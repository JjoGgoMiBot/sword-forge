import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {POKER, best, parse, score5, splitPots, newTable, sit, act, tick, view, standUp, setAway, nextDue, botMove} from '../server/src/land-poker.js';
import {LandRoom} from '../server/src/land.js';
import {LandPlayer} from '../server/src/land-player.js';

const hand = s => s.split(' ').map(parse);
// 같은 시드면 같은 결과(재현 가능한 난수)
const seeded = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const chips = t => t.seats.reduce((a, s) => a + (s ? s.stack + s.total : 0), 0) + (t.dead || 0);

test('족보 순서: 스트레이트 플러시 > 포카드 > … > 하이카드, 휠·키커 비교', () => {
  const order = ['9h Th Jh Qh Kh', '7s 7h 7d 7c 2s', '7s 7h 7d 2c 2s', '2h 7h 9h Jh Kh', '5s 6h 7d 8c 9s', '7s 7h 7d Kc 2s', '7s 7h Kd Kc 2s', '7s 7h Kd Qc 2s', '2s 7h 9d Jc Ks'];
  const scores = order.map(x => score5(hand(x)));
  for (let i = 1; i < scores.length; i++) assert.ok(scores[i - 1] > scores[i], order[i - 1] + ' > ' + order[i]);
  assert.ok(score5(hand('As 2h 3d 4c 5s')) < score5(hand('2s 3h 4d 5c 6s')), '휠(A-5)은 가장 낮은 스트레이트');
  assert.ok(score5(hand('As Ah Kd 9c 2s')) > score5(hand('As Ah Qd Jc Ts')), '같은 원페어는 키커로');
  assert.equal(best(hand('As Ks Qs Js Ts 2h 3d')).name, '스트레이트 플러시');
  assert.equal(best(hand('2h 2d 2c 9s 9h 9d Ah')).name, '풀하우스');
});

test('사이드팟: 낸 만큼만 가져가고 폴드한 사람 칩은 팟에 남는다', () => {
  const s = (total, extra = {}) => ({total, inHand: true, folded: false, ...extra});
  const pots = splitPots([s(100), s(300), s(500), s(500, {folded: true}), null, null]);
  assert.deepEqual(pots.map(p => p.amount), [400, 600, 400]);
  assert.deepEqual(pots.map(p => p.eligible), [[0, 1, 2], [1, 2], [2]]);
  assert.equal(pots.reduce((a, p) => a + p.amount, 0), 1400);
});

function table(players = 2, rng = seeded(7)) {
  const t = newTable();
  for (let i = 0; i < players; i++) sit(t, i, {id: 'u' + i, key: 'k' + i, name: '사람' + i}, 1000, 0);
  tick(t, t.nextAt, rng);
  return t;
}

test('사람이 앉으면 봇이 빈자리를 채우고, 다른 사람 패는 보이지 않는다', () => {
  const t = table(1);
  assert.equal(t.phase, 'preflop');
  assert.equal(t.seats.filter(Boolean).length, POKER.botTarget);
  assert.equal(t.seats.filter(s => s?.bot).length, POKER.botTarget - 1);
  const v = view(t, 'u0', 0), json = JSON.stringify(v);
  assert.equal(v.seats[0].cards.length, 2, '내 패는 보인다');
  for (const s of v.seats.filter(x => x && !x.me)) { assert.equal(s.cards, null); assert.equal(s.hidden, 2); }
  assert.ok(!('deck' in v) && !json.includes('"key"'), '덱·지갑 키는 보내지 않는다');
  const watcher = view(t, 'nobody', 0);
  assert.ok(watcher.seats.every(s => !s || s.cards === null), '구경꾼은 아무 패도 못 본다');
  for (const s of t.seats.filter(Boolean)) for (const c of s.cards) assert.ok(!JSON.stringify(watcher).includes('"' + 'x' + c + '"'));
});

test('봇은 자기 패와 보드만 보고 판단한다(남의 패를 바꿔도 같은 선택)', () => {
  const t = table(1), i = t.toAct;
  const before = botMove(t, i, seeded(3));
  for (const [k, s] of t.seats.entries()) if (s && k !== i) s.cards = hand('As Ah');
  t.deck = [];
  assert.deepEqual(botMove(t, i, seeded(3)), before);
});

test('시간이 지나면 체크할 수 있으면 체크, 아니면 폴드. 두 번 연속이면 다음 판 전에 일어난다', () => {
  const t = newTable();
  sit(t, 0, {id: 'a', key: 'ka', name: 'A'}, 1000, 0);
  sit(t, 1, {id: 'b', key: 'kb', name: 'B'}, 1000, 0);
  tick(t, t.nextAt, seeded(1));
  // 봇이 섞여 있으므로 사람 차례가 올 때까지 진행
  const rng = seeded(2);
  let timeouts = 0, now = t.nextAt || 0, ev = {cashOuts: []};
  for (let k = 0; k < 400 && timeouts < 6; k++) {
    const due = nextDue(t); if (due == null) break;
    now = Math.max(now, due);
    const s = t.toAct != null ? t.seats[t.toAct] : null;
    const facing = s && !s.bot ? t.currentBet - s.bet : null;
    const step = tick(t, now, rng); ev.cashOuts.push(...step.cashOuts);
    if (s && !s.bot && s.last?.timeout) { timeouts++; assert.equal(s.last.type, facing > 0 ? 'fold' : 'check'); }
  }
  assert.ok(timeouts >= 2);
  assert.ok(ev.cashOuts.some(c => c.reason === 'timeout'), '연속 시간 초과는 자리에서 일어난다');
});

test('행동 검증: 내 차례가 아니면 거절, 최소 레이즈, 체크 불가 상황', () => {
  const t = table(1), me = t.seats[0];
  // 사람 차례가 될 때까지 봇을 진행
  const rng = seeded(5);
  for (let k = 0; k < 50 && t.toAct !== 0 && t.phase !== 'showdown'; k++) tick(t, nextDue(t), rng);
  if (t.toAct !== 0) return;
  assert.throws(() => act(t, 'ghost', {type: 'check'}, 0), /차례/);
  if (t.currentBet > me.bet) assert.throws(() => act(t, 'u0', {type: 'check'}, 0), /체크/);
  assert.throws(() => act(t, 'u0', {type: 'raise', amount: t.currentBet + 1}, 0), /최소/);
  act(t, 'u0', {type: 'raise', amount: t.currentBet + t.minRaise}, 0);
  assert.equal(me.last.type, 'raise');
});

test('무작위 행동·중간 퇴장으로 수백 판을 돌려도 오류 없이 칩이 정수로 유지된다', () => {
  const rng = seeded(99), t = newTable();
  let paidIn = 0, paidOut = 0, now = 0;
  const join = (i, id) => { if (!t.seats[i]) { sit(t, i, {id, key: 'k' + id, name: id}, 1000, now); paidIn += 1000; } };
  join(0, 'a'); join(3, 'b');
  for (let k = 0; k < 6000; k++) {
    const due = nextDue(t);
    if (due == null) { join(0, 'a'); join(3, 'b'); continue; }
    now = Math.max(now, due);
    // 사람은 무작위로 행동
    if (t.toAct != null && !t.seats[t.toAct].bot && rng() < 0.9) {
      const s = t.seats[t.toAct], o = view(t, s.id, now).options, r = rng();
      const move = r < 0.15 ? {type: 'fold'} : r < 0.75 || !o.canRaise ? {type: o.canCheck ? 'check' : 'call'} : {type: 'raise', amount: o.minTo + Math.floor(rng() * (o.maxTo - o.minTo + 1))};
      for (const c of act(t, s.id, move, now, rng).cashOuts) paidOut += c.amount;
    } else for (const c of tick(t, now, rng).cashOuts) paidOut += c.amount;
    if (rng() < 0.01) { const id = rng() < 0.5 ? 'a' : 'b'; for (const c of standUp(t, id, now, rng).cashOuts) paidOut += c.amount; }
  }
  assert.ok(t.hand > 300, '충분히 많은 판: ' + t.hand);
  for (const s of t.seats) if (s) { assert.ok(Number.isSafeInteger(s.stack) && s.stack >= 0); }
});

test('한 판 안에서 팟 합계는 낸 칩 합계와 같다', () => {
  const rng = seeded(11);
  for (let round = 0; round < 200; round++) {
    const t = table(2, rng), start = chips(t);
    let now = 0;
    for (let k = 0; k < 200 && t.phase !== 'showdown'; k++) {
      now = Math.max(now, nextDue(t));
      if (t.toAct != null && !t.seats[t.toAct].bot) {
        const s = t.seats[t.toAct], o = view(t, s.id, now).options;
        act(t, s.id, o.canRaise && rng() < 0.3 ? {type: 'raise', amount: o.maxTo} : {type: o.canCheck ? 'check' : 'call'}, now, rng);
      } else tick(t, now, rng);
      assert.equal(chips(t), start);
    }
    assert.equal(t.phase, 'showdown');
    assert.equal(t.seats.reduce((a, s) => a + (s ? s.stack : 0), 0), start, '쇼다운 뒤 스택 합 = 처음 칩 합');
  }
});

test('연결이 끊긴 사람 차례는 짧게만 기다린다', () => {
  const t = table(1), rng = seeded(4);
  for (let k = 0; k < 50 && t.toAct !== 0; k++) tick(t, nextDue(t), rng);
  if (t.toAct !== 0) return;
  const now = t.deadline - POKER.actionMs + 1000;
  assert.equal(setAway(t, 'u0', true, now), true);
  assert.equal(t.deadline, now + POKER.awayActionMs);
});

// ── 마을 방(LandRoom)과 지갑(LandPlayer) 연결 ──
function wallet() {
  const players = new Map();
  const make = () => { const db = new DatabaseSync(':memory:'); const sql = {exec(q, ...a) { const rows = db.prepare(q).all(...a); return {toArray: () => rows}; }}; return new LandPlayer({storage: {sql, transactionSync: fn => fn()}}, {}); };
  const env = {LAND_PLAYERS: {idFromName: k => k, get: k => { if (!players.has(k)) players.set(k, make()); return players.get(k); }}};
  return {env, players};
}
function room(env) {
  const db = new DatabaseSync(':memory:'), sockets = [], alarms = [];
  const sql = {exec(query, ...args) { const rows = db.prepare(query).all(...args); return {toArray: () => rows}; }};
  const ctx = {storage: {sql, setAlarm: async at => alarms.push(at)}, getWebSockets: () => sockets};
  const r = new LandRoom(ctx, env);
  const socket = a => { const ws = {readyState: 1, attachment: a, sent: [], deserializeAttachment() { return {...this.attachment}; }, serializeAttachment(v) { this.attachment = v; }, send(raw) { this.sent.push(JSON.parse(raw)); }, close(code) { this.code = code; this.readyState = 3; }}; sockets.push(ws); return ws; };
  return {r, db, socket, alarms};
}
const resident = id => ({id, key: 'key-' + id, name: id, room: 'public:1', avatar: {}, x: 0, y: 0});
const balance = async (env, key) => (await (await env.LAND_PLAYERS.get(key).fetch(new Request('https://p/', {method: 'POST', body: JSON.stringify({key, name: key, op: 'get'})}))).json()).wallet.balance;

test('바이인은 지갑에서 빠지고, 일어나면 남은 칩이 지갑으로 돌아온다', async () => {
  const w = wallet(), f = room(w.env), a = resident('me'), ws = f.socket(a);
  await f.r.pokerMessage(ws, a, {type: 'poker', op: 'sit', seat: 2, buyIn: 600}, Date.now());
  assert.equal(await balance(w.env, a.key), 400);
  assert.ok(ws.sent.some(m => m.type === 'wallet' && m.balance === 400), '잔액 갱신을 보낸다');
  const state = ws.sent.filter(m => m.type === 'poker').at(-1).table;
  assert.equal(state.you, 2); assert.equal(state.seats[2].stack, 600);
  assert.ok(f.alarms.length, '첫 판 알람');
  await f.r.pokerMessage(ws, ws.deserializeAttachment(), {type: 'poker', op: 'leave'}, Date.now());
  assert.equal(await balance(w.env, a.key), 1000);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM poker_payouts').get().n, 0);
  f.db.close();
});

test('잔액보다 큰 바이인은 거절되고 자리에 앉지 않는다', async () => {
  const w = wallet(), f = room(w.env), a = resident('poor'), ws = f.socket(a);
  await f.r.pokerMessage(ws, a, {type: 'poker', op: 'sit', seat: 0, buyIn: 4000}, Date.now());
  assert.match(ws.sent.find(m => m.type === 'pokerError').msg, /부족/);
  assert.equal(f.r.pokerState().seats[0], null);
  assert.equal(await balance(w.env, a.key), 1000);
});

test('지갑이 잠시 안 되면 정산을 표에 남겨 두었다가 다시 보낸다(한 번만 반영)', async () => {
  const w = wallet(), f = room(w.env), a = resident('retry'), ws = f.socket(a);
  await f.r.pokerMessage(ws, a, {type: 'poker', op: 'sit', seat: 1, buyIn: 500}, Date.now());
  const real = w.env.LAND_PLAYERS.get;
  w.env.LAND_PLAYERS.get = () => ({fetch: async () => { throw Error('down'); }});
  await f.r.pokerMessage(ws, ws.deserializeAttachment(), {type: 'poker', op: 'leave'}, Date.now());
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM poker_payouts').get().n, 1);
  w.env.LAND_PLAYERS.get = real;
  f.db.prepare('UPDATE poker_payouts SET due=0').run();
  await f.r.alarm(); await f.r.pokerPay();
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM poker_payouts').get().n, 0);
  assert.equal(await balance(w.env, a.key), 1000);
});

test('손님 요청으로는 포커 지갑 기능을 부를 수 없다', async () => {
  const w = wallet(), p = w.env.LAND_PLAYERS.get('x');
  const r = await p.fetch(new Request('https://p/', {method: 'POST', body: JSON.stringify({key: 'x', name: 'x', op: 'pokerCashOut', id: crypto.randomUUID(), issued: Date.now(), payload: {amount: 99999}})}));
  assert.equal(r.status, 404);
  assert.equal(await balance(w.env, 'x'), 1000);
});

test('다른 사람 소켓에는 내 패가 가지 않는다', async () => {
  const w = wallet(), f = room(w.env), a = resident('a'), b = resident('b');
  const wa = f.socket(a), wb = f.socket(b);
  await f.r.pokerMessage(wa, a, {type: 'poker', op: 'sit', seat: 0, buyIn: 1000}, Date.now());
  await f.r.pokerMessage(wb, b, {type: 'poker', op: 'watch'}, Date.now());
  const t = f.r.pokerState(); t.nextAt = 0; await f.r.alarm();
  assert.equal(t.phase, 'preflop');
  const mine = wa.sent.filter(m => m.type === 'poker').at(-1).table.seats[0].cards;
  const seen = wb.sent.filter(m => m.type === 'poker').at(-1).table;
  assert.equal(mine.length, 2, '내 소켓에는 내 패');
  assert.equal(seen.seats[0].cards, null, '구경꾼 소켓에는 패 없음');
  assert.equal(seen.seats[0].hidden, 2);
});
