// 쪼꼬미랜드 사운드 엔진 — 선언형 레시피를 Web Audio 그래프로 그린다(프리미어식 멀티트랙).
//
// 레시피 = { id, kind:'sfx'|'bgm', lufs, tracks:[{ name, gain(dB), pan, fx, auto, clips:[…] }] }
//   클립  = { at, dur, src:{type:'osc'|'fm'|'noise'|'pluck'|'buffer', …}, freq, gain(dB), env, bend, vib, trem, filter, dist, pan }
//   트랙 fx = { dist, filter, trem, delay:{time,feedback,mix,tone}, reverb(0..1) }
//   트랙 auto(구간 자동화, 레시피 시작 기준 초) = { gain:[[t,dB]…], pan:[[t,-1..1]…], filter:[[t,Hz]…] }
// 값 자리에는 숫자 또는 [[시각,값],…] 곡선을 쓸 수 있다.
//
// 이 파일은 "그리기"만 한다. 어떤 소리를 언제 낼지는 recipes.js·cues.js 가 정한다.
import { compileRecipe, curveAt, curveEnd, isCurve, envelopePoints, noteToHz, dbToGain, rng, noiseSamples, pluckSamples, impulseSamples, distortionCurve, foldTail, loudness, limitPeaks, gainToDb, clamp } from './dsp.js';
const MAX_GR = 6; // 오프라인 리미터 최대 이득 감소(dB). 넘으면 타격감이 뭉개진다.

const WAVES = new Set(['sine', 'square', 'sawtooth', 'triangle']);
const NOISE_SECONDS = 2;

// AudioParam 에 값/곡선을 건다. exp=true 면 주파수처럼 지수 램프(양수만).
function automate(param, value, t0, { exp = false, map = v => v } = {}) {
  if (value === undefined || value === null) return;
  if (!isCurve(value)) { param.setValueAtTime(map(value), t0); return; }
  param.setValueAtTime(map(value[0][1]), t0 + Math.max(0, value[0][0]));
  for (let i = 1; i < value.length; i++) {
    const [t, v] = value[i], mv = map(v);
    if (exp && mv > 0 && map(value[i - 1][1]) > 0) param.exponentialRampToValueAtTime(mv, t0 + t);
    else param.linearRampToValueAtTime(mv, t0 + t);
  }
}

function panner(ctx) {
  if (ctx.createStereoPanner) return ctx.createStereoPanner();
  const g = ctx.createGain(); g.pan = null; return g; // 아주 오래된 브라우저: 팬 없이 통과
}

function lfo(ctx, rate, depth, target, t0, t1, delay = 0) {
  const osc = ctx.createOscillator(), amt = ctx.createGain();
  osc.frequency.setValueAtTime(rate, t0);
  amt.gain.setValueAtTime(0, t0);
  if (delay > 0) { amt.gain.setValueAtTime(0, t0 + delay); amt.gain.linearRampToValueAtTime(depth, t0 + delay + 0.25); }
  else amt.gain.setValueAtTime(depth, t0);
  osc.connect(amt).connect(target);
  osc.start(t0); osc.stop(t1);
  return osc;
}

function filterNode(ctx, f, t0) {
  const n = ctx.createBiquadFilter();
  n.type = f.type || 'lowpass';
  automate(n.frequency, f.freq ?? 2000, t0, { exp: true });
  automate(n.Q, f.q ?? 0.7, t0);
  if (f.gain !== undefined) automate(n.gain, f.gain, t0);
  return n;
}

function shaper(ctx, amount) {
  const n = ctx.createWaveShaper();
  n.curve = distortionCurve(amount);
  n.oversample = '4x';
  return n;
}

// 트레몰로: 기준 이득 (1-depth/2) ± depth/2
function tremolo(ctx, trem, t0, t1) {
  const g = ctx.createGain();
  const depth = clamp(trem.depth ?? 0.4, 0, 1);
  g.gain.setValueAtTime(1 - depth / 2, t0);
  lfo(ctx, trem.rate ?? 6, depth / 2, g.gain, t0, t1, trem.delay ?? 0);
  return g;
}

function noiseBuffer(ctx, cache, color, seed) {
  const key = color + ':' + (seed % 4);
  if (!cache.has(key)) {
    const n = Math.floor(ctx.sampleRate * NOISE_SECONDS);
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    b.copyToChannel(noiseSamples(n, color, rng(seed * 7 + 3)), 0);
    cache.set(key, b);
  }
  return cache.get(key);
}

// 클립 하나 → 소스 노드(들). 반환: { out(이 노드에서 소리가 나온다), pitch: [detune 파라미터들], stop(t) }
function makeSource(ctx, clip, t0, t1, env) {
  const src = clip.src;
  const freq = noteToHz(clip.freq ?? src.freq ?? 440);
  if (src.type === 'osc') {
    const voices = Math.max(1, src.unison ?? 1), spread = src.spread ?? 12;
    const sum = ctx.createGain(); sum.gain.value = 1 / Math.sqrt(voices);
    const pitch = [], nodes = [];
    for (let v = 0; v < voices; v++) {
      const o = ctx.createOscillator();
      if (Array.isArray(src.partials)) o.setPeriodicWave(ctx.createPeriodicWave(new Float32Array([0, ...src.partials.map(() => 0)]), new Float32Array([0, ...src.partials])));
      else o.type = WAVES.has(src.wave) ? src.wave : 'sine';
      o.frequency.setValueAtTime(freq * (src.ratio ?? 1), t0);
      o.detune.setValueAtTime((src.detune ?? 0) + (voices > 1 ? (v / (voices - 1) - 0.5) * 2 * spread : 0), t0);
      o.connect(sum); o.start(t0); o.stop(t1);
      pitch.push(o.detune); nodes.push(o);
    }
    return { out: sum, pitch };
  }
  if (src.type === 'fm') {
    const car = ctx.createOscillator(), mod = ctx.createOscillator(), idx = ctx.createGain();
    car.type = WAVES.has(src.wave) ? src.wave : 'sine';
    car.frequency.setValueAtTime(freq, t0);
    const mf = freq * (src.ratio ?? 2);
    mod.frequency.setValueAtTime(mf, t0);
    automate(idx.gain, src.index ?? 2, t0, { map: v => v * mf });
    mod.connect(idx).connect(car.frequency);
    car.start(t0); mod.start(t0); car.stop(t1); mod.stop(t1);
    return { out: car, pitch: [car.detune, mod.detune] };
  }
  if (src.type === 'noise') {
    const b = ctx.createBufferSource();
    b.buffer = noiseBuffer(ctx, env.noise, src.color || 'white', env.seed);
    b.loop = true;
    const offset = (env.rand() * (NOISE_SECONDS - 0.1));
    b.start(t0, offset); b.stop(t1);
    return { out: b, pitch: [] };
  }
  if (src.type === 'pluck') {
    const len = t1 - t0;
    const data = pluckSamples(ctx.sampleRate, freq, len, { bright: src.bright ?? 0.6, decay: src.decay ?? 0.996, rand: env.rand });
    const buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
    buf.copyToChannel(data, 0);
    const b = ctx.createBufferSource(); b.buffer = buf;
    b.start(t0); b.stop(t1);
    return { out: b, pitch: b.detune ? [b.detune] : [] };
  }
  if (src.type === 'buffer') {
    const s = env.samples?.get(src.url);
    if (!s) return null; // 아직 못 불러온 음원은 조용히 건너뛴다
    const buf = ctx.createBuffer(s.channels.length, s.channels[0].length, s.sampleRate);
    s.channels.forEach((ch, i) => buf.copyToChannel(ch, i));
    const b = ctx.createBufferSource(); b.buffer = buf;
    if (src.rate) b.playbackRate.setValueAtTime(src.rate, t0);
    b.start(t0, src.offset ?? 0); b.stop(t1);
    return { out: b, pitch: b.detune ? [b.detune] : [] };
  }
  throw new Error('알 수 없는 소스 ' + src.type);
}

function renderClip(ctx, clip, dest, t0, env) {
  const start = t0 + clip.at;
  const envPts = envelopePoints(clip.env, clip.dur);
  const end = start + Math.max(clip.dur, curveEnd(envPts)) + 0.02;
  const made = makeSource(ctx, clip, start, end, env);
  if (!made) return;
  let node = made.out;
  // 음높이: 굽힘(반음 곡선) + 비브라토(센트)
  for (const p of made.pitch) {
    if (clip.bend !== undefined) automate(p, clip.bend, start, { map: st => st * 100 + (clip.src.detune ?? 0) });
    if (clip.vib) lfo(ctx, clip.vib.rate ?? 5.5, clip.vib.depth ?? 15, p, start, end, clip.vib.delay ?? 0);
  }
  if (clip.dist) { const s = shaper(ctx, clip.dist); node.connect(s); node = s; }
  if (clip.filter) { const f = filterNode(ctx, clip.filter, start); node.connect(f); node = f; }
  if (clip.filter2) { const f = filterNode(ctx, clip.filter2, start); node.connect(f); node = f; }
  const amp = ctx.createGain();
  const peak = dbToGain(clip.gain ?? 0) * (clip.vel ?? 1);
  amp.gain.setValueAtTime(0, start);
  for (const [t, v] of envPts) amp.gain.linearRampToValueAtTime(v * peak, start + t);
  node.connect(amp); node = amp;
  if (clip.trem) { const tg = tremolo(ctx, clip.trem, start, end); node.connect(tg); node = tg; }
  if (clip.pan !== undefined) { const p = panner(ctx); if (p.pan) automate(p.pan, clip.pan, start); node.connect(p); node = p; }
  node.connect(dest);
}

function makeReverb(ctx, space, out, cache) {
  const key = JSON.stringify(space);
  let ir = cache.get(key);
  if (!ir) { ir = impulseSamples(ctx.sampleRate, space); cache.set(key, ir); }
  const conv = ctx.createConvolver();
  conv.normalize = false;
  const buf = ctx.createBuffer(2, ir[0].length, ctx.sampleRate);
  buf.copyToChannel(ir[0], 0); buf.copyToChannel(ir[1], 1);
  conv.buffer = buf;
  // 잔향 앞 저역을 걷어내 탁해지지 않게(전문가 믹스 관행: 리버브 리턴 HPF)
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 220;
  conv.connect(hp).connect(out);
  return conv;
}

function makeDelay(ctx, d, t0, out) {
  const input = ctx.createGain();
  const dl = ctx.createDelay(2), fb = ctx.createGain(), tone = ctx.createBiquadFilter(), wet = ctx.createGain();
  automate(dl.delayTime, d.time ?? 0.25, t0);
  fb.gain.value = clamp(d.feedback ?? 0.35, 0, 0.9);
  tone.type = 'lowpass'; tone.frequency.value = d.tone ?? 3200;
  wet.gain.value = d.mix ?? 0.25;
  input.connect(dl); dl.connect(tone); tone.connect(fb); fb.connect(dl); tone.connect(wet).connect(out);
  return input;
}

// 컴파일된 레시피를 ctx 안 dest 로 t0 부터 그린다. 반환: 끝 시각(꼬리 포함).
export function renderRecipe(ctx, compiled, dest, t0 = 0, opt = {}) {
  const env = { seed: opt.seed ?? 1, rand: rng((opt.seed ?? 1) * 9973 + 17), noise: opt.noiseCache || new Map(), samples: opt.samples, irCache: opt.irCache || new Map() };
  const bus = ctx.createGain();
  bus.gain.value = dbToGain(compiled.gain);
  bus.connect(dest);
  const t1 = t0 + compiled.dur + compiled.tail;
  let reverb = null;
  const space = compiled.space || opt.space || { seconds: 1.6, decay: 3, damp: 0.5 };
  for (const tr of compiled.tracks) {
    const input = ctx.createGain();
    let node = input;
    const fx = tr.fx;
    if (fx.dist) { const s = shaper(ctx, fx.dist); node.connect(s); node = s; }
    if (fx.filter) {
      const f = filterNode(ctx, fx.filter, t0);
      if (tr.auto.filter) automate(f.frequency, tr.auto.filter, t0, { exp: true });
      node.connect(f); node = f;
    }
    if (fx.trem) { const tg = tremolo(ctx, fx.trem, t0, t1); node.connect(tg); node = tg; }
    const g = ctx.createGain();
    g.gain.setValueAtTime(dbToGain(tr.gain), t0);
    if (tr.auto.gain) automate(g.gain, tr.auto.gain, t0, { map: db => dbToGain(db + tr.gain) });
    node.connect(g); node = g;
    const p = panner(ctx);
    if (p.pan) automate(p.pan, tr.auto.pan ?? tr.pan, t0);
    node.connect(p); node = p;
    node.connect(bus);
    if (fx.delay) node.connect(makeDelay(ctx, fx.delay, t0, bus));
    if (fx.reverb > 0) {
      reverb ||= makeReverb(ctx, space, bus, env.irCache);
      const send = ctx.createGain(); send.gain.value = fx.reverb;
      node.connect(send).connect(reverb);
    }
    for (const clip of tr.clips) renderClip(ctx, clip, input, t0, env);
  }
  return t1;
}

// 사용한 음원 url 목록(미리 불러오기용)
export function sampleUrls(compiled) {
  const urls = new Set();
  for (const tr of compiled.tracks) for (const c of tr.clips) if (c.src.type === 'buffer' && c.src.url) urls.add(c.src.url);
  return [...urls];
}

// 레시피를 오프라인으로 그려 채널 배열로 돌려준다. 목표 음량(lufs)에 맞추고 피크는 -1dBFS 아래로.
// BGM 루프는 꼬리를 앞에 접어 이음매를 없앤다.
export async function renderToChannels(OfflineCtx, compiled, { sampleRate = 48000, seed = 1, space, samples, irCache } = {}) {
  const total = compiled.dur + compiled.tail;
  const len = Math.max(1, Math.ceil(total * sampleRate));
  const ctx = new OfflineCtx(2, len, sampleRate);
  renderRecipe(ctx, compiled, ctx.destination, 0, { seed, space, samples, irCache });
  const rendered = await ctx.startRendering();
  let chans = [rendered.getChannelData(0), rendered.getChannelData(1)];
  if (compiled.loop) chans = foldTail(chans, Math.round(compiled.dur * sampleRate));
  // 효과음 끝의 무음(-80dBFS 아래)을 먼저 잘라 메모리를 아낀다(정규화는 실제로 재생할 길이로 잰다). 잘린 곳은 5ms 로 부드럽게 닫는다.
  if (!compiled.loop) {
    let end = 0;
    for (const ch of chans) for (let i = ch.length - 1; i > end; i--) if (Math.abs(ch[i]) > 1e-4) { end = i; break; }
    const len = Math.min(chans[0].length, end + 1 + Math.round(0.005 * sampleRate));
    if (len < chans[0].length - sampleRate * 0.02) {
      const f = Math.round(0.005 * sampleRate);
      chans = chans.map(ch => { const out = ch.slice(0, len); for (let i = 0; i < f && i < len; i++) out[len - 1 - i] *= i / f; return out; });
    }
  }
  const before = loudness(chans, sampleRate);
  const CEIL = 0.89; // -1dBFS
  const want = m => (Number.isFinite(compiled.lufs) && Number.isFinite(m.integrated) ? dbToGain(compiled.lufs - m.integrated) : 1);
  const fit = m => Math.min(want(m), CEIL / Math.max(1e-9, dbToGain(m.peak))); // 목표보다 피크 여유(-1dBFS)가 우선
  let k = fit(before), limited = 0;
  // 피크 때문에 목표에 못 미치면 사본에 리미터를 걸어 보고, 목표에 더 가까워질 때만 쓴다.
  // (아주 짧은 타격음은 에너지가 피크에 몰려 있어 깎아도 음량이 같이 줄어든다 → 그대로 둔다)
  if (k < want(before) * 0.94 && !compiled.loop) {
    const trial = chans.map(c => c.slice());
    const gr = limitPeaks(trial, sampleRate, Math.max(CEIL / want(before), dbToGain(before.peak - MAX_GR)));
    const m = loudness(trial, sampleRate), k2 = fit(m);
    if (m.integrated + gainToDb(k2) > before.integrated + gainToDb(k) + 0.5) { chans = trial; k = k2; limited = gr; }
  }
  if (k !== 1) for (const ch of chans) for (let i = 0; i < ch.length; i++) ch[i] *= k;
  return { channels: chans, sampleRate, before, after: loudness(chans, sampleRate), gain: k, limited };
}

export { compileRecipe };
