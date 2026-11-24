// 쪼꼬미랜드 오락관 · 혼자 하는 게임 엔진 (쪼꼬미봇 core/casino.py 이식 + 마인즈·룰렛 추가).
// 순수 함수만 둔다: 상태·난수(rng)를 받아 결과를 돌려준다. 지갑·저장은 LandPlayer가 맡는다.
// 숨은 값(총알 위치·지뢰 자리·다음 카드)은 상태에만 있고, *View()는 이미 드러난 것만 담는다.
import {random, integer, weighted} from './land-games.js';

// 조정할 수치는 이 표만 고친다. 모든 배당은 원금 포함 총 지급 배율이다.
export const ARCADE = Object.freeze({
  returnPercent: 96,          // 러시안 룰렛·하이로우·마인즈: 어느 시점에 멈춰도 기대 환수율이 이 값 이하
  roulette: Object.freeze({chambers: 6}),
  hilo: Object.freeze({maxSteps: 10, maxMult: 100}),
  mines: Object.freeze({cells: 25, counts: Object.freeze([1, 3, 5, 10]), maxMult: 100}),
  baccarat: Object.freeze({player: 1.9, banker: 1.88, tie: 10}),
  // 럭키박스: 가격은 세 가지(100·1,000·5,000). 상품 배율 기대값 ≈ 0.952
  boxes: Object.freeze({small: 100, big: 1000, gold: 5000}),
  boxPrizes: Object.freeze([
    ['먼지만 폴폴', 3620, 0.2], ['달콤한 사탕', 3000, 0.5], ['초코 한 줌', 1800, 1], ['선물 꾸러미', 1000, 2],
    ['금화 주머니', 450, 4], ['반짝이 보석', 120, 10], ['전설의 황금 쪼꼬미', 10, 50],
  ]),
  // 플링코(공 떨어뜨리기): 12줄을 내려오며 좌우 반반으로 튄다. 칸 k의 확률은 C(12,k)/4096.
  // 위험도별 배당표(13칸, 가운데가 가장 흔함). 환수율 low≈96.2% · mid≈93.6% · high≈94.9%, 최대 100배.
  plinko: Object.freeze({rows: 12, tables: Object.freeze({
    low: Object.freeze([11, 4, 1.7, 1.2, 1.2, 0.8, 0.6, 0.8, 1.2, 1.2, 1.7, 4, 11]),
    mid: Object.freeze([45, 10, 3, 1.8, 1, 0.7, 0.3, 0.7, 1, 1.8, 3, 10, 45]),
    high: Object.freeze([100, 20, 6, 2.4, 0.8, 0.3, 0.1, 0.3, 0.8, 2.4, 6, 20, 100]),
  })}),
  // 룰렛 휠(유럽식 0 하나): 환수율 36/37 ≈ 97.3%
  wheelRed: Object.freeze([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]),
  // 구걸: 잔액이 적을 때만, 쿨다운 동안 한 번. [가중치, 최소, 최대]
  beg: Object.freeze({maxBalance: 300, cooldownMs: 600000, table: Object.freeze([[45, 0, 0], [40, 10, 50], [13, 60, 150], [2, 300, 300]])}),
  roundTtlMs: 600000,         // 진행 중인 판을 10분 넘게 두면 다음 요청 때 자동 정산(멈춤 가능하면 멈춤)
});

const fail = msg => { throw Object.assign(Error(msg), {arcade: true}); };
// 배율은 0.01 단위로 버린다. 정수 계산으로 부동소수 오차를 피한다
const cents = x => Math.floor(x * 100 + 1e-9);
export const pay = (bet, mult) => Math.floor(bet * cents(mult) / 100);

// ── 🔫 러시안 룰렛: 6칸 실린더에 총알 1발, 버틸수록 배율 상승 ──
export function rouletteMult(survived) {
  const n = ARCADE.roulette.chambers;
  if (survived <= 0) return 1;
  const k = Math.min(survived, n - 1);
  return Math.floor(ARCADE.returnPercent * n / (n - k)) / 100;
}
export function rouletteStart(bet, rng = random) {
  return {game: 'roulette', id: crypto.randomUUID(), bet, bullet: integer(ARCADE.roulette.chambers, rng), shots: 0, done: false, outcome: null, payout: 0};
}
export function roulettePull(r) {
  if (r.done) fail('이미 끝난 판이에요.');
  if (r.shots === r.bullet) return finish(r, 'bang', 0);
  r.shots++;
  if (r.shots >= ARCADE.roulette.chambers - 1) return finish(r, 'max', pay(r.bet, rouletteMult(r.shots)));
  return r;
}
export function rouletteView(r) {
  if (!r) return null;
  const n = ARCADE.roulette.chambers;
  return {game: 'roulette', id: r.id, bet: r.bet, shots: r.shots, chambers: n, done: r.done, outcome: r.outcome, payout: r.payout,
    mult: rouletteMult(r.shots), next: r.shots < n - 1 ? rouletteMult(r.shots + 1) : null, survive: (n - r.shots - 1) / (n - r.shots),
    bullet: r.done ? r.bullet : null};
}

// ── 🔼 하이로우: 다음 카드가 높을까 낮을까. 같은 숫자는 진다 ──
// 무한 덱(매번 52장 중 하나). 공정 배율은 분자/분모 정수로 누적해 오차 없이 계산한다
export const hiloProb = (rank, guess) => (guess === 'high' ? 13 - rank : rank - 1) / 13;
const gcd = (a, b) => b ? gcd(b, a % b) : a;
const hiloMult = (num, den) => Math.min(ARCADE.hilo.maxMult, Math.floor(ARCADE.returnPercent * num / den) / 100);
const drawCard = rng => ({rank: integer(13, rng) + 1, suit: integer(4, rng)});
export function hiloStart(bet, rng = random) {
  return {game: 'hilo', id: crypto.randomUUID(), bet, cards: [drawCard(rng)], num: 1, den: 1, steps: 0, done: false, outcome: null, payout: 0};
}
export function hiloGuess(g, guess, rng = random) {
  if (g.done) fail('이미 끝난 판이에요.');
  if (!['high', 'low'].includes(guess)) fail('높음 또는 낮음을 골라주세요.');
  const rank = g.cards.at(-1).rank, ways = guess === 'high' ? 13 - rank : rank - 1;
  if (!ways) fail(guess === 'high' ? 'K보다 높은 카드는 없어요.' : 'A보다 낮은 카드는 없어요.');
  const next = drawCard(rng);
  g.cards.push(next);
  if (!(guess === 'high' ? next.rank > rank : next.rank < rank)) return finish(g, 'miss', 0);
  g.num *= 13; g.den *= ways;
  const d = gcd(g.num, g.den); g.num /= d; g.den /= d;
  g.steps++;
  if (g.steps >= ARCADE.hilo.maxSteps || hiloMult(g.num, g.den) >= ARCADE.hilo.maxMult) return finish(g, 'max', pay(g.bet, hiloMult(g.num, g.den)));
  return g;
}
export function hiloView(g) {
  if (!g) return null;
  const rank = g.cards.at(-1).rank, next = guess => {
    const ways = guess === 'high' ? 13 - rank : rank - 1;
    return ways ? hiloMult(g.num * 13, g.den * ways) : null;
  };
  return {game: 'hilo', id: g.id, bet: g.bet, cards: g.cards.slice(-8), steps: g.steps, done: g.done, outcome: g.outcome, payout: g.payout,
    mult: g.steps ? hiloMult(g.num, g.den) : 1, high: next('high'), low: next('low'), pHigh: hiloProb(rank, 'high'), pLow: hiloProb(rank, 'low')};
}

// ── 💎 마인즈: 25칸에 지뢰 m개, 안전한 칸을 열수록 배율 상승 ──
// k칸을 연속으로 무사히 열 확률 = C(25-m,k)/C(25,k) → 공정 배율은 그 역수
export function minesFair(mines, opened) {
  let f = 1;
  for (let i = 0; i < opened; i++) f *= (ARCADE.mines.cells - i) / (ARCADE.mines.cells - mines - i);
  return f;
}
export const minesMult = (mines, opened) => opened ? Math.min(ARCADE.mines.maxMult, Math.floor(ARCADE.returnPercent * minesFair(mines, opened) + 1e-9) / 100) : 1;
export function minesStart(bet, mines, rng = random) {
  if (!ARCADE.mines.counts.includes(mines)) fail('지뢰 수는 ' + ARCADE.mines.counts.join('·') + '개 중에서 골라주세요.');
  const cells = Array.from({length: ARCADE.mines.cells}, (_, i) => i);
  for (let i = cells.length - 1; i > 0; i--) { const j = integer(i + 1, rng); [cells[i], cells[j]] = [cells[j], cells[i]]; }
  return {game: 'mines', id: crypto.randomUUID(), bet, mines, bombs: cells.slice(0, mines).sort((a, b) => a - b), opened: [], done: false, outcome: null, payout: 0, hit: null};
}
export function minesPick(g, cell) {
  if (g.done) fail('이미 끝난 판이에요.');
  if (!Number.isInteger(cell) || cell < 0 || cell >= ARCADE.mines.cells) fail('칸을 다시 골라주세요.');
  if (g.opened.includes(cell)) fail('이미 연 칸이에요.');
  if (g.bombs.includes(cell)) { g.hit = cell; return finish(g, 'boom', 0); }
  g.opened.push(cell);
  const safe = ARCADE.mines.cells - g.mines, mult = minesMult(g.mines, g.opened.length);
  if (g.opened.length >= safe || mult >= ARCADE.mines.maxMult) return finish(g, 'max', pay(g.bet, mult));
  return g;
}
export function minesView(g) {
  if (!g) return null;
  const n = g.opened.length;
  return {game: 'mines', id: g.id, bet: g.bet, mines: g.mines, opened: g.opened, done: g.done, outcome: g.outcome, payout: g.payout, hit: g.hit,
    mult: minesMult(g.mines, n), next: n < ARCADE.mines.cells - g.mines ? minesMult(g.mines, n + 1) : null,
    safeChance: (ARCADE.mines.cells - g.mines - n) / (ARCADE.mines.cells - n), bombs: g.done ? g.bombs : null};
}

// 멈춤(캐시아웃): 한 단계 이상 버틴 판만. 세 게임이 같은 규칙을 쓴다
const CASH = {
  roulette: g => g.shots >= 1 && rouletteMult(g.shots),
  hilo: g => g.steps >= 1 && hiloMult(g.num, g.den),
  mines: g => g.opened.length >= 1 && minesMult(g.mines, g.opened.length),
};
export function cashOut(g) {
  if (g.done) fail('이미 끝난 판이에요.');
  const mult = CASH[g.game]?.(g);
  if (!mult) fail('한 번은 도전해야 멈출 수 있어요.');
  return finish(g, 'cash', pay(g.bet, mult));
}
// 시간 초과: 멈출 수 있으면 멈추고, 아직 한 번도 안 했으면 원금을 돌려준다(아무도 손해 보지 않는 쪽)
export function expire(g) {
  if (g.done) return g;
  const mult = CASH[g.game]?.(g);
  return finish(g, mult ? 'cash' : 'refund', mult ? pay(g.bet, mult) : g.bet);
}
function finish(g, outcome, payout) { g.done = true; g.outcome = outcome; g.payout = payout; return g; }
export const roundView = g => !g ? null : g.game === 'roulette' ? rouletteView(g) : g.game === 'hilo' ? hiloView(g) : minesView(g);

// ── 🎴 바카라: 8덱 표준 세 번째 카드 규칙 ──
const baccPoint = c => c.rank >= 10 ? 0 : c.rank;
const baccTotal = cs => cs.reduce((a, c) => a + baccPoint(c), 0) % 10;
function bankerDraws(b, p3) {
  if (p3 == null) return b <= 5;
  if (b <= 2) return true;
  if (b === 3) return p3 !== 8;
  if (b === 4) return p3 >= 2 && p3 <= 7;
  if (b === 5) return p3 >= 4 && p3 <= 7;
  if (b === 6) return p3 === 6 || p3 === 7;
  return false;
}
// 8덱(416장)에서 뽑기: 많아야 6장이므로 뽑은 자리만 기억하는 비복원 추출로 충분하다
function shoeDraw(rng) {
  const used = new Set();
  return () => { let i; do i = integer(416, rng); while (used.has(i)); used.add(i); return {rank: (i % 52 >> 2) + 1, suit: i & 3}; };
}
export function baccaratDeal(rng = random) {
  const draw = shoeDraw(rng), player = [draw(), draw()], banker = [draw(), draw()];
  let p = baccTotal(player), b = baccTotal(banker);
  if (p < 8 && b < 8) {
    let p3 = null;
    if (p <= 5) { player.push(draw()); p3 = baccPoint(player[2]); }
    if (bankerDraws(b, p3)) banker.push(draw());
  }
  p = baccTotal(player); b = baccTotal(banker);
  return {player, banker, playerTotal: p, bankerTotal: b, winner: p > b ? 'player' : b > p ? 'banker' : 'tie'};
}
export function baccaratPayout(bet, side, winner) {
  if (side === winner) return pay(bet, ARCADE.baccarat[side]);
  return winner === 'tie' ? bet : 0;   // 타이면 플레이어·뱅커에 건 돈은 돌려준다
}

// ── 🎁 럭키박스 ──
export function boxOpen(choice, rng = random) {
  const price = ARCADE.boxes[choice];
  if (!price) fail('상자를 골라주세요.');
  const i = weighted(ARCADE.boxPrizes.map(p => p[1]), rng), [name, , mult] = ARCADE.boxPrizes[i];
  return {box: choice, price, prize: name, tier: i, mult, payout: pay(price, mult)};
}

// ── 🎡 룰렛 휠: 0~36. 선택은 'red'|'black'|'odd'|'even'|'low'|'high'|'d1'~'d3'|'n7' ──
export function wheelBet(choice) {
  if (typeof choice !== 'string') return null;
  const red = ARCADE.wheelRed, m = /^n(\d{1,2})$/.exec(choice);
  if (m) { const n = Number(m[1]); return n <= 36 ? {mult: 36, hit: x => x === n} : null; }
  const even = {red: x => red.includes(x), black: x => x > 0 && !red.includes(x), odd: x => x % 2 === 1, even: x => x > 0 && x % 2 === 0, low: x => x >= 1 && x <= 18, high: x => x >= 19};
  if (even[choice]) return {mult: 2, hit: even[choice]};
  const d = /^d([123])$/.exec(choice);
  if (d) { const lo = (Number(d[1]) - 1) * 12 + 1; return {mult: 3, hit: x => x >= lo && x < lo + 12}; }
  return null;
}
export const wheelColor = n => n === 0 ? 'green' : ARCADE.wheelRed.includes(n) ? 'red' : 'black';

// 한 번에 끝나는 게임(바카라·럭키박스·룰렛 휠). 럭키박스는 상자 가격이 곧 베팅액이다
// ── 🔵 플링코: 공이 지나간 길(path)은 서버가 정하고, 화면은 그대로 보여주기만 한다 ──
export function plinkoDrop(bet, risk, rng = random) {
  const table = ARCADE.plinko.tables[risk];
  if (!table) fail('위험도를 골라주세요(낮음·보통·높음).');
  const path = Array.from({length: ARCADE.plinko.rows}, () => integer(2, rng));   // 0=왼쪽 1=오른쪽
  const slot = path.reduce((s, x) => s + x, 0), mult = table[slot];
  return {game: 'plinko', choice: risk, path, slot, mult, table, payout: pay(bet, mult)};
}

export function arcadeOneShot(game, bet, choice, rng = random) {
  if (game === 'plinko') return plinkoDrop(bet, choice, rng);
  if (game === 'baccarat') {
    if (!['player', 'banker', 'tie'].includes(choice)) fail('플레이어·뱅커·타이 중에서 골라주세요.');
    const d = baccaratDeal(rng);
    return {game, choice, ...d, payout: baccaratPayout(bet, choice, d.winner)};
  }
  if (game === 'wheel') {
    const b = wheelBet(choice);
    if (!b) fail('걸 곳을 골라주세요.');
    const n = integer(37, rng);
    return {game, choice, number: n, color: wheelColor(n), payout: b.hit(n) ? bet * b.mult : 0};
  }
  if (game === 'luckybox') return {game, choice, ...boxOpen(choice, rng)};
  return null;
}

// ── 🥺 구걸: 잔액이 적을 때 쪼꼬미가 주는 적선 ──
export function begAlms(rng = random) {
  const t = ARCADE.beg.table, [, lo, hi] = t[weighted(t.map(x => x[0]), rng)];
  return hi ? lo + integer(hi - lo + 1, rng) : 0;
}
export const BEG_LINES = Object.freeze(['쪼꼬미가 못 본 척 지나갔어요…', '쪼꼬미가 주머니를 뒤져 동전을 던져 줬어요.', '쪼꼬미가 불쌍하다며 초코를 꽤 줬어요!', '지나가던 부자 쪼꼬미가 크게 한 턱 냈어요!']);
export const begLine = amount => BEG_LINES[amount <= 0 ? 0 : amount <= 50 ? 1 : amount < 300 ? 2 : 3];
