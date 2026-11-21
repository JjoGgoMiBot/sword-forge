// 쪼꼬미랜드 오락관 결과 이펙트 모듈.
// 서버가 판정한 결과를 받은 뒤 "보여주기만" 한다. 돈·확률·판정은 여기서 건드리지 않는다.
// 바깥에 내놓는 것: casinoOutcome(결과 분류) · fxPlanFor(상황별 연출표) · playCasinoFx(재생)
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const COIN_SRC = 'assets/choco-coin.png';
const HOLD_MS = 55; // 임팩트 순간 정지감(몇 프레임 멈춘 듯 보이게)
const HOLD_SCALE = 0.12;

// 한 곳에 모은 연출표. 숫자만 바꾸면 세기가 바뀐다.
// wait: 앤티시페이션(모이는 시간) · dur: 전체 길이 · coins/sparks/shards: 큰/중/잔 입자 수
const RECIPES = {
  jackpot:   { dur: 3400, wait: 520, coins: 44, sparks: 72, shards: 34, rings: 3, flash: 1,   dust: 0,  dim: 0.22, bloom: '#ffd66b' },
  blackjack: { dur: 2300, wait: 300, coins: 10, sparks: 38, shards: 16, rings: 2, flash: 0.7, dust: 0,  dim: 0.12, bloom: '#f1dc9f' },
  win:       { dur: 1900, wait: 150, coins: 16, sparks: 26, shards: 0,  rings: 1, flash: 0.5, dust: 0,  dim: 0,    bloom: '#f6c85f' },
  draw:      { dur: 950,  wait: 0,   coins: 0,  sparks: 0,  shards: 0,  rings: 1, flash: 0,   dust: 0,  dim: 0,    bloom: '#e6d9bd' },
  loss:      { dur: 1250, wait: 0,   coins: 0,  sparks: 0,  shards: 0,  rings: 0, flash: 0,   dust: 14, dim: 0.34, bloom: '#4b3a30' },
};

// 게임별로 이펙트가 터지는 자리(화면 안 요소)와 세기 보정.
const ORIGIN = {
  slots: { sel: '.slot-cabinet', scale: 1.15 },
  dice: { sel: '.dice-scene', scale: 1 },
  blackjack: { sel: '.blackjack-table-art, .bj-hands, .playing-card', scale: 1 },
  horse: { sel: '.race-heading img', scale: 1.05 },
  quiz: { sel: '.quiz-board-art', scale: 0.95 },
  rps: { sel: '.rps-scene', scale: 0.95 },
};

export function casinoOutcome(result, game) {
  if (!result) return 'idle';
  if (game === 'blackjack') {
    const round = result.round;
    if (!round?.done) return 'deal';
    if (round.outcome === 'blackjack') return 'blackjack';
    if (['win', 'dealer_bust'].includes(round.outcome)) return 'win';
    return round.outcome === 'push' ? 'draw' : 'loss';
  }
  if (game === 'quiz') return result.correct === true ? 'win' : result.correct === false ? 'loss' : 'idle';
  if (['daily', 'rescue'].includes(game)) return 'win';
  if (!Number.isFinite(result.payout) || !Number.isFinite(result.bet)) return 'idle';
  if (game === 'slots' && result.payout >= result.bet * 20) return 'jackpot';
  return result.payout > result.bet ? 'win' : result.payout === result.bet ? 'draw' : 'loss';
}

// 상황(결과+게임) → 연출표. 알 수 없는 상황은 null(아무것도 안 함).
export function fxPlanFor(outcome, game) {
  const base = RECIPES[outcome];
  if (!base) return null;
  const k = (ORIGIN[game] || {}).scale || 1;
  return { ...base, outcome, game, coins: Math.round(base.coins * k), sparks: Math.round(base.sparks * k) };
}

export const reducedMotion = () => {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

let coinPromise = null;
const loadCoin = () => coinPromise || (coinPromise = new Promise(resolve => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = COIN_SRC;
}));

const running = new WeakMap();

function originOf(stage, game) {
  const box = stage.getBoundingClientRect();
  const hit = (ORIGIN[game] && stage.querySelector(ORIGIN[game].sel)) || null;
  if (!hit) return { x: box.width / 2, y: box.height * 0.5 };
  const r = hit.getBoundingClientRect();
  return { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2 };
}

// 모션 줄이기 설정: 움직임 없이 짧은 빛 번짐 한 번만(알림 역할).
function softGlow(stage, plan) {
  const veil = document.createElement('div');
  veil.setAttribute('aria-hidden', 'true');
  veil.style.cssText = 'position:absolute;inset:0;z-index:8;pointer-events:none;border-radius:inherit;background:radial-gradient(circle at 50% 50%,' + plan.bloom + 'aa,transparent 70%)';
  stage.append(veil);
  const anim = veil.animate([{ opacity: 0 }, { opacity: plan.outcome === 'loss' ? 0.35 : 0.8 }, { opacity: 0 }], { duration: 700, easing: 'ease-out' });
  const end = () => veil.remove();
  anim.onfinish = end;
  anim.oncancel = end;
  return { cancel: () => { anim.cancel(); }, done: new Promise(r => { anim.addEventListener('finish', r); anim.addEventListener('cancel', r); }) };
}

export function playCasinoFx(stage, { outcome, game, rand = Math.random, reduced = reducedMotion() } = {}) {
  const plan = fxPlanFor(outcome, game);
  if (!stage || !plan) return { cancel() {}, done: Promise.resolve() };
  running.get(stage)?.cancel();
  if (reduced) { const soft = softGlow(stage, plan); running.set(stage, soft); return soft; }

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:8;pointer-events:none;border-radius:inherit';
  const ctx = canvas.getContext('2d');
  if (!ctx) return { cancel() {}, done: Promise.resolve() };
  const box = stage.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = Math.max(1, Math.round(box.width)), H = Math.max(1, Math.round(box.height));
  canvas.width = W * dpr; canvas.height = H * dpr;
  stage.append(canvas);

  const at = originOf(stage, game);
  const parts = [], rings = [];
  let coinImg = null, flashAt = -1, raf = 0, stopped = false, spawned = false;
  loadCoin().then(img => { coinImg = img; });
  let resolveDone; const done = new Promise(r => { resolveDone = r; });
  const R = (a, b) => a + (b - a) * rand();

  const spawnMote = () => { // 앤티시페이션: 바깥 빛 알갱이가 중심으로 모인다
    const a = R(0, TAU), d = R(110, 210);
    parts.push({ kind: 'mote', x: at.x + Math.cos(a) * d, y: at.y + Math.sin(a) * d, tx: at.x, ty: at.y, born: 0, life: plan.wait / 1000 * R(0.7, 1) });
  };
  const impact = () => {
    flashAt = performance.now();
    for (let i = 0; i < plan.rings; i++) rings.push({ delay: i * 95, max: 90 + i * 70, born: performance.now() });
    // 큰 형태 1개(첫 코인) + 중간(코인) + 잔 입자(불똥·조각)
    for (let i = 0; i < plan.coins; i++) {
      const a = -Math.PI / 2 + R(-0.75, 0.75);
      // 정점이 무대 위쪽 밖으로 나가 잘리지 않게 발사 속도 상한을 둔다
      const vMax = Math.sqrt(2 * 1250 * Math.max(60, at.y * 0.92));
      const v = Math.min(vMax, R(380, 760) * (plan.outcome === 'jackpot' ? 1.2 : 1));
      parts.push({ kind: 'coin', x: at.x, y: at.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 1250, size: i === 0 ? 56 : R(22, 40), spin: R(6, 14), rot: R(0, TAU), born: 0, life: R(1.25, 1.9) });
    }
    for (let i = 0; i < plan.sparks; i++) {
      const a = R(0, TAU), v = R(220, 760);
      parts.push({ kind: 'spark', x: at.x, y: at.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 90, g: 380, drag: 2.2, len: R(0.035, 0.07), born: 0, life: R(0.55, 1.15) });
    }
    for (let i = 0; i < plan.shards; i++) {
      parts.push({ kind: 'shard', x: at.x + R(-60, 60), y: at.y - 20, vx: R(-160, 160), vy: R(-420, -120), g: 340, w: R(6, 11), h: R(10, 17), rot: R(0, TAU), spin: R(-9, 9), hue: Math.floor(R(0, 4)), born: 0, life: R(1.4, 2.3) });
    }
    for (let i = 0; i < plan.dust; i++) {
      parts.push({ kind: 'dust', x: at.x + R(-90, 90), y: at.y + R(-30, 30), vx: R(-14, 14), vy: R(10, 60), g: 22, r: R(1.5, 3.4), born: 0, life: R(0.9, 1.3) });
    }
  };

  const SHARD = ['#f6c85f', '#fff4cf', '#e58c8a', '#9fd4b0'];
  const sparkRamp = t => (t < 0.18 ? 'rgba(255,253,240,' : t < 0.55 ? 'rgba(255,208,96,' : 'rgba(224,122,42,');
  const t0 = performance.now();
  let last = t0, simEl = 0;

  function finish() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    canvas.remove();
    if (running.get(stage) === handle) running.delete(stage);
    resolveDone();
  }

  function frame(now) {
    if (stopped) return;
    const real = Math.min(0.05, (now - last) / 1000);
    last = now;
    simEl += real * 1000; // 느린 기기에서도 입자 시간과 종료 시각이 어긋나지 않게 같은 시계를 쓴다
    const el = simEl;
    const hold = spawned && now - flashAt < HOLD_MS;
    const dt = hold ? real * HOLD_SCALE : real;
    if (!spawned && el >= plan.wait) { spawned = true; impact(); }
    if (!spawned && plan.wait && rand() < 0.55) spawnMote();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // 가장자리 어둡힘: 앤티에서 깊어지고, 임팩트 뒤 서서히 풀림. 패배는 느리게 가라앉는다.
    if (plan.dim) {
      const ramp = plan.wait ? clamp(el / plan.wait, 0, 1) : clamp(el / 260, 0, 1);
      const fade = clamp(1 - (el - plan.wait) / (plan.dur - plan.wait), 0, 1);
      const a = plan.dim * (spawned ? fade : ramp) * (plan.outcome === 'loss' ? clamp(1 - Math.max(0, el - 500) / 750, 0, 1) : 1);
      const vg = ctx.createRadialGradient(at.x, at.y, Math.min(W, H) * 0.25, at.x, at.y, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(30,20,12,0)');
      vg.addColorStop(1, 'rgba(30,20,12,' + a.toFixed(3) + ')');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    }

    // 층 1: 입자(몸통) — 일반 합성
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.born += dt;
      const t = p.born / p.life;
      if (t >= 1) { parts.splice(i, 1); continue; }
      if (p.kind === 'mote') {
        const e = t * t; // 끝으로 갈수록 빨려 들어간다
        const x = p.x + (p.tx - p.x) * e, y = p.y + (p.ty - p.y) * e;
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,224,140,' + (0.25 + 0.6 * t).toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(x, y, 1.6 + 2.2 * t, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        continue;
      }
      if (p.kind === 'dust') {
        p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        ctx.fillStyle = 'rgba(92,72,58,' + (0.5 * (1 - t)).toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
        continue;
      }
      if (p.kind === 'spark') {
        const drag = Math.exp(-p.drag * dt);
        p.vx *= drag; p.vy = p.vy * drag + p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        // 끝이 뾰족한 불똥: 진행 방향 앞이 굵고 뒤로 갈수록 가늘다
        const tx = p.x - p.vx * p.len, ty = p.y - p.vy * p.len;
        const nx = -p.vy, ny = p.vx, nl = Math.hypot(nx, ny) || 1, wd = 2.4 * (1 - t * 0.6);
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = sparkRamp(t) + (1 - t * t).toFixed(2) + ')';
        ctx.beginPath();
        ctx.moveTo(p.x + (nx / nl) * wd, p.y + (ny / nl) * wd);
        ctx.lineTo(tx, ty);
        ctx.lineTo(p.x - (nx / nl) * wd, p.y - (ny / nl) * wd);
        ctx.closePath(); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        continue;
      }
      p.vy += p.g * dt;
      if (p.kind === 'shard') p.vx += Math.sin(p.born * 7 + p.rot) * 120 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
      const alpha = t > 0.72 ? 1 - (t - 0.72) / 0.28 : 1; // 소멸 구간이 길다
      ctx.save();
      ctx.globalAlpha = clamp(alpha, 0, 1);
      ctx.translate(p.x, p.y);
      if (p.kind === 'coin') {
        const flip = Math.cos(p.rot); // 회전하며 옆면이 보이는 코인
        ctx.scale(Math.abs(flip) < 0.12 ? 0.12 : flip, 1);
        if (coinImg) ctx.drawImage(coinImg, -p.size / 2, -p.size / 2, p.size, p.size);
        else { ctx.fillStyle = '#c98a3b'; ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, TAU); ctx.fill(); }
      } else {
        ctx.rotate(p.rot); ctx.scale(Math.cos(p.born * 9 + p.rot), 1);
        ctx.fillStyle = SHARD[p.hue]; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      ctx.restore();
    }

    // 층 2: 충격 고리 — 굵기가 줄며 퍼진다
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i], age = now - r.born - r.delay;
      if (age < 0) continue;
      const t = age / 620;
      if (t >= 1) { rings.splice(i, 1); continue; }
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = plan.bloom + Math.round(clamp((1 - t) * 0.8, 0, 1) * 255).toString(16).padStart(2, '0');
      ctx.lineWidth = Math.max(0.6, 7 * (1 - t));
      ctx.beginPath(); ctx.arc(at.x, at.y, r.max * (1 - Math.pow(1 - t, 3)), 0, TAU); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }

    // 층 3: 중심 섬광 — 순백은 핵과 앞쪽 몇 프레임에만, 번짐은 핵 주변에만
    if (flashAt > 0 && plan.flash) {
      const t = (now - flashAt) / 380;
      if (t < 1) {
        const rad = 40 + 150 * plan.flash * (0.35 + t);
        const g = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, rad);
        const core = Math.max(0, 1 - t * 2.6) * plan.flash;
        g.addColorStop(0, 'rgba(255,255,250,' + core.toFixed(2) + ')');
        g.addColorStop(0.28, plan.bloom + Math.round(clamp((1 - t) * 0.7 * plan.flash, 0, 1) * 255).toString(16).padStart(2, '0'));
        g.addColorStop(1, plan.bloom + '00');
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    if (el < plan.dur + 400 && (el < plan.dur || parts.length || rings.length)) raf = requestAnimationFrame(frame);
    else finish();
  }

  const handle = { cancel: finish, done };
  running.set(stage, handle);
  raf = requestAnimationFrame(frame);
  return handle;
}
