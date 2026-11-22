// 개인 경마 연출 대본. 우승 말은 서버가 이미 정했다(확률·지급은 서버 몫). 여기서는 그 결과에 닿는 "경주 모양"만 짠다.
// 흐름: 출발 대기 → 게이트 오픈 → 순위가 바뀌는 중반 → 마지막 직선 접전 → 사진 판정 → 결과 공개.
// 같은 결과는 언제 다시 그려도 같은 경주가 나오게 결과 내용으로 씨앗을 만든다.

// gate: 게이트가 열리는 시각 · finish: 우승 말 코가 결승선에 닿는 시각 · runout: 결승선 뒤 감속 · settle: 결과 공개
// line: 결승선 위치(트랙 너비 비율) · start: 게이트 안 말 코 위치(px)
export const RACE = { gate: 1400, finish: 9600, runout: 900, settle: 10900, line: 0.86, start: 58, startNarrow: 48 };
// 체크포인트: [시각, 평균 진행, 순위 간격]. 앞은 벌어지고 막판에는 붙는다.
const CHECK = [[1400, 0, 0], [2600, 0.12, 0.016], [4200, 0.33, 0.024], [5800, 0.54, 0.028], [7400, 0.74, 0.026], [8600, 0.885, 0.018]];
// 경마 관례 번호천 색(1 빨강, 2 흰색, 3 파랑, 4 노랑, 5 초록)과 말마다 다른 털빛.
export const SADDLE = [['#c8312b', '#fff'], ['#f4f1ea', '#1d1d1d'], ['#2b5fae', '#fff'], ['#f0c93a', '#1d1d1d'], ['#2f7d4a', '#fff']];
export const COAT = ['none', 'brightness(.62) contrast(1.15) saturate(.9)', 'grayscale(1) brightness(1.32) contrast(.92)', 'brightness(.4) contrast(1.3) saturate(.6)', 'sepia(.45) saturate(1.5) brightness(1.16) hue-rotate(-8deg)'];

function seedOf(text) { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const ranksOf = score => { const order = score.map((s, i) => i).sort((a, b) => score[b] - score[a]); const r = []; order.forEach((i, k) => { r[i] = k; }); return r; };
// 착차 이름: 경마 중계 용어(코·머리·목·1/2마신·1마신…). 진행 0.01 ≈ 말 몸 길이 1/4 로 본다.
export function marginName(gap) { return gap < 0.008 ? '코 차이' : gap < 0.016 ? '머리 차이' : gap < 0.026 ? '목 차이' : gap < 0.05 ? '1/2마신' : gap < 0.09 ? '1마신' : '2마신 이상'; }

// 결과 → 말마다 [시각, 진행] 점들 · 결승 순서 · 착차 · 중계 문구
export function raceScript(result) {
  const horses = result?.horses || [], n = horses.length, winner = result?.winner;
  if (!n || !Number.isInteger(winner) || winner < 0 || winner >= n) return null;
  const R = rng(seedOf(horses.map(h => h.name + ':' + h.rate).join('|') + '#' + winner + '#' + (result.choice ?? '') + '#' + (result.bet ?? '')));
  const chance = horses.map(h => Number(h.chance) || 1 / n);
  // 결승 순서: 우승 다음은 승률을 반영해 뽑고, 나머지는 승률+흔들림 순.
  const rest = horses.map((_, i) => i).filter(i => i !== winner);
  const pickW = list => { let t = list.reduce((s, i) => s + chance[i], 0) * R(); for (const i of list) { t -= chance[i]; if (t <= 0) return i; } return list[list.length - 1]; };
  const second = pickW(rest);
  const tail = rest.filter(i => i !== second).sort((a, b) => (chance[b] + R() * 0.25) - (chance[a] + R() * 0.25));
  const order = [winner, second, ...tail];
  const finalQ = new Array(n);
  finalQ[winner] = 1; finalQ[second] = 1 - (0.003 + R() * 0.012); // 사진 판정이 필요할 만큼 붙는다
  let back = 1 - finalQ[second];
  tail.forEach(i => { back += 0.018 + R() * 0.04; finalQ[i] = 1 - back; });

  // 중간 순위: 앞 체크포인트 점수를 이어받아 조금씩 바뀌게(한 번에 꼴찌↔선두 같은 순간이동 없음).
  let score = chance.map(c => c * 2 + R());
  const ranks = [new Array(n).fill(0)];
  for (let k = 1; k < CHECK.length; k++) {
    score = score.map(s => s * 0.55 + R() * 0.9);
    let r = ranksOf(score);
    const swap = (i, want) => { const j = r.indexOf(want); [r[i], r[j]] = [want, r[i]]; };
    if (k <= 3 && r[winner] === 0) swap(winner, 1 + (R() * Math.min(3, n - 1) | 0)); // 우승 말이 처음부터 선두면 긴장이 없다
    if (k === 4) { swap(second, 0); swap(winner, n > 2 && R() < 0.6 ? 2 : 1); } // 직선 입구: 우승 말은 2~3위에서 추격
    if (k === 5) { swap(second, 0); swap(winner, 1); } // 막판: 두 마리 머리 싸움
    ranks.push(r);
  }
  const lanes = horses.map((_, i) => {
    const keys = [[0, 0]];
    let prev = 0;
    CHECK.forEach(([t, m, d], k) => {
      let q = k === 0 ? 0 : m + d * ((n - 1) / 2 - ranks[k][i]) + (R() - 0.5) * 0.006;
      if (k === 5 && i === winner) q = m + d * ((n - 1) / 2) - (0.004 + R() * 0.006); // 선두 바로 뒤에 붙는다
      if (k === 5 && i === second) q = m + d * ((n - 1) / 2);
      if (k > 0) q = Math.max(q, prev + 0.05); // 말은 뒤로 가지 않는다
      keys.push([t, q]); prev = q;
    });
    const fq = Math.max(finalQ[i], prev + 0.05);
    keys.push([RACE.finish, fq], [RACE.finish + RACE.runout, fq + 0.055 - (1 - fq) * 0.2]);
    return keys;
  });
  // 결승선 통과 직전 우승 말이 마지막 한 걸음에서 앞선다: 다른 말의 결승 값이 1을 넘지 않게 보정
  lanes.forEach((keys, i) => { if (i !== winner) { const f = keys[keys.length - 2]; f[1] = Math.min(f[1], 0.997); } });

  const name = i => (i + 1) + '번 ' + horses[i].name;
  const leaderAt = k => ranks[k].indexOf(0);
  const calls = [[0, '게이트 진입 · 출발 대기'], [RACE.gate, '출발! 게이트가 열렸어요']];
  let lastLeader = -1;
  [1, 2, 3].forEach(k => {
    const l = leaderAt(k);
    calls.push([CHECK[k][0], k === 1 ? name(l) + ' 선두로 나섭니다' : l !== lastLeader ? name(l) + ', 선두 탈환!' : (k === 3 ? '3코너 · ' : '') + name(l) + ' 선두 유지']);
    lastLeader = l;
  });
  calls.push([CHECK[4][0], '마지막 직선! ' + name(second) + ' 앞, ' + name(winner) + ' 추격']);
  calls.push([CHECK[5][0], name(second) + ' · ' + name(winner) + ' 접전!']);
  calls.push([RACE.finish, '나란히 결승선 통과 · 사진 판정 중…']);
  return { lanes, order, margin: marginName(1 - finalQ[second]), calls, n };
}

// 단조 3차 보간(프리치-칼슨): 점 사이를 부드럽게, 넘치지 않게. 출발은 속도 0에서 가속한다.
export function sampler(keys) {
  const n = keys.length, xs = keys.map(k => k[0]), ys = keys.map(k => k[1]);
  const d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = 0; m[n - 1] = d[n - 2] * 0.35;
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  // 게이트 전 구간(0→gate)은 제자리
  m[1] = 0;
  return t => {
    if (t <= xs[0]) return ys[0];
    if (t >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (t > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], u = (t - xs[i]) / h, u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * ys[i] + (u3 - 2 * u2 + u) * h * m[i] + (-2 * u3 + 3 * u2) * ys[i + 1] + (u3 - u2) * h * m[i + 1];
  };
}

// 진행 q → 말 자리(트랙 기준 translateX). q=0 게이트 안, q=1 코가 결승선.
export const laneX = (q, start) => 'translateX(calc(' + (q * RACE.line * 100).toFixed(3) + '% + ' + ((1 - q) * start).toFixed(2) + 'px))';

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// 화면에서 경주를 튼다. 움직임은 transform·opacity 뿐(합성 단계에서 처리).
export function playRace(stage, result, { reduced = reducedMotion() } = {}) {
  const none = { cancel() {} };
  const script = raceScript(result);
  if (!stage || !script || !stage.querySelectorAll) return none;
  const pos = [...stage.querySelectorAll('.horse-pos')], runners = [...stage.querySelectorAll('.horse-runner')];
  const call = stage.querySelector('.race-call'), photo = stage.querySelector('.race-photo'), flash = stage.querySelector('.race-flash');
  const doors = [...stage.querySelectorAll('.gate-door')], field = stage.querySelector('.horse-list');
  const start = matchMedia('(max-width:420px)').matches ? RACE.startNarrow : RACE.start;
  const timers = [], anims = [];
  const say = text => { if (call) call.textContent = text; };
  if (reduced) { say('결승 · ' + script.margin); return none; }
  const total = RACE.finish + RACE.runout;
  const ease = 'cubic-bezier(.45,0,.2,1)';
  pos.forEach((el, i) => {
    const at = sampler(script.lanes[i] || [[0, 0]]), frames = [];
    for (let t = 0; t <= total; t += 40) frames.push({ transform: laneX(at(t), start), offset: t / total });
    if (frames[frames.length - 1].offset < 1) frames.push({ transform: laneX(at(total), start), offset: 1 });
    anims.push(el.animate(frames, { duration: total, fill: 'both' }));
  });
  // 달리는 동안 몸이 오르내린다(말마다 박자를 어긋나게). 게이트 안에서는 숨 고르기만.
  runners.forEach((el, i) => {
    anims.push(el.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-1px)' }, { transform: 'translateY(0)' }], { duration: 900 + i * 70, iterations: Math.ceil(RACE.gate / (900 + i * 70)), easing: 'ease-in-out' }));
    const stride = 340 + (i % 3) * 18;
    anims.push(el.animate([
      { transform: 'translateY(0) rotate(0deg)' },
      { transform: 'translateY(-3.5px) rotate(-2.4deg)', offset: 0.38 },
      { transform: 'translateY(.5px) rotate(1.2deg)', offset: 0.74 },
      { transform: 'translateY(0) rotate(0deg)' },
    ], { duration: stride, delay: RACE.gate + i * 45, iterations: Math.floor((total - RACE.gate) / stride), easing: ease }));
  });
  doors.forEach((el, i) => anims.push(el.animate([{ transform: 'perspective(90px) rotateY(0deg)', opacity: 1 }, { transform: 'perspective(90px) rotateY(-78deg)', opacity: 0.35 }], { duration: 260, delay: RACE.gate - 40 + i * 6, fill: 'both', easing: 'cubic-bezier(.2,.9,.3,1)' })));
  // 마지막 직선: 결승선 쪽으로 살짝 다가가며 긴장을 올리고, 판정이 끝나면 돌아온다.
  if (field) anims.push(field.animate([{ transform: 'scale(1)', offset: 0 }, { transform: 'scale(1)', offset: 7200 / RACE.settle }, { transform: 'scale(1.035)', offset: RACE.finish / RACE.settle }, { transform: 'scale(1.035)', offset: (RACE.finish + 500) / RACE.settle }, { transform: 'scale(1)', offset: 1 }], { duration: RACE.settle, easing: ease, fill: 'both' }));
  if (flash) anims.push(flash.animate([{ opacity: 0 }, { opacity: 0.7, offset: 0.12 }, { opacity: 0 }], { duration: 420, delay: RACE.finish + 30, easing: 'ease-out', fill: 'both' }));
  if (photo) { // 결승 직후 가운데에 떴다가, 판정을 보여 준 뒤 물러난다
    const len = RACE.settle + 1700 - (RACE.finish + 260);
    anims.push(photo.animate([{ opacity: 0, transform: 'translateY(8px) scale(.96)' }, { opacity: 1, transform: 'none', offset: 320 / len }, { opacity: 1, transform: 'none', offset: 1 - 300 / len }, { opacity: 0, transform: 'translateY(-6px)' }], { duration: len, delay: RACE.finish + 260, easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'both' }));
  }
  for (const [t, text] of script.calls) timers.push(setTimeout(() => say(text), t));
  const wait = stage.querySelector('.photo-wait'), done = stage.querySelector('.photo-done');
  if (wait && done) { // 판정이 끝나야 순위를 보인다
    anims.push(wait.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, delay: RACE.settle - 320, fill: 'both', easing: 'ease-in' }));
    anims.push(done.animate([{ opacity: 0, transform: 'scale(1.25)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 300, delay: RACE.settle - 200, fill: 'both', easing: 'cubic-bezier(.2,.9,.3,1.3)' }));
  }
  timers.push(setTimeout(() => say('판정 · ' + '1착 ' + (script.order[0] + 1) + '번 · ' + script.margin), RACE.settle - 200));
  return { cancel() { timers.forEach(clearTimeout); anims.forEach(a => a.cancel()); } };
}

// 경주 화면 마크업. 결과가 있으면 결승 뒤 자리, 없으면 게이트 안에 둔다(애니메이션은 playRace가 덮어쓴다).
export function raceMarkup(race, result, { esc = String, horseSrc = '', narrow = false } = {}) {
  const horses = race?.horses || [], script = result ? raceScript(result) : null, start = narrow ? RACE.startNarrow : RACE.start;
  const lane = (horse, i) => {
    const q = script ? sampler(script.lanes[i])(RACE.finish + RACE.runout) : 0, mine = result && result.choice === i, won = result && result.winner === i;
    const [bg, fg] = SADDLE[i % SADDLE.length];
    return '<div class="horse-lane' + (mine ? ' mine' : '') + (won ? ' won' : '') + '"><span class="horse-name"><b class="saddle" style="background:' + bg + ';color:' + fg + '">' + (i + 1) + '</b>' + esc(horse.name) + (mine ? '<em>내 말</em>' : '') + '</span>'
      + '<span class="horse-track"><span class="gate-stall" aria-hidden="true"><i class="gate-door"></i></span><span class="horse-pos" style="transform:' + laneX(q, start) + '"><img class="horse-runner" style="filter:' + COAT[i % COAT.length] + '" src="' + horseSrc + '" alt=""><b class="saddle cloth" style="background:' + bg + ';color:' + fg + '">' + (i + 1) + '</b></span></span>'
      + '<span class="horse-odds">' + (horse.rate / 10).toFixed(1) + '배</span></div>';
  };
  const photo = script ? '<div class="race-photo" role="status"><small>PHOTO FINISH</small><span class="photo-wait">사진 판정 중…</span><span class="photo-done">1착 ' + (script.order[0] + 1) + '번 · 2착 ' + (script.order[1] + 1) + '번 <i>' + script.margin + '</i></span></div><span class="race-flash" aria-hidden="true"></span>' : '';
  return '<p class="race-call" aria-hidden="true">' + (script ? '결승 · ' + '1착 ' + (script.order[0] + 1) + '번 · ' + script.margin : '게이트 진입 · 출발 대기') + '</p><div class="horse-list">' + horses.map(lane).join('') + '</div>' + photo;
}
