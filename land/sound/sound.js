// 쪼꼬미랜드 사운드 매니저 — 게임 코드가 쓰는 유일한 입구.
//   sound.play('card.flip')            효과음 한 번
//   sound.cue([{at:ms,id,params}])     시간표대로 여러 소리(취소 가능)
//   sound.setScene('casino'|'fortune'|null)  장면 BGM(컨셉 '자동'일 때 장면별 컨셉)
//   sound.set({muted, master, bgm, sfx, concept})  설정(localStorage 저장)
// 약속: 첫 사용자 입력 전에는 AudioContext 를 만들지 않는다. 소리 쪽 오류는 게임을 막지 않는다.
import { compileRecipe, renderToChannels, sampleUrls } from './engine.js';
import { humanize, dbToGain, clamp } from './dsp.js';
import { recipeFor, CONCEPTS, DEFAULT_CONCEPT } from './recipes.js?v=3';

export const STORAGE_KEY = 'land.sound.v1';
export const DEFAULTS = Object.freeze({ muted: false, master: 0.9, bgm: 0.55, sfx: 0.9, concept: 'auto' });
export const SCENE_CONCEPT = { town:'town',forge:'forge',casino:'lounge',fortune:'mist' };
const CACHE_LIMIT = 8e6; // 캐시 표본 수 상한(≈32MB float). 오래 안 쓴 것부터 버린다.
export const BGM_FILES = Object.freeze({town:'town',lounge:'casino',forge:'forge',mist:'fortune'});
const NOOP = Object.freeze({ stop() {}, cancel() {}, done: Promise.resolve() });

export function normalizeSettings(raw) {
  const s = { ...DEFAULTS };
  if (raw && typeof raw === 'object') {
    if (typeof raw.muted === 'boolean') s.muted = raw.muted;
    for (const k of ['master', 'bgm', 'sfx']) if (Number.isFinite(raw[k])) s[k] = clamp(raw[k], 0, 1);
    if (raw.concept === 'auto' || CONCEPTS[raw.concept]) s.concept = raw.concept;
  }
  return s;
}
export function loadSettings(storage) {
  try { const raw = storage?.getItem(STORAGE_KEY); return normalizeSettings(raw ? JSON.parse(raw) : null); }
  catch { return { ...DEFAULTS }; }
}
export function saveSettings(storage, s) {
  try { storage?.setItem(STORAGE_KEY, JSON.stringify(s)); return true; } catch { return false; }
}
function defaultStorage() { try { return globalThis.localStorage; } catch { return null; } }

// 마스터 리미터 뒤 안전 클리퍼: 0.9 까지는 그대로, 그 위는 tanh 로 부드럽게 1 아래로 접는다.
export function safetyCurve(n = 2048) {
  const c = new Float32Array(n), knee = 0.9;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
    c[i] = a <= knee ? x : Math.sign(x) * (knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee)));
  }
  return c;
}

export function createSound({ win = globalThis.window, storage = defaultStorage(), AudioCtx, OfflineCtx, fetchAudio = globalThis.fetch, log = console } = {}) {
  AudioCtx ||= win?.AudioContext || win?.webkitAudioContext;
  OfflineCtx ||= win?.OfflineAudioContext || win?.webkitOfflineAudioContext;
  let settings = loadSettings(storage);
  let ctx = null, bus = null, gestured = false, scene = 'town', bgm = null, wantBgm = null;
  const cache = new Map(), pending = new Map(), samples = new Map(), irCache = new Map(), listeners = new Set();
  const stats = { dropped: 0, plays: 0, renders: 0, renderMs: 0, errors: 0, cachedSamples: 0, created: 0 };
  const warned = new Set();
  const warn = (id, e) => { stats.errors++; if (!warned.has(id)) { warned.add(id); log?.warn?.('[sound]', id, e?.message || e); } };

  const conceptId = () => (settings.concept !== 'auto' ? settings.concept : SCENE_CONCEPT[scene] || DEFAULT_CONCEPT);

  // ── 오디오 그래프(첫 입력 때 한 번) ──
  function build() {
    if (ctx || !AudioCtx) return ctx;
    try { ctx = new AudioCtx({ latencyHint: 'interactive' }); } catch (e) { warn('context', e); return null; }
    stats.created++;
    const master = ctx.createGain(), limiter = ctx.createDynamicsCompressor(), clip = ctx.createWaveShaper();
    // 리미터: 문턱 -3dBFS, 20:1, 빠른 어택. 뒤의 클리퍼가 남은 순간 피크를 접는다.
    limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.002; limiter.release.value = 0.15;
    clip.curve = safetyCurve(); clip.oversample = '2x';
    master.connect(limiter).connect(clip).connect(ctx.destination);
    const music = ctx.createGain(), duck = ctx.createGain(), effects = ctx.createGain();
    music.connect(duck).connect(master); effects.connect(master);
    bus = { master, limiter, music, duck, effects };
    applyVolumes(true);
    return ctx;
  }
  function applyVolumes(instant = false) {
    if (!ctx) return;
    const t = ctx.currentTime, set = (p, v) => (instant ? p.setValueAtTime(v, t) : p.setTargetAtTime(v, t, 0.04));
    set(bus.master.gain, settings.muted ? 0 : settings.master);
    set(bus.music.gain, settings.bgm);
    set(bus.effects.gain, settings.sfx);
  }
  function unlock() {
    gestured = true;
    if (settings.muted) return;
    if (!build()) return;
    if (ctx.state !== 'running' && !(win?.document?.hidden)) ctx.resume?.().catch(() => {});
    if (wantBgm && !bgm) startBgm();
  }
  const onGesture = () => unlock();
  if (win?.addEventListener) {
    for (const type of ['pointerdown', 'keydown', 'touchend']) win.addEventListener(type, onGesture, { capture: true, passive: true });
    // 탭이 가려지면 멈춰 배터리·CPU 를 아낀다.
    win.document?.addEventListener?.('visibilitychange', () => {
      if (!ctx) return;
      if (win.document.hidden) ctx.suspend?.().catch(() => {});
      else if (!settings.muted && gestured) ctx.resume?.().catch(() => {});
    });
  }

  // ── 렌더 캐시 ──
  function keyOf(id, concept, params) { return id + '|' + concept + '|' + JSON.stringify(params || {}); }
  function evict() {
    let total = 0;
    for (const v of cache.values()) total += v.samples;
    for (const [k, v] of cache) {
      if (total <= CACHE_LIMIT) break;
      if (v.pinned) continue;
      cache.delete(k); total -= v.samples;
    }
    stats.cachedSamples = total;
  }
  async function loadSample(url) {
    if (samples.has(url)) return;
    const res = await fetch(url);
    const decoded = await new OfflineCtx(1, 1, 48000).decodeAudioData(await res.arrayBuffer());
    samples.set(url, { sampleRate: decoded.sampleRate, channels: Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i).slice()) });
  }
  // 레시피 → 오디오 채널(목표 음량으로 정규화됨). 컨텍스트 없이도 된다(시험 화면).
  async function renderOffline(id, { concept = conceptId(), params = {}, seed = 1, sampleRate = id.startsWith('bgm') ? 32000 : ctx?.sampleRate || 48000 } = {}) {
    const recipe = recipeFor(id, concept);
    if (!recipe) throw new Error('레시피 없음: ' + id);
    if (!OfflineCtx) throw new Error('OfflineAudioContext 없음');
    const c = CONCEPTS[concept] || CONCEPTS[DEFAULT_CONCEPT];
    const compiled = compileRecipe(recipe, { ...params, concept: c.id, seed });
    await Promise.all(sampleUrls(compiled).map(loadSample));
    const t0 = (globalThis.performance || Date).now();
    const out = await renderToChannels(OfflineCtx, compiled, { sampleRate, seed, space: compiled.space || c.space, samples, irCache });
    stats.renders++; stats.renderMs += (globalThis.performance || Date).now() - t0;
    return { ...out, compiled };
  }
  async function prepareBuffer(id, concept, params, seed) {
    if (id === 'bgm' && BGM_FILES[concept] && ctx?.decodeAudioData && fetchAudio && OfflineCtx) {
      try {
        const url = new URL('../assets/music/' + BGM_FILES[concept] + '.ogg?v=1', import.meta.url);
        const response = await fetchAudio(url, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error('music HTTP ' + response.status);
        const decoder = new OfflineCtx(2, 1, 32000);
        const buffer = await decoder.decodeAudioData(await response.arrayBuffer());
        const meta = compileRecipe(recipeFor(id, concept), { ...params, concept, seed });
        if (Math.abs(buffer.duration - meta.dur) > .15) throw new Error('music duration');
        return { buffer, meta };
      } catch (error) { warn('music.file.' + concept, error); }
    }
    const r = await renderOffline(id, { concept, params, seed });
    const buffer = ctx.createBuffer(2, r.channels[0].length, r.sampleRate);
    r.channels.forEach((ch, c) => buffer.copyToChannel(ch, c));
    return { buffer, meta: r.compiled };
  }
  // 변형(라운드로빈) 하나를 꺼낸다. 없으면 그린다.
  async function variant(id, concept, params) {
    const key = keyOf(id, concept, params);
    let entry = cache.get(key);
    if (!entry) {
      const recipe = recipeFor(id, concept);
      if (!recipe) throw new Error('레시피 없음: ' + id);
      const count = compileRecipe(recipe, { ...params, concept, seed: 1 }).variants;
      entry = { buffers: new Array(count).fill(null), rr: 0, samples: 0, meta: null, pinned: false };
      cache.set(key, entry);
    } else { cache.delete(key); cache.set(key, entry); } // LRU: 최근 사용을 뒤로
    const i = entry.rr++ % entry.buffers.length;
    if (!entry.buffers[i]) {
      const pkey = key + '#' + i;
      if (!pending.has(pkey)) pending.set(pkey, prepareBuffer(id, concept, params, i + 1).then(({buffer:b,meta}) => {
        entry.buffers[i] = b; entry.meta = meta; entry.samples += b.length * b.numberOfChannels;
        evict();
        return b;
      }).finally(() => pending.delete(pkey)));
      await pending.get(pkey);
    }
    return { buffer: entry.buffers[i], meta: entry.meta };
  }

  function duckMusic(when, db, len) {
    if (!bus || !(db > 0)) return;
    const g = bus.duck.gain, low = dbToGain(-db);
    g.cancelScheduledValues(when);
    g.setTargetAtTime(low, when, 0.03);
    g.setTargetAtTime(1, when + Math.max(0.2, len * 0.6), 0.35);
  }

  // 효과음 하나. opts: { when(ctx 시각) | delay(초), params, gain(dB), pan, concept }
  function play(id, opts = {}) {
    if (settings.muted || !ctx) return NOOP;
    stats.plays++;
    const concept = opts.concept || conceptId();
    let src = null, stopped = false;
    const done = variant(id, concept, opts.params).then(({ buffer, meta }) => {
      if (stopped || !ctx) return;
      const now = ctx.currentTime, want = opts.when ?? now + (opts.delay ?? 0), late = now - want;
      // 시간표(cue) 소리가 합성이 늦어 화면보다 뒤처지면: 긴 소리는 늦은 만큼 앞을 건너뛰어 맞추고,
      // 짧은 타격음은 120ms 넘게 늦으면 아예 내지 않는다(어긋난 '탁'이 안 나는 것보다 나쁘다).
      let offset = 0;
      if (opts.when != null && late > 0.03) {
        if (buffer.duration > 1.2) offset = Math.min(late, buffer.duration - 0.1);
        else if (late > (id==='card.deal'?.4:.12)) { stats.dropped++; return; }
      }
      const when = Math.max(now, want);
      const hz = humanize(meta.random);
      src = ctx.createBufferSource(); src.buffer = buffer; src.playbackRate.value = hz.rate;
      const g = ctx.createGain(); g.gain.value = hz.gain * dbToGain(opts.gain ?? 0);
      let node = src.connect(g);
      if (opts.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(opts.pan, -1, 1); node = node.connect(p); }
      node.connect(bus.effects);
      src.start(when, offset);
      duckMusic(when, meta.duck, buffer.duration);
      return new Promise(r => { src.onended = r; });
    }).catch(e => warn(id, e));
    return { stop() { stopped = true; try { src?.stop(); } catch {} }, cancel() { this.stop(); }, done };
  }

  // 시간표 재생: [{at(ms), id, params, gain, pan}] — 오디오 시계로 정확히 맞춘다.
  function cue(list, { concept } = {}) {
    if (settings.muted || !ctx || !list?.length) return NOOP;
    const base = ctx.currentTime + 0.03;
    const handles = list.map(c => play(c.id, { when: base + (c.at || 0) / 1000, params: c.params, gain: c.gain, pan: c.pan, concept }));
    return { cancel() { handles.forEach(h => h.stop()); }, stop() { this.cancel(); }, done: Promise.all(handles.map(h => h.done)) };
  }

  // ── BGM ──
  async function startBgm() {
    if (!ctx || settings.muted || !wantBgm) return;
    const concept = wantBgm, token = {};
    const previous=bgm;
    bgm = { concept, token,fade:previous?.fade };
    try {
      const { buffer } = await variant('bgm', concept, {});
      if (bgm?.token !== token) return; // 그 사이 장면이 바뀌었다
      const src = ctx.createBufferSource(), g = ctx.createGain(), t = ctx.currentTime;
      previous?.fade?.();
      src.buffer = buffer; src.loop = true;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 2);
      src.connect(g).connect(bus.music); src.start(t);
      bgm.fade = () => { const n = ctx.currentTime; g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(g.gain.value, n); g.gain.linearRampToValueAtTime(0, n + 1.2); try { src.stop(n + 1.3); } catch {} };
    } catch (e) { if(bgm?.token===token)bgm=previous;warn('bgm.' + concept, e); }
  }
  function stopBgm() { bgm?.fade?.(); bgm = null; }
  function refreshBgm() {
    const next = scene ? conceptId() : null;
    wantBgm = next;
    if (!next) return stopBgm();
    if (bgm?.concept === next) return;
    startBgm();
  }

  function emit() { for (const f of listeners) { try { f(get()); } catch {} } }
  function get() { return { ...settings, unlocked: !!ctx, state: ctx?.state || 'none', activeConcept: conceptId(), scene }; }
  function set(patch) {
    const before = settings;
    settings = normalizeSettings({ ...settings, ...patch });
    saveSettings(storage, settings);
    if (!settings.muted && before.muted) { if (gestured || patch.muted === false) unlock(); }
    applyVolumes();
    if (settings.muted) {
      stopBgm();
      if (ctx) setTimeout(() => { if (settings.muted) ctx.suspend?.().catch(() => {}); }, 250); // 음소거 중엔 오디오 스레드를 쉰다
    } else {
      if (bgm && bgm.concept !== conceptId()) stopBgm();
      refreshBgm(); rewarm();
    }
    emit();
  }
  let warmIds = [], warmed = '';
  // 컨셉이 바뀌면(장면 이동·설정) 그 컨셉의 자주 쓰는 소리를 한가할 때 미리 그린다. 첫 소리 지연·시간표 어긋남 방지.
  function rewarm() { const c = conceptId(); if (ctx && warmIds.length && warmed !== c) { warmed = c; prewarm(warmIds); } }
  function setScene(name) { scene = name || 'town'; refreshBgm(); rewarm(); emit(); }

  // 자주 쓰는 소리를 한가할 때 미리 그려 첫 재생 지연을 없앤다.
  function prewarm(ids) {
    warmIds = ids;
    if (!ctx) return Promise.resolve();
    const concept = conceptId(); warmed = concept;
    return ids.reduce((p, id) => p.then(() => new Promise(r => setTimeout(r, 30))).then(() => variant(id, concept, {}).catch(e => warn(id, e))), Promise.resolve());
  }

  return { play, cue, set, get, setScene, unlock, prewarm, renderOffline, onChange(f) { listeners.add(f); return () => listeners.delete(f); }, stats, get context() { return ctx; } };
}

let shared = null;
// 페이지 하나에 매니저 하나.
export function getSound() { return (shared ||= createSound()); }
