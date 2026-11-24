// land/sound: 합성 엔진·레시피·시간표·설정 시험. 실제 오디오 장치 없이 모형 AudioContext 로 그래프를 그려 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import { loudness, noteToHz, tickTimes, expandSeq, compileRecipe, humanize, rng, foldTail, envelopePoints, impulseSamples, pluckSamples, noiseSamples, dbToGain } from '../land/sound/dsp.js';
import { renderRecipe } from '../land/sound/engine.js';
import { recipeFor, SFX_IDS, CONCEPTS } from '../land/sound/recipes.js';
import { casinoCues, fortuneCues, PREWARM } from '../land/sound/cues.js';
import { createSound, normalizeSettings, loadSettings, saveSettings, DEFAULTS, STORAGE_KEY, safetyCurve } from '../land/sound/sound.js';
import { settleMs, reelStopMs } from '../land/casino-fx.js';
import { MUSIC_PLAN, PLACE_MUSIC } from '../land/sound/score.js';

const sine = (sr, hz, sec, amp = 1) => Float32Array.from({ length: Math.round(sr * sec) }, (_, i) => amp * Math.sin(2 * Math.PI * hz * i / sr));

test('shipped sampled recordings have complete Ogg pages and match the 32-bar catalog', () => {
  for (const [id, plan] of Object.entries(MUSIC_PLAN)) {
    const file = readFileSync(new URL('../land/assets/music/' + id + '.ogg', import.meta.url));
    let offset=0, rate=0, granule=0, ended=false;
    while(offset<file.length){
      assert.equal(file.toString('ascii',offset,offset+4),'OggS',id+' page header');
      const count=file[offset+26],start=offset+27+count;
      const size=file.subarray(offset+27,start).reduce((a,b)=>a+b,0);
      if(!rate){assert.equal(file.toString('ascii',start+1,start+7),'vorbis');rate=file.readUInt32LE(start+12);}
      const g=file.readBigUInt64LE(offset+6);if(g!==0xffffffffffffffffn)granule=Number(g);
      ended=!!(file[offset+5]&4);offset=start+size;
    }
    assert.equal(offset,file.length,id+' no truncation');
    assert.ok(ended,id+' end-of-stream present');
    assert.equal(rate,44100);
    assert.ok(Math.abs(granule/rate-plan.duration)<.002,id+' exact cycle length');
  }
});

test('four place scores have full arrangements, phrase breaths and an evolving second section', () => {
  for (const [id, score] of Object.entries(PLACE_MUSIC)) {
    const plan = MUSIC_PLAN[id], bar = 240 / plan.bpm;
    assert.ok(Math.abs(score.dur - plan.bars * bar) < 1e-8);
    assert.equal(plan.sections.length, 4);
    assert.ok(score.tracks.slice(0, 4).every(t => t.clips.length > 0), id + ' melodic arrangement');
    assert.equal(score.tracks[4].clips.length > 0, id !== 'fortune', 'tarot leaves percussion out');
    assert.ok(score.tracks.flatMap(t => t.clips).every(n => n.at >= 0 && n.at < score.dur && n.dur > 0), id + ' event bounds');
    const lead = score.tracks[0].clips, answer = score.tracks[1].clips;
    assert.ok(!lead.some(n => n.at >= 7 * bar && n.at < 8 * bar), id + ' phrase breath');
    assert.ok(answer.every(n => n.at >= 8 * bar), id + ' answer enters in variation');
    assert.notEqual(lead.find(n => n.at >= 16 * bar).freq, lead[0].freq, id + ' contrasting register');
  }
});

test('BS.1770 meter matches reference: 997Hz 0dBFS sine = -3.01 LUFS mono, 0 LUFS stereo', () => {
  for (const sr of [48000, 44100]) {
    const s = sine(sr, 997, 3);
    assert.ok(Math.abs(loudness([s], sr).integrated + 3.01) < 0.1, 'mono ' + sr);
    assert.ok(Math.abs(loudness([s, s], sr).integrated) < 0.1, 'stereo ' + sr);
    assert.ok(Math.abs(loudness([s, s], sr).peak) < 0.01);
  }
  const quiet = sine(48000, 997, 3, dbToGain(-20));
  assert.ok(Math.abs(loudness([quiet, quiet], 48000).integrated + 20) < 0.1);
  assert.equal(loudness([new Float32Array(48000)], 48000).integrated, -Infinity, 'silence is gated out');
});

test('pitch, sequences and decelerating roulette ticks', () => {
  assert.equal(Math.round(noteToHz('A4')), 440);
  assert.equal(Math.round(noteToHz('C4') * 100) / 100, 261.63);
  assert.equal(Math.round(noteToHz('Bb3')), 233);
  const t = tickTimes(4);
  assert.ok(t.length > 15);
  assert.ok(t.every((x, i) => i === 0 || x > t[i - 1]), 'monotonic');
  const gaps = t.slice(1).map((x, i) => x - t[i]);
  assert.ok(gaps.at(-1) > gaps[0] * 4, 'ticks spread out as the wheel slows');
  assert.ok(t.at(-1) <= 4);
  const clips = expandSeq({ seq: 'A4 - . C5! | x?', step: 0.5, tpl: { src: { type: 'osc' } } });
  assert.equal(clips.length, 3);
  assert.equal(clips[0].dur > 0.9, true, 'hold extends the note');
  assert.equal(clips[1].at, 1.5);
  assert.ok(clips[1].gain > clips[0].gain ?? 0, 'accent is louder');
  assert.ok(clips[2].gain < 0, 'ghost is quieter');
});

test('every recipe compiles in every concept; hits are 3-layer; repeats humanize within ±5%', () => {
  for (const concept of Object.keys(CONCEPTS)) {
    const bgm = compileRecipe(recipeFor('bgm', concept));
    assert.equal(bgm.loop, true, concept);
    assert.ok(bgm.dur >= 15 && bgm.dur <= 120, concept + ' loop length ' + bgm.dur);
    assert.equal(bgm.variants, 1);
    for (const id of SFX_IDS) {
      const c = compileRecipe(recipeFor(id, concept), { dur: 1.2, seed: 3, concept });
      assert.ok(c.tracks.length >= 1 && c.dur > 0 && c.dur < 8, id);
      assert.ok(c.lufs <= -8 && c.lufs >= -28, id + ' target loudness');
      if (c.tracks.some(t => t.name === 'transient')) for (const layer of ['body', 'tail']) assert.ok(c.tracks.some(t => t.name === layer), id + ' ' + layer);
    }
  }
  for (const id of ['dice.slam', 'slot.stop', 'roulette.stop', 'vfx.explosion', 'chip.place']) {
    const names = compileRecipe(recipeFor(id, 'fantasy')).tracks.map(t => t.name);
    for (const layer of ['transient', 'body', 'tail']) assert.ok(names.includes(layer), id + ' has ' + layer);
  }
  const r = rng(42);
  for (let i = 0; i < 500; i++) { const h = humanize({ pitch: 0.05, gain: 0.05 }, r); assert.ok(Math.abs(h.rate - 1) <= 0.05 && Math.abs(h.gain - 1) <= 0.05); }
  assert.equal(compileRecipe(recipeFor('card.flip', 'fantasy')).variants, 3, 'short sfx get round-robin variants');
  assert.throws(() => compileRecipe({ id: 'bad', tracks: [{ clips: [{ at: 0 }] }] }), /bad/);
});

test('DSP generators are finite and bounded', () => {
  const ir = impulseSamples(48000, { seconds: 1 });
  assert.equal(ir.length, 2);
  assert.ok(ir[0].every(Number.isFinite));
  const p = pluckSamples(48000, 220, 0.5, { rand: rng(1) });
  assert.ok(p.every(x => Number.isFinite(x) && Math.abs(x) <= 1.5));
  for (const c of ['white', 'pink', 'brown']) assert.ok(noiseSamples(4800, c, rng(2)).every(x => Math.abs(x) <= 1.01), c);
  const env = envelopePoints({ a: 0.01, d: 0.1, s: 0.5, r: 0.2 }, 1);
  assert.equal(env[0][1], 0);
  assert.ok(env.every(([t, v], i) => i === 0 || t >= env[i - 1][0]) && env.every(([, v]) => v >= 0 && v <= 1));
  const curve = safetyCurve();
  assert.ok(Math.abs(curve[curve.length / 2]) < 0.01 && curve.at(-1) <= 1 && curve[0] >= -1);
});

test('loop tail folds back so the seam is continuous', () => {
  const sr = 1000, loop = 1000, tail = 300;
  const ch = Float32Array.from({ length: loop + tail }, (_, i) => (i >= loop ? 0.5 : 0));
  const [out] = foldTail([ch], loop);
  assert.equal(out.length, loop);
  assert.ok(out[0] > 0.4 && out[tail + 5] === 0, 'tail energy now sits at the loop start');
});

// ── 모형 Web Audio ──
function mockAudio(sampleRate = 48000) {
  const stats = { nodes: 0, started: 0, connections: 0 };
  const param = v => ({ value: v, setValueAtTime() { return this; }, linearRampToValueAtTime() { return this; }, exponentialRampToValueAtTime(x) { assert.ok(x > 0, 'exp ramp to non-positive'); return this; }, setTargetAtTime() { return this; }, setValueCurveAtTime() { return this; }, cancelScheduledValues() { return this; }, cancelAndHoldAtTime() { return this; } });
  const node = () => {
    stats.nodes++;
    const params = {};
    return new Proxy({}, {
      get(o, k) {
        if (k in o) return o[k];
        if (k === 'connect') return t => { stats.connections++; return t; };
        if (k === 'disconnect') return () => {};
        if (k === 'start') return () => { stats.started++; };
        if (k === 'stop') return () => {};
        if (k === 'setPeriodicWave') return () => {};
        if (k === 'then') return undefined;
        return (params[k] ||= param(0));
      },
      set(o, k, v) { o[k] = v; return true; },
    });
  };
  const buffer = (ch, len, sr) => { const d = Array.from({ length: ch }, () => new Float32Array(len)); return { numberOfChannels: ch, length: len, sampleRate: sr, duration: len / sr, getChannelData: i => d[i], copyToChannel(a, i) { d[i].set(a); } }; };
  const ctx = new Proxy({ sampleRate, currentTime: 0, state: 'suspended', destination: {}, createBuffer: buffer, createPeriodicWave: () => ({}), resume: async () => { ctx.state = 'running'; }, suspend: async () => {} }, {
    get(o, k) { if (k in o) return o[k]; if (String(k).startsWith('create')) return () => node(); return undefined; },
  });
  return { ctx, stats };
}

test('prepared music loads without synthesis and a stale scene cannot start late', async () => {
  const {ctx, stats} = mockAudio(), requests = new Map();
  ctx.decodeAudioData = async () => {};
  const OfflineCtx = function () { return {decodeAudioData: async bytes => ctx.createBuffer(2, Math.round(new Float64Array(bytes)[0] * 32000), 32000)}; };
  const fetchAudio = url => new Promise(resolve => requests.set(String(url).split('/').at(-1), resolve));
  const sound = createSound({win: {}, storage: null, AudioCtx: function(){return ctx;}, OfflineCtx, fetchAudio});
  sound.setScene('town'); sound.unlock(); sound.setScene('forge');
  const response = id => ({ok:true,arrayBuffer:async()=>new Float64Array([PLACE_MUSIC[id].dur]).buffer});
  requests.get('forge.ogg?v=2')(response('forge'));
  await new Promise(r => setImmediate(r));
  assert.equal(stats.started, 1, 'current scene starts');
  requests.get('town.ogg?v=2')(response('town'));
  await new Promise(r => setImmediate(r));
  assert.equal(stats.started, 1, 'outdated scene does not overlap');
  assert.equal(sound.stats.renders, 0, 'file path avoids runtime synthesis');
  assert.equal(sound.get().activeConcept, 'forge');
});

test('every recipe builds a valid Web Audio graph (mock context, all concepts)', () => {
  for (const concept of Object.keys(CONCEPTS)) {
    for (const id of ['bgm', ...SFX_IDS]) {
      const { ctx, stats } = mockAudio();
      const c = compileRecipe(recipeFor(id, concept), { dur: 1.5, seed: 2, concept });
      const end = renderRecipe(ctx, c, ctx.destination, 0, { seed: 2 });
      assert.ok(end >= c.dur, id);
      assert.ok(stats.started > 0, concept + '/' + id + ' starts sources');
    }
  }
});

test('casino cues follow casino-fx timings and are sorted', () => {
  const slots = casinoCues('slots', 'jackpot', { count: 3 });
  assert.deepEqual(slots.filter(c => c.id === 'slot.stop').map(c => c.at), [0, 1, 2].map(reelStopMs));
  assert.ok(slots.some(c => c.id === 'jackpot' && c.at === settleMs('slots', 3)));
  assert.ok(slots.some(c => c.id === 'vfx.explosion'));
  for (const game of ['slots', 'dice', 'blackjack', 'horse', 'rps']) {
    const list = casinoCues(game, 'win', { count: 3 });
    assert.ok(list.every((c, i) => i === 0 || c.at >= list[i - 1].at), game + ' sorted');
    assert.ok(list.every(c => SFX_IDS.includes(c.id)), game + ' ids exist');
    assert.equal(list.at(-1).id, 'win');
  }
  const bj = casinoCues('blackjack', 'loss', { count: 2 });
  assert.deepEqual(bj.filter(c => c.id === 'card.flip').map(c => c.at), [330, 630]);
  assert.deepEqual(casinoCues('dice', 'loss', { reduced: true }), [{ at: 0, id: 'lose' }], 'reduced motion → outcome only');
  assert.deepEqual(casinoCues('daily', 'none'), []);
  for (const m of ['open', 'spread', 'pick', 'result']) assert.ok(fortuneCues(m, { cards: 3 }).every(c => SFX_IDS.includes(c.id)), m);
  assert.ok(PREWARM.every(id => SFX_IDS.includes(id)));
});

test('settings survive broken storage and are clamped', () => {
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
  assert.deepEqual(loadSettings(throwing), { ...DEFAULTS });
  assert.doesNotThrow(() => saveSettings(throwing, DEFAULTS));
  assert.deepEqual(loadSettings(null), { ...DEFAULTS });
  const s = normalizeSettings({ muted: true, master: 7, bgm: -1, sfx: 'x', concept: 'nope' });
  assert.equal(s.muted, true); assert.equal(s.master, 1); assert.equal(s.bgm, 0); assert.equal(s.sfx, DEFAULTS.sfx); assert.equal(s.concept, 'auto');
  const mem = new Map(), storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  saveSettings(storage, { ...DEFAULTS, muted: true, concept: 'korean' });
  assert.equal(loadSettings(storage).concept, 'korean');
  assert.ok(mem.has(STORAGE_KEY));
  storage.setItem(STORAGE_KEY, '{broken');
  assert.deepEqual(loadSettings(storage), { ...DEFAULTS });
});

test('no AudioContext before the first user gesture; mute stops everything', async () => {
  const handlers = {};
  const win = { addEventListener: (t, f) => { handlers[t] = f; }, document: { hidden: false, addEventListener() {} } };
  let made = 0;
  const AudioCtx = function () { made++; return mockAudio().ctx; };
  const sound = createSound({ win, storage: null, AudioCtx, OfflineCtx: function () {}, log: { warn() {} } });
  sound.setScene('casino');
  assert.equal(sound.play('win'), sound.play('lose'), 'NOOP before unlock');
  sound.cue(casinoCues('slots', 'win', { count: 3 }));
  assert.equal(made, 0, 'no context before gesture');
  assert.ok(handlers.pointerdown && handlers.keydown && handlers.touchend);
  sound.set({ muted: true });
  handlers.pointerdown();
  assert.equal(made, 0, 'muted gesture still creates nothing');
  sound.set({ muted: false });
  assert.equal(made, 1, 'unmuting after a gesture opens the context once');
  handlers.keydown();
  assert.equal(made, 1, 'single shared context');
  assert.equal(sound.get().activeConcept, 'lounge');
  sound.setScene('forge');
  assert.equal(sound.get().activeConcept, 'forge');
  sound.setScene(null);
  assert.equal(sound.get().activeConcept, 'town', 'closing a venue returns to the town score');
  sound.setScene('fortune');
  assert.equal(sound.get().activeConcept, 'mist');
  sound.set({ concept: 'japanese' });
  assert.equal(sound.get().activeConcept, 'japanese', 'manual concept overrides scene');
});
