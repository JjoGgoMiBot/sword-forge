// 랜드 포커(텍사스 홀덤, 노리밋) 테이블 엔진.
// 순수 함수만 둔다: 상태(t)·시각(now)·난수(rng)를 받아 상태를 바꾸고 정산할 일(ev)을 돌려준다.
// 지갑·소켓·저장은 LandRoom이 맡는다. 카드는 서버만 알고, view()는 보는 사람 자기 패와 쇼다운 공개 패만 담는다.
import {random} from './land-games.js';

// 조정할 수치는 이 표만 고친다.
export const POKER = Object.freeze({
  seats: 6,
  smallBlind: 10,
  bigBlind: 20,
  minBuyIn: 400,        // 20BB
  maxBuyIn: 4000,       // 200BB
  defaultBuyIn: 1000,
  actionMs: 20000,      // 사람 차례 제한 시간. 넘기면 체크할 수 있으면 체크, 아니면 폴드
  awayActionMs: 6000,   // 연결이 끊긴 사람 차례는 짧게만 기다린다
  maxTimeouts: 2,       // 연속 시간 초과가 이만큼이면 판이 끝날 때 자리에서 일어난다
  botDelayMs: [900, 2000],
  startDelayMs: 20000,  // 첫 사람이 앉은 뒤 첫 판까지(다른 사람이 들어올 시간)
  showdownMs: 5500,     // 결과를 보여 주고 다음 판까지
  botTarget: 4,         // 사람이 한 명이라도 앉아 있으면 자리 수를 이만큼까지 봇으로 채운다
  botStack: 1000,
  botSims: 180,         // 봇 승률 추정 몬테카를로 횟수
  botNames: Object.freeze(['모카', '라떼', '쿠키', '마카롱', '브라우니', '젤리', '푸딩', '와플']),
});

const RANKS = '23456789TJQKA', SUITS = 'shdc';
export const label = c => RANKS[c >> 2] + SUITS[c & 3];
export const parse = s => RANKS.indexOf(s[0]) * 4 + SUITS.indexOf(s[1]);
export const HAND_NAMES = Object.freeze(['하이카드', '원페어', '투페어', '트리플', '스트레이트', '플러시', '풀하우스', '포카드', '스트레이트 플러시']);
const BETTING = new Set(['preflop', 'flop', 'turn', 'river']);
const fail = msg => { throw Object.assign(Error(msg), {poker: true}); };

// ── 족보 ─────────────────────────────────────────────
// 5장 점수: 족보 번호(0~8) 뒤에 비교 순서대로 숫자 다섯 개를 15진수로 붙인다. 클수록 강하다.
export function score5(cs) {
  const r = cs.map(c => (c >> 2) + 2).sort((a, b) => b - a);
  const flush = cs.every(c => (c & 3) === (cs[0] & 3));
  const count = new Map();
  for (const x of r) count.set(x, (count.get(x) || 0) + 1);
  const g = [...count].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  let high = 0;
  if (count.size === 5) { if (r[0] - r[4] === 4) high = r[0]; else if (r[0] === 14 && r[1] === 5) high = 5; }
  let cat, kick;
  if (high && flush) { cat = 8; kick = [high]; }
  else if (g[0][1] === 4) { cat = 7; kick = [g[0][0], g[1][0]]; }
  else if (g[0][1] === 3 && g[1][1] === 2) { cat = 6; kick = [g[0][0], g[1][0]]; }
  else if (flush) { cat = 5; kick = r; }
  else if (high) { cat = 4; kick = [high]; }
  else if (g[0][1] === 3) { cat = 3; kick = g.map(x => x[0]); }
  else if (g[0][1] === 2 && g[1][1] === 2) { cat = 2; kick = g.map(x => x[0]); }
  else if (g[0][1] === 2) { cat = 1; kick = g.map(x => x[0]); }
  else { cat = 0; kick = r; }
  let s = cat;
  for (let i = 0; i < 5; i++) s = s * 15 + (kick[i] || 0);
  return s;
}
export const category = score => Math.floor(score / 15 ** 5);

// 5~7장 중 가장 좋은 5장
export function best(cards) {
  const n = cards.length;
  let top = -1, five = null;
  const pick = [0, 0, 0, 0, 0];
  const walk = (start, depth) => {
    if (depth === 5) { const hand = pick.map(i => cards[i]), s = score5(hand); if (s > top) { top = s; five = hand; } return; }
    for (let i = start; i <= n - (5 - depth); i++) { pick[depth] = i; walk(i + 1, depth + 1); }
  };
  walk(0, 0);
  return {score: top, cat: category(top), name: HAND_NAMES[category(top)], five};
}

// 아는 카드(내 패+보드)만으로 승률을 어림한다. 실제 덱·남의 패는 보지 않는다.
export function equity(hole, board, opponents, sims = POKER.botSims, rng = random) {
  const known = new Set([...hole, ...board]);
  const rest = [];
  for (let c = 0; c < 52; c++) if (!known.has(c)) rest.push(c);
  const opp = Math.max(1, Math.min(3, opponents)), need = 5 - board.length + opp * 2;
  let share = 0;
  for (let k = 0; k < sims; k++) {
    for (let i = 0; i < need; i++) { const j = i + Math.floor(rng() * (rest.length - i)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    const full = [...board, ...rest.slice(0, 5 - board.length)];
    const mine = best([...hole, ...full]).score;
    let beaten = false, ties = 0;
    for (let o = 0; o < opp; o++) {
      const at = 5 - board.length + o * 2, theirs = best([rest[at], rest[at + 1], ...full]).score;
      if (theirs > mine) { beaten = true; break; }
      if (theirs === mine) ties++;
    }
    if (!beaten) share += 1 / (ties + 1);
  }
  return share / sims;
}

// ── 테이블 ───────────────────────────────────────────
export function newTable() {
  return {hand: 0, phase: 'idle', seats: Array(POKER.seats).fill(null), button: -1, deck: [], board: [], toAct: null, deadline: null, nextAt: null, currentBet: 0, minRaise: POKER.bigBlind, result: null};
}
export const active = t => BETTING.has(t.phase);
const seatOf = (t, id) => t.seats.findIndex(s => s && !s.bot && s.id === id);
const live = s => s && s.inHand && !s.folded;
const canAct = s => live(s) && !s.allIn;
const needsAction = (t, s) => canAct(s) && (!s.acted || s.bet < t.currentBet);
const next = (t, from, test) => { for (let k = 1; k <= POKER.seats; k++) { const i = (from + k) % POKER.seats; if (test(t.seats[i], i)) return i; } return -1; };
const potTotal = t => t.seats.reduce((a, s) => a + (s?.total || 0), 0) + (t.dead || 0);
const emptyEvents = () => ({cashOuts: [], wins: []});
const shuffle = rng => { const d = Array.from({length: 52}, (_, i) => i); for (let i = 51; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; } return d; };

export function checkSit(t, index, who, amount) {
  if (!Number.isInteger(index) || index < 0 || index >= POKER.seats) fail('자리를 다시 골라주세요.');
  if (seatOf(t, who.id) >= 0) fail('이미 이 테이블에 앉아 있어요.');
  if (t.seats[index]) fail('그 자리는 이미 찼어요. 빈자리를 골라주세요.');
  if (!Number.isSafeInteger(amount) || amount < POKER.minBuyIn || amount > POKER.maxBuyIn) fail(`바이인은 ${POKER.minBuyIn.toLocaleString('ko-KR')}~${POKER.maxBuyIn.toLocaleString('ko-KR')}초코예요.`);
}

// 지갑에서 바이인을 뺀 뒤에 부른다
export function sit(t, index, who, amount, now) {
  checkSit(t, index, who, amount);
  t.seats[index] = {id: who.id, key: who.key, name: who.name, bot: false, stack: amount, ...fresh(), timeouts: 0, leaving: false, away: false};
  if (!active(t) && t.nextAt == null) t.nextAt = now + POKER.startDelayMs;
  return index;
}
const fresh = () => ({cards: [], bet: 0, total: 0, inHand: false, folded: false, allIn: false, acted: false, mayRaise: true, last: null});

function cashOut(t, i, ev, reason) {
  const s = t.seats[i];
  if (s.stack > 0) ev.cashOuts.push({key: s.key, id: s.id, name: s.name, amount: s.stack, reason});
  t.seats[i] = null;
}

// 자리에서 일어나기. 판 중이면 폴드하고 남은 칩만 돌려받는다(이미 낸 칩은 팟에 남는다).
export function standUp(t, id, now, rng = random) {
  const ev = emptyEvents(), i = seatOf(t, id);
  if (i < 0) return ev;
  const s = t.seats[i];
  if (active(t) && live(s)) {
    const turn = t.toAct === i;
    s.folded = true; s.last = {type: 'fold'};
    t.dead = (t.dead || 0) + s.total; s.total = 0;
    cashOut(t, i, ev, 'leave');
    if (turn || !t.seats.some(x => needsAction(t, x))) merge(ev, advance(t, i, now, rng));
    else if (t.seats.filter(live).length <= 1) merge(ev, advance(t, i, now, rng));
  } else {
    if (s.inHand && s.total) { t.dead = (t.dead || 0) + s.total; }
    cashOut(t, i, ev, 'leave');
  }
  if (!t.seats.some(x => x && !x.bot)) idleIfEmpty(t);
  return ev;
}

// 소켓이 모두 끊기면 away. 판 중이면 차례만 짧게 기다리고, 판이 끝나면 일어난다.
export function setAway(t, id, away, now = Date.now()) {
  const i = seatOf(t, id);
  if (i < 0 || t.seats[i].away === !!away) return false;
  const s = t.seats[i];
  s.away = !!away;
  if (!away) s.timeouts = 0;
  else if (active(t) && t.toAct === i && t.deadline != null) t.deadline = Math.min(t.deadline, now + POKER.awayActionMs);
  return true;
}

function idleIfEmpty(t) {
  if (active(t)) return;
  for (let i = 0; i < POKER.seats; i++) if (t.seats[i]?.bot) t.seats[i] = null;
  t.phase = 'idle'; t.nextAt = null; t.toAct = null; t.deadline = null; t.board = []; t.result = null;
}

function startHand(t, now, rng, ev) {
  t.nextAt = null; t.dead = 0;
  // 정리: 떠날 사람·연결 끊긴 사람·칩이 빅블라인드보다 적은 사람은 일어나고, 칩 떨어진 봇은 나간다
  for (let i = 0; i < POKER.seats; i++) {
    const s = t.seats[i];
    if (!s) continue;
    if (s.bot) { if (s.stack < POKER.bigBlind) t.seats[i] = null; continue; }
    if (s.leaving || s.away || s.stack < POKER.bigBlind) cashOut(t, i, ev, s.stack < POKER.bigBlind ? 'broke' : s.away ? 'away' : 'timeout');
  }
  if (!t.seats.some(s => s && !s.bot)) { idleIfEmpty(t); return; }
  // 봇: 사람이 늘면 빠지고, 모자라면 채운다
  let occupied = t.seats.filter(Boolean).length;
  for (let i = POKER.seats - 1; i >= 0 && occupied > POKER.botTarget; i--) if (t.seats[i]?.bot) { t.seats[i] = null; occupied--; }
  const used = new Set(t.seats.filter(s => s?.bot).map(s => s.name));
  while (occupied < POKER.botTarget) {
    const empty = t.seats.map((s, i) => s ? -1 : i).filter(i => i >= 0), at = empty[Math.floor(rng() * empty.length)];
    const free = POKER.botNames.filter(n => !used.has('봇 ' + n)), name = '봇 ' + (free[Math.floor(rng() * free.length)] || '초코');
    used.add(name);
    t.seats[at] = {id: 'bot:' + at + ':' + t.hand, key: null, name, bot: true, stack: POKER.botStack, ...fresh(), timeouts: 0, leaving: false, away: false};
    occupied++;
  }
  t.hand++;
  t.deck = shuffle(rng); t.board = []; t.result = null;
  for (const s of t.seats) if (s) Object.assign(s, fresh(), {inHand: true});
  t.button = next(t, t.button, s => !!s);
  for (const s of t.seats) if (s) s.cards = [t.deck.pop(), t.deck.pop()];
  const players = t.seats.filter(Boolean).length;
  const sb = players === 2 ? t.button : next(t, t.button, s => !!s), bb = next(t, sb, s => !!s);
  t.sb = sb; t.bb = bb;
  pay(t.seats[sb], POKER.smallBlind); t.seats[sb].last = {type: 'blind', amount: t.seats[sb].bet};
  pay(t.seats[bb], POKER.bigBlind); t.seats[bb].last = {type: 'blind', amount: t.seats[bb].bet};
  t.currentBet = POKER.bigBlind; t.minRaise = POKER.bigBlind; t.phase = 'preflop';
  turnFrom(t, bb, now, rng, ev);
}

function pay(s, n) {
  const x = Math.min(n, s.stack);
  s.stack -= x; s.bet += x; s.total += x;
  if (s.stack === 0) s.allIn = true;
}

// from 다음 자리부터 할 일이 있는 사람에게 차례를 준다. 없으면 이번 거리를 닫는다.
function turnFrom(t, from, now, rng, ev) {
  if (t.seats.filter(live).length <= 1) return finish(t, now, ev);
  const i = next(t, from, s => needsAction(t, s));
  if (i < 0) return closeStreet(t, now, rng, ev);
  t.toAct = i;
  const s = t.seats[i];
  t.deadline = now + (s.bot ? POKER.botDelayMs[0] + Math.floor(rng() * (POKER.botDelayMs[1] - POKER.botDelayMs[0])) : s.away ? POKER.awayActionMs : POKER.actionMs);
}

function closeStreet(t, now, rng, ev) {
  for (const s of t.seats) if (s) { s.bet = 0; if (live(s)) { s.acted = false; s.mayRaise = true; } }
  t.currentBet = 0; t.minRaise = POKER.bigBlind; t.toAct = null; t.deadline = null;
  const order = ['preflop', 'flop', 'turn', 'river'];
  const deal = () => { const step = t.board.length === 0 ? 3 : 1; for (let k = 0; k < step; k++) t.board.push(t.deck.pop()); };
  if (t.phase === 'river') return finish(t, now, ev);
  // 둘 이상이 더 걸 수 없으면(올인) 남은 보드를 모두 깔고 바로 쇼다운
  if (t.seats.filter(canAct).length <= 1) { while (t.board.length < 5) deal(); return finish(t, now, ev); }
  deal();
  t.phase = order[order.indexOf(t.phase) + 1];
  for (const s of t.seats) if (s) s.last = live(s) ? (s.allIn ? {type: 'allin'} : null) : s.last;
  turnFrom(t, t.button, now, rng, ev);
}

// 팟 나누기: 낸 금액 단계별로 사이드팟을 만들고, 각 팟은 그 단계까지 낸 살아 있는 사람만 가져간다.
export function splitPots(seats, dead = 0) {
  const alive = seats.map((s, i) => live(s) ? i : -1).filter(i => i >= 0);
  const levels = [...new Set(alive.map(i => seats[i].total))].sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const s of seats) if (s) amount += Math.min(s.total, level) - Math.min(s.total, prev);
    pots.push({amount, eligible: alive.filter(i => seats[i].total >= level)});
    prev = level;
  }
  let extra = dead;
  for (const s of seats) if (s && s.total > prev) extra += s.total - prev;
  if (pots.length) pots[0].amount += extra; else if (extra) pots.push({amount: extra, eligible: alive});
  return pots.filter(p => p.amount > 0);
}

function finish(t, now, ev) {
  const alive = t.seats.map((s, i) => live(s) ? i : -1).filter(i => i >= 0);
  const won = new Map(), reveal = {}, hands = {};
  if (alive.length === 1) {
    won.set(alive[0], potTotal(t));
  } else {
    for (const i of alive) { hands[i] = best([...t.seats[i].cards, ...t.board]); reveal[i] = t.seats[i].cards.map(label); }
    for (const pot of splitPots(t.seats, t.dead || 0)) {
      const top = Math.max(...pot.eligible.map(i => hands[i].score));
      const winners = pot.eligible.filter(i => hands[i].score === top);
      const share = Math.floor(pot.amount / winners.length);
      let odd = pot.amount - share * winners.length;
      // 나머지 칩은 버튼 왼쪽부터
      const ordered = [...winners].sort((a, b) => ((a - t.button + POKER.seats - 1) % POKER.seats) - ((b - t.button + POKER.seats - 1) % POKER.seats));
      for (const i of ordered) { won.set(i, (won.get(i) || 0) + share + (odd > 0 ? 1 : 0)); if (odd > 0) odd--; }
    }
  }
  const winners = [];
  for (const [i, amount] of won) {
    const s = t.seats[i];
    s.stack += amount;
    winners.push({seat: i, name: s.name, bot: s.bot, amount, hand: hands[i]?.name || null});
    if (!s.bot) ev.wins.push({id: s.id, key: s.key, name: s.name, seat: i, amount, contributed: s.total, hand: t.hand});
  }
  t.result = {hand: t.hand, showdown: alive.length > 1, winners, reveal, board: t.board.map(label), hands: Object.fromEntries(Object.entries(hands).map(([i, h]) => [i, h.name]))};
  for (const s of t.seats) if (s) { s.total = 0; s.bet = 0; }
  t.dead = 0;
  t.phase = 'showdown'; t.toAct = null; t.deadline = null; t.nextAt = now + POKER.showdownMs;
  for (const s of t.seats) if (s && !s.bot && s.timeouts >= POKER.maxTimeouts) s.leaving = true;
}

function merge(a, b) { a.cashOuts.push(...b.cashOuts); a.wins.push(...b.wins); return a; }

// 행동 적용(검증 포함). type: fold·check·call·raise(amount=이번 거리 총액)
function apply(t, i, move) {
  const s = t.seats[i], toCall = t.currentBet - s.bet;
  let type = move?.type;
  if (type === 'call' && toCall <= 0) type = 'check';
  if (type === 'fold') { s.folded = true; s.last = {type: 'fold'}; }
  else if (type === 'check') { if (toCall > 0) fail('체크할 수 없어요. 콜이나 폴드를 골라주세요.'); s.last = {type: 'check'}; }
  else if (type === 'call') { pay(s, toCall); s.last = {type: s.allIn ? 'allin' : 'call', amount: s.bet}; }
  else if (type === 'raise') {
    const to = Number(move.amount), cap = s.bet + s.stack;
    if (!Number.isSafeInteger(to)) fail('레이즈 금액을 확인해주세요.');
    if (!s.mayRaise || !t.seats.some((x, k) => k !== i && canAct(x))) fail('지금은 레이즈할 수 없어요.');
    const target = Math.min(to, cap);
    if (target <= t.currentBet) fail('지금 베팅보다 크게 올려주세요.');
    if (target < cap && target < t.currentBet + t.minRaise) fail(`최소 ${(t.currentBet + t.minRaise).toLocaleString('ko-KR')}까지 올려야 해요.`);
    const raise = target - t.currentBet, full = raise >= t.minRaise;
    pay(s, target - s.bet);
    for (const [k, x] of t.seats.entries()) {
      if (k === i || !canAct(x)) continue;
      if (full) { x.acted = false; x.mayRaise = true; } else if (x.bet < target) x.acted = false;
    }
    if (full) t.minRaise = raise;
    t.currentBet = target;
    s.last = {type: s.allIn ? 'allin' : t.board.length || t.currentBet > POKER.bigBlind ? 'raise' : 'raise', amount: s.bet};
  } else fail('알 수 없는 행동이에요.');
  s.acted = true; s.mayRaise = false;
}

function advance(t, i, now, rng) {
  const ev = emptyEvents();
  turnFrom(t, i, now, rng, ev);
  return ev;
}

export function act(t, id, move, now, rng = random) {
  if (!active(t)) fail('지금은 판이 진행 중이 아니에요.');
  const i = seatOf(t, id);
  if (i < 0 || t.toAct !== i) fail('지금은 내 차례가 아니에요.');
  apply(t, i, move);
  t.seats[i].timeouts = 0;
  return advance(t, i, now, rng);
}

// 봇: 자기 패와 보드만 보고 승률을 어림해 팟 오즈와 비교한다(다른 사람 패·덱 순서는 보지 않는다).
export function botMove(t, i, rng = random) {
  const s = t.seats[i], toCall = t.currentBet - s.bet, pot = potTotal(t);
  const opponents = t.seats.filter((x, k) => k !== i && live(x)).length;
  const eq = equity(s.cards, t.board, opponents, POKER.botSims, rng), fair = 1 / (opponents + 1), strength = eq / fair;
  const canRaise = s.mayRaise && s.bet + s.stack > t.currentBet && t.seats.some((x, k) => k !== i && canAct(x));
  const size = frac => { const raw = t.currentBet + Math.max(t.minRaise, Math.round(pot * frac / 10) * 10); return Math.min(raw, s.bet + s.stack); };
  const r = rng();
  if (toCall <= 0) {
    if (canRaise && (strength > 1.45 || r < 0.07)) return {type: 'raise', amount: size(0.5 + rng() * 0.25)};
    return {type: 'check'};
  }
  const odds = toCall / (pot + toCall);
  if (canRaise && strength > 1.85 && r < 0.6) return {type: 'raise', amount: size(0.7 + rng() * 0.3)};
  if (eq >= odds * 1.08 || (toCall <= POKER.bigBlind && eq >= odds * 0.75)) return {type: 'call'};
  return {type: 'fold'};
}

// 시간이 된 일을 처리한다: 봇 차례, 사람 시간 초과(자동 체크/폴드), 다음 판 시작.
export function tick(t, now, rng = random) {
  const ev = emptyEvents();
  for (let guard = 0; guard < 64; guard++) {
    if (active(t) && t.deadline != null && now >= t.deadline) {
      const i = t.toAct, s = t.seats[i];
      if (s.bot) {
        // 봇 판단이 규칙에 맞지 않으면(예: 칩이 모자란 레이즈) 콜·체크로 대신한다. 알람이 멈추면 안 된다
        try { apply(t, i, botMove(t, i, rng)); } catch (e) { if (!e.poker) throw e; apply(t, i, {type: 'call'}); }
      }
      else {
        apply(t, i, {type: t.currentBet - s.bet > 0 ? 'fold' : 'check'});
        s.timeouts++; s.last = {...s.last, timeout: true};
      }
      merge(ev, advance(t, i, now, rng));
    } else if (!active(t) && t.nextAt != null && now >= t.nextAt) {
      startHand(t, now, rng, ev);
    } else break;
  }
  return ev;
}

export const nextDue = t => active(t) ? t.deadline : t.nextAt;

// 한 사람에게 보낼 화면 상태. 남의 홀카드는 쇼다운에서 공개된 것만.
export function view(t, viewerId, now) {
  const me = viewerId ? seatOf(t, viewerId) : -1;
  const shown = t.phase === 'showdown' ? t.result?.reveal || {} : {};
  const seats = t.seats.map((s, i) => s && {
    seat: i, name: s.name, bot: s.bot, me: i === me, stack: s.stack, bet: s.bet, folded: s.folded, allIn: s.allIn, inHand: s.inHand, away: s.away, last: s.last,
    cards: i === me && s.cards.length ? s.cards.map(label) : shown[i] || null,
    hidden: i !== me && !shown[i] && live(s) ? 2 : 0,
  });
  let options = null;
  if (active(t) && me >= 0 && t.toAct === me) {
    const s = t.seats[me], toCall = Math.max(0, t.currentBet - s.bet), cap = s.bet + s.stack;
    const canRaise = s.mayRaise && cap > t.currentBet && t.seats.some((x, k) => k !== me && canAct(x));
    options = {toCall: Math.min(toCall, s.stack), canCheck: toCall === 0, canRaise, minTo: Math.min(cap, t.currentBet + t.minRaise), maxTo: cap, pot: potTotal(t)};
  }
  const mine = me >= 0 ? t.seats[me] : null;
  return {
    hand: t.hand, phase: t.phase, button: t.button, sb: t.sb ?? null, bb: t.bb ?? null,
    board: t.board.map(label), pot: potTotal(t), currentBet: t.currentBet,
    toAct: t.toAct, remainMs: t.deadline != null ? Math.max(0, t.deadline - now) : null, nextMs: !active(t) && t.nextAt != null ? Math.max(0, t.nextAt - now) : null,
    seats, you: me >= 0 ? me : null, options,
    myHand: mine && mine.cards.length && t.board.length >= 3 && !mine.folded ? best([...mine.cards, ...t.board]).name : null,
    result: t.phase === 'showdown' ? t.result : null,
    limits: {smallBlind: POKER.smallBlind, bigBlind: POKER.bigBlind, minBuyIn: POKER.minBuyIn, maxBuyIn: POKER.maxBuyIn, defaultBuyIn: POKER.defaultBuyIn, actionMs: POKER.actionMs},
  };
}
