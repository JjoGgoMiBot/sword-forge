// 쪼꼬미랜드 사운드 — 소리를 만들기 전에 계산만 하는 순수 함수 모음.
// Web Audio 없이도(노드 시험에서도) 돌아간다. 엔진(engine.js)이 이 결과로 그래프를 만든다.

// ── 기본 수학 ─────────────────────────────────────────────
export const dbToGain = db => Math.pow(10, db / 20);
export const gainToDb = g => (g > 0 ? 20 * Math.log10(g) : -Infinity);
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// 결정적 난수(같은 seed면 같은 소리 → 시험·라운드로빈 변형에 쓴다). mulberry32.
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 'A4', 'C#5', 'Eb3' → Hz. 숫자는 그대로(Hz). 알 수 없으면 NaN.
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function noteToHz(note) {
  if (typeof note === 'number') return note;
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(String(note).trim());
  if (!m) return NaN;
  const midi = 12 * (Number(m[3]) + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return 440 * Math.pow(2, (midi - 69) / 12);
}
export const semis = (hz, st) => hz * Math.pow(2, st / 12);

// ── 자동화 곡선 ───────────────────────────────────────────
// 값은 숫자(고정) 또는 [[시각, 값], …] 점 목록(선형 보간). 시각은 클립(또는 트랙) 시작 기준 초.
export function isCurve(v) { return Array.isArray(v) && v.length > 0 && Array.isArray(v[0]); }
export function curveAt(v, t) {
  if (!isCurve(v)) return v;
  if (t <= v[0][0]) return v[0][1];
  for (let i = 1; i < v.length; i++) {
    const [t1, v1] = v[i];
    if (t <= t1) { const [t0, v0] = v[i - 1]; return t1 === t0 ? v1 : v0 + (v1 - v0) * (t - t0) / (t1 - t0); }
  }
  return v[v.length - 1][1];
}
export const curveEnd = v => (isCurve(v) ? v[v.length - 1][0] : 0);
export const scaleCurve = (v, k) => (isCurve(v) ? v.map(([t, x]) => [t, x * k]) : v * k);

// 엔벌로프: ADSR(a,d,s,r, hold=클립길이-a-d) 또는 점 목록(points). 결과는 [[t, 0..1], …].
export function envelopePoints(env = {}, dur) {
  if (isCurve(env.points)) return env.points;
  const a = Math.max(0.0005, env.a ?? 0.003), d = Math.max(0, env.d ?? 0.08), s = clamp(env.s ?? 0, 0, 1), r = Math.max(0.001, env.r ?? 0.05);
  const curve = env.curve ?? 'exp'; // exp: 타악기처럼 빨리 떨어지고 길게 꼬리
  const pts = [[0, 0], [a, 1]];
  const sustainEnd = Math.max(a + d, dur - r);
  if (curve === 'exp' && d > 0) { // 지수 감쇠를 짧은 선분 몇 개로 근사(자동화 이벤트 수를 줄인다)
    for (let i = 1; i <= 4; i++) { const k = i / 4; pts.push([a + d * k, s + (1 - s) * Math.pow(0.02, k)]); }
  } else pts.push([a + d, s]);
  if (s > 0) { pts.push([sustainEnd, s]); pts.push([sustainEnd + r, 0]); }
  else pts.push([a + d + r, 0]);
  return pts;
}

// ── 레시피 펼치기 ─────────────────────────────────────────
// seq: '가락 문자열'을 클립 목록으로. 공백 구분 토큰, '.'=쉼표, '-'=앞 음 늘이기, '|'=마디선(무시).
// 토큰에 '!'를 붙이면 강세(+4dB), '?'는 고스트(-8dB).
export function expandSeq({ seq, step = 0.25, at = 0, tpl = {}, transpose = 0, gate = 0.95 }) {
  const clips = [];
  let t = at, last = null;
  for (const raw of String(seq).split(/\s+/).filter(Boolean)) {
    if (raw === '|') continue;
    if (raw === '-') { if (last) last.dur += step; t += step; continue; }
    if (raw === '.') { last = null; t += step; continue; }
    let tok = raw, gainAdd = 0;
    if (tok.endsWith('!')) { gainAdd = 4; tok = tok.slice(0, -1); }
    else if (tok.endsWith('?')) { gainAdd = -8; tok = tok.slice(0, -1); }
    const hit = /^x$/i.test(tok); // 'x' = 음높이 없는 타격(북)
    const hz = hit ? null : noteToHz(tok);
    if (!hit && !Number.isFinite(hz)) throw new Error('seq: 알 수 없는 음 ' + raw);
    last = { ...tpl, at: t, dur: step * gate, gain: (tpl.gain ?? 0) + gainAdd };
    if (!hit) last.freq = semis(hz, transpose);
    clips.push(last);
    t += step;
  }
  return clips;
}

// 점점 느려지는 틱(룰렛·슬롯 릴). 처음 간격 gap0 → 마지막 간격 gap1, 총 dur 안에서.
// 감속 회전체는 각속도가 선형으로 줄어든다고 보고, 칸을 지날 때마다 틱이 난다.
export function tickTimes(dur, gap0 = 0.035, gap1 = 0.32) {
  if (!(dur > 0) || !(gap0 > 0) || !(gap1 >= gap0)) return [];
  const out = [];
  let t = 0;
  while (t < dur && out.length < 2000) {
    out.push(t);
    const p = t / dur;
    t += gap0 + (gap1 - gap0) * p * p; // 끝으로 갈수록 급격히 느려진다
  }
  return out;
}
export function expandTicks({ ticks, at = 0, tpl = {} }) {
  const { dur, gap0, gap1, accent = 0 } = ticks;
  const times = tickTimes(dur, gap0, gap1);
  return times.map((t, i) => ({ ...tpl, at: at + t, gain: (tpl.gain ?? 0) - (i / times.length) * accent }));
}

// 레시피 → 엔진이 그대로 그릴 수 있는 평평한 형태. 잘못된 레시피는 이유를 담아 throw.
export function compileRecipe(recipe, params = {}) {
  if (!recipe || typeof recipe !== 'object') throw new Error('레시피가 비었다');
  const r = typeof recipe.build === 'function' ? { ...recipe, ...recipe.build(params) } : recipe;
  if (!Array.isArray(r.tracks) || !r.tracks.length) throw new Error((r.id || '?') + ': tracks 없음');
  let end = 0;
  const tracks = r.tracks.map((tr, ti) => {
    const clips = [];
    for (const c of tr.clips || []) {
      if (c.seq) clips.push(...expandSeq(c));
      else if (c.ticks) clips.push(...expandTicks(c));
      else clips.push({ ...c });
    }
    for (const c of clips) {
      c.at = Number(c.at ?? 0);
      c.dur = Number(c.dur ?? 0.2);
      if (!c.src || !c.src.type) throw new Error((r.id || '?') + ' 트랙' + ti + ': 클립 src 없음');
      if (!(c.at >= 0) || !(c.dur > 0)) throw new Error((r.id || '?') + ' 트랙' + ti + ': 시각/길이 오류');
      const tail = c.dur + Math.max(0, (c.env?.r ?? 0.05));
      end = Math.max(end, c.at + tail);
    }
    return { name: tr.name || 'track' + ti, gain: tr.gain ?? 0, pan: tr.pan ?? 0, fx: tr.fx || {}, auto: tr.auto || {}, clips };
  });
  const dur = r.dur ?? end;
  const kind = r.kind || 'sfx';
  return {
    id: r.id, kind, dur, tail: r.tail ?? (r.loop ? 3 : 0.6), loop: !!r.loop, gain: r.gain ?? 0,
    lufs: r.lufs ?? (kind === 'bgm' ? -16 : -16), duck: r.duck ?? 0,
    random: r.random ?? (kind === 'bgm' ? { pitch: 0, gain: 0 } : { pitch: 0.05, gain: 0.05 }),
    space: r.space || null, variants: r.variants ?? (kind === 'bgm' || dur > 1 ? 1 : 3), tracks, // 자주 반복되는 짧은 소리만 3변형(메모리)
  };
}

// 반복음 무작위(±pitch, ±gain 비율). 결과 { rate, gain(배율) }.
export function humanize(random = {}, rand = Math.random) {
  const p = random.pitch ?? 0.05, g = random.gain ?? 0.05;
  return { rate: 1 + (rand() * 2 - 1) * p, gain: 1 + (rand() * 2 - 1) * g };
}

// ── 합성 버퍼 ─────────────────────────────────────────────
// 노이즈: white / pink(Paul Kellet) / brown. 길이 n.
export function noiseSamples(n, color = 'white', rand = Math.random) {
  const out = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const w = rand() * 2 - 1;
    if (color === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    } else if (color === 'brown') { last = (last + 0.02 * w) / 1.02; out[i] = last * 3.5; }
    else out[i] = w;
  }
  return out;
}

// 뜯는 현(가야금·코토): Karplus-Strong. bright 0..1 은 처음 들뜬 소리의 밝기, decay 는 줄 길이감.
export function pluckSamples(sr, hz, dur, { bright = 0.6, decay = 0.996, rand = Math.random } = {}) {
  const n = Math.max(1, Math.floor(sr * dur));
  const period = Math.max(2, Math.round(sr / hz));
  const buf = new Float32Array(period);
  let lp = 0;
  for (let i = 0; i < period; i++) { const w = rand() * 2 - 1; lp += (w - lp) * (0.15 + 0.85 * bright); buf[i] = lp; }
  const out = new Float32Array(n);
  let idx = 0, prev = 0;
  for (let i = 0; i < n; i++) {
    const cur = buf[idx];
    out[i] = cur;
    const next = decay * 0.5 * (cur + prev);
    prev = cur;
    buf[idx] = next;
    idx = (idx + 1) % period;
  }
  // 뜯는 순간 DC·클릭 제거: 처음 2ms 페이드인
  const fade = Math.min(n, Math.floor(sr * 0.002));
  for (let i = 0; i < fade; i++) out[i] *= i / fade;
  return out;
}

// 합성 잔향 임펄스(스테레오). 앞쪽 초기반사 몇 개 + 지수 감쇠 노이즈, 고역은 더 빨리 감쇠(공기 흡수).
export function impulseSamples(sr, { seconds = 2.2, decay = 3, predelay = 0.012, damp = 0.5, seed = 7 } = {}) {
  const n = Math.max(1, Math.floor(sr * seconds));
  const pre = Math.floor(sr * predelay);
  const chans = [new Float32Array(n), new Float32Array(n)];
  chans.forEach((ch, c) => {
    const r = rng(seed + c * 101);
    let lp = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / (n - pre);
      const env = Math.pow(1 - t, decay);
      const k = 1 - damp * (0.3 + 0.7 * t); // 뒤로 갈수록 어두워진다
      lp += ((r() * 2 - 1) - lp) * clamp(k, 0.05, 1);
      ch[i] = lp * env;
    }
    for (let e = 0; e < 6; e++) { const at = pre + Math.floor(sr * (0.004 + r() * 0.03)); if (at < n) ch[at] += (r() < 0.5 ? -1 : 1) * (0.5 - e * 0.06); }
  });
  // 에너지 정규화(잔향 길이를 바꿔도 체감 크기가 비슷하게)
  let e = 0; for (const ch of chans) for (let i = 0; i < n; i++) e += ch[i] * ch[i];
  const k = e > 0 ? 1 / Math.sqrt(e / 2) * 0.35 : 1;
  for (const ch of chans) for (let i = 0; i < n; i++) ch[i] *= k;
  return chans;
}

// 디스토션 곡선(tanh 소프트 클립). amount 0..1.
export function distortionCurve(amount = 0.3, n = 1024) {
  const k = 1 + amount * 40;
  const curve = new Float32Array(n);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(k * x) / norm; }
  return curve;
}

// 루프 버퍼의 꼬리(잔향·딜레이)를 앞부분에 접어 넣어 이음매 없이 반복되게 한다.
export function foldTail(channels, loopLen) {
  return channels.map(ch => {
    const out = ch.slice(0, loopLen);
    for (let i = loopLen; i < ch.length; i++) out[(i - loopLen) % loopLen] += ch[i];
    return out;
  });
}

// ── 음량 측정(ITU-R BS.1770-4, K-가중 + 게이팅) ─────────────
function biquad(x, b, a) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
// 표준이 48k 계수만 주므로, 아날로그 원형에서 표본율에 맞춰 다시 구한다(pyloudnorm 방식).
function kFilters(sr) {
  // 1단: 고역 셸프(머리 효과)
  const G = 3.999843853973347;
  let Q = 0.7071752369554196, fc = 1681.974450955533;
  let w = Math.tan(Math.PI * fc / sr), w2 = w * w, a0 = 1 + w / Q + w2;
  const Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
  const shelf = {
    b: [(Vh + Vb * w / Q + w2) / a0, 2 * (w2 - Vh) / a0, (Vh - Vb * w / Q + w2) / a0],
    a: [1, 2 * (w2 - 1) / a0, (1 - w / Q + w2) / a0],
  };
  // 고역 통과(RLB)
  Q = 0.5003270373238773; fc = 38.13547087602444;
  w = Math.tan(Math.PI * fc / sr); w2 = w * w; a0 = 1 + w / Q + w2;
  const hp = { b: [1, -2, 1], a: [1, 2 * (w2 - 1) / a0, (1 - w / Q + w2) / a0] };
  return [shelf, hp];
}
// 채널 배열 → { integrated(LUFS), peak(dBFS) }. 400ms 블록, 75% 겹침, 절대 -70 / 상대 -10 게이트.
export function loudness(channels, sr) {
  let peak = 0;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) { const a = Math.abs(ch[i]); if (a > peak) peak = a; }
  const [shelf, hp] = kFilters(sr);
  const filtered = channels.map(ch => biquad(biquad(ch, shelf.b, shelf.a), hp.b, hp.a));
  const n = filtered[0]?.length || 0;
  const block = Math.floor(sr * 0.4), hop = Math.floor(block / 4);
  const blocks = [];
  const meanSq = (s, e) => { let z = 0; for (const ch of filtered) { let acc = 0; for (let i = s; i < e; i++) acc += ch[i] * ch[i]; z += acc / (e - s); } return z; };
  if (n < block) { if (n > 0) blocks.push(meanSq(0, n)); }
  else for (let s = 0; s + block <= n; s += hop) blocks.push(meanSq(s, s + block));
  const lufsOf = z => -0.691 + 10 * Math.log10(z);
  const abs = blocks.filter(z => z > 0 && lufsOf(z) > -70);
  if (!abs.length) return { integrated: -Infinity, peak: gainToDb(peak) };
  const rel = lufsOf(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const gated = abs.filter(z => lufsOf(z) > rel);
  return { integrated: lufsOf(gated.reduce((a, b) => a + b, 0) / gated.length), peak: gainToDb(peak) };
}

// 오프라인 룩어헤드 피크 리미터(제자리 처리). 타격음처럼 피크가 높은 소리가 -1dBFS 상한 때문에
// 목표 음량에 못 미치는 것을 막는다. 앞을 미리 보고(lookahead) 부드럽게 줄였다가 release 로 되돌린다.
// 반환: 최대 이득 감소(dB, 양수).
export function limitPeaks(channels, sr, ceiling, { lookahead = 0.002, attack = 0.0015, release = 0.08 } = {}) {
  const n = channels[0].length, L = Math.max(1, Math.round(lookahead * sr));
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let a = 0;
    for (const ch of channels) { const v = Math.abs(ch[i]); if (v > a) a = v; }
    need[i] = a > ceiling ? ceiling / a : 1;
  }
  // 앞쪽 L 샘플 안의 최소 필요 이득(단조 덱)
  const m = new Float32Array(n), dq = new Int32Array(n);
  let head = 0, tail = 0;
  for (let i = n - 1; i >= 0; i--) {
    while (tail > head && need[dq[tail - 1]] >= need[i]) tail--;
    dq[tail++] = i;
    while (dq[head] > i + L) head++;
    m[i] = need[dq[head]];
  }
  const rel = 1 - Math.exp(-1 / (release * sr)), att = 1 - Math.exp(-1 / (attack * sr));
  // 앞으로: 회복(release). 뒤로: 미리 내려가기(attack). 둘 다 min 이라 필요 이득을 넘지 않는다.
  let g = 1;
  for (let i = 0; i < n; i++) { g = Math.min(m[i], g + (1 - g) * rel); m[i] = g; }
  g = 1;
  let minG = 1;
  for (let i = n - 1; i >= 0; i--) { g = Math.min(m[i], g + (1 - g) * att); m[i] = g; if (g < minG) minG = g; }
  if (minG < 1) for (const ch of channels) for (let i = 0; i < n; i++) ch[i] *= m[i];
  return -20 * Math.log10(minG);
}
