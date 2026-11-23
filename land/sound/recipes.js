// 쪼꼬미랜드 사운드 레시피 — 선언형 데이터. 새 소리가 필요하면 여기에 항목 하나를 더한다.
// 문법은 engine.js 머리말 참고. 타격음은 트랙을 transient · body · tail 3층으로 쌓는다(hit:true).
// lufs 는 그 소리 하나의 목표 음량(정규화). 큰 사건일수록 높게, 반복되는 작은 소리일수록 낮게.
import { rng, noteToHz, semis } from './dsp.js';

// ── 악기(클립 틀) ─────────────────────────────────────────
export const INST = {
  gayageum: { src: { type: 'pluck', bright: 0.5, decay: 0.9975 }, env: { a: 0.001, d: 1.6, s: 0, r: 0.4 }, vib: { rate: 5, depth: 22, delay: 0.35 }, filter: { type: 'peaking', freq: 1100, q: 1, gain: 4 } },
  daegeum: { src: { type: 'osc', partials: [1, 0.35, 0.12, 0.06, 0.03] }, env: { a: 0.09, d: 0.3, s: 0.75, r: 0.35, curve: 'lin' }, vib: { rate: 5.2, depth: 20, delay: 0.35 }, bend: [[0, -0.4], [0.1, 0]] },
  breath: { src: { type: 'noise', color: 'pink' }, env: { a: 0.06, d: 0.2, s: 0.45, r: 0.3, curve: 'lin' }, filter: { type: 'bandpass', freq: 2600, q: 1.2 }, gain: -22 },
  koto: { src: { type: 'pluck', bright: 0.85, decay: 0.995 }, env: { a: 0.001, d: 1.1, s: 0, r: 0.3 }, filter: { type: 'highshelf', freq: 2500, gain: 3 } },
  shakuhachi: { src: { type: 'osc', partials: [1, 0.18, 0.25, 0.05] }, env: { a: 0.14, d: 0.3, s: 0.8, r: 0.4, curve: 'lin' }, bend: [[0, -1], [0.16, 0]], vib: { rate: 4.2, depth: 28, delay: 0.5 } },
  haegeum: { src: { type: 'osc', wave: 'sawtooth' }, env: { a: 0.07, d: 0.2, s: 0.8, r: 0.25, curve: 'lin' }, filter: { type: 'bandpass', freq: 1300, q: 0.9 }, filter2: { type: 'lowpass', freq: 3500 }, vib: { rate: 6, depth: 35, delay: 0.2 }, bend: [[0, -0.6], [0.12, 0]], gain: 6 },
  harp: { src: { type: 'pluck', bright: 0.7, decay: 0.997 }, env: { a: 0.001, d: 1.8, s: 0, r: 0.5 } },
  pad: { src: { type: 'osc', wave: 'sawtooth', unison: 5, spread: 12 }, env: { a: 1.2, d: 0.5, s: 0.85, r: 1.5, curve: 'lin' }, filter: { type: 'lowpass', freq: 1400, q: 0.5 } },
  bell: { src: { type: 'fm', ratio: 3.5, index: [[0, 3.5], [1.2, 0.3]] }, env: { a: 0.002, d: 1.8, s: 0, r: 0.6 } },
  glass: { src: { type: 'fm', ratio: 4, index: [[0, 1.2], [0.3, 0.1]] }, env: { a: 0.001, d: 0.45, s: 0, r: 0.2 } },
  gong: { src: { type: 'fm', ratio: 1.41, index: [[0, 5], [2.5, 0.5]] }, env: { a: 0.004, d: 3, s: 0, r: 1 }, bend: [[0, 0], [3, -0.3]] },
  kkwaenggwari: { src: { type: 'fm', ratio: 1.483, index: [[0, 8], [0.4, 2]] }, freq: 1250, env: { a: 0.001, d: 0.5, s: 0, r: 0.2 }, filter: { type: 'highpass', freq: 600 } },
  taiko: { src: { type: 'osc', wave: 'sine' }, freq: 62, bend: [[0, 9], [0.06, 0]], env: { a: 0.001, d: 0.75, s: 0, r: 0.2 } },
  taikoSkin: { src: { type: 'noise', color: 'brown' }, env: { a: 0.001, d: 0.09, s: 0, r: 0.05 }, filter: { type: 'lowpass', freq: 900 }, gain: -4 },
  kung: { src: { type: 'osc', wave: 'sine' }, freq: 105, bend: [[0, 5], [0.05, 0]], env: { a: 0.001, d: 0.45, s: 0, r: 0.15 } },
  deok: { src: { type: 'noise', color: 'white' }, env: { a: 0.0005, d: 0.035, s: 0, r: 0.03 }, filter: { type: 'bandpass', freq: 2800, q: 1.5 } },
  buk: { src: { type: 'osc', wave: 'sine' }, freq: 88, bend: [[0, 4], [0.05, 0]], env: { a: 0.001, d: 0.5, s: 0, r: 0.15 } },
  // 은은한 배경용: 뜯는 소리·톱니파 없이 사인·삼각파에 낮은 필터. 어택을 길게 둬서 소리가 "깔린다".
  softpad: { src: { type: 'osc', wave: 'triangle', unison: 3, spread: 7 }, env: { a: 2.4, d: 0.8, s: 0.9, r: 2.6, curve: 'lin' }, filter: { type: 'lowpass', freq: 850, q: 0.4 } },
  drone: { src: { type: 'osc', partials: [1, 0.22, 0.05] }, env: { a: 3, d: 0.8, s: 0.9, r: 3, curve: 'lin' }, filter: { type: 'lowpass', freq: 520, q: 0.3 } },
  epiano: { src: { type: 'osc', partials: [1, 0.2, 0.05] }, env: { a: 0.012, d: 1.4, s: 0, r: 0.7 }, filter: { type: 'lowpass', freq: 1900, q: 0.4 } },
  bowl: { src: { type: 'fm', ratio: 2, index: [[0, 1.1], [2.2, 0.08]] }, env: { a: 0.09, d: 3.4, s: 0, r: 1.4 }, filter: { type: 'lowpass', freq: 2600, q: 0.4 } },
  bass: { src: { type: 'pluck', bright: 0.3, decay: 0.9985 }, env: { a: 0.002, d: 2.6, s: 0, r: 0.6 } },
};

// ── 공간(합성 잔향) ───────────────────────────────────────
export const SPACES = {
  hall: { seconds: 2.8, decay: 2.6, damp: 0.45, predelay: 0.02 },
  wood: { seconds: 1.8, decay: 3.2, damp: 0.6, predelay: 0.012 },
  madang: { seconds: 1.2, decay: 3.5, damp: 0.35, predelay: 0.008 },
  cathedral: { seconds: 4, decay: 2.2, damp: 0.4, predelay: 0.03 },
  room: { seconds: 0.9, decay: 4, damp: 0.55, predelay: 0.006 },
};

const tr = (name, clips, extra = {}) => ({ name, clips, ...extra });
const bars = s => s.replace(/\|/g, ' ');

// ── 컨셉 BGM ─────────────────────────────────────────────
// 동양풍: 가야금 아르페지오 + 대금 선율 + 저음 + 북. 75BPM, 8분음표 0.4초, 8마디(25.6초)
const ORIENTAL_BGM = {
  id: 'bgm.oriental', kind: 'bgm', loop: true, dur: 25.6, lufs: -16,
  tracks: [
    tr('가야금', [{ seq: bars('D4 A4 D5 A4 E5 D5 A4 F#4 | B3 F#4 B4 F#4 D5 B4 A4 F#4 | E4 B4 E5 B4 F#5 E5 B4 A4 | A3 E4 A4 B4 D5 . A4 . | D4 A4 D5 A4 E5 D5 B4 A4 | B3 F#4 B4 D5 E5 D5 B4 F#4 | E4 B4 E5 F#5 A5 F#5 E5 B4 | A3 E4 A4 . D4 . . .'), step: 0.4, gate: 3, tpl: { ...INST.gayageum, gain: -3 } }], { pan: -0.25, fx: { reverb: 0.35 } }),
    tr('대금', [{ seq: bars('A4 - - - - - B4 A4 | F#4 - - - - - E4 F#4 | A4 - - - B4 - D5 - | E5 - - - - - - - | D5 - - - B4 - A4 - | B4 - - - A4 - F#4 - | E4 - - - F#4 - A4 B4 | A4 - - - - - - .'), step: 0.4, tpl: { ...INST.daegeum, gain: -7 } }], { pan: 0.2, fx: { reverb: 0.45, delay: { time: 0.6, feedback: 0.25, mix: 0.12 } } }),
    tr('숨결', [{ seq: bars('A4 - - - - - B4 A4 | F#4 - - - - - E4 F#4 | A4 - - - B4 - D5 - | E5 - - - - - - - | D5 - - - B4 - A4 - | B4 - - - A4 - F#4 - | E4 - - - F#4 - A4 B4 | A4 - - - - - - .'), step: 0.4, tpl: INST.breath }], { pan: 0.2, fx: { reverb: 0.4 } }),
    tr('저음', [{ seq: 'D3 B2 E3 A2 D3 B2 E3 A2', step: 3.2, gate: 0.9, tpl: { ...INST.bass, gain: -4 } }], { fx: { reverb: 0.15 } }),
    tr('북', [{ seq: Array(8).fill('x . . . x? . x .').join(' '), step: 0.4, tpl: { ...INST.buk, gain: -9 } }], { fx: { reverb: 0.2, filter: { type: 'lowpass', freq: 900 } } }),
  ],
};

// 일본풍: 코토 + 샤쿠하치 + 태고. 미야코부시(D Eb G A Bb). 72BPM.
const JP_STEP = 60 / 72 / 2;
const JAPANESE_BGM = {
  id: 'bgm.japanese', kind: 'bgm', loop: true, dur: JP_STEP * 64, lufs: -16,
  tracks: [
    tr('코토', [{ seq: bars('D4 A4 Bb4 A4 D5 . A4 . | Eb4 G4 A4 G4 Bb4 . A4 G4 | D4 A4 Bb4 D5 Eb5 D5 Bb4 A4 | G4 . A4 . D4 . . . | D5 . Bb4 A4 G4 . A4 . | Bb4 A4 G4 Eb4 D4 . . . | G3 D4 G4 A4 Bb4 A4 G4 Eb4 | D4 . A3 . D4 . . .'), step: JP_STEP, gate: 2.5, tpl: { ...INST.koto, gain: -3 } }], { pan: -0.2, fx: { reverb: 0.3 } }),
    tr('샤쿠하치', [{ seq: bars('A4 - - - - - - . | Bb4 - - - A4 - G4 - | A4 - - - - - . . | D5 - - - Eb5 - D5 - | Bb4 - - - A4 - - . | G4 - - - A4 - Bb4 - | A4 - - - - - - - | . . . . . . . .'), step: JP_STEP, tpl: { ...INST.shakuhachi, gain: -8 } }], { pan: 0.25, fx: { reverb: 0.5 } }),
    tr('숨결', [{ seq: bars('A4 - - - - - - . | Bb4 - - - A4 - G4 - | A4 - - - - - . . | D5 - - - Eb5 - D5 - | Bb4 - - - A4 - - . | G4 - - - A4 - Bb4 - | A4 - - - - - - - | . . . . . . . .'), step: JP_STEP, tpl: { ...INST.breath, gain: -17 } }], { pan: 0.25, fx: { reverb: 0.5 } }),
    tr('태고', [{ seq: bars(Array(7).fill('x! . . . . . x? x').join(' | ') + ' | x! . x . x! . . .'), step: JP_STEP, tpl: { ...INST.taiko, gain: -5 } }], { fx: { reverb: 0.25 } }),
    tr('태고 가죽', [{ seq: bars(Array(7).fill('x! . . . . . x? x').join(' | ') + ' | x! . x . x! . . .'), step: JP_STEP, tpl: { ...INST.taikoSkin, gain: -12 } }], { fx: { reverb: 0.25 } }),
  ],
};

// 한국풍: 굿거리 장단(12/8) 장구 + 해금 + 꽹과리 + 가야금 저음. 8분음표 1/3초, 6장단(24초).
const KR_STEP = 1 / 3;
const KR_KUNG = Array(6).fill('x! . . . . x . . . x . .').join(' ');
const KR_DEOK = Array(6).fill('x! . x x? . . . x x? . . .').join(' ');
const KOREAN_BGM = {
  id: 'bgm.korean', kind: 'bgm', loop: true, dur: KR_STEP * 72, lufs: -16,
  tracks: [
    tr('해금', [{ seq: bars('E4 - - - - - G4 - - A4 - - | B4 - - - - - A4 - G4 E4 - - | A4 - - - - - B4 - - D5 - - | E5 - - - - - D5 - B4 A4 - - | G4 - - - - - A4 - - B4 - - | E4 - - - - - - - - . . .'), step: KR_STEP, tpl: { ...INST.haegeum, gain: -2 } }], { pan: 0.15, fx: { reverb: 0.35 } }),
    tr('장구 궁편', [{ seq: KR_KUNG, step: KR_STEP, tpl: { ...INST.kung, gain: -3 } }], { pan: -0.2, fx: { reverb: 0.15 } }),
    tr('장구 채편', [{ seq: KR_DEOK, step: KR_STEP, tpl: { ...INST.deok, gain: -9 } }], { pan: 0.2, fx: { reverb: 0.15 } }),
    tr('꽹과리', [{ seq: Array(6).fill('x . . . . . x? . . . . .').join(' '), step: KR_STEP, tpl: { ...INST.kkwaenggwari, gain: -21 } }], { pan: 0.35, fx: { reverb: 0.2 } }),
    tr('가야금 저음', [{ seq: bars('E3 . . . . . B2 . . . . . | A2 . . . . . E3 . . . . . | D3 . . . . . A2 . . . . . | E3 . . . . . B2 . . . . . | G2 . . . . . D3 . . . . . | E3 . . . . . B2 . . . . .'), step: KR_STEP, gate: 5, tpl: { ...INST.gayageum, gain: -6 } }], { pan: -0.3, fx: { reverb: 0.25 } }),
  ],
};

// 판타지: 패드 화음 + 벨 선율 + 하프 아르페지오 + 반짝임. 90BPM, C 리디안.
const FT_STEP = 1 / 3;
const FANTASY_BGM = {
  id: 'bgm.fantasy', kind: 'bgm', loop: true, dur: FT_STEP * 64, lufs: -16,
  build(p = {}) {
    const r = rng(p.seed ?? 5);
    const notes = ['C6', 'E6', 'G6', 'B6', 'D7', 'F#6'];
    const sparkle = [];
    for (let t = 0.3; t < FT_STEP * 62; t += 0.35 + r() * 0.9) sparkle.push({ ...INST.glass, at: t, dur: 0.3, freq: noteToHz(notes[Math.floor(r() * notes.length)]), gain: -6 - r() * 8, pan: r() * 1.4 - 0.7 });
    return { tracks: [...this.base, tr('반짝임', sparkle, { fx: { reverb: 0.6, delay: { time: FT_STEP * 1.5, feedback: 0.4, mix: 0.3, tone: 5000 } } })] };
  },
  base: [
    tr('패드 저음', [{ seq: 'C3 A2 F2 G2', step: FT_STEP * 16, gate: 1, tpl: { ...INST.pad, gain: -8 } }], { fx: { reverb: 0.5 }, auto: { filter: [[0, 700], [10.6, 1600], [21.3, 700]] } }),
    tr('패드 화음', [{ seq: 'E4 C4 A3 B3', step: FT_STEP * 16, gate: 1, tpl: { ...INST.pad, gain: -10 } }, { seq: 'B4 G4 E4 D4', step: FT_STEP * 16, gate: 1, tpl: { ...INST.pad, gain: -12 } }], { pan: 0.1, fx: { reverb: 0.6, filter: { type: 'lowpass', freq: 1200 } }, auto: { filter: [[0, 800], [10.6, 2200], [21.3, 800]] } }),
    tr('벨', [{ seq: bars('E5 . G5 . B5 . A5 G5 | E5 - - - D5 . E5 . | C5 . E5 . A5 . G5 E5 | D5 - - - . . . . | A4 . C5 . F#5 . E5 C5 | A4 - - - B4 . C5 . | B4 . D5 . G5 . F#5 D5 | G5 - - - - - . .'), step: FT_STEP, tpl: { ...INST.bell, gain: -6 } }], { pan: -0.15, fx: { reverb: 0.5, delay: { time: FT_STEP * 3, feedback: 0.3, mix: 0.18 } } }),
    tr('하프', [{ seq: bars(['C4 G4 E5 G4', 'A3 E4 C5 E4', 'F3 C4 A4 C4', 'G3 D4 B4 D4'].map(a => (a + ' ').repeat(4)).join(' ')), step: FT_STEP, gate: 3, tpl: { ...INST.harp, gain: -12 } }], { pan: 0.3, fx: { reverb: 0.45 } }),
  ],
};

// 도박 라운지: 박자·뜯는 소리 없이 따뜻한 패드가 깔리고 부드러운 건반이 드문드문. 24초, 4화음(C·Am·F·G) 6초씩.
const LOUNGE_BGM = {
  id: 'bgm.lounge', kind: 'bgm', loop: true, dur: 24, lufs: -19,
  tracks: [
    tr('패드 저음', [{ seq: 'C3 A2 F2 G2', step: 6, gate: 1, tpl: { ...INST.softpad, gain: -6 } }], { fx: { reverb: 0.5 } }),
    tr('패드 화음', [{ seq: 'E4 C4 A3 B3', step: 6, gate: 1, tpl: { ...INST.softpad, gain: -9 } }, { seq: 'G4 E4 C4 D4', step: 6, gate: 1, tpl: { ...INST.softpad, gain: -12 } }], { pan: 0.1, fx: { reverb: 0.6 } }),
    tr('건반', [{ seq: 'E5 . . . G5 . . . D5 . . . . . C5 .', step: 1.5, gate: 1, tpl: { ...INST.epiano, gain: -13 } }], { pan: -0.15, fx: { reverb: 0.55, delay: { time: 0.75, feedback: 0.25, mix: 0.15, tone: 2500 } } }),
  ],
};

// 운세 안개: 박자 없이 낮은 드론 위에 울림 긴 그릇 소리가 두 번. 24초.
const MIST_BGM = {
  id: 'bgm.mist', kind: 'bgm', loop: true, dur: 24, lufs: -21,
  tracks: [
    tr('드론', [{ seq: 'D3 A2', step: 12, gate: 1, tpl: { ...INST.drone, gain: -5 } }], { fx: { reverb: 0.45 } }),
    tr('패드', [{ seq: 'A3 F#3', step: 12, gate: 1, tpl: { ...INST.softpad, gain: -10 } }, { seq: 'F#4 D4', step: 12, gate: 1, tpl: { ...INST.softpad, gain: -14 } }], { pan: 0.1, fx: { reverb: 0.65 } }),
    tr('그릇', [{ seq: 'A4 . . . . . . . D5 . . . . . . .', step: 1.5, gate: 1, tpl: { ...INST.bowl, gain: -14 } }], { pan: 0.2, fx: { reverb: 0.7, delay: { time: 1.1, feedback: 0.3, mix: 0.15, tone: 2200 } } }),
  ],
};

// ── 컨셉 ─────────────────────────────────────────────────
// lead: 승리 가락 악기, bell: 맑은 종소리, drum: 결과 북, scale: 아래에서 위로 6음
export const CONCEPTS = {
  oriental: { id: 'oriental', name: '동양풍', desc: '가야금·대금', space: SPACES.hall, scale: ['D4', 'E4', 'F#4', 'A4', 'B4', 'D5', 'E5', 'F#5', 'A5'], lead: INST.gayageum, bell: INST.gong, drum: INST.buk, bgm: ORIENTAL_BGM },
  japanese: { id: 'japanese', name: '일본풍', desc: '코토·샤쿠하치·태고', space: SPACES.wood, scale: ['D4', 'Eb4', 'G4', 'A4', 'Bb4', 'D5', 'Eb5', 'G5', 'A5'], lead: INST.koto, bell: { ...INST.bell, src: { type: 'fm', ratio: 2.76, index: [[0, 2], [1, 0.2]] } }, drum: INST.taiko, bgm: JAPANESE_BGM },
  korean: { id: 'korean', name: '한국풍', desc: '장구·꽹과리·해금', space: SPACES.madang, scale: ['E4', 'G4', 'A4', 'B4', 'D5', 'E5', 'G5', 'A5', 'B5'], lead: { ...INST.gayageum, src: { type: 'pluck', bright: 0.6, decay: 0.997 } }, bell: INST.kkwaenggwari, drum: INST.kung, bgm: KOREAN_BGM },
  lounge: { id: 'lounge', name: '라운지', desc: '패드·건반(은은하게)', space: SPACES.cathedral, scale: ['C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5', 'E5', 'G5'], lead: INST.epiano, bell: INST.bowl, drum: INST.buk, bgm: LOUNGE_BGM },
  mist: { id: 'mist', name: '안개', desc: '드론·그릇(박자 없음)', space: SPACES.hall, scale: ['D4', 'E4', 'F#4', 'A4', 'B4', 'D5', 'E5', 'F#5', 'A5'], lead: INST.epiano, bell: INST.bowl, drum: INST.buk, bgm: MIST_BGM },
  fantasy: { id: 'fantasy', name: '판타지', desc: '벨·패드·스파클', space: SPACES.cathedral, scale: ['C4', 'E4', 'G4', 'B4', 'D5', 'E5', 'F#5', 'G5', 'B5'], lead: INST.harp, bell: INST.bell, drum: INST.buk, bgm: FANTASY_BGM },
};
export const DEFAULT_CONCEPT = 'fantasy';
const conceptOf = p => CONCEPTS[p?.concept] || CONCEPTS[DEFAULT_CONCEPT];
const sc = (c, i) => noteToHz(c.scale[Math.max(0, Math.min(c.scale.length - 1, i))]);

// ── 효과음 조각 ───────────────────────────────────────────
const click = (at, freq = 4000, gain = 0, d = 0.006) => ({ at, dur: d, src: { type: 'noise' }, env: { a: 0.0005, d, s: 0, r: 0.004 }, filter: { type: 'highpass', freq }, gain });
const thud = (at, freq = 120, gain = 0, d = 0.25, drop = 6) => ({ at, dur: d, src: { type: 'osc', wave: 'sine' }, freq, bend: [[0, drop], [0.04, 0]], env: { a: 0.001, d, s: 0, r: 0.08 }, gain });
const swish = (at, dur, f0, f1, gain = 0, q = 1.2) => ({ at, dur, src: { type: 'noise', color: 'pink' }, env: { points: [[0, 0], [dur * 0.6, 1], [dur, 0]] }, filter: { type: 'bandpass', freq: [[0, f0], [dur, f1]], q }, gain });
const rattle = (at, gain = 0, f = 3200) => ({ at, dur: 0.012, src: { type: 'noise' }, env: { a: 0.0005, d: 0.012, s: 0, r: 0.006 }, filter: { type: 'bandpass', freq: f, q: 4 }, gain });

// 타격음 3층 틀: transient(짧고 밝은 딱) · body(음정 있는 몸통) · tail(공간 꼬리)
const hit = (id, { transient, body, tail, lufs = -16, extra = {} }) => ({ id, hit: true, lufs, ...extra, tracks: [tr('transient', transient), tr('body', body), tr('tail', tail, { fx: { reverb: 0.5 } })] });

// lufs: BS.1770 통합 음량 목표. 10~30ms 짜리 타격음은 400ms 측정창에서 에너지가 피크에 몰려 낮게 재지므로
// -1dBFS 피크 상한에서 실제로 닿는 값(실험실 '전체 측정')으로 정했다. 귀로는 피크가 높은 짧은 소리가 더 크게 들린다.
export const SFX = {
  'ui.tap': hit('ui.tap', { lufs: -24, transient: [click(0, 5000, -6, 0.004)], body: [thud(0, 520, -10, 0.05, 2)], tail: [] }),
  'chip.place': hit('chip.place', { lufs: -20, transient: [click(0, 3500, 0, 0.005)], body: [{ at: 0.002, dur: 0.12, src: { type: 'fm', ratio: 2.3, index: [[0, 1.5], [0.1, 0.2]] }, freq: 2100, env: { a: 0.001, d: 0.1, s: 0, r: 0.05 }, gain: -6 }], tail: [rattle(0.03, -10, 2600), rattle(0.055, -16, 2400)] }),

  // 카드
  'card.flip': hit('card.flip', { lufs: -26, transient: [click(0, 3000, 0, 0.008)], body: [swish(0, 0.07, 2200, 900, -2, 1.5)], tail: [{ at: 0.03, dur: 0.12, src: { type: 'noise', color: 'pink' }, env: { a: 0.002, d: 0.1, s: 0, r: 0.05 }, filter: { type: 'lowpass', freq: 1400 }, gain: -12 }] }),
  'card.deal': hit('card.deal', { lufs: -24.5, transient: [{ ...click(0.17, 1500, 0, 0.015), pan: 0.25 }], body: [{ ...swish(0, 0.18, 600, 2600, -4, 1), pan: [[0, -0.35], [0.18, 0.25]] }, thud(0.17, 180, -10, 0.05, 4)], tail: [{ at: 0.18, dur: 0.08, src: { type: 'noise', color: 'pink' }, env: { a: 0.001, d: 0.07, s: 0, r: 0.04 }, filter: { type: 'lowpass', freq: 1800 }, gain: -14 }] }),

  // 룰렛: 감속에 따라 틱 간격이 벌어진다. params.dur(초)
  'roulette.spin': { id: 'roulette.spin', lufs: -19, variants: 1, build(p = {}) {
    const dur = p.dur ?? 4;
    return { tracks: [
      tr('틱', [{ ticks: { dur, gap0: 0.035, gap1: 0.3, accent: 4 }, tpl: { dur: 0.008, src: { type: 'noise' }, env: { a: 0.0005, d: 0.008, s: 0, r: 0.004 }, filter: { type: 'bandpass', freq: 4200, q: 3 } } }, { ticks: { dur, gap0: 0.035, gap1: 0.3, accent: 4 }, tpl: { dur: 0.01, src: { type: 'osc', wave: 'triangle' }, freq: 2300, env: { a: 0.0005, d: 0.008, s: 0, r: 0.004 }, gain: -12 } }], { fx: { reverb: 0.1 } }),
      tr('구르는 공', [{ at: 0, dur, src: { type: 'noise', color: 'brown' }, env: { points: [[0, 0], [0.1, 1], [dur * 0.8, 0.5], [dur, 0]] }, filter: { type: 'bandpass', freq: [[0, 900], [dur, 300]], q: 0.8 }, gain: -8 }], { fx: { trem: { rate: 14, depth: 0.5 } } }),
    ] };
  } },
  'roulette.stop': hit('roulette.stop', { lufs: -26.5, transient: [click(0, 3500, 0, 0.006), click(0.07, 3500, -5, 0.005), click(0.11, 3500, -10, 0.004)], body: [thud(0.0, 300, -6, 0.08, 3), thud(0.07, 300, -12, 0.06, 2)], tail: [{ at: 0.12, dur: 0.25, src: { type: 'noise', color: 'brown' }, env: { a: 0.01, d: 0.2, s: 0, r: 0.1 }, filter: { type: 'lowpass', freq: 500 }, gain: -10 }] }),

  // 주사위 통: 흔들기(params.dur) → 엎기 → 공개
  'dice.shake': { id: 'dice.shake', lufs: -18, build(p = {}) {
    const r = rng(p.seed ?? 11), dur = p.dur ?? 0.8, shakes = Math.max(2, Math.round(dur / 0.2));
    const clicks = [], knocks = [];
    for (let s = 0; s < shakes; s++) {
      const t0 = s * (dur / shakes);
      knocks.push({ ...thud(t0, 140 + r() * 30, -8, 0.06, 3), pan: s % 2 ? 0.2 : -0.2 });
      const n = 4 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) clicks.push({ ...rattle(t0 + 0.01 + r() * 0.12, -r() * 9, 2400 + r() * 2200), pan: r() * 0.6 - 0.3 });
    }
    return { tracks: [tr('주사위', clicks, { fx: { reverb: 0.15 } }), tr('통', knocks, { fx: { filter: { type: 'lowpass', freq: 700 } } })] };
  } },
  'dice.slam': hit('dice.slam', { lufs: -19.5, transient: [click(0, 2000, 0, 0.008)], body: [thud(0, 95, 0, 0.18, 5), { at: 0, dur: 0.09, src: { type: 'noise', color: 'brown' }, env: { a: 0.001, d: 0.08, s: 0, r: 0.04 }, filter: { type: 'lowpass', freq: 500 }, gain: -3 }], tail: [rattle(0.05, -6), rattle(0.09, -10, 2800), rattle(0.12, -16, 3600)] }),
  'dice.reveal': { id: 'dice.reveal', lufs: -21, tracks: [tr('들기', [swish(0, 0.22, 400, 1500, 0, 0.9)]), tr('구름', [rattle(0.05, -4), rattle(0.1, -8, 2900)], { fx: { reverb: 0.2 } })] },

  // 슬롯 릴: 회전(params.dur) → 멈춤
  'slot.spin': { id: 'slot.spin', lufs: -22, variants: 1, build(p = {}) {
    const dur = p.dur ?? 1.7;
    return { tracks: [
      tr('모터', [{ at: 0, dur, src: { type: 'noise', color: 'pink' }, env: { points: [[0, 0], [0.08, 1], [dur - 0.1, 0.8], [dur, 0]] }, filter: { type: 'bandpass', freq: 900, q: 1.5 }, trem: { rate: 18, depth: 0.6 } }]),
      tr('딸깍', [{ ticks: { dur, gap0: 0.045, gap1: 0.06 }, tpl: { ...click(0, 3000, -10, 0.004) } }]),
    ] };
  } },
  'slot.stop': hit('slot.stop', { lufs: -24, transient: [click(0, 2500, 0, 0.006)], body: [thud(0, 140, -2, 0.12, 6)], tail: [{ at: 0.01, dur: 0.3, src: { type: 'fm', ratio: 2.7, index: [[0, 2], [0.3, 0.1]] }, freq: 880, env: { a: 0.001, d: 0.28, s: 0, r: 0.1 }, gain: -16 }] }),

  // 경마
  'race.start': { id: 'race.start', lufs: -15, tracks: [
    tr('출발 종', [{ ...INST.bell, at: 0, dur: 0.5, freq: 1318, gain: 0 }, { ...INST.bell, at: 0.18, dur: 1.2, freq: 1318, gain: 0 }], { fx: { reverb: 0.3 } }),
    tr('문 열림', [click(0.16, 1500, -4, 0.02), thud(0.16, 80, -2, 0.3, 4)]),
  ] },
  'race.gallop': { id: 'race.gallop', lufs: -20, variants: 1, build(p = {}) {
    const dur = p.dur ?? 10, r = rng(p.seed ?? 3), hooves = [[], []], crowd = [];
    for (let h = 0; h < 2; h++) {
      let t = 0.05 + h * 0.11;
      while (t < dur) {
        const cycle = 0.55 - 0.17 * Math.min(1, t / (dur * 0.6)); // 점점 빨라지는 질주
        for (const off of [0, 0.075, 0.15]) hooves[h].push({ ...thud(t + off + r() * 0.01, 85 + r() * 20, -2 - r() * 4, 0.07, 3), pan: h ? 0.3 : -0.3 });
        t += cycle;
      }
    }
    crowd.push({ at: 0, dur, src: { type: 'noise', color: 'pink' }, env: { points: [[0, 0.2], [dur * 0.7, 0.5], [dur, 1]] }, filter: { type: 'bandpass', freq: 900, q: 0.7 }, trem: { rate: 3.3, depth: 0.25 }, gain: -10 });
    return { tracks: [tr('말발굽 1', hooves[0], { fx: { filter: { type: 'lowpass', freq: 600 } } }), tr('말발굽 2', hooves[1], { fx: { filter: { type: 'lowpass', freq: 600 } } }), tr('관중', crowd, { fx: { reverb: 0.4 } })] };
  } },
  'race.finish': { id: 'race.finish', lufs: -14, duck: 6, tracks: [
    tr('환호', [{ at: 0, dur: 2.2, src: { type: 'noise', color: 'pink' }, env: { points: [[0, 0], [0.25, 1], [1.4, 0.7], [2.2, 0]] }, filter: { type: 'bandpass', freq: 1200, q: 0.6 }, trem: { rate: 7, depth: 0.3 } }], { fx: { reverb: 0.4 } }),
    tr('결승 종', [{ ...INST.bell, at: 0, dur: 0.3, freq: 1568 }, { ...INST.bell, at: 0.15, dur: 0.3, freq: 1568 }, { ...INST.bell, at: 0.3, dur: 1.2, freq: 1568 }], { fx: { reverb: 0.35 } }),
  ] },

  // 가위바위보: 손 흔들기 박자 → 공개
  'rps.beat': { id: 'rps.beat', lufs: -21, tracks: [tr('손', [swish(0, 0.12, 500, 1200, 0, 1), thud(0.1, 160, -8, 0.06, 3)])] },
  'rps.reveal': hit('rps.reveal', { lufs: -26, transient: [click(0, 2500, 0, 0.01)], body: [swish(0, 0.08, 1500, 3000, -4, 1.4)], tail: [] }),

  // VFX
  'vfx.sparkle': { id: 'vfx.sparkle', lufs: -19, build(p = {}) {
    const r = rng(p.seed ?? 21), c = conceptOf(p), clips = [];
    for (let i = 0; i < 9; i++) clips.push({ ...INST.glass, at: i * 0.045 + r() * 0.03, dur: 0.25, freq: semis(sc(c, 4 + Math.floor(r() * 5)), 12), gain: -r() * 8, pan: r() * 1.2 - 0.6 });
    return { tracks: [tr('반짝', clips, { fx: { reverb: 0.5, delay: { time: 0.13, feedback: 0.3, mix: 0.2, tone: 6000 } } }), tr('숨', [{ at: 0, dur: 0.5, src: { type: 'noise' }, env: { points: [[0, 0], [0.05, 1], [0.5, 0]] }, filter: { type: 'highpass', freq: 7000 }, gain: -12 }])] };
  } },
  'vfx.explosion': hit('vfx.explosion', { lufs: -15.5, extra: { duck: 6 },
    transient: [{ at: 0, dur: 0.012, src: { type: 'noise' }, env: { a: 0.0005, d: 0.012, s: 0, r: 0.01 }, gain: 0 }],
    body: [{ at: 0, dur: 0.5, src: { type: 'noise', color: 'brown' }, env: { a: 0.002, d: 0.45, s: 0, r: 0.1 }, filter: { type: 'lowpass', freq: [[0, 3000], [0.5, 200]] }, dist: 0.35, gain: 2 }, thud(0, 60, 0, 0.6, 12)],
    tail: [{ at: 0.05, dur: 1.4, src: { type: 'noise', color: 'brown' }, env: { a: 0.05, d: 1.3, s: 0, r: 0.3 }, filter: { type: 'lowpass', freq: 400 }, gain: -6 }],
  }),
};

// ── 컨셉을 따르는 결과음(승리·패배·잭팟·사주) ─────────────
const leadNote = (c, at, i, dur, gain = 0, extra = {}) => ({ ...c.lead, at, dur, freq: sc(c, i), gain: (c.lead.gain ?? 0) + gain, ...extra });
const bellNote = (c, at, i, dur, gain = 0) => ({ ...c.bell, at, dur, freq: c.bell.freq ?? semis(sc(c, i), 12), gain: (c.bell.gain ?? 0) + gain });

Object.assign(SFX, {
  win: { id: 'win', lufs: -14, duck: 4, build(p) {
    const c = conceptOf(p);
    return { space: c.space, tracks: [
      tr('transient', [click(0, 4000, -6, 0.006), bellNote(c, 0, 5, 0.4, -6)]),
      tr('body', [0, 2, 3, 5, 6].map((d, i) => leadNote(c, 0.02 + i * 0.085, d, 0.6, -i * 0.5)), { fx: { reverb: 0.3 } }),
      tr('tail', [2, 3, 5].map(i => leadNote(c, 0.5, i + 2, 1.4, -6)).concat([bellNote(c, 0.48, 7, 1.2, -8)]), { fx: { reverb: 0.6 } }),
    ] };
  } },
  draw: { id: 'draw', lufs: -19, build(p) {
    const c = conceptOf(p);
    return { space: c.space, tracks: [tr('body', [leadNote(c, 0, 3, 0.5, 0), leadNote(c, 0.16, 3, 0.8, -3)], { fx: { reverb: 0.3 } })] };
  } },
  lose: { id: 'lose', lufs: -18, build(p) {
    const c = conceptOf(p);
    return { space: c.space, tracks: [
      tr('body', [4, 2, 0].map((d, i) => leadNote(c, i * 0.2, d, 0.7, -i, { bend: i === 2 ? [[0, 0], [0.6, -0.8]] : undefined })), { fx: { reverb: 0.3, filter: { type: 'lowpass', freq: 1800 } } }),
      tr('tail', [{ ...c.drum, at: 0.4, dur: 0.5, gain: -6 }], { fx: { reverb: 0.4 } }),
    ] };
  } },
  jackpot: { id: 'jackpot', lufs: -12, duck: 9, variants: 1, build(p) {
    const c = conceptOf(p), r = rng(p.seed ?? 77), coins = [];
    for (let i = 0; i < 26; i++) coins.push({ at: 0.35 + i * 0.055 + r() * 0.04, dur: 0.3, src: { type: 'fm', ratio: 2.3, index: [[0, 1.6], [0.25, 0.2]] }, freq: 1900 + r() * 1400, env: { a: 0.001, d: 0.25, s: 0, r: 0.1 }, gain: -6 - r() * 8, pan: r() * 1.4 - 0.7 });
    const fan = [];
    for (let k = 0; k < 2; k++) [0, 2, 3, 5, 6, 8].forEach((d, i) => fan.push(leadNote(c, 0.3 + k * 0.62 + i * 0.09, d, 0.7, -2)));
    return { space: c.space, tracks: [
      tr('transient', [{ at: 0, dur: 0.015, src: { type: 'noise' }, env: { a: 0.0005, d: 0.015, s: 0, r: 0.01 } }, bellNote(c, 0, 6, 1.5, -2)]),
      tr('body', [thud(0, 55, 0, 0.7, 12), { ...c.drum, at: 0, dur: 0.6, gain: 0 }, ...fan], { fx: { reverb: 0.35 } }),
      tr('동전', coins, { fx: { reverb: 0.3 } }),
      tr('tail', [0, 2, 4].map(i => leadNote(c, 1.6, i + 3, 2, -4)).concat([bellNote(c, 1.6, 8, 2.2, -6)]), { fx: { reverb: 0.7 } }),
    ] };
  } },
  'saju.open': { id: 'saju.open', lufs: -17, variants: 1, build(p) {
    const c = conceptOf(p);
    return { space: c.space, tracks: [
      tr('바람', [{ at: 0, dur: 1.4, src: { type: 'noise', color: 'pink' }, env: { points: [[0, 0], [1.2, 1], [1.4, 0]] }, filter: { type: 'bandpass', freq: [[0, 300], [1.3, 3200]], q: 2 }, gain: -6 }], { auto: { pan: [[0, -0.5], [1.4, 0.5]] }, fx: { reverb: 0.4 } }),
      tr('화음', [0, 2, 4].map(i => ({ ...INST.pad, at: 0.2, dur: 1.4, freq: sc(c, i), gain: -10, env: { a: 1, d: 0.2, s: 0.8, r: 1, curve: 'lin' } })), { fx: { reverb: 0.6 } }),
      tr('종', [bellNote(c, 1.25, 5, 2, 0)], { fx: { reverb: 0.6 } }),
    ] };
  } },
  'saju.result': { id: 'saju.result', lufs: -15, duck: 4, build(p) {
    const c = conceptOf(p);
    return { space: c.space, tracks: [
      tr('transient', [bellNote(c, 0, 5, 1.6, 0)]),
      tr('body', [0, 2, 4, 5].map((d, i) => leadNote(c, 0.08 + i * 0.13, d + 2, 1.2, -4)), { fx: { reverb: 0.5 } }),
      tr('tail', [{ ...INST.glass, at: 0.6, dur: 0.4, freq: semis(sc(c, 7), 12), gain: -10 }, { ...INST.glass, at: 0.75, dur: 0.4, freq: semis(sc(c, 8), 12), gain: -12 }], { fx: { reverb: 0.7, delay: { time: 0.18, feedback: 0.35, mix: 0.25 } } }),
    ] };
  } },
});

// 전체 목록(시험 화면·시험용)
export function recipeFor(id, concept) {
  if (id === 'bgm') return CONCEPTS[concept]?.bgm || CONCEPTS[DEFAULT_CONCEPT].bgm;
  if (id?.startsWith('bgm.')) return Object.values(CONCEPTS).find(c => c.bgm.id === id)?.bgm || null;
  return SFX[id] || null;
}
export const SFX_IDS = Object.keys(SFX);
