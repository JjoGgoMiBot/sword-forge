import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {NOTICE, winNotice, joinNotice} from '../server/src/land-notice.js';
import {LandRoom, chocoRanking, saveRank, clearRankCache} from '../server/src/land.js';

function fixture() {
  const db = new DatabaseSync(':memory:'), sockets = [], alarms = [];
  const sql = {exec(query, ...args) { const rows = db.prepare(query).all(...args); return {toArray: () => rows}; }};
  const ctx = {storage: {sql, setAlarm: async at => alarms.push(at)}, getWebSockets: () => sockets};
  const room = new LandRoom(ctx, {});
  const socket = a => { const ws = {readyState: 1, attachment: a, sent: [], deserializeAttachment() { return {...this.attachment}; }, serializeAttachment(v) { this.attachment = v; }, send(raw) { this.sent.push(JSON.parse(raw)); }, close(code) { this.code = code; this.readyState = 3; }}; sockets.push(ws); return ws; };
  const notices = ws => ws.sent.filter(m => m.type === 'notice').map(m => m.notice.kind);
  return {db, room, socket, alarms, notices};
}
const resident = (id, name = id) => ({id, name, avatar: {}, x: 0, y: 0});

test('큰 당첨만 공지: 순이익 기준과 배당 기준', () => {
  assert.equal(winNotice('a', {game: 'slots', bet: 100, payout: 150}), null, '작은 당첨');
  assert.equal(winNotice('a', {game: 'slots', bet: 100, payout: 0}), null, '진 판');
  assert.equal(winNotice('a', {game: 'dice', bet: 3000, payout: 6000}).net, 3000, '순이익 2000 이상');
  const jackpot = winNotice('a', {game: 'slots', bet: 50, payout: 500});
  assert.equal(jackpot.net, 450); assert.match(jackpot.text, /슬롯.*450초코.*10배/);
  assert.equal(winNotice('a', {game: 'slots', bet: 10, payout: 200}), null, '10배라도 순이익이 작으면 조용히');
  assert.equal(winNotice('a', {game: 'slots', bet: 1.5, payout: 9000}), null, '정수가 아니면 무시');
});

test('공지 이름에서 멘션·태그 문자를 지운다', () => {
  assert.equal(joinNotice('@everyone<b>').name, 'everyoneb');
  assert.equal(joinNotice('').name, '주민');
});

test('같은 당첨 공지는 한 번만 방송', () => {
  const f = fixture(), ws = f.socket(resident('u1'));
  const n = winNotice('행운', {game: 'slots', bet: 100, payout: 2500});
  assert.equal(f.room.notice(n, 'k:1'), true);
  assert.equal(f.room.notice(n, 'k:1'), false);
  assert.deepEqual(f.notices(ws), ['win']); f.db.close();
});

test('입장 공지는 다른 사람에게, 쿨다운 안의 재입장은 조용히', () => {
  const f = fixture(), other = f.socket(resident('o')), me = f.socket(resident('me'));
  f.room.arrive(resident('me'), false, me);
  assert.deepEqual(f.notices(other), ['join']); assert.deepEqual(f.notices(me), []);
  f.room.arrive(resident('me'), false, me);
  assert.deepEqual(f.notices(other), ['join'], '쿨다운');
  f.db.close();
});

test('퇴장은 늦춰서 알리고, 그 사이 돌아오면 퇴장도 입장도 알리지 않는다', async () => {
  const f = fixture(), other = f.socket(resident('o')), me = f.socket(resident('me'));
  f.room.arrive(resident('me'), false, me);
  me.close(1000); f.room.depart(resident('me'));
  assert.equal(f.alarms.length, 1); assert.ok(f.alarms[0] >= Date.now() + NOTICE.leaveDelayMs - 50);
  const again = f.socket(resident('me')); f.room.arrive(resident('me'), false, again);
  f.db.prepare('UPDATE presence SET leave_due=0').run(); await f.room.alarm();
  assert.deepEqual(f.notices(other), ['join'], '재접속은 조용히');
  again.close(1000); f.room.depart(resident('me'));
  f.db.prepare('UPDATE presence SET leave_due=0').run(); await f.room.alarm();
  assert.deepEqual(f.notices(other), ['join', 'leave']); f.db.close();
});

test('다른 창이 남아 있으면 퇴장으로 보지 않는다', () => {
  const f = fixture(); f.socket(resident('me')); f.room.arrive(resident('me'), false, null);
  f.room.depart(resident('me')); assert.equal(f.alarms.length, 0); f.db.close();
});

test('초코 랭킹은 잔액 순, 같은 사람은 한 줄', async () => {
  const db = new DatabaseSync(':memory:');
  const env = {DB: {prepare(q) { const run = args => ({run: async () => db.prepare(q).run(...args), all: async () => ({results: db.prepare(q).all(...args)})}); return {...run([]), bind: (...a) => run(a)}; }}};
  await saveRank(env, 'k1', '가', 500); await saveRank(env, 'k2', '나', 900); await saveRank(env, 'k1', '가가', 1200);
  await saveRank(env, 'k3', '다', 1.5); clearRankCache();
  assert.deepEqual(await chocoRanking(env), [{rank: 1, name: '가가', balance: 1200}, {rank: 2, name: '나', balance: 900}]);
  db.close();
});

test('한 판이 끝나면 LandPlayer가 settled(게임·판돈·배당)를 돌려준다', async () => {
  const {LandPlayer} = await import('../server/src/land-player.js');
  const db = new DatabaseSync(':memory:');
  const sql = {exec(query, ...args) { const rows = db.prepare(query).all(...args); return {toArray: () => rows, one: () => rows[0]}; }};
  const p = new LandPlayer({storage: {sql, transactionSync: fn => fn()}}, {});
  const call = async body => (await p.fetch(new Request('https://player/', {method: 'POST', body: JSON.stringify({key: 'k', name: '주민', ...body})}))).json();
  await call({op: 'get'});
  const out = await call({op: 'play', id: crypto.randomUUID(), issued: Date.now(), payload: {game: 'dice', bet: 100, choice: 'odd'}});
  assert.equal(out.settled?.game, 'dice', JSON.stringify(out).slice(0, 200));
  assert.equal(out.settled.bet, 100); assert.ok(Number.isSafeInteger(out.settled.payout));
  db.close();
});

test('공지 줄이 넘치면 입장·퇴장부터 버리고 당첨은 남긴다', async () => {
  const {enqueue} = await import('../land/notice-ui.js');
  let q = [];
  for (const kind of ['win', 'join', 'leave', 'join', 'win', 'join', 'leave']) q = enqueue(q, {kind, text: kind}, 4);
  assert.equal(q.length, 4);
  assert.equal(q.filter(n => n.kind === 'win').length, 2);
  q = enqueue([{kind: 'win'}, {kind: 'win'}], {kind: 'win'}, 2);
  assert.equal(q.length, 2);
});

test('랭킹은 잠깐 같은 결과를 돌려주고, 잔액이 같으면 다시 쓰지 않는다', async () => {
  const db = new DatabaseSync(':memory:'); let reads = 0;
  const env = {DB: {prepare(q) { const run = args => ({run: async () => db.prepare(q).run(...args), all: async () => { reads++; return {results: db.prepare(q).all(...args)}; }}); return {...run([]), bind: (...a) => run(a)}; }}};
  clearRankCache(); await saveRank(env, 'k1', '가', 500);
  const at = db.prepare('SELECT updated FROM land_choco_rank').get().updated;
  await new Promise(r => setTimeout(r, 5)); await saveRank(env, 'k1', '가', 500);
  assert.equal(db.prepare('SELECT updated FROM land_choco_rank').get().updated, at, '같은 잔액은 그대로');
  await chocoRanking(env, 1000); await chocoRanking(env, 1000 + NOTICE.rankingCacheMs - 1);
  assert.equal(reads, 1);
  await chocoRanking(env, 1000 + NOTICE.rankingCacheMs + 1); assert.equal(reads, 2);
  clearRankCache(); db.close();
});
