/* VFX 엔진 — 프리셋(데이터)만 바꿔 끼우면 검기·검기 날리기·타격 이펙트를 만든다.
   Canvas 2D, 외부 라이브러리 없음. 일반 <script>로 불러오면 window.VFX 가 생긴다(file:// 에서도 동작).

   튜토리얼(유니티 셰이더) ↔ 이 코드
   - Loft 메시(링 띠)          → Trail: 각도 샘플마다 안쪽·바깥 반지름으로 띠를 만든다
   - 그라데이션 텍스처          → preset.trail.colors (ramp)
   - Dissolve 텍스처 + 버텍스 알파 → 값 노이즈를 나이에 따라 올라가는 문턱값과 비교
   - UV 오프셋(흐르는 무늬)      → 노이즈 좌표에 시간 × scroll 을 더함
   - 뒤쪽 어두운 텍스처          → back 패스(일반 합성)로 먼저 그림
   - 하이라이트(디졸브 저항)      → 바깥 가장자리는 늦게 사라짐
   - 파티클 시스템              → preset.particles
   - 블룸(포스트 프로세싱)        → 축소·흐림 후 더하기 합성
*/
(function (root) {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a || 1e-6)); return t * t * (3 - 2 * t); };
  const rnd = (r) => (Array.isArray(r) ? lerp(r[0], r[1], Math.random()) : (r == null ? 0 : r));

  function hex(h) {
    if (Array.isArray(h)) return h;
    h = String(h).replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  /** stops: [[위치 0~1, '#hex'], ...] → t => [r,g,b] */
  function ramp(stops) {
    if (!stops || !stops.length) stops = [[0, '#ffffff'], [1, '#ffffff']];
    if (typeof stops[0] === 'string') stops = stops.map((c, i, a) => [a.length > 1 ? i / (a.length - 1) : 0, c]);
    const s = stops.map(([p, c]) => [p, hex(c)]).sort((a, b) => a[0] - b[0]);
    return (t) => {
      t = clamp(t);
      if (t <= s[0][0]) return s[0][1];
      for (let i = 1; i < s.length; i++) {
        if (t <= s[i][0]) {
          const k = (t - s[i - 1][0]) / (s[i][0] - s[i - 1][0] || 1);
          const a = s[i - 1][1], b = s[i][1];
          return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
        }
      }
      return s[s.length - 1][1];
    };
  }
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${clamp(a).toFixed(3)})`;

  // 값 노이즈 (디졸브 텍스처 대신)
  function hash(x, y) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  function noise2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return lerp(lerp(hash(xi, yi), hash(xi + 1, yi), u), lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), u), v);
  }
  const fbm = (x, y) => noise2(x, y) * 0.65 + noise2(x * 2.3 + 17.1, y * 2.3 + 5.7) * 0.35;

  // 프리셋 → 계산용 형태(색 ramp 등) 캐시
  const PDEF = { type: 'spark', rate: 0, life: [0.3, 0.7], speed: [150, 450], out: [0, 80], jitter: 50, gravity: 0, drag: 2, size: [1, 3], from: [0.6, 1], spin: 0, len: 1.8, alpha: 1, spread: TAU };
  const cache = new WeakMap();
  function compile(p) {
    let c = cache.get(p);
    if (c) return c;
    const tr = p.trail || {};
    const im = p.impact || {};
    const pdef = (d) => Object.assign({}, PDEF, d, { ramp: ramp(d.colors || tr.colors), _tc: tr.colors });
    c = {
      trail: ramp(tr.colors),
      back: hex(tr.back || '#000000'),
      parts: (p.particles || []).map(pdef),
      burst: (im.burst || []).map(pdef),
      flash: im.flash ? hex(im.flash.color || im.flash) : null,
      ring: im.ring ? hex(im.ring.color || im.ring) : null,
      star: im.star ? hex(im.star.color) : null,
      // 속도선(애니메이션 스피드 라인): 칼끝에서 접선 방향으로 길게 날아가는 빛 줄
      streak: Object.assign({}, PDEF, { type: 'streak', speed: [900, 1700], drag: 7, life: [0.1, 0.2], size: [1.2, 2.6], jitter: 0 },
        { ramp: ramp([[0, '#ffffff'], [0.5, ramp(tr.colors)(0.85)], [1, ramp(tr.colors)(0.6)]]), _tc: tr.colors }),
    };
    cache.set(p, c);
    return c;
  }

  const MAX_PARTICLES = 1600;
  const gatherDefs = new WeakMap();
  /** 입자 불투명도: 보통은 태어나자마자 밝고 서서히 꺼짐, 모이는 입자(inward)는 모일수록 밝아졌다 닿는 순간 꺼짐 */
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const partAlpha = (d, k) => d.inward ? d.alpha * sstep(0, 0.6, k) * (1 - sstep(0.85, 1, k)) : d.alpha * (1 - k * k);
  /* 트레일 모양(원소마다 실루엣이 다르게). in/out = 띠 안쪽·바깥으로 넘치는 폭(띠 굵기 배수). id는 셰이더 번호 */
  /** 2D 띠 가장자리: [바깥으로 더 뻗음, 안쪽으로 더 파임, 띠 전체 비틀림] (굵기 배수). u = 호 각도(라디안) */
  const hsh = (x) => { const v = Math.sin(x * 91.345 + 0.7) * 47453.5453; return v - Math.floor(v); };
  const tri = (x) => 1 - Math.abs(2 * (x - Math.floor(x)) - 1);
  function shapeEdge(id, u, age, t) {
    switch (id) {
      case 1: { const n = noise2(u * 5 - t * 2.5, 1.7); return [Math.pow(tri(u * 5 + n * 0.8), 3) * (0.6 + 1.4 * n), 0.1, 0]; }      // 불: 날름대는 뾰족한 불혀
      case 2: { const z = u * 7 + 0.45 * Math.sin(u * 17 + 1.3) + 0.25 * Math.sin(u * 31), h = hsh(Math.floor(z)); return [tri(z) * (0.08 + 1.1 * Math.pow(h, 1.7)), tri(z + 0.5) * 0.2 * hsh(Math.floor(z) + 3.1), 0]; }   // 간격·높이 제각각(부채살 방지)                 // 얼음: 직선 면의 결정 톱니
      case 3: { const z = u * 9; return [Math.sqrt(tri(z)) * 0.3, Math.sqrt(tri(z + 0.5)) * 0.25, 0]; }                                 // 눈: 몽글한 서리 가장자리
      case 4: { const z = u * 10, i = Math.floor(z), f = z - i; return [0.1, 0, (hsh(i) + (hsh(i + 1) - hsh(i)) * f - 0.5) * 1.1]; }   // 번개: 띠 전체가 지그재그
      case 5: return [(u * 12 - Math.floor(u * 12) > 0.82 ? 0.25 : 0), 0, 0];                                                              // 비전: 규칙적인 각인 홈
      case 6: return [Math.pow(tri(u * 6), 9) * 2.2, 0, 0];                                                                                 // 신성: 가는 빛살
      case 7: return [0, Math.pow(noise2(u * 4, 3.1), 3) * (1 + 3 * age), 0];                                                              // 독: 안쪽으로 흘러내리는 점액
      case 8: { const n = noise2(u * 5 + t * 0.8, 8.2); return [Math.pow(n, 2.5) * 2.4, 0.15, 0]; }                                       // 어둠: 바깥으로 감기는 촉수
      default: return [0, 0, 0];
    }
  }
  const SHAPES = {
    blade: { id: 0, in: 0, out: 0 }, fire: { id: 1, in: 0.2, out: 1.0 }, ice: { id: 2, in: 0.15, out: 0.6 },
    snow: { id: 3, in: 0.5, out: 0.7 }, lightning: { id: 4, in: 0.35, out: 0.45 }, arcane: { id: 5, in: 0.1, out: 0.15 },
    holy: { id: 6, in: 0.1, out: 1.3 }, poison: { id: 7, in: 1.0, out: 0.15 }, dark: { id: 8, in: 0.3, out: 0.9 },
  };

  /* ---------- Trail: 휘두른 자리에 남는 띠(검기) / 날아가는 초승달(검기 날리기) ---------- */
  class Trail {
    constructor(eng, preset, o = {}) {
      const tr = preset.trail;
      this.e = eng; this.p = preset; this.c = compile(preset);
      this.r0 = o.r0 != null ? o.r0 : tr.radius[0];
      this.r1 = o.r1 != null ? o.r1 : tr.radius[1];
      this.life = o.life != null ? o.life : tr.life;
      this.S = []; this.acc = Math.random() * 50;
      this.ox = 0; this.oy = 0; this.vx = 0; this.vy = 0; this.sc = 1; this.base = 1; this.grow = 0; this.drag = 0; this.stAcc = 0;
      this.touched = eng.t; this.emitAcc = []; this.wave = null;
      this.pl = o.plane || null;   // 3D: 이 띠가 놓인 면(fx.plane/fx.facing). 2D는 null
    }
    /** 칼끝이 a0→a1 로 움직였다(라디안). (x,y)=회전 중심, p=세기 0~1, dt=이 이동에 걸린 시간 */
    sweep(...a) { this.e.onPlane(this.pl, () => this._sweep(...a)); }
    _sweep(a0, a1, x0, y0, x1, y1, p0 = 1, p1 = 1, dt = 0) {
      const e = this.e, da = a1 - a0;
      this.touched = e.t;
      if (!this.S.length) this.S.push({ a: a0, x: x0, y: y0, t: e.t - dt, id: this.acc, pw: p0, w: 1 });
      const n = Math.max(1, Math.ceil(Math.abs(da) / 0.028));
      for (let i = 1; i <= n; i++) {
        const k = i / n;
        this.acc += Math.abs(da) / n;
        this.S.push({ a: a0 + da * k, x: lerp(x0, x1, k), y: lerp(y0, y1, k), t: e.t - dt * (1 - k), id: this.acc, pw: lerp(p0, p1, k), w: 1 });
      }
      const pw = (p0 + p1) / 2, sg = Math.sign(da) || 1;
      const sr = this.p.trail.streaks == null ? 9 : this.p.trail.streaks;
      if (pw > 0.55 && sr > 0) {
        this.stAcc += sr * Math.abs(da) * pw;
        while (this.stAcc >= 1) {
          this.stAcc -= 1;
          const k = Math.random(), a = a0 + da * k, r = this.r1 * lerp(0.75, 1.08, Math.random());
          const cx = lerp(x0, x1, k), cy = lerp(y0, y1, k), sp = rnd(this.c.streak.speed);
          const ta = a + sg * Math.PI / 2 + (Math.random() - 0.5) * 0.25;
          e.spawn(this.c.streak, this.ox + (cx + Math.cos(a) * r) * this.sc, this.oy + (cy + Math.sin(a) * r) * this.sc, Math.cos(ta) * sp, Math.sin(ta) * sp);
        }
      }
      this.c.parts.forEach((d, i) => {
        if (!d.rate) return;
        this.emitAcc[i] = (this.emitAcc[i] || 0) + d.rate * Math.abs(da) * pw;
        while (this.emitAcc[i] >= 1) {
          this.emitAcc[i] -= 1;
          const k = Math.random(), a = a0 + da * k;
          const r = lerp(this.r0, this.r1, rnd(d.from));
          const cx = lerp(x0, x1, k), cy = lerp(y0, y1, k);
          const ca = Math.cos(a), sa = Math.sin(a), sp = rnd(d.speed) * (0.4 + 0.6 * pw), ou = rnd(d.out);
          e.spawn(d, this.ox + (cx + ca * r) * this.sc, this.oy + (cy + sa * r) * this.sc,
            -sa * sg * sp + ca * ou + (Math.random() - 0.5) * d.jitter,
            ca * sg * sp + sa * ou + (Math.random() - 0.5) * d.jitter);
        }
      });
    }
    get alive() { return this.S.length > 0 || this.e.t - this.touched < 0.12; }

    update(dt) { this.e.onPlane(this.pl, () => this._update(dt)); }
    _update(dt) {
      const e = this.e;
      while (this.S.length && (e.t - this.S[0].t) >= this.life) this.S.shift();
      const w = this.wave;
      if (!w) return;
      const k = Math.exp(-this.drag * dt);
      this.vx *= k; this.vy *= k;
      this.ox += this.vx * dt; this.oy += this.vy * dt; this.base += this.grow * dt;
      const age = e.t - w.born;
      // 튀어나오기: 작게 시작 -> 살짝 넘쳤다가 -> 제자리 (디즈니 스쿼시·스트레치와 오버슈트)
      const pk = clamp(age / 0.13);
      this.sc = this.base * (pk < 1 ? 0.55 + 0.45 * (1 + 2.7 * Math.pow(pk - 1, 3) + 1.7 * Math.pow(pk - 1, 2)) : 1);
      if (w.hitAt != null && !w.hit && age >= w.hitAt) {
        w.hit = true;
        const fx = this.ox + Math.cos(w.ang) * this.r1 * this.sc, fy = this.oy + Math.sin(w.ang) * this.r1 * this.sc;
        e.impact(fx, fy, this.p, w.ang);
      }
      // 날아가는 동안 뒤로 흘리는 파티클
      if (age < this.life * 0.8) {
        const back = w.ang + Math.PI;
        this.c.parts.forEach((d, i) => {
          if (!d.rate) return;
          this.emitAcc[i] = (this.emitAcc[i] || 0) + d.rate * w.arc * dt * 7;
          while (this.emitAcc[i] >= 1) {
            this.emitAcc[i] -= 1;
            const a = w.ang + (Math.random() - 0.5) * w.arc * 0.9;
            const r = lerp(this.r0, this.r1, rnd(d.from));
            const sp = rnd(d.speed) * 0.35, ou = rnd(d.out);
            e.spawn(d, this.ox + Math.cos(a) * r * this.sc, this.oy + Math.sin(a) * r * this.sc,
              this.vx * 0.25 + Math.cos(back) * sp + Math.cos(a) * ou + (Math.random() - 0.5) * d.jitter,
              this.vy * 0.25 + Math.sin(back) * sp + Math.sin(a) * ou + (Math.random() - 0.5) * d.jitter);
          }
        });
      }
    }

    /* 붓결 가닥 만들기: 참고 영상처럼 결 따라 갈라진 초승달을 가늘고 끝이 뾰족한 가닥 여러 개로 그린다.
       g: 0=하얀 중심, 1=몸통, 2=안쪽 꼬리 결, 3=바깥 실선 */
    makeStrands() {
      const R = Math.random, L = [];
      const add = (g, n, v0, v1, w0, w1, len0, len1, a, c0, c1) => {
        for (let i = 0; i < n; i++) {
          const len = lerp(len0, len1, R());
          L.push({ g, v: lerp(v0, v1, R()), w: lerp(w0, w1, R()), len, per: len * lerp(1.15, 1.9, R()), ph: R() * 10,
            a: a * lerp(0.6, 1, R()), c: lerp(c0, c1, R()), dv: (R() - 0.5) * 0.25, ns: R() * 50 });
        }
      };
      add(0, 12, 0.74, 0.99, 0.04, 0.11, 0.9, 2.6, 0.5, 0.84, 1.0);   // 하얗게 타는 바깥 중심
      add(1, 26, 0.3, 0.86, 0.02, 0.08, 0.4, 1.8, 0.45, 0.42, 0.8);  // 몸통 결
      add(2, 22, -0.25, 0.4, 0.008, 0.03, 0.3, 1.4, 0.45, 0.2, 0.55); // 안쪽으로 흩어지는 가는 꼬리
      add(2, 5, 1.0, 1.12, 0.008, 0.02, 0.3, 0.9, 0.35, 0.6, 0.9);    // 바깥으로 튀는 실
      add(4, 4, 1.12, 1.45, 0.006, 0.014, 1.2, 3.0, 0.32, 0.7, 0.95); // 바깥에 뜨는 가는 잔상 호
      L.push({ g: 3, v: 0.985, w: 0.035, len: 1e9, per: 1e9, ph: 0, a: 0.9, c: 1, dv: 0, ns: 7 });
      return L;
    }

    draw(ctx, pass) {
      const S = this.S, n = S.length;
      if (n < 2) return;
      const e = this.e, tr = this.p.trail, c = this.c;
      const dz = tr.dissolve || {};
      const dScale = dz.scale || 5, dSoft = dz.soft || 0.25, dAmt = dz.amount || 1.2;
      const scroll = tr.scroll || 0, inten = Math.min(1.05, tr.intensity || 1), backA = tr.backAlpha || 0;   // 2D는 가산 겹침이 쉽게 타므로 상한
      const band = tr.band || 0.62, streak = tr.streak == null ? 0.5 : tr.streak;
      if (pass === 'back' && backA <= 0) return;
      if (!this.strands) this.strands = this.makeStrands();
      const step = Math.max(1, Math.ceil(n / 140));
      const idx = [];
      for (let i = 0; i < n; i += step) idx.push(i);
      if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
      const m = idx.length;

      const sid = (SHAPES[tr.shape] || SHAPES.blade).id;   // 2D 대체 경로도 원소별 가장자리 모양
      // 표본마다: 초승달 굵기(prof), 띠 안·바깥 반지름, 방향
      const rows = idx.map((i, j) => {
        const s = S[i];
        const age = clamp((e.t - s.t) / this.life);
        let prof;
        if (this.wave) prof = s.w;
        else { const u = m > 1 ? j / (m - 1) : 1; prof = Math.pow(Math.sin(Math.PI * Math.pow(u, 1.7)), 0.55); }
        prof *= s.pw;
        const thick = (this.r1 - this.r0) * band * prof * (1 - 0.35 * age);
        let rOut = this.r1, rIn = rOut - thick;
        if (sid) { const o = shapeEdge(sid, s.id, age, e.t); rOut += thick * o[0] + thick * o[2]; rIn += thick * o[2] - thick * o[1]; }
        return { age, id: s.id, prof, rIn, rOut, ca: Math.cos(s.a), sa: Math.sin(s.a), x: s.x, y: s.y,
          fade: Math.pow(1 - age, 1.3) };
      });
      const P = (r, R) => [this.ox + (r.x + r.ca * R) * this.sc, this.oy + (r.y + r.sa * R) * this.sc];

      // 1) 몸통 빛: 초승달 전체를 부드럽게 한 번 채운다
      if (pass === 'light') {
        ctx.beginPath();
        for (let j = 0; j < m; j++) { const [x, y] = P(rows[j], rows[j].rOut); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        for (let j = m - 1; j >= 0; j--) { const r = rows[j]; const [x, y] = P(r, lerp(r.rIn, r.rOut, 0.15)); ctx.lineTo(x, y); }
        ctx.closePath();
        const mid = rows[Math.floor(m * 0.7)] || rows[m - 1];
        ctx.fillStyle = rgba(c.trail(0.6), 0.1 * inten * mid.fade);
        ctx.fill();
      }

      // 1b) 스미어 플래시: 막 지나간 자리(나이 0.12 미만)를 하얗게 한 번 번쩍 -> 칼이 보이지 않을 만큼 빠르다
      if (pass === 'light') {
        let j0 = m;
        while (j0 > 0 && rows[j0 - 1].age < 0.07) j0--;
        if (m - j0 >= 2) {
          ctx.beginPath();
          for (let j = j0; j < m; j++) { const [x, y] = P(rows[j], rows[j].rOut + 4); j > j0 ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
          for (let j = m - 1; j >= j0; j--) { const r = rows[j]; const [x, y] = P(r, lerp(r.rIn, r.rOut, 0.05)); ctx.lineTo(x, y); }
          ctx.closePath();
          ctx.fillStyle = rgba(c.trail(0.85), 0.3 * (1 - rows[m - 1].age / 0.07));
          ctx.fill();
        }
      }

      // 2) 가닥: 호를 따라 늘어진 끝이 뾰족한 리본
      const L = [], Rr = [], nrm = Math.min(1, Math.sqrt(12 / Math.max(1, this.strands.length)));   // 가닥이 많으면(번개 메아리·줄무늬) 가산 겹침이 순백으로 타지 않게 나눠 준다
      for (const st of this.strands) {
        if (pass === 'back' && st.g >= 3) continue;
        let seg = 0;
        const flush = () => {
          if (L.length >= 4) {
            // 디졸브로 끊긴 조각 양끝을 직각으로 자르지 않고, 진행 방향으로 뻗은 뾰족한 끝점으로 닫는다(직사각형 리본 방지)
            const n2 = L.length, mid = (q) => [(L[q] + Rr[q]) / 2, (L[q + 1] + Rr[q + 1]) / 2];
            const a0 = mid(0), a1 = mid(2), b0 = mid(n2 - 2), b1 = mid(n2 - 4), ext = 1.6;
            ctx.beginPath(); ctx.moveTo(a0[0] + (a0[0] - a1[0]) * ext, a0[1] + (a0[1] - a1[1]) * ext);
            for (let q = 0; q < n2; q += 2) ctx.lineTo(L[q], L[q + 1]);
            ctx.lineTo(b0[0] + (b0[0] - b1[0]) * ext, b0[1] + (b0[1] - b1[1]) * ext);
            for (let q = Rr.length - 2; q >= 0; q -= 2) ctx.lineTo(Rr[q], Rr[q + 1]);
            ctx.closePath();
            let col, a;
            if (pass === 'back') { col = c.back; a = backA * st.a * 1.4 * (seg / Math.max(1, L.length / 2)); }
            else { col = c.trail(st.g >= 3 ? st.c : Math.min(st.c, 0.8)); a = st.a * inten * nrm * (st.g >= 3 ? 0.85 : 0.7) * (seg / Math.max(1, L.length / 2)); }   // 순백은 핵 가닥에만, 몸통은 중간 명도
            ctx.fillStyle = rgba(col, a); ctx.fill();
          }
          L.length = 0; Rr.length = 0; seg = 0;
        };
        for (let j = 0; j < m; j++) {
          const r = rows[j];
          let t;
          if (st.len > 1e8) t = m > 1 ? j / (m - 1) : 0.5;
          else { const z = ((r.id - st.ph) % st.per + st.per) % st.per; t = z / st.len; }
          if (t >= 1 || r.prof < 0.02) { flush(); continue; }
          // 디졸브: 나이에 따라 올라가는 문턱값과 노이즈 비교 → 가닥이 끊기며 사라짐
          const nv = fbm(r.id * dScale + e.t * scroll, st.ns);
          const th = Math.pow(r.age, 1.2) * dAmt - 0.2 + (st.g === 0 ? -0.15 : 0);
          const dm = smooth(th, th + dSoft, nv);
          const taper = Math.pow(Math.sin(Math.PI * t), st.g === 3 ? 0.35 : 0.8);
          const thick = r.rOut - r.rIn;
          const jag = noise2(r.id * dScale * 3.5 + st.ns, st.ns * 3);   // 붓 끝처럼 거친 굵기 변화
          let v = st.v + st.dv * t, hw = thick * st.w * taper * dm * lerp(1, 0.25 + 1.3 * jag, streak);
          if (pass === 'back') { v -= 0.18; hw *= 2.2; }
          hw += (st.g >= 3 ? 0.7 : 0) * taper * r.prof * dm;
          if (hw < 0.15) { flush(); continue; }
          const R0 = lerp(r.rIn, r.rOut, v);
          const a = P(r, R0 + hw), b = P(r, R0 - hw);
          L.push(a[0], a[1]); Rr.push(b[0], b[1]); seg += r.fade;
        }
        flush();
      }
    }
  }

  /* ---------- Engine ---------- */
  /**
   * 몸체: 게임 캐릭터·목표물의 '만화 반응'을 맡는 스프링.
   * 엔진이 알아서 건드린다(쏘기 전 움츠림, 쏠 때 반동, 맞을 때 찌그러짐·흰 번쩍·밀림).
   * 게임은 그릴 때 body.apply(g) 로 변형만 적용하고, body.flash(0~1) 만큼 하얗게 칠하면 된다.
   */
  class Body {
    constructor(x, y, r = 40) {
      this.x = x; this.y = y; this.r = r;
      this.ox = 0; this.oy = 0; this.vx = 0; this.vy = 0;   // 밀림(스프링)
      this.s = 0; this.sv = 0; this.ang = 0;                // 늘어남(+)/찌그러짐(-) 정도와 방향
      this.flash = 0; this.hold = 0;                        // hold: 모으는 동안 유지할 움츠림
    }
    /** amount>0 늘어남, <0 찌그러짐 (ang 방향 기준). push = 그 방향으로 밀어내는 속도 */
    poke(amount, ang, push = 0) {
      this.ang = ang; this.sv += amount * 30;
      this.vx += Math.cos(ang) * push; this.vy += Math.sin(ang) * push;
    }
    update(dt) {
      // 덜 감쇠된 스프링 → 한두 번 출렁이다 멈춤(디즈니 '따라가기')
      const tgt = this.hold;
      this.sv += (-(this.s - tgt) * 520 - this.sv * 16) * dt; this.s += this.sv * dt;
      this.vx += (-this.ox * 260 - this.vx * 13) * dt; this.vy += (-this.oy * 260 - this.vy * 13) * dt;
      this.ox += this.vx * dt; this.oy += this.vy * dt;
      this.s = clamp(this.s, -0.6, 0.9);
      this.flash = Math.max(0, this.flash - dt * 25);
    }
    /** 그리기 전에 호출: 몸 중심으로 옮기고 늘어남·찌그러짐(부피 유지) 적용. 이후 (0,0) 기준으로 그린다 */
    apply(g) {
      const k = 1 + this.s;
      g.translate(this.x + this.ox, this.y + this.oy);
      g.rotate(this.ang); g.scale(k, 1 / Math.sqrt(Math.max(0.2, k))); g.rotate(-this.ang);
    }
  }

  /** 투사체: 모으기(예비동작) → 발사(반동) → 비행(속도 방향 늘어남) → 도착(타격) */
  // 타격 광선과 같은 모양: 가운데가 굵고 양끝이 뾰족한 바늘. (x,y)에서 ang 방향 off만큼 떨어져 len 길이
  function needle(ctx, x, y, ang, off, len, w, col, a) {
    if (w < 0.15 || a <= 0.01) return;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    ctx.fillStyle = rgba(col, Math.min(1, a));
    ctx.beginPath();
    ctx.moveTo(x + ca * off, y + sa * off);
    ctx.lineTo(x + ca * (off + len * 0.22) - sa * w, y + sa * (off + len * 0.22) + ca * w);
    ctx.lineTo(x + ca * (off + len), y + sa * (off + len));
    ctx.lineTo(x + ca * (off + len * 0.22) + sa * w, y + sa * (off + len * 0.22) - ca * w);
    ctx.closePath(); ctx.fill();
  }
  function glow(ctx, x, y, r, stops) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    stops.forEach(([t, col, a]) => g.addColorStop(t, rgba(col, a)));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }

  class Shot {
    constructor(eng, preset, from, to, o) {
      this.e = eng; this.p = preset; this.c = compile(preset); this.o = o;
      this.from = from; this.to = to; this.pl = o.plane || null;
      const R = eng.rules;
      this.charge = R ? (o.charge == null ? 0.24 : o.charge) : 0;
      this.speed = o.speed || 1300; this.size = o.size || 16;
      this.age = 0; this.phase = this.charge > 0 ? 'charge' : 'fly'; this.alive = true;
      this.x = from.x; this.y = from.y; this.vx = 0; this.vy = 0; this.acc = 0;
      this.arc = o.arc == null ? (R ? 0.18 : 0) : o.arc;   // 직선보다 살짝 휜 궤적(디즈니 '호')
      // 모으기 때 빨려 드는 바늘: 시작 시각을 엇갈려 한꺼번에 오지 않게(30~60ms 간격 느낌)
      this.inj = Array.from({ length: 16 }, (_, i) => ({ ang: (i / 16) * TAU + (Math.random() - 0.5) * 0.4, t0: (i * 0.37 % 1) * 0.6, dur: lerp(0.28, 0.4, Math.random()), r0: lerp(95, 150, Math.random()), w: lerp(1.6, 2.6, Math.random()) }));
      if (this.phase === 'fly') this.launch();
      else if (from.poke) { from.ang = this.aim(); from.hold = -0.22; from.vx -= Math.cos(from.ang) * 120; from.vy -= Math.sin(from.ang) * 120; }   // 쏘기 전 움츠리며 뒤로 당김
    }
    aim() { const t = this.to, b = this.from; const ox = b.ox || 0, oy = b.oy || 0; return Math.atan2(t.y + (t.oy || 0) - (b.y + oy), t.x + (t.ox || 0) - (b.x + ox)); }
    launch() {
      const R = this.e.rules, a = this.aim() - this.arc;
      this.phase = 'fly'; this.flyT = 0;
      this.x = this.from.x + Math.cos(a) * (this.from.r || 0); this.y = this.from.y + Math.sin(a) * (this.from.r || 0);
      this.vx = Math.cos(a) * this.speed; this.vy = Math.sin(a) * this.speed;
      if (R && this.from.poke) { this.from.hold = 0; this.from.poke(0.35, a, -260); }   // 반동: 앞으로 늘어나며 뒤로 밀림
      if (R) {
        this.e.kick({ trauma: 0.18, dir: a + Math.PI });
        const sc = this.c.trail ? this.c.trail(0.62) : (this.c.star || [255, 255, 255]), L0 = this.size * 5;
        const rays = [[0, 1.6], [-0.42, 0.9], [0.42, 0.9], [-0.95, 0.45], [0.95, 0.45], [Math.PI, 0.35]].map(([d, l]) => ({ ang: a + d, len: L0 * l, w: this.size * 0.32 * (l > 1 ? 1 : 0.7), main: true }));
        this.e.hits.push({ x: this.x, y: this.y, p: this.p, c: { flash: this.c.flash || [255, 255, 255], star: sc }, im: { flash: { size: this.size * 2.4, alpha: 0.8 }, star: { width: this.size * 0.22 } }, rays, age: 0, life: 0.14, pl: this.pl });
      }
    }
    update(dt) { this.e.onPlane(this.pl, () => this._update(dt)); }
    _update(dt) {
      this.age += dt;
      if (this.phase === 'charge') {
        // 모으기: 주변에서 빛 알갱이를 빨아들인다
        const cx = this.from.x + (this.from.ox || 0), cy = this.from.y + (this.from.oy || 0), a = this.aim();
        const hx = cx + Math.cos(a) * (this.from.r || 0) * 1.3, hy = cy + Math.sin(a) * (this.from.r || 0) * 1.3;
        this.x = hx; this.y = hy;
        if (this.age >= this.charge) this.launch();
        return;
      }
      this.flyT += dt;
      // 목표를 향해 휘어 들어감
      const tx = this.to.x + (this.to.ox || 0), ty = this.to.y + (this.to.oy || 0);
      const want = Math.atan2(ty - this.y, tx - this.x), cur = Math.atan2(this.vy, this.vx);
      let da = want - cur; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
      const na = cur + da * Math.min(1, dt * 9);
      const sp = this.speed * (this.e.rules ? 0.75 + Math.min(1, this.flyT / 0.12) * 0.4 : 1);   // 빠르게 붙는 가속
      this.vx = Math.cos(na) * sp; this.vy = Math.sin(na) * sp;
      const px = this.x, py = this.y;
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.c.parts.forEach((d) => {   // 지나간 자리에 속성 입자
        d._acc = (d._acc || 0) + d.rate * 0.02 * dt * 60;
        while (d._acc >= 1) { d._acc -= 1; const k = Math.random(); this.e.spawn(d, lerp(px, this.x, k), lerp(py, this.y, k), -this.vx * 0.05 + (Math.random() - 0.5) * 60, -this.vy * 0.05 + (Math.random() - 0.5) * 60); }
      });
      const dist = Math.hypot(tx - this.x, ty - this.y);
      if (dist < (this.to.r || 0) + 6 || this.flyT > 3) {
        this.alive = false;
        this.e.impact(this.x, this.y, this.p, na, { plain: !this.e.rules, scale: this.o.hitScale || 0.55 });
      }
    }
    draw(ctx) {
      const W0 = [255, 255, 255], c = this.c, col = c.star || c.flash || W0;
      const body = c.trail ? c.trail(0.6) : col, edge = c.trail ? c.trail(0.42) : col, hot = c.trail ? c.trail(0.84) : W0, W = W0;
      if (this.phase === 'charge') {
        const k = this.age / this.charge, t = this.age;
        // 1) 빨려 드는 바늘: 바깥에서 가속하며(ease-in) 핵으로, 빠를수록 길게
        for (const n of this.inj) {
          const q = (k - n.t0) / n.dur; if (q <= 0 || q >= 1) continue;
          const e = q * q, r = lerp(n.r0, this.size * 0.8, e), len = lerp(26, 70, q) * (1 - e * 0.6);
          const fade = Math.sin(Math.PI * Math.min(1, q * 1.15));
          needle(ctx, this.x, this.y, n.ang, r, len, n.w * 2.4, edge, 0.5 * fade);
          needle(ctx, this.x, this.y, n.ang, r, len, n.w, body, fade);
          needle(ctx, this.x, this.y, n.ang, r, len * 0.45, n.w * 0.35, hot, fade);
        }
        // 2) 핵: 바깥 글로우 → 몸통 색 → 흰 핵 (떨림으로 에너지가 차는 느낌)
        const fl = 1 + 0.12 * Math.sin(t * 95) + 0.06 * Math.sin(t * 57), R0 = this.size * lerp(0.35, 1.2, k * k) * fl;
        glow(ctx, this.x, this.y, R0 * 3, [[0, edge, 0.4], [1, edge, 0]]);
        glow(ctx, this.x, this.y, R0 * 1.5, [[0, W, 1], [0.22, hot, 0.95], [0.5, body, 0.7], [1, body, 0]]);
        // 3) 발사 직전(마지막 30%) 십자 반짝임이 커진다: "곧 나간다" 신호
        if (k > 0.7) {
          const g = smooth(0.7, 1, k), ra = t * 3;
          for (let i = 0; i < 4; i++) {
            const L = this.size * (i % 2 ? 2.2 : 3.4) * g;
            needle(ctx, this.x, this.y, ra + i * Math.PI / 2, 0, L, this.size * 0.22, body, 0.8 * g);
            needle(ctx, this.x, this.y, ra + i * Math.PI / 2, 0, L * 0.8, this.size * 0.09, W, g);
          }
        }
        return;
      }
      const Rl = this.e.rules, v = Math.hypot(this.vx, this.vy) || 1, ang = Math.atan2(this.vy, this.vx);
      if (!Rl) { glow(ctx, this.x, this.y, this.size * 1.6, [[0, W, 1], [0.4, col, 0.7], [1, col, 0]]); return; }
      const st = 1 + Math.min(2.2, v * 0.0016), r = this.size / Math.sqrt(st), back = ang + Math.PI, t = this.age;
      // 1) 바깥 글로우(넓고 옅게)
      ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(ang); ctx.scale(st * 0.9, 1);
      glow(ctx, 0, 0, r * 3.2, [[0, edge, 0.32], [1, edge, 0]]);
      ctx.restore();
      // 2) 꼬리: 굵기가 변하며 흔들리는 가닥 3개(가운데 길고, 양옆 짧게) — 몸통 색 → 흰 속심
      const L = this.size * st * 4.2;
      for (let i = -1; i <= 1; i++) {
        const wob = Math.sin(t * 38 + i * 2.1) * 0.07 + i * 0.13, len = L * (i ? 0.62 : 1) * (0.92 + 0.08 * Math.sin(t * 51 + i));
        needle(ctx, this.x, this.y, back + wob, -r * 0.6, len, r * (i ? 0.75 : 1.05), edge, 0.6);
        needle(ctx, this.x, this.y, back + wob, -r * 0.6, len * 0.75, r * (i ? 0.42 : 0.6), body, 0.85);
      }
      needle(ctx, this.x, this.y, back, -r * 0.4, L * 0.38, r * 0.26, hot, 0.9);
      // 3) 머리: 선두가 가장 밝다 — 앞으로 눌린 흰 핵 + 앞쪽 짧은 반짝임
      ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(ang); ctx.scale(1.25, 0.85);
      glow(ctx, 0, 0, r * 1.8, [[0, W, 1], [0.28, hot, 0.95], [0.6, body, 0.75], [1, edge, 0]]);
      ctx.restore();
      needle(ctx, this.x, this.y, ang, r * 0.5, r * 1.5, r * 0.24, hot, 0.8);
    }
  }

  class Engine {
    constructor() {
      this.t = 0; this.trails = []; this.parts = []; this.hits = []; this.lines = []; this.shots = []; this.bodies = [];
      this.rules = true;   // 만화 규칙(예비동작·늘어남/찌그러짐·피격 반응·히트스톱). false면 밋밋한 기본 동작
      // 카메라 손맛: 트라우마 흔들림·줌 펀치·히트스톱·임팩트 프레임
      this.trauma = 0; this.dir = 0; this.sx = 0; this.sy = 0; this.rot = 0; this.zoom = 0; this.px = 0; this.py = 0;
      this.freeze = 0; this.ifr = -1; this.impactFrames = true; this.camScale = 1; this.onImpact = null;
      this.fx = document.createElement('canvas'); this.fc = this.fx.getContext('2d');
      this.b1 = document.createElement('canvas'); this.b1c = this.b1.getContext('2d');
      this.b2 = document.createElement('canvas'); this.b2c = this.b2.getContext('2d');
      this.hasFilter = 'filter' in this.b1c;
      this.bloomAmt = 0.8;
    }
    resize(w, h) {
      this.fx.width = w; this.fx.height = h;
      this.b1.width = Math.max(1, Math.round(w / 4)); this.b1.height = Math.max(1, Math.round(h / 4));
      this.b2.width = Math.max(1, Math.round(w / 12)); this.b2.height = Math.max(1, Math.round(h / 12));
    }
    /** 휘두르기 띠. 반환된 trail.sweep(...) 을 매 프레임 호출 */
    trail(preset, o) { const t = new Trail(this, preset, o); this.trails.push(t); this.bloomAmt = preset.bloom == null ? 0.8 : preset.bloom; return t; }

    /** 초승달 검기를 ang 방향으로 날린다. (x,y)=초승달 앞 끝이 처음 놓일 곳 */
    wave(preset, x, y, ang, o = {}) {
      const radius = o.radius || 150, arc = o.arc || 2.0;
      const t = new Trail(this, preset, { r0: radius * 0.5, r1: radius, life: o.life || 0.75, plane: o.plane });
      const n = 48;
      for (let i = 0; i < n; i++) {
        const k = i / (n - 1);
        t.S.push({ a: ang - arc / 2 + arc * k, x: 0, y: 0, t: this.t, id: t.acc + arc * k, pw: 1, w: Math.pow(Math.sin(Math.PI * k), 0.6) });
      }
      const sp = o.speed || 900;
      t.ox = x - Math.cos(ang) * radius; t.oy = y - Math.sin(ang) * radius;
      t.vx = Math.cos(ang) * sp; t.vy = Math.sin(ang) * sp;
      t.drag = o.drag == null ? 1.2 : o.drag; t.grow = o.grow == null ? 0.6 : o.grow;
      t.wave = { born: this.t, ang, arc, hitAt: o.hitAt, hit: false };
      this.trails.push(t);
      this.bloomAmt = preset.bloom == null ? 0.8 : preset.bloom;
      return t;
    }

    /** 반응할 몸체 등록. 이후 근처 타격·투사체에 엔진이 알아서 반응시킨다 */
    body(x, y, r) { const b = new Body(x, y, r); this.bodies.push(b); return b; }
    /** 투사체 쏘기. from/to 는 body 또는 {x,y}. o: speed, size, charge(모으는 초), arc */
    shot(preset, from, to, o = {}) { const s = new Shot(this, preset, from, to, o); this.shots.push(s); return s; }
    /** 예비동작(앤티) 충전: 속성 잔 입자가 (x,y)로 빨려 들며 모일수록 밝아진다. n=개수, o: radius[min,max], plane */
    gather(preset, x, y, n = 1, o = {}) {
      const c = compile(preset), pl = o.plane !== undefined ? o.plane : this._pl || null;
      // 앤티는 '잔 입자'만 모은다: 평균 크기가 가장 작은 것을 고정으로 고른다(무작위 비교면 큰 입자가 자주 뽑힘).
      // 번개 마디(bolt)는 길이(len)가 크기라 작아 보여도 1.5배로 수십 개 모이면 흰 털뭉치가 되므로 뺀다.
      const src = c.parts.concat(c.burst).filter((d) => d.type !== 'smoke' && d.type !== 'streak' && d.type !== 'bolt');
      if (!src.length) return;
      const avg = (v) => (Array.isArray(v) ? (v[0] + v[1]) / 2 : v);
      const base = src.reduce((m, d) => (avg(d.size) < avg(m.size) ? d : m));
      let d = gatherDefs.get(base);
      if (!d) { d = Object.assign({}, base, { size: Array.isArray(base.size) ? base.size.map((v) => v * 1.5) : base.size * 1.5, gravity: 0, drag: 0, life: [0.16, 0.26], inward: true, orbit: false, aim: false, spin: 0 }); gatherDefs.set(base, d); }
      const R = o.radius || [70, 140];
      this.onPlane(pl, () => {
        for (let i = 0; i < n; i++) {
          const a = Math.random() * TAU, r = rnd(R), L = rnd(d.life);
          // 수명 끝에 정확히 중심에 닿는 속도(끌림 0)
          const before = this.parts.length;
          this.spawn(d, x + Math.cos(a) * r, y + Math.sin(a) * r, -Math.cos(a) * r / L, -Math.sin(a) * r / L);
          if (this.parts.length > before) this.parts[this.parts.length - 1].life = L;
        }
      });
    }

    /** 타격 이펙트: 섬광 + 퍼지는 고리 + 별 모양 광선 + 파편 + 화면 흔들림. o.plain=true면 섬광만 */
    impact(x, y, preset, dir = 0, o = {}) {
      const c = compile(preset), pl = o.plane !== undefined ? o.plane : this._pl || null;
      let im = preset.impact || {};
      if (o.scale && o.scale !== 1) {   // 작은 투사체 타격 등: 섬광·고리·광선 크기만 줄임
        const k = o.scale, sz = (v, d) => v && Object.assign({}, v, { size: (v.size || d) * k });
        im = Object.assign({}, im, { flash: sz(im.flash, 120), ring: sz(im.ring, 110), star: im.star && Object.assign({}, im.star, { len: (im.star.len || 160) * k, width: (im.star.width || 10) * k }) });
      }
      if (o.plain || !this.rules) {
        this.hits.push({ x, y, p: preset, c: { flash: c.flash || [255, 255, 255] }, im: { flash: { size: 60, alpha: 0.8 } }, rays: [], age: 0, life: 0.25, pl });
        if (this.onImpact) this.onImpact(x, y, preset, dir);
        return;
      }
      // 근처 몸체 반응: 맞은 방향으로 찌그러지고 하얗게 번쩍, 밀려났다 돌아옴
      if (!pl) for (const b of this.bodies) {
        if (Math.hypot(b.x + b.ox - x, b.y + b.oy - y) < b.r * 2 + 30) { b.poke(-0.45, dir, 420); b.flash = 1; }
      }
      const rays = [];
      if (im.star) {
        // 참고 영상처럼 가늘고 아주 긴 주 광선 + 사방으로 튀는 짧은 바늘
        const cnt = im.star.count || 4, base = im.star.angle != null ? im.star.angle : dir + Math.PI / 4 + (Math.random() - 0.5) * 0.4, L0 = im.star.len || 160, W0 = im.star.width || 10;
        for (let i = 0; i < cnt; i++) {
          const long = i % 2 === 0;
          rays.push({ ang: base + (TAU / cnt) * i + (Math.random() - 0.5) * 0.15, len: L0 * (long ? 2.1 : 1.3) * (0.85 + Math.random() * 0.3), w: W0 * (long ? 0.55 : 0.4), main: true });
        }
        const nn = im.star.needles == null ? 12 : im.star.needles;
        for (let i = 0; i < nn; i++) {
          rays.push({ ang: Math.random() * TAU, len: L0 * lerp(0.25, 0.6, Math.random()), w: W0 * 0.18, off: L0 * lerp(0.15, 0.5, Math.random()), main: false });
        }
      }
      const shp = SHAPES[im.shape || (preset.trail && preset.trail.shape)], bits = [];
      for (let i = 0; i < 20; i++) bits.push(Math.random());
      this.hits.push({ x, y, p: preset, c, im, rays, age: 0, life: im.life || 0.42, pl, shape: shp ? shp.id : 0, bits });
      // 집중선: 화면 밖에서 타격점으로 모이는 가는 선 (만화·애니 효과선)
      if (im.lines !== false) {
        const L = [];
        for (let i = 0; i < 22; i++) L.push({ a: Math.random() * TAU, w: lerp(1.5, 6, Math.random()), r: lerp(0.9, 1.3, Math.random()) });
        this.lines.push({ x, y, age: 0, life: 0.22, L, col: c.star || c.flash || [255, 255, 255], pl });
      }
      this.kick({ x, y, dir, trauma: (im.shake || 6) / 14, freeze: im.hitstop == null ? 0.06 : im.hitstop,   // 60fps 기준 4프레임(격투·액션 히트스톱 2~4프레임)
      zoom: 0.045, frame: im.frames !== false });
      if (this.onImpact) this.onImpact(x, y, preset, dir);
      this.onPlane(pl, () => c.burst.forEach((d) => {
        const cnt = d.count || 20;
        for (let i = 0; i < cnt; i++) {
          const a = dir + (Math.random() - 0.5) * d.spread, sp = rnd(d.speed);
          this.spawn(d, x, y, Math.cos(a) * sp, Math.sin(a) * sp);
        }
      }));
      this.bloomAmt = preset.bloom == null ? 0.8 : preset.bloom;
    }

    /** 카메라 충격. trauma 0~1(흔들림, 제곱으로 적용), freeze=히트스톱 초, zoom=줌 펀치, frame=임팩트 프레임 */
    kick(o = {}) {
      this.trauma = clamp(this.trauma + (o.trauma || 0));
      if (o.dir != null) this.dir = o.dir;
      if (o.freeze) this.freeze = Math.max(this.freeze, o.freeze);
      if (o.zoom) { this.zoom = Math.max(this.zoom, o.zoom); this.px = o.x || 0; this.py = o.y || 0; }
      if (o.frame && this.impactFrames) this.ifr = 0;
    }
    /** 실제 경과 시간 -> 게임 시간. 히트스톱 동안은 거의 멈춘다(공격자·피격자 모두). 매 프레임 한 번 부른다 */
    scaleDt(real) {
      if (this.ifr >= 0) { this.ifr += real; if (this.ifr > 0.1) this.ifr = -1; }
      if (this.freeze > 0) { this.freeze -= real; return real * 0.03; }
      return real;
    }

    spawn(d, x, y, vx, vy) {
      if (this.parts.length >= MAX_PARTICLES) return;
      let z = 0, vz = 0;
      const L = this._pl;
      if (L) {   // 면 위 좌표·속도 → 3D 공간(입자는 면을 벗어나 날아간다)
        const o = L.o, r = L.r, q = L.d;
        const X = o[0] + r[0] * x + q[0] * y, Y = o[1] + r[1] * x + q[1] * y; z = o[2] + r[2] * x + q[2] * y;
        const VX = r[0] * vx + q[0] * vy, VY = r[1] * vx + q[1] * vy; vz = r[2] * vx + q[2] * vy;
        // 면 법선 방향으로도 흩뿌린다: 안 그러면 옆에서 볼 때 입자가 한 줄로 납작하게 보인다
        const n = [r[1] * q[2] - r[2] * q[1], r[2] * q[0] - r[0] * q[2], r[0] * q[1] - r[1] * q[0]];
        const vn = (Math.random() - 0.5) * 0.35 * Math.hypot(vx, vy), pn = (Math.random() - 0.5) * 6;
        x = X + n[0] * pn; y = Y + n[1] * pn; z += n[2] * pn; vx = VX + n[0] * vn; vy = VY + n[1] * vn; vz += n[2] * vn;
      }
      const p = { d, x, y, z, vx, vy, vz, age: 0, life: rnd(d.life), size: rnd(d.size), rot: Math.random() * TAU, spin: (Math.random() - 0.5) * 2 * (d.spin || 0), seed: Math.random() * 100, pts: null, regen: 0 };
      if (d.aim) { p.rot = Math.atan2(vy, vx) + (Math.random() - 0.5) * 0.5; p.spin = 0; }   // 결정·촉수: 바깥으로 솟는 방향
      p.r0 = p.rot;
      if (d.orbit) { p.cx = x; p.cy = y; p.oa = Math.random() * TAU; p.or = rnd(d.orbitR || [20, 60]); p.od = Math.random() < 0.5 ? -1 : 1; }
      this.parts.push(p);
    }

    update(dt) {
      this.t += dt;
      for (const t of this.trails) t.update(dt);
      this.trails = this.trails.filter((t) => t.alive);
      for (const s of this.shots) s.update(dt);
      this.shots = this.shots.filter((s) => s.alive);
      for (const b of this.bodies) b.update(dt);
      const P = this.parts;
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i], d = p.d;
        p.age += dt;
        if (p.age >= p.life) { P[i] = P[P.length - 1]; P.pop(); continue; }
        const k = Math.exp(-d.drag * dt);
        p.vx *= k; p.vy = p.vy * k + d.gravity * dt; p.vz *= k;
        if (d.type === 'flake') p.vx += Math.sin(p.age * 4 + p.seed) * 60 * dt;
        if (d.type === 'feather') { p.vx += Math.sin(p.age * 3 + p.seed) * 140 * dt; p.rot = p.r0 + Math.sin(p.age * 3 + p.seed) * 0.7; }
        if (d.orbit) {   // 중심을 따라가며 그 둘레를 도는 입자(비전 궤도)
          p.cx += p.vx * dt; p.cy += p.vy * dt; p.oa += d.orbit * p.od * dt; p.or *= Math.exp(-(d.orbitShrink || 0) * dt);
          p.x = p.cx + Math.cos(p.oa) * p.or; p.y = p.cy + Math.sin(p.oa) * p.or * (d.orbitFlat || 1);
          p.z += p.vz * dt;
        } else { p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; }
        p.rot += p.spin * dt;
      }
      for (const h of this.hits) h.age += dt;
      this.hits = this.hits.filter((h) => h.age < h.life);
      for (const l of this.lines) l.age += dt;
      this.lines = this.lines.filter((l) => l.age < l.life);
      // 트라우마 흔들림: 세기의 제곱 -> 약한 타격은 살짝, 강한 타격은 크게. 부드러운 노이즈 + 타격 방향으로 치우침
      this.trauma = Math.max(0, this.trauma - dt * 1.8);
      const sh = this.trauma * this.trauma * 26 * this.camScale, tt = this.t * 38;
      const nx = noise2(tt, 3.1) * 2 - 1, ny = noise2(tt, 9.7) * 2 - 1;
      this.sx = (nx * 0.6 + Math.cos(this.dir) * Math.abs(nx) * 0.8) * sh;
      this.sy = (ny * 0.6 + Math.sin(this.dir) * Math.abs(nx) * 0.8) * sh;
      this.rot = (noise2(tt, 21.3) * 2 - 1) * this.trauma * this.trauma * 0.035 * this.camScale;
      this.zoom *= Math.exp(-dt * 12);
    }

    get busy() { return this.trails.length + this.parts.length + this.hits.length + this.shots.length + this.lines.length > 0 || this.ifr >= 0; }
    clear() { this.trails = []; this.parts = []; this.hits = []; this.lines = []; this.shots = []; this.trauma = 0; this.zoom = 0; this.freeze = 0; this.ifr = -1; }
    cam(g) {   // 흔들림 + 타격점 기준 줌 펀치·기울기
      g.translate(this.sx, this.sy);
      if (this.zoom > 0.001 || this.rot) { g.translate(this.px, this.py); g.rotate(this.rot); g.scale(1 + this.zoom, 1 + this.zoom); g.translate(-this.px, -this.py); }
    }

    /* ---------- 3D ----------
       이펙트는 모두 '면' 위에서 2D로 계산한다(면 안 좌표: x=오른쪽, y=아래, 단위 px). 2D 모드는 그 면이 화면이다.
       3D 모드는 면을 월드 공간에 놓고 카메라로 투영한다. 띠는 면에 붙은 리본, 섬광·입자는 화면을 보는 빌보드다.
       내부 좌표(sim) = 월드 × unit, y만 뒤집음(월드 Y 위 → sim y 아래, 중력이 +y로 그대로 작동). */
    /** 매 프레임 카메라를 넘긴다. view·proj: 열 우선 4x4(Three.js의 matrixWorldInverse·projectionMatrix .elements). unit: 월드 1 = 프리셋 px 몇. null이면 2D */
    camera3d(c) {
      if (!c) { this.c3 = null; return; }
      const v = c.view, p = c.proj, m = new Float32Array(16);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) m[j * 4 + i] = p[i] * v[j * 4] + p[4 + i] * v[j * 4 + 1] + p[8 + i] * v[j * 4 + 2] + p[12 + i] * v[j * 4 + 3];
      this.unit = c.unit || this.unit || 100;
      this.c3 = { vp: m, view: v, focal: p[5] * this.fx.height / 2 };
    }
    /** 월드 공간의 면. origin=중심, right=면의 +x, down=면의 +y(둘 다 방향, 길이 무관) */
    plane(origin, right, down) {
      const u = this.unit || 100, n = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, -a[1] / l, a[2] / l]; };
      return { o: [origin[0] * u, -origin[1] * u, origin[2] * u], r: n(right), d: n(down) };
    }
    /** 카메라를 정면으로 보는 면(타격 섬광 등). camera3d 다음에 부른다 */
    facing(origin) {
      const v = this.c3 ? this.c3.view : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
      return this.plane(origin, [v[0], v[4], v[8]], [-v[1], -v[5], -v[9]]);
    }
    /** fn 동안 생기는 입자·타격을 면 pl 위에 놓는다 */
    onPlane(pl, fn) { const pv = this._pl; this._pl = pl; try { fn(); } finally { this._pl = pv; } }
    /** sim 좌표 → 화면 px. [x, y, px/sim단위, 깊이] 또는 카메라 뒤면 null. 2D면 그대로 */
    projSim(x, y, z) {
      const c = this.c3; if (!c) return [x, y, 1, 1];
      const m = c.vp, u = this.unit, X = x / u, Y = -y / u, Z = z / u;
      const w = m[3] * X + m[7] * Y + m[11] * Z + m[15];
      if (w < 1e-3) return null;
      const cx = m[0] * X + m[4] * Y + m[8] * Z + m[12], cy = m[1] * X + m[5] * Y + m[9] * Z + m[13];
      return [(cx / w * 0.5 + 0.5) * this.fx.width, (0.5 - cy / w * 0.5) * this.fx.height, c.focal / (w * u), w];
    }
    /** 면을 얼마나 정면으로 보나 → 띠 밝기 배율. 옆에서(칼날 면과 나란히) 보면 리본이 밝은 실선 하나로 뭉치므로 낮춘다 */
    edgeFade(pl) {
      const c = this.c3; if (!c || !pl) return 1;
      const v = c.view, u = this.unit;
      const ex = -(v[0] * v[12] + v[1] * v[13] + v[2] * v[14]), ey = -(v[4] * v[12] + v[5] * v[13] + v[6] * v[14]), ez = -(v[8] * v[12] + v[9] * v[13] + v[10] * v[14]);
      const r = [pl.r[0], -pl.r[1], pl.r[2]], d = [pl.d[0], -pl.d[1], pl.d[2]];
      const n = [r[1] * d[2] - r[2] * d[1], r[2] * d[0] - r[0] * d[2], r[0] * d[1] - r[1] * d[0]];
      const wx = pl.o[0] / u - ex, wy = -pl.o[1] / u - ey, wz = pl.o[2] / u - ez, L = Math.hypot(wx, wy, wz) || 1;
      const f = Math.abs(n[0] * wx + n[1] * wy + n[2] * wz) / L, k = Math.min(1, Math.max(0, (f - 0.04) / 0.36));
      return 0.3 + 0.7 * k * k * (3 - 2 * k);
    }
    /** 면 위 점 → 화면 px */
    projLocal(pl, x, y) {
      if (!pl || !this.c3) return this.projSim(x, y, 0);
      const o = pl.o, r = pl.r, q = pl.d;
      return this.projSim(o[0] + r[0] * x + q[0] * y, o[1] + r[1] * x + q[1] * y, o[2] + r[2] * x + q[2] * y);
    }
    /** 월드 좌표 → 화면 px(칼·캐릭터를 같은 카메라로 그릴 때) */
    toScreen(X, Y, Z) { const u = this.unit || 100; return this.projSim(X * u, -Y * u, Z * u); }

    /**
     * ctx: 화면 캔버스. world(c): 월드 좌표 변환을 거는 함수(예: DPR 배율).
     * opts.between(ctx): 뒤 레이어와 빛 레이어 사이에 그릴 것(검·캐릭터).
     */
    render(ctx, world, opts = {}) {
      // GPU 경로(vfx-gl.js): 셰이더로 노이즈 침식·그라디언트 맵·밉 체인 블룸. 없거나 실패하면 2D 경로
      if (this.useGL !== false && root.VFX.GL) {
        if (this.gl === undefined) this.gl = root.VFX.GL.create(this);
        if (this.gl) return this.gl.render(ctx, world, opts);
      }
      return this.render2d(ctx, world, opts);
    }
    /** 임팩트 프레임(애니): 첫 ~2프레임 화면 반전, 다음 ~2프레임 흑백 고대비. ctx는 화면 좌표 상태 */
    postFrames(ctx, W, H) {
      if (this.ifr < 0) return;
      ctx.globalAlpha = 1;
      if (this.ifr < 0.03) { ctx.globalCompositeOperation = 'difference'; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); }
      else if (this.ifr < 0.06) { ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(0, 0, W, H); }
    }
    render2d(ctx, world, opts = {}) {
      if (this.c3) { if (!this._warned3d) { this._warned3d = true; console.warn('VFX: 3D 모드는 WebGL이 필요하다'); } return; }
      const W = this.fx.width, H = this.fx.height;
      // 1) 뒤 레이어: 연기·어두운 띠 (일반 합성)
      ctx.save(); world(ctx); this.cam(ctx);
      for (const p of this.parts) if (p.d.type === 'smoke') this.drawSmoke(ctx, p);
      for (const t of this.trails) t.draw(ctx, 'back');
      if (opts.between) opts.between(ctx);
      ctx.restore();
      // 2) 빛 레이어 (더하기 합성)
      const f = this.fc;
      f.setTransform(1, 0, 0, 1, 0, 0); f.globalCompositeOperation = 'source-over'; f.clearRect(0, 0, W, H);
      if (!this.busy) return;
      f.save(); world(f); this.cam(f); f.globalCompositeOperation = 'lighter';
      for (const l of this.lines) this.drawLines(f, l);
      for (const t of this.trails) t.draw(f, 'light');
      for (const p of this.parts) if (p.d.type !== 'smoke') this.drawPart(f, p);
      for (const s of this.shots) s.draw(f);
      for (const h of this.hits) this.drawHit(f, h);
      f.restore();
      // 3) 합성 + 블룸
      const bloom = opts.bloom == null ? this.bloomAmt : opts.bloom;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(this.fx, 0, 0);
      if (bloom > 0) {
        const b1 = this.b1c, b2 = this.b2c;
        b1.globalCompositeOperation = 'copy'; if (this.hasFilter) b1.filter = 'blur(2px)';
        b1.drawImage(this.fx, 0, 0, this.b1.width, this.b1.height); b1.filter = 'none';
        b2.globalCompositeOperation = 'copy'; if (this.hasFilter) b2.filter = 'blur(2px)';
        b2.drawImage(this.b1, 0, 0, this.b2.width, this.b2.height); b2.filter = 'none';
        ctx.imageSmoothingEnabled = true;
        ctx.globalAlpha = clamp(bloom * 1.0); ctx.drawImage(this.b1, 0, 0, W, H);
        ctx.globalAlpha = clamp(bloom * 1.0); ctx.drawImage(this.b2, 0, 0, W, H); ctx.drawImage(this.b2, 0, 0, W, H);
      }
      // 4) 임팩트 프레임(애니): 첫 ~2프레임은 화면 반전, 다음 ~2프레임은 흑백 고대비 -> 다시 정상
      this.postFrames(ctx, W, H);
      ctx.restore();
    }

    drawLines(ctx, l) {
      const k = l.age / l.life, a = Math.pow(1 - k, 1.5);
      const rin = lerp(230, 90, 1 - Math.pow(1 - k, 3));
      for (const s of l.L) {
        const ca = Math.cos(s.a), sa = Math.sin(s.a), ro = 900 * s.r, ri = rin * s.r, w = s.w * (1 - k * 0.5);
        ctx.fillStyle = rgba(s.w > 4 ? l.col : [255, 255, 255], 0.55 * a);
        ctx.beginPath();
        ctx.moveTo(l.x + ca * ro - sa * w, l.y + sa * ro + ca * w);
        ctx.lineTo(l.x + ca * ri, l.y + sa * ri);
        ctx.lineTo(l.x + ca * ro + sa * w, l.y + sa * ro - ca * w);
        ctx.closePath(); ctx.fill();
      }
    }

    drawSmoke(ctx, p) {
      const k = p.age / p.life, r = p.size * (1 + k * 2.2);
      const col = p.d.ramp(k), a = Math.min(0.4, p.d.alpha) * Math.sin(Math.PI * Math.min(1, k * 1.4 + 0.05)) * (1 - k);
      if (a < 0.01) return;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
    }

    drawPart(ctx, p) {
      const d = p.d, k = p.age / p.life, col = d.ramp(k);
      let a = partAlpha(d, k);
      switch (d.type) {
        case 'spark': {
          const l = 0.022 * d.len;
          ctx.strokeStyle = rgba(col, a); ctx.lineWidth = p.size * (1 - k * 0.6); ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * l, p.y - p.vy * l); ctx.stroke();
          break;
        }
        case 'ember': {
          a *= 0.6 + 0.4 * Math.sin(this.t * 28 + p.seed * 7);
          ctx.fillStyle = rgba(col, a * 0.25); ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 2.6, 0, TAU); ctx.fill();
          ctx.fillStyle = rgba(col, a); ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.8, 0, TAU); ctx.fill();
          break;
        }
        case 'shard': {
          // 깨진 조각: 씨앗마다 꼭짓점 3~5개·길쭉함이 다른 다각형, 조각면마다 밝기가 다르고 금 간 능선
          const fr = (p.seed * 0.618) % 1, sd = p.seed * 0.013, nv = 3 + Math.floor(hsh(sd * 1.7) * 3), off = hsh(sd * 0.9);
          const L = p.size * (1.6 + 1.8 * fr) * Math.sqrt(d.len), W = p.size * (0.9 + 0.9 * (1 - fr)), c = Math.cos(p.rot), s = Math.sin(p.rot);
          const vs = [];
          for (let j = 0; j < nv; j++) {
            const b = (j + off) * TAU / nv, r = 0.5 + 0.5 * hsh(sd * 2.3 + j * 5.7), u = Math.cos(b) * r * L, v = Math.sin(b) * r * W;
            vs.push([p.x + c * u - s * v, p.y + s * u + c * v]);
          }
          for (let j = 0; j < nv; j++) {
            const q0 = vs[j], q1 = vs[(j + 1) % nv];
            ctx.fillStyle = rgba(col, a * (0.18 + 0.42 * hsh(sd * 3.1 + j * 7.3)));
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.closePath(); ctx.fill();
          }
          ctx.strokeStyle = rgba([255, 255, 255], a * 0.5); ctx.lineWidth = 0.8; ctx.beginPath();
          vs.forEach((q, j) => (j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath();
          for (const q of vs) { ctx.moveTo(p.x, p.y); ctx.lineTo(q[0], q[1]); }
          ctx.stroke();
          break;
        }
        case 'flake': {
          a *= Math.min(1, k * 6);   // 육각 눈송이: 여섯 팔 + 곁가지
          const R = p.size * 2.2;
          ctx.strokeStyle = rgba(col, a); ctx.lineWidth = Math.max(0.8, p.size * 0.22); ctx.lineCap = 'round'; ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const an = p.rot + i * TAU / 6, c = Math.cos(an), sn = Math.sin(an);
            ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + c * R, p.y + sn * R);
            if (R > 6) for (const [t, l] of [[0.45, 0.3], [0.7, 0.2]]) {
              const bx = p.x + c * R * t, by = p.y + sn * R * t;
              for (const sg of [-1, 1]) { const b2 = an + sg * 1.0472; ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(b2) * R * l, by + Math.sin(b2) * R * l); }
            }
          }
          ctx.stroke();
          break;
        }
        case 'crystal': {   // 육각 결정 기둥: 밝은 앞면 + 어두운 옆면 + 뾰족한 끝
          const gr = smooth(0, 0.15, k), Lc = p.size * 4.4 * d.len * (0.25 + 0.75 * gr), w = p.size * 1.5, c = Math.cos(p.rot), sn = Math.sin(p.rot);
          const pt = (u, v) => [p.x + c * u - sn * v, p.y + sn * u + c * v];
          const face = (pts, al) => { ctx.beginPath(); pts.forEach((q, i) => { const [x, y] = pt(q[0], q[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.fillStyle = rgba(col, al); ctx.fill(); };
          const bL = Lc * 0.72;
          face([[0, -w], [bL, -w], [Lc, 0], [0, -w * 0.34]], a * 0.3);
          face([[0, w], [bL, w], [Lc, 0], [0, w * 0.34]], a * 0.5);
          face([[0, -w * 0.34], [bL, -w * 0.34], [Lc, 0], [bL, w * 0.34], [0, w * 0.34]], a * 0.75);
          ctx.strokeStyle = rgba([255, 255, 255], a * 0.8); ctx.lineWidth = 1; ctx.beginPath();
          const [x0, y0] = pt(Lc * 0.1, -w * 0.34), [x1, y1] = pt(bL, -w * 0.34), [x2, y2] = pt(Lc, 0);
          ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          break;
        }
        case 'tendril': {   // 연기 촉수: 굵은 뿌리에서 뾰족한 끝으로 꿈틀대는 곡선
          a *= smooth(0, 0.15, k);
          const Lt = p.size * 4.8 * d.len * (0.5 + 0.5 * smooth(0, 0.3, k)), c = Math.cos(p.rot), sn = Math.sin(p.rot), N = 12, Lf = [], Rt = [], sg = hsh(p.seed * 0.043) > 0.5 ? 1 : -1;   // 씨앗마다 한쪽으로 말리는 갈고리
          for (let i = 0; i <= N; i++) {
            const h = i / N, wob = (sg * 0.3 * h * h + Math.sin(h * 5 + this.t * 6 + p.seed * 9) * 0.08 * h) * Lt, w = p.size * 0.9 * Math.pow(1 - h, 0.9) * Math.min(1, 0.1 + h * 4);   // 뿌리도 뾰족하게(뭉툭한 판 방지)
            const u = h * Lt; Lf.push([p.x + c * u - sn * (wob + w), p.y + sn * u + c * (wob + w)]); Rt.push([p.x + c * u - sn * (wob - w), p.y + sn * u + c * (wob - w)]);
          }
          ctx.beginPath(); Lf.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); for (let i = N; i >= 0; i--) ctx.lineTo(Rt[i][0], Rt[i][1]);
          ctx.closePath(); ctx.fillStyle = rgba(col, a * 0.22); ctx.fill();   // 가산으로 여러 개가 겹쳐도 순백이 되지 않게 몸통은 옅게
          ctx.strokeStyle = rgba(col, a * 0.45); ctx.lineWidth = 1; ctx.stroke();   // 테만 밝게
          break;
        }
        case 'mote': {
          a *= Math.min(1, k * 8);
          ctx.fillStyle = rgba(col, a * 0.18); ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 4, 0, TAU); ctx.fill();
          ctx.fillStyle = rgba(col, a); ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
          break;
        }
        // 원소 고유 입자(2D 대체 렌더): GL 스프라이트와 같은 실루엣을 경로로 근사
        case 'flame': {   // 눈물 모양 불꽃: 움직이는 쪽이 끝
          const v = Math.hypot(p.vx, p.vy), ux = v > 30 ? p.vx / v : 0, uy = v > 30 ? p.vy / v : -1, L = p.size * 2.2 * (1 - k * 0.5), w = p.size * 0.7 * (1 - k * 0.4);
          for (const [s, aa, cc] of [[1, 0.5, col], [0.5, 0.9, [255, 240, 200]]]) {
            ctx.fillStyle = rgba(cc, a * aa); ctx.beginPath();
            ctx.moveTo(p.x + ux * L * s, p.y + uy * L * s);
            ctx.quadraticCurveTo(p.x - uy * w * s * 1.6, p.y + ux * w * s * 1.6, p.x - ux * w * s, p.y - uy * w * s);
            ctx.quadraticCurveTo(p.x + uy * w * s * 1.6, p.y - ux * w * s * 1.6, p.x + ux * L * s, p.y + uy * L * s);
            ctx.fill();
          }
          break;
        }
        case 'mist': {   // 흐린 구름(하얀 핵 없음)
          const r = p.size * (1 + k * 1.4), gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          gr.addColorStop(0, rgba(col, a * 0.22 * Math.min(1, k * 5))); gr.addColorStop(1, rgba(col, 0));
          ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
          break;
        }
        case 'drop': {   // 액체 방울: 둥근 머리 + 꼬리 + 광택
          const v = Math.hypot(p.vx, p.vy) || 1, ux = p.vx / v, uy = p.vy / v, r = p.size * 0.6, T = p.size * (1 + Math.min(2, v / 300));
          ctx.fillStyle = rgba(col, a * 0.85); ctx.beginPath();
          ctx.moveTo(p.x - ux * T, p.y - uy * T); ctx.lineTo(p.x - uy * r, p.y + ux * r);
          ctx.arc(p.x, p.y, r, Math.atan2(ux, -uy), Math.atan2(ux, -uy) + Math.PI, true); ctx.closePath(); ctx.fill();
          ctx.fillStyle = rgba([255, 255, 255], a * 0.7); ctx.beginPath(); ctx.arc(p.x + ux * r * 0.3 - uy * r * 0.3, p.y + uy * r * 0.3 + ux * r * 0.3, r * 0.25, 0, TAU); ctx.fill();
          break;
        }
        case 'bubble': {   // 거품: 얇은 테 + 광택
          const r = p.size * 0.8;
          ctx.strokeStyle = rgba(col, a * 0.7); ctx.lineWidth = Math.max(1, r * 0.15);
          ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
          ctx.fillStyle = rgba(col, a * 0.1); ctx.fill();
          ctx.fillStyle = rgba([255, 255, 255], a * 0.8); ctx.beginPath(); ctx.arc(p.x - r * 0.35, p.y - r * 0.35, r * 0.18, 0, TAU); ctx.fill();
          break;
        }
        case 'feather': {   // 깃털: 깃대 + 뾰족한 잎 윤곽
          const c = Math.cos(p.rot), s = Math.sin(p.rot), L = p.size * 1.4, w = p.size * 0.45;
          ctx.fillStyle = rgba(col, a * 0.75); ctx.beginPath();
          ctx.moveTo(p.x + c * L, p.y + s * L);
          ctx.quadraticCurveTo(p.x - s * w * 2, p.y + c * w * 2, p.x - c * L, p.y - s * L);
          ctx.quadraticCurveTo(p.x + s * w * 2, p.y - c * w * 2, p.x + c * L, p.y + s * L); ctx.fill();
          ctx.strokeStyle = rgba([255, 255, 255], a * 0.8); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(p.x + c * L, p.y + s * L); ctx.lineTo(p.x - c * L * 1.2, p.y - s * L * 1.2); ctx.stroke();
          break;
        }
        case 'glyph': {   // 룬 글자: 3x3 격자 획 몇 개
          const g = p.size * 0.5, sd = Math.floor(p.seed * 7);
          ctx.strokeStyle = rgba(col, a * Math.min(1, k * 8)); ctx.lineWidth = Math.max(1, p.size * 0.14); ctx.lineCap = 'round';
          ctx.beginPath();
          for (let i = 0; i < 4; i++) {
            const h = (sd * 13 + i * 7) % 9, j = (sd * 5 + i * 11 + 3) % 9;
            ctx.moveTo(p.x + ((h % 3) - 1) * g, p.y + (Math.floor(h / 3) - 1) * g);
            ctx.lineTo(p.x + ((j % 3) - 1) * g, p.y + (Math.floor(j / 3) - 1) * g);
          }
          const a0 = (p.seed * 3.1) % TAU; ctx.moveTo(p.x + Math.cos(a0) * g * 1.45, p.y + Math.sin(a0) * g * 1.45);
          ctx.arc(p.x, p.y, g * 1.45, a0, a0 + 1.6 + (p.seed % 1) * 2.2);   // 굽은 호 획
          ctx.stroke();
          break;
        }
        case 'streak': {   // 길고 양끝이 뾰족한 빛 줄(속도선)
          const v = Math.hypot(p.vx, p.vy) || 1, ux = p.vx / v, uy = p.vy / v, L = 30 + v * 0.07, w = p.size * (1 - k * 0.7);
          for (const [ww, aa, cc] of [[w * 2.2, 0.3, col], [w, 1, [255, 255, 255]]]) {
            ctx.fillStyle = rgba(cc, a * aa);
            ctx.beginPath(); ctx.moveTo(p.x + ux * L * 0.25, p.y + uy * L * 0.25);
            ctx.lineTo(p.x - uy * ww, p.y + ux * ww); ctx.lineTo(p.x - ux * L, p.y - uy * L); ctx.lineTo(p.x + uy * ww, p.y - ux * ww);
            ctx.closePath(); ctx.fill();
          }
          break;
        }
        case 'bolt': {
          if (!p.pts || this.t - p.regen > 0.045) {
            p.regen = this.t;
            const L = d.len * (0.7 + 0.15 * p.size), ang = Math.atan2(p.vy, p.vx) + (Math.random() - 0.5) * 0.8;
            const seg = 6, pts = [0, 0];
            for (let i = 1; i <= seg; i++) {
              const t = i / seg, off = i === seg ? 0 : (Math.random() - 0.5) * L * 0.35;
              pts.push(Math.cos(ang) * L * t - Math.sin(ang) * off, Math.sin(ang) * L * t + Math.cos(ang) * off);
            }
            p.pts = pts;
          }
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          for (const [lw, aa, cc] of [[p.size * 3, 0.25, col], [p.size * 0.9, 1, [255, 255, 255]]]) {
            ctx.strokeStyle = rgba(cc, a * aa); ctx.lineWidth = lw;
            ctx.beginPath(); ctx.moveTo(p.x + p.pts[0], p.y + p.pts[1]);
            for (let i = 2; i < p.pts.length; i += 2) ctx.lineTo(p.x + p.pts[i], p.y + p.pts[i + 1]);
            ctx.stroke();
          }
          break;
        }
        default: {
          ctx.fillStyle = rgba(col, a); ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
        }
      }
    }

    drawHit(ctx, h) {
      const k = h.age / h.life, im = h.im, c = h.c;
      const eo = 1 - Math.pow(1 - k, 3);
      if (c.flash) {
        const r = (im.flash.size || 120) * (0.4 + eo * 0.5), a = Math.pow(1 - k, 2.5) * (im.flash.alpha || 0.9) * 0.75;
        const g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, r);
        g.addColorStop(0, rgba([255, 255, 255], a)); g.addColorStop(0.25, rgba(c.flash, a * 0.8)); g.addColorStop(1, rgba(c.flash, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(h.x, h.y, r, 0, TAU); ctx.fill();
      }
      if (c.ring) {
        const r = (im.ring.size || 110) * eo, w = (im.ring.width || 6) * (1 - k);
        if (w > 0.2) {
          ctx.strokeStyle = rgba(c.ring, (1 - k) * 0.5); ctx.lineWidth = w;
          ctx.beginPath(); ctx.arc(h.x, h.y, r, 0, TAU); ctx.stroke();
        }
      }
      if (c.star) {
        const grow = smooth(0, 0.18, k), thin = Math.pow(1 - k, 1.6);
        const dia = (ca, sa, o, len, wd, col, a) => {
          // 가운데가 약간 굵고 양끝이 바늘처럼 뾰족한 광선
          ctx.fillStyle = rgba(col, a);
          ctx.beginPath();
          ctx.moveTo(h.x + ca * (o - len * 0.08), h.y + sa * (o - len * 0.08));
          ctx.lineTo(h.x + ca * (o + len * 0.12) - sa * wd, h.y + sa * (o + len * 0.12) + ca * wd);
          ctx.lineTo(h.x + ca * (o + len), h.y + sa * (o + len));
          ctx.lineTo(h.x + ca * (o + len * 0.12) + sa * wd, h.y + sa * (o + len * 0.12) - ca * wd);
          ctx.closePath(); ctx.fill();
        };
        for (const ray of h.rays) {
          const ca = Math.cos(ray.ang), sa = Math.sin(ray.ang);
          if (ray.main) {
            const L = ray.len * (0.3 + 0.7 * grow), w = ray.w * thin;
            if (w < 0.15) continue;
            dia(ca, sa, 0, L, w * 2.4, c.star, 0.35 * thin);
            dia(ca, sa, 0, L, w, c.star, 0.9 * thin + 0.1);
            dia(ca, sa, 0, L * 0.85, w * 0.4, [255, 255, 255], thin);
          } else {
            const o = ray.off * (0.4 + 0.9 * grow), L = ray.len * (1 - k * 0.5), w = ray.w * thin;
            if (w < 0.15) continue;
            dia(ca, sa, o, L, w, c.star, 0.8 * thin);
            dia(ca, sa, o, L * 0.8, w * 0.45, [255, 255, 255], thin);
          }
        }
        // 교차점 하얀 핵
        const cr = (im.star.width || 10) * 2.2 * (1 - k);
        if (cr > 0.5) {
          const g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, cr * 3);
          g.addColorStop(0, rgba([255, 255, 255], 1 - k)); g.addColorStop(0.3, rgba(c.star, 0.7 * (1 - k))); g.addColorStop(1, rgba(c.star, 0));
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(h.x, h.y, cr * 3, 0, TAU); ctx.fill();
        }
      }
    }
  }

  root.VFX = Object.assign(root.VFX || {}, { Engine, Trail, Body, Shot, SHAPES, partAlpha, ramp, hex, rgba, noise2, fbm, clamp, lerp, smooth, compile, presets: (root.VFX && root.VFX.presets) || {} });
})(typeof window !== 'undefined' ? window : globalThis);
