// 쪼꼬미랜드 · 같이 하는 게임 엔진: 🚀 크래시와 🔫 총쏘기 서바이벌.
// 포커(land-poker.js)와 같은 모양: 상태(c)·시각(now)·난수(rng)를 받아 상태를 바꾸고 정산할 일(ev)을 돌려준다.
// 지갑·소켓·저장·알람은 LandRoom이 맡는다. 터지는 배율·총알 위치는 서버 상태에만 있고, view()는 이미 일어난 일만 담는다.
import {random, integer} from './land-games.js';
export const SAFE_STAKE = Math.floor(Number.MAX_SAFE_INTEGER / 1000);

// 조정할 수치는 이 표만 고친다.
export const CRASH = Object.freeze({
  edge: 0.96,          // P(터지는 배율 ≥ x) = edge / x → 어느 배율에서 멈춰도 기대 환수율 96%
  maxMult: 100,
  doubleMs: 6000,      // 배율이 2배가 되는 시간(지수 성장). ×10 ≈ 20초, ×100 ≈ 40초
  minCash: 1.01,       // 이 배율부터 멈출 수 있다
  bettingMs: 8000,     // 첫 베팅 뒤 출발까지
  nextBettingMs: 10000,// 터진 뒤 결과를 보여 주며 다음 판 베팅을 받는 시간
  minBet: 10, maxBet: SAFE_STAKE,  // 상한 없음: 가진 초코까지(지갑이 막는다). 배당 계산이 안전 정수를 넘지 않게만 둔다
  maxPlayers: 30,
  history: 12,
});
export const PARTY = Object.freeze({
  fee: 0.04,           // 판돈에서 떼는 몫. 최후의 1인이 나머지를 모두 가진다 → 기대 환수율 96%
  chambers: 6,
  minPlayers: 2, maxPlayers: 6,
  minStake: 10, maxStake: SAFE_STAKE,
  lobbyMs: 20000,      // 두 번째 사람이 들어온 뒤 출발까지(가득 차면 fullStartMs)
  fullStartMs: 3000,
  aloneMs: 120000,     // 혼자 기다리다 이만큼 지나면 판을 닫고 돌려준다
  introMs: 1500,       // 출발 뒤 첫 방아쇠까지
  pullMs: 1400,        // 방아쇠 간격
  bangPauseMs: 2200,   // 탕 소리 뒤 다음 라운드까지
  doneMs: 8000,        // 결과를 보여 주는 시간
});

const fail = msg => { throw Object.assign(Error(msg), {arcade: true}); };
const pay = (bet, mult) => Math.floor(bet * Math.round(mult * 100) / 100);
const K = Math.LN2 / CRASH.doubleMs;
const empty = () => ({cashOuts: [], wins: []});

// ── 🚀 크래시 ─────────────────────────────────────────
// 출발 뒤 ms가 지났을 때 배율(0.01 단위 버림)
export const multAt = ms => ms <= 0 ? 1 : Math.min(CRASH.maxMult, Math.floor(Math.exp(K * ms) * 100 + 1e-9) / 100);
// 배율이 처음 x 이상이 되는 시각(출발 기준 ms)
export const msFor = x => x <= 1 ? 0 : Math.ceil(Math.log(x) / K);
export function crashPoint(rng = random) {
  const u = 1 - rng();   // (0, 1]
  return Math.max(1, Math.min(CRASH.maxMult, Math.floor(CRASH.edge / u * 100) / 100));
}
export const newCrash = () => ({phase: 'idle', round: 0, bets: [], history: [], last: null});

export function checkCrashBet(c, who, bet, auto) {
  if (!['idle', 'betting'].includes(c.phase)) fail('이번 판은 이미 출발했어요. 다음 판에 걸어주세요.');
  if (!Number.isSafeInteger(bet) || bet < CRASH.minBet || bet > CRASH.maxBet) fail('베팅은 ' + CRASH.minBet + '초코 이상의 정수로 입력해주세요.');
  if (auto != null && (!Number.isFinite(auto) || auto < CRASH.minCash || auto > CRASH.maxMult)) fail('자동 멈춤은 ×' + CRASH.minCash + '~×' + CRASH.maxMult + ' 사이로 정해주세요.');
  if (c.bets.some(b => b.id === who.id)) fail('이번 판에는 이미 걸었어요.');
  if (c.bets.length >= CRASH.maxPlayers) fail('이번 판은 자리가 가득 찼어요.');
}
// 지갑에서 베팅을 뺀 뒤에 부른다
export function placeCrashBet(c, who, bet, auto, now) {
  checkCrashBet(c, who, bet, auto);
  if (c.phase === 'idle') { c.phase = 'betting'; c.round++; c.bettingEnd = now + CRASH.bettingMs; c.last = null; }
  c.bets.push({id: who.id, key: who.key, name: who.name, bet, auto: auto == null ? null : Math.floor(auto * 100) / 100, cashed: null, payout: 0});
}
function settle(c, b, mult, ev) {
  b.cashed = mult; b.payout = pay(b.bet, mult);
  ev.cashOuts.push({key: b.key, id: b.id, name: b.name, amount: b.payout, game: 'crash'});
  ev.wins.push({name: b.name, game: 'crash', bet: b.bet, payout: b.payout, noticeId: 'crash:' + c.round + ':' + b.id});
}
export function crashCash(c, id, now) {
  const ev = empty();
  if (c.phase !== 'running') fail('지금은 멈출 판이 없어요.');
  const b = c.bets.find(x => x.id === id);
  if (!b) fail('이번 판에 걸지 않았어요.');
  if (b.cashed) fail('이미 멈췄어요.');
  if (now >= c.crashAt) fail('앗, 이미 터졌어요!');
  let m = multAt(now - c.startAt);
  if (m < CRASH.minCash) fail('×' + CRASH.minCash + '부터 멈출 수 있어요.');
  if (b.auto && b.auto <= m) m = b.auto;   // 알람이 늦었어도 자동 멈춤 배율로 정산
  settle(c, b, m, ev);
  return ev;
}
export function crashTick(c, now, rng = random) {
  const ev = empty();
  if (c.phase === 'betting' && now >= c.bettingEnd) {
    if (!c.bets.length) { c.phase = 'idle'; return ev; }
    c.phase = 'running'; c.point = crashPoint(rng); c.startAt = now;
    // 배율이 point를 넘어서는 순간 터진다. 그 전까지(m ≤ point) 멈추면 정산된다
    c.crashAt = now + msFor(c.point + 0.01);
  }
  if (c.phase !== 'running') return ev;
  for (const b of c.bets) if (!b.cashed && b.auto && b.auto <= c.point && c.startAt + msFor(b.auto) <= now) settle(c, b, b.auto, ev);
  if (now >= c.crashAt) {
    c.history = [c.point, ...c.history].slice(0, CRASH.history);
    c.last = {round: c.round, point: c.point, bets: c.bets.map(publicBet)};
    c.phase = 'betting'; c.round++; c.bets = []; c.bettingEnd = now + CRASH.nextBettingMs;
    delete c.point; delete c.startAt; delete c.crashAt;
  }
  return ev;
}
export function crashDue(c) {
  if (c.phase === 'betting') return c.bettingEnd;
  if (c.phase !== 'running') return null;
  let due = c.crashAt;
  for (const b of c.bets) if (!b.cashed && b.auto && b.auto <= c.point) due = Math.min(due, c.startAt + msFor(b.auto));
  return due;
}
const publicBet = b => ({name: b.name, bet: b.bet, cashed: b.cashed, payout: b.payout});
export function crashView(c, id, now) {
  const mine = c.bets.find(b => b.id === id);
  return {
    phase: c.phase, round: c.round, doubleMs: CRASH.doubleMs, maxMult: CRASH.maxMult, minCash: CRASH.minCash,
    remaining: c.phase === 'betting' ? Math.max(0, c.bettingEnd - now) : null,
    elapsed: c.phase === 'running' ? Math.max(0, now - c.startAt) : null,
    bets: c.bets.map(b => ({...publicBet(b), me: b.id === id})),
    mine: mine ? {bet: mine.bet, auto: mine.auto, cashed: mine.cashed, payout: mine.payout} : null,
    history: c.history, last: c.last,
  };
}
// 사람이 나가도 걸어 둔 판은 그대로 간다(자동 멈춤만 정산). 방이 판을 버릴 일은 없다

// ── 🔫 총쏘기 서바이벌 ────────────────────────────────
// 라운드마다 실린더를 새로 돌리고 시작하는 사람도 무작위 → 누가 맞을지는 살아 있는 사람 모두 같은 확률
export const newParty = () => ({phase: 'idle', game: 0, players: [], events: [], last: null});

export function checkPartyJoin(p, who, stake) {
  if (!['idle', 'lobby'].includes(p.phase)) fail('지금 판이 진행 중이에요. 끝나면 새 판에 들어와주세요.');
  if (p.players.some(x => x.id === who.id)) fail('이미 참가했어요.');
  if (p.players.length >= PARTY.maxPlayers) fail('자리가 가득 찼어요.');
  const amount = p.phase === 'lobby' ? p.stake : stake;
  if (!Number.isSafeInteger(amount) || amount < PARTY.minStake || amount > PARTY.maxStake) fail('참가비는 ' + PARTY.minStake + '초코 이상의 정수로 정해주세요.');
  return amount;
}
// 지갑에서 참가비를 뺀 뒤에 부른다
export function partyJoin(p, who, stake, now) {
  const amount = checkPartyJoin(p, who, stake);
  if (p.phase === 'idle') { p.phase = 'lobby'; p.game++; p.stake = amount; p.players = []; p.events = []; p.last = null; p.lobbyExpires = now + PARTY.aloneMs; p.startDue = null; }
  p.players.push({id: who.id, key: who.key, name: who.name});
  if (p.players.length === PARTY.minPlayers) p.startDue = now + PARTY.lobbyMs;
  if (p.players.length >= PARTY.maxPlayers) p.startDue = Math.min(p.startDue, now + PARTY.fullStartMs);
  return amount;
}
export function partyLeave(p, id) {
  const ev = empty();
  if (p.phase !== 'lobby') fail('출발한 판에서는 나갈 수 없어요.');
  const i = p.players.findIndex(x => x.id === id);
  if (i < 0) fail('참가하지 않았어요.');
  const [gone] = p.players.splice(i, 1);
  ev.cashOuts.push({key: gone.key, id: gone.id, name: gone.name, amount: p.stake, game: 'party', reason: 'refund'});
  if (!p.players.length) p.phase = 'idle';
  else if (p.players.length < PARTY.minPlayers) p.startDue = null;
  return ev;
}
// 출발: 모든 방아쇠 순서와 시각을 미리 정해 서버에만 둔다. view는 지난 사건만 보여 준다
export function partyScript(n, start, rng = random) {
  const alive = Array.from({length: n}, (_, i) => i), events = [];
  let t = start + PARTY.introMs;
  while (alive.length > 1) {
    const bullet = integer(PARTY.chambers, rng), first = integer(alive.length, rng);
    for (let k = 0; k <= bullet; k++) {
      const seat = alive[(first + k) % alive.length], bang = k === bullet;
      events.push({at: t, seat, bang});
      t += bang ? PARTY.bangPauseMs : PARTY.pullMs;
      if (bang) alive.splice(alive.indexOf(seat), 1);
    }
  }
  return {events, winner: alive[0], endAt: t};
}
export function partyTick(p, now, rng = random) {
  const ev = empty();
  if (p.phase === 'lobby') {
    if (p.players.length < PARTY.minPlayers && now >= p.lobbyExpires) {
      for (const x of p.players) ev.cashOuts.push({key: x.key, id: x.id, name: x.name, amount: p.stake, game: 'party', reason: 'refund'});
      p.players = []; p.phase = 'idle';
    } else if (p.players.length >= PARTY.minPlayers && now >= p.startDue) {
      const s = partyScript(p.players.length, now, rng);
      Object.assign(p, {phase: 'playing', startAt: now, events: s.events, winner: s.winner, endAt: s.endAt});
    }
    return ev;
  }
  if (p.phase === 'playing' && now >= p.endAt) {
    const w = p.players[p.winner], pot = p.stake * p.players.length, prize = partyPrize(pot);
    ev.cashOuts.push({key: w.key, id: w.id, name: w.name, amount: prize, game: 'party'});
    ev.wins.push({name: w.name, game: 'party', bet: p.stake, payout: prize, noticeId: 'party:' + p.game});
    p.last = {game: p.game, winner: w.name, prize, players: p.players.length};
    p.phase = 'done'; p.doneUntil = now + PARTY.doneMs;
    return ev;
  }
  if (p.phase === 'done' && now >= p.doneUntil) { p.phase = 'idle'; p.players = []; p.events = []; }
  return ev;
}
export const partyPrize = pot => Math.floor(pot * (1 - PARTY.fee));
export function partyDue(p, now = 0) {
  if (p.phase === 'lobby') return p.players.length >= PARTY.minPlayers ? p.startDue : p.lobbyExpires;
  if (p.phase === 'playing') { const next = p.events.find(e => e.at > now); return next ? next.at : p.endAt; }
  if (p.phase === 'done') return p.doneUntil;
  return null;
}
export function partyView(p, id, now) {
  const shown = p.phase === 'playing' || p.phase === 'done' ? p.events.filter(e => p.phase === 'done' || e.at <= now) : [];
  const dead = new Set(shown.filter(e => e.bang).map(e => e.seat));
  return {
    phase: p.phase, game: p.game, stake: p.stake || null, fee: PARTY.fee, chambers: PARTY.chambers, maxPlayers: PARTY.maxPlayers,
    pot: (p.stake || 0) * p.players.length, prize: partyPrize((p.stake || 0) * p.players.length),
    players: p.players.map((x, i) => ({name: x.name, me: x.id === id, dead: dead.has(i), winner: p.phase === 'done' && p.winner === i})),
    joined: p.players.some(x => x.id === id),
    startIn: p.phase === 'lobby' && p.startDue ? Math.max(0, p.startDue - now) : null,
    closesIn: p.phase === 'lobby' && !p.startDue ? Math.max(0, p.lobbyExpires - now) : null,
    events: shown.map(e => ({seat: e.seat, bang: e.bang, ago: now - e.at})),
    shots: shown.length,
    last: p.last,
  };
}

// ── 🤠 총잡이 결투(쪼꼬미봇 GunDuel과 같은 규칙) ─────────
// 두 명이 같은 판돈을 걸면 서버가 무작위로 기다렸다가 '발사!'를 알린다. 서버에 먼저 도착한 사격이 이긴다.
// 신호 전에 쏘면 반칙패. 신호 시각은 서버 상태에만 있고 view()에는 신호가 난 뒤에야 fire가 켜진다.
export const DUEL = Object.freeze({
  fee: 0.03, waitMs: Object.freeze([2500, 7000]), introMs: 1500,
  minStake: 10, maxStake: SAFE_STAKE,
  aloneMs: 120000,     // 상대를 기다리다 이만큼 지나면 돌려준다
  shootMs: 5000,       // 신호 뒤 둘 다 안 쏘면 환불
  doneMs: 6000,
});
export const duelPrize = stake => Math.floor(stake * 2 * (1 - DUEL.fee));
export const newDuel = () => ({phase: 'idle', game: 0, players: [], last: null});
// target: 지정한 사람 이름(선택). 비우면 누구든 받을 수 있는 공개 대기.
export const duelTarget = raw => { const t = String(raw ?? '').trim(); if (t.length > 12) fail('상대 이름은 12자 이하예요.'); return t; };
export function checkDuelJoin(d, who, stake, target = '') {
  if (!['idle', 'lobby'].includes(d.phase)) fail('지금 결투가 진행 중이에요. 끝나면 도전해주세요.');
  if (d.players.some(x => x.id === who.id)) fail('이미 결투를 신청했어요.');
  const me = String(who.name).toLowerCase();
  if (d.phase === 'idle' && duelTarget(target).toLowerCase() === me && duelTarget(target)) fail('나에게는 결투를 신청할 수 없어요.');
  if (d.phase === 'lobby' && d.target && d.target !== me) fail(d.targetName + '님에게 신청한 결투예요.');
  const amount = d.phase === 'lobby' ? d.stake : stake;
  if (!Number.isSafeInteger(amount) || amount < DUEL.minStake || amount > DUEL.maxStake) fail('판돈은 ' + DUEL.minStake + '초코 이상의 정수로 정해주세요.');
  return amount;
}
// 지갑에서 판돈을 뺀 뒤에 부른다
export function duelJoin(d, who, stake, now, rng = random, target = '') {
  const amount = checkDuelJoin(d, who, stake, target);
  if (d.phase === 'idle') { const t = duelTarget(target); Object.assign(d, {phase: 'lobby', game: d.game + 1, stake: amount, players: [], last: null, lobbyExpires: now + DUEL.aloneMs, target: t.toLowerCase(), targetName: t}); }
  d.players.push({id: who.id, key: who.key, name: who.name});
  if (d.players.length === 2) {
    const [lo, hi] = DUEL.waitMs;
    Object.assign(d, {phase: 'ready', readyAt: now, signalAt: now + DUEL.introMs + lo + Math.floor(rng() * (hi - lo))});
  }
  return amount;
}
export function duelLeave(d, id) {
  const ev = empty();
  if (d.phase !== 'lobby') fail('시작한 결투에서는 물러날 수 없어요.');
  const me = d.players.find(x => x.id === id);
  if (!me) fail('결투를 신청하지 않았어요.');
  ev.cashOuts.push({key: me.key, id: me.id, name: me.name, amount: d.stake, game: 'duel', reason: 'refund'});
  d.players = []; d.phase = 'idle';
  return ev;
}
function duelEnd(d, winnerIndex, how, now, ev) {
  const w = d.players[winnerIndex], loser = d.players[1 - winnerIndex], prize = duelPrize(d.stake);
  ev.cashOuts.push({key: w.key, id: w.id, name: w.name, amount: prize, game: 'duel'});
  ev.wins.push({name: w.name, game: 'duel', bet: d.stake, payout: prize, noticeId: 'duel:' + d.game});
  d.last = {game: d.game, winner: w.name, loser: loser.name, how, prize, reaction: how === 'shot' ? now - d.signalAt : null};
  d.phase = 'done'; d.doneUntil = now + DUEL.doneMs;
}
export function duelShoot(d, id, now) {
  const ev = empty();
  if (!['ready', 'fire'].includes(d.phase)) fail('지금은 쏠 때가 아니에요.');
  const i = d.players.findIndex(x => x.id === id);
  if (i < 0) fail('결투하는 두 사람만 쏠 수 있어요.');
  if (now < d.signalAt) duelEnd(d, 1 - i, 'foul', now, ev);   // 신호 전에 쏨 → 반칙패
  else duelEnd(d, i, 'shot', now, ev);
  return ev;
}
export function duelTick(d, now) {
  const ev = empty();
  if (d.phase === 'lobby' && now >= d.lobbyExpires) {
    for (const x of d.players) ev.cashOuts.push({key: x.key, id: x.id, name: x.name, amount: d.stake, game: 'duel', reason: 'refund'});
    d.players = []; d.phase = 'idle';
  } else if (d.phase === 'ready' && now >= d.signalAt) d.phase = 'fire';
  else if (d.phase === 'fire' && now >= d.signalAt + DUEL.shootMs) {
    for (const x of d.players) ev.cashOuts.push({key: x.key, id: x.id, name: x.name, amount: d.stake, game: 'duel', reason: 'refund'});
    d.last = {game: d.game, winner: null, how: 'timeout', prize: 0};
    d.phase = 'done'; d.doneUntil = now + DUEL.doneMs;
  }
  if (d.phase === 'done' && now >= d.doneUntil) { d.phase = 'idle'; d.players = []; }
  return ev;
}
export function duelDue(d) {
  if (d.phase === 'lobby') return d.lobbyExpires;
  if (d.phase === 'ready') return d.signalAt;
  if (d.phase === 'fire') return d.signalAt + DUEL.shootMs;
  if (d.phase === 'done') return d.doneUntil;
  return null;
}
export function duelView(d, id, now) {
  return {
    phase: d.phase, game: d.game, stake: d.stake || null, fee: DUEL.fee, prize: duelPrize(d.stake || 0),
    target: d.phase === 'lobby' && d.target ? d.targetName : null,
    players: d.players.map(x => ({name: x.name, me: x.id === id})), joined: d.players.some(x => x.id === id),
    fire: d.phase === 'fire',
    closesIn: d.phase === 'lobby' ? Math.max(0, d.lobbyExpires - now) : null,
    last: d.last,
  };
}

// ── ✊ 가위바위보 대결(사람 대 사람) ─────────────────
// 결투와 같은 모양: 판돈을 걸고(상대 지정 또는 공개 대기) 두 사람이 모이면 '고르기' 시간이 열린다.
// 고른 손은 서버 상태에만 있고, view()는 두 사람이 다 고르거나 시간이 끝난 뒤에야 밝힌다.
// 비기면 판돈을 돌려주고, 한 사람만 골랐으면 고른 사람이 이긴다(안 고른 사람은 기권).
export const RPSD = Object.freeze({
  fee: 0.03, minStake: 10, maxStake: SAFE_STAKE,
  aloneMs: 120000, pickMs: 10000, doneMs: 6000,
});
export const RPS_HANDS = Object.freeze(['rock', 'paper', 'scissors']);
const RPS_BEATS = Object.freeze({rock: 'scissors', paper: 'rock', scissors: 'paper'});
export const rpsdPrize = stake => Math.floor(stake * 2 * (1 - RPSD.fee));
export const newRpsd = () => ({phase: 'idle', game: 0, players: [], last: null});
export function checkRpsdJoin(d, who, stake, target = '') {
  if (!['idle', 'lobby'].includes(d.phase)) fail('지금 가위바위보 대결이 진행 중이에요. 끝나면 도전해주세요.');
  if (d.players.some(x => x.id === who.id)) fail('이미 대결을 신청했어요.');
  const me = String(who.name).toLowerCase(), t = duelTarget(target);
  if (d.phase === 'idle' && t && t.toLowerCase() === me) fail('나에게는 대결을 신청할 수 없어요.');
  if (d.phase === 'lobby' && d.target && d.target !== me) fail(d.targetName + '님에게 신청한 대결이에요.');
  const amount = d.phase === 'lobby' ? d.stake : stake;
  if (!Number.isSafeInteger(amount) || amount < RPSD.minStake || amount > RPSD.maxStake) fail('판돈은 ' + RPSD.minStake + '초코 이상의 정수로 정해주세요.');
  return amount;
}
// 지갑에서 판돈을 뺀 뒤에 부른다
export function rpsdJoin(d, who, stake, now, target = '') {
  const amount = checkRpsdJoin(d, who, stake, target);
  if (d.phase === 'idle') { const t = duelTarget(target); Object.assign(d, {phase: 'lobby', game: d.game + 1, stake: amount, players: [], last: null, lobbyExpires: now + RPSD.aloneMs, target: t.toLowerCase(), targetName: t}); }
  d.players.push({id: who.id, key: who.key, name: who.name, pick: null});
  if (d.players.length === 2) Object.assign(d, {phase: 'pick', pickUntil: now + RPSD.pickMs});
  return amount;
}
export function rpsdLeave(d, id) {
  const ev = empty();
  if (d.phase !== 'lobby') fail('시작한 대결에서는 물러날 수 없어요.');
  const me = d.players.find(x => x.id === id);
  if (!me) fail('대결을 신청하지 않았어요.');
  ev.cashOuts.push({key: me.key, id: me.id, name: me.name, amount: d.stake, game: 'rpsduel', reason: 'refund'});
  d.players = []; d.phase = 'idle';
  return ev;
}
function rpsdFinish(d, winnerIndex, how, now, ev) {
  const [a, b] = d.players;
  if (winnerIndex < 0) {
    for (const x of d.players) ev.cashOuts.push({key: x.key, id: x.id, name: x.name, amount: d.stake, game: 'rpsduel', reason: 'refund'});
    d.last = {game: d.game, winner: null, how, prize: 0, picks: [a.pick, b.pick], names: [a.name, b.name]};
  } else {
    const w = d.players[winnerIndex], prize = rpsdPrize(d.stake);
    ev.cashOuts.push({key: w.key, id: w.id, name: w.name, amount: prize, game: 'rpsduel'});
    ev.wins.push({name: w.name, game: 'rpsduel', bet: d.stake, payout: prize, noticeId: 'rpsduel:' + d.game});
    d.last = {game: d.game, winner: w.name, loser: d.players[1 - winnerIndex].name, how, prize, picks: [a.pick, b.pick], names: [a.name, b.name]};
  }
  d.phase = 'done'; d.doneUntil = now + RPSD.doneMs;
}
function rpsdResolve(d, now, ev) {
  const [a, b] = d.players;
  if (a.pick && b.pick) {
    if (a.pick === b.pick) rpsdFinish(d, -1, 'tie', now, ev);
    else rpsdFinish(d, RPS_BEATS[a.pick] === b.pick ? 0 : 1, 'hands', now, ev);
  } else if (a.pick || b.pick) rpsdFinish(d, a.pick ? 0 : 1, 'forfeit', now, ev);
  else rpsdFinish(d, -1, 'timeout', now, ev);
}
export function rpsdPick(d, id, hand, now) {
  const ev = empty();
  if (d.phase !== 'pick') fail('지금은 고를 때가 아니에요.');
  const me = d.players.find(x => x.id === id);
  if (!me) fail('대결하는 두 사람만 고를 수 있어요.');
  if (!RPS_HANDS.includes(hand)) fail('가위·바위·보 중에서 골라주세요.');
  if (me.pick) fail('이미 골랐어요.');
  me.pick = hand;
  if (d.players.every(x => x.pick)) rpsdResolve(d, now, ev);
  return ev;
}
export function rpsdTick(d, now) {
  const ev = empty();
  if (d.phase === 'lobby' && now >= d.lobbyExpires) {
    for (const x of d.players) ev.cashOuts.push({key: x.key, id: x.id, name: x.name, amount: d.stake, game: 'rpsduel', reason: 'refund'});
    d.players = []; d.phase = 'idle';
  } else if (d.phase === 'pick' && now >= d.pickUntil) rpsdResolve(d, now, ev);
  if (d.phase === 'done' && now >= d.doneUntil) { d.phase = 'idle'; d.players = []; }
  return ev;
}
export function rpsdDue(d) {
  if (d.phase === 'lobby') return d.lobbyExpires;
  if (d.phase === 'pick') return d.pickUntil;
  if (d.phase === 'done') return d.doneUntil;
  return null;
}
export function rpsdView(d, id, now) {
  return {
    phase: d.phase, game: d.game, stake: d.stake || null, fee: RPSD.fee, prize: rpsdPrize(d.stake || 0),
    target: d.phase === 'lobby' && d.target ? d.targetName : null,
    players: d.players.map(x => ({name: x.name, me: x.id === id, picked: !!x.pick})), joined: d.players.some(x => x.id === id),
    myPick: d.players.find(x => x.id === id)?.pick || null,   // 내 손만 보인다. 상대 손은 결과가 나온 뒤 last에만 있다
    closesIn: d.phase === 'lobby' ? Math.max(0, d.lobbyExpires - now) : d.phase === 'pick' ? Math.max(0, d.pickUntil - now) : null,
    last: d.last,
  };
}
