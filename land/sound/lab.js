// 소리 실험실: 레시피별 재생·측정·트랙 타임라인·파형.
import { getSound } from './sound.js';
import { SFX_IDS, CONCEPTS, recipeFor } from './recipes.js';
import { compileRecipe } from './dsp.js';

const LABEL = {
  'ui.tap': '버튼 누름', 'chip.place': '칩 놓기', 'card.flip': '카드 뒤집기', 'card.deal': '카드 돌리기',
  'roulette.spin': '룰렛 회전(감속)', 'roulette.stop': '룰렛 멈춤', 'dice.shake': '주사위 컵 흔들기', 'dice.slam': '컵 엎기', 'dice.reveal': '컵 들기',
  'slot.spin': '슬롯 릴 회전', 'slot.stop': '슬롯 릴 멈춤', 'race.start': '경주 출발', 'race.gallop': '말발굽', 'race.finish': '결승',
  'rps.beat': '가위바위보 박자', 'rps.reveal': '가위바위보 공개', 'vfx.sparkle': '반짝임', 'vfx.explosion': '폭발',
  win: '승리', draw: '무승부', lose: '패배', jackpot: '잭팟', 'saju.open': '사주 열기', 'saju.result': '사주 결과',
};
const PARAMS = { 'roulette.spin': { dur: 4 }, 'dice.shake': { dur: 0.8 }, 'slot.spin': { dur: 1.7 }, 'race.gallop': { dur: 4 } };
const TOL = 1.5; // 목표 ±LU

const sound = getSound();
const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
let concept = (sound.get().concept !== 'auto' && sound.get().concept) || 'fantasy';
const results = new Map(); // key concept|id → {lufs, peak, target, ms}
const playing = new Set();

function rowsFor(ids, host) {
  host.replaceChildren(...ids.map(id => {
    const row = document.createElement('div');
    row.className = 'row'; row.dataset.id = id;
    row.innerHTML = '<button type="button" class="play" aria-label="' + (LABEL[id] || id) + ' 재생">▶</button>'
      + '<div class="name"><b>' + (id === 'bgm' ? CONCEPTS[concept].name + ' 루프' : LABEL[id] || id) + '</b><code>' + id + '</code><div class="nums">측정 전</div></div>'
      + '<div><canvas height="' + (id === 'bgm' ? 150 : 110) + '"></canvas><div class="legend"></div></div>';
    row.querySelector('.play').onclick = () => toggle(id, row);
    return row;
  }));
}

function compiled(id) { return compileRecipe(recipeFor(id, concept), { ...(PARAMS[id] || {}), concept, seed: 1 }); }

// 위: 파형(측정 뒤) / 아래: 트랙별 레인에 클립 막대
function draw(row, wave) {
  if (wave) row._wave = wave; else wave = row._wave;
  const id = row.dataset.id, c = compiled(id), canvas = row.querySelector('canvas');
  const dpr = devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.height / 1;
  canvas.width = Math.round(w * dpr); canvas.style.height = h + 'px'; canvas.height = Math.round(h * dpr);
  const g = canvas.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, w, h);
  const total = c.dur + (c.loop ? 0 : c.tail), waveH = Math.round(h * 0.45), laneTop = waveH + 4;
  const lanes = c.tracks.length, laneH = Math.max(3, Math.min(14, (h - laneTop - 2) / lanes));
  g.fillStyle = css('--wave');
  if (wave) {
    const ch = wave.channels, n = ch[0].length, mid = waveH / 2;
    for (let x = 0; x < w; x++) {
      const a = Math.floor(x / w * n), b = Math.max(a + 1, Math.floor((x + 1) / w * n));
      let lo = 0, hi = 0;
      for (let i = a; i < b; i += 4) { const v = (ch[0][i] + ch[1][i]) / 2; if (v < lo) lo = v; if (v > hi) hi = v; }
      g.fillRect(x, mid - hi * mid, 1, Math.max(1, (hi - lo) * mid));
    }
  } else { g.globalAlpha = 0.5; g.fillRect(0, waveH / 2, w, 1); g.globalAlpha = 1; }
  c.tracks.forEach((tr, i) => {
    const y = laneTop + i * laneH;
    g.fillStyle = css('--lane'); g.fillRect(0, y, w, laneH - 1);
    g.fillStyle = css('--clip');
    for (const clip of tr.clips) g.fillRect(clip.at / total * w, y + 1, Math.max(1.5, clip.dur / total * w), laneH - 3);
  });
  row.querySelector('.legend').textContent = '트랙 ' + lanes + '개(위→아래): ' + c.tracks.map(t => t.name).join(' · ') + ' · 클립 ' + c.tracks.reduce((s, t) => s + t.clips.length, 0) + '개 · ' + total.toFixed(2) + '초';
}

function showNums(row) {
  const r = results.get(concept + '|' + row.dataset.id), el = row.querySelector('.nums');
  if (!r) { el.textContent = '측정 전'; return; }
  const off = Math.abs(r.lufs - r.target) > TOL, hot = r.peak > -0.9;
  el.innerHTML = '<span class="' + (off ? 'bad' : '') + '">' + r.lufs.toFixed(1) + ' LUFS</span> (목표 ' + r.target + ')<br><span class="' + (hot ? 'bad' : '') + '">피크 ' + r.peak.toFixed(1) + ' dBFS</span>' + (r.gr > 0.05 ? ' · 리미터 -' + r.gr.toFixed(1) + 'dB' : '') + ' · ' + r.ms + 'ms';
}

async function measure(row) {
  const id = row.dataset.id, t0 = performance.now();
  const out = await sound.renderOffline(id, { concept, params: PARAMS[id] || {}, seed: 1, sampleRate: 48000 });
  results.set(concept + '|' + id, { lufs: out.after.integrated, peak: out.after.peak, target: out.compiled.lufs, gr: out.limited || 0, ms: Math.round(performance.now() - t0) });
  draw(row, out); showNums(row); summary();
}

function toggle(id, row) {
  const btn = row.querySelector('.play');
  if (btn.dataset.handle) { stop(row); return; }
  const h = sound.play(id, { params: PARAMS[id] || {}, concept, delay: 0.02 });
  if (sound.get().muted) $('status').textContent = '음소거 상태예요. 카지노 화면 오른쪽 위 소리 버튼이나 아래 설정으로 켜 주세요.';
  btn.dataset.handle = '1'; btn.textContent = '■'; btn.setAttribute('aria-label', (LABEL[id] || id) + ' 멈춤');
  const entry = { row, h }; playing.add(entry);
  h.done.then(() => { if (playing.has(entry)) stop(row); });
  row._entry = entry;
  if (!results.has(concept + '|' + id)) measure(row).catch(e => fail(id, e));
}
function stop(row) {
  const e = row._entry; if (e) { e.h.stop(); playing.delete(e); row._entry = null; }
  const btn = row.querySelector('.play'); delete btn.dataset.handle; btn.textContent = '▶';
  btn.setAttribute('aria-label', (LABEL[row.dataset.id] || row.dataset.id) + ' 재생');
}
function fail(id, e) { $('status').textContent = id + ' 측정 실패: ' + (e?.message || e); console.error(e); }

function summary() {
  const ids = ['bgm', ...SFX_IDS], mine = ids.map(id => results.get(concept + '|' + id)).filter(Boolean);
  const ok = mine.filter(r => Math.abs(r.lufs - r.target) <= TOL).length;
  const peak = mine.length ? Math.max(...mine.map(r => r.peak)) : null;
  const ms = mine.reduce((s, r) => s + r.ms, 0);
  const stat = (v, label, bad) => '<div class="stat' + (bad ? ' bad' : '') + '"><b>' + v + '</b><small>' + label + '</small></div>';
  $('summary').innerHTML = stat(ids.length, CONCEPTS[concept].name + ' 레시피 수')
    + stat(mine.length + ' / ' + ids.length, '측정함')
    + stat(mine.length ? ok + ' / ' + mine.length : '—', '목표 음량 ±' + TOL + ' LU 안', mine.length && ok < mine.length)
    + stat(peak == null ? '—' : peak.toFixed(1) + ' dB', '최대 피크 · 합성 ' + (ms / 1000).toFixed(1) + '초', peak > -0.9);
}

function renderConcepts() {
  $('concepts').replaceChildren(...Object.values(CONCEPTS).map(c => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = c.name + ' · ' + c.desc; b.setAttribute('aria-pressed', String(c.id === concept));
    b.onclick = () => { if (c.id === concept) return; stopAll(); concept = c.id; renderAll(); };
    return b;
  }));
}
function stopAll() { document.querySelectorAll('.row').forEach(stop); }
function renderAll() {
  renderConcepts();
  rowsFor(['bgm'], $('bgmRows'));
  rowsFor(SFX_IDS, $('sfxRows'));
  document.querySelectorAll('.row').forEach(row => { draw(row); showNums(row); });
  summary();
}

$('stopAll').onclick = stopAll;
$('measure').onclick = async () => {
  const btn = $('measure'); btn.disabled = true;
  const rows = [...document.querySelectorAll('.row')];
  let i = 0;
  for (const row of rows) {
    $('status').textContent = '측정 중 ' + (++i) + ' / ' + rows.length + ' · ' + row.dataset.id;
    try { await measure(row); } catch (e) { fail(row.dataset.id, e); }
    await new Promise(r => setTimeout(r, 0));
  }
  $('status').textContent = CONCEPTS[concept].name + ' 측정 끝 · ' + rows.length + '개';
  btn.disabled = false;
};
let resizeT = 0;
addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => document.querySelectorAll('.row').forEach(row => draw(row)), 150); });
renderAll();
// 실험용 노출(브라우저 검증 스크립트가 쓴다)
window.__soundLab = { sound, results, measureAll: () => $('measure').onclick(), setConcept: id => { concept = id; renderAll(); } };
