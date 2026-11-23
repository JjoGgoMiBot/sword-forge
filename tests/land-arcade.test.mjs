import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ARCADE, pay, rouletteMult, rouletteStart, roulettePull, rouletteView, hiloStart, hiloGuess, hiloView, minesFair, minesMult, minesStart, minesPick, minesView, cashOut, expire, baccaratDeal, baccaratPayout, boxOpen, wheelBet, arcadeOneShot, begAlms} from '../server/src/land-arcade.js';
import {CRASH, PARTY, multAt, msFor, crashPoint, newCrash, placeCrashBet, crashCash, crashTick, crashDue, crashView, newParty, partyJoin, partyLeave, partyTick, partyDue, partyView, partyScript, partyPrize, DUEL, duelPrize, newDuel, duelJoin, duelLeave, duelShoot, duelTick, duelDue, duelView} from '../server/src/land-crash.js';
import {LandRoom, giftNet} from '../server/src/land.js';
import {LandPlayer, GIFT} from '../server/src/land-player.js';
import {winNotice} from '../server/src/land-notice.js';

const seeded = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const throwsArcade = (fn, re) => assert.throws(fn, e => e.arcade === true && re.test(e.message));

// ── 혼자 하는 게임 ──
test('러시안 룰렛: 버틴 만큼 배율, 탕이면 0, 다섯 번 버티면 자동 최대 정산', () => {
  const r = rouletteStart(100, () => 0.5);   // 총알은 3번째(0부터) 칸
  assert.equal(r.bullet, 3);
  throwsArcade(() => cashOut(r), /한 번은/);
  roulettePull(r); roulettePull(r);
  assert.equal(rouletteView(r).mult, 1.44);
  assert.equal(rouletteView(r).bullet, null, '끝나기 전에는 총알 위치를 보내지 않는다');
  roulettePull(r); roulettePull(r);
  assert.equal(r.done, true); assert.equal(r.outcome, 'bang'); assert.equal(r.payout, 0);
  assert.equal(rouletteView(r).bullet, 3, '끝나면 보여 준다');
  const lucky = rouletteStart(100, () => 0.99);  // 총알은 마지막 칸
  for (let i = 0; i < 5; i++) roulettePull(lucky);
  assert.equal(lucky.outcome, 'max'); assert.equal(lucky.payout, 576);
  throwsArcade(() => roulettePull(lucky), /끝난/);
});

test('러시안 룰렛 기대 환수율: 몇 번에서 멈춰도 96%를 넘지 않는다', () => {
  for (let k = 1; k <= 5; k++) {
    const survive = (6 - k) / 6, rtp = survive * rouletteMult(k);
    assert.ok(rtp <= 0.96 + 1e-9 && rtp > 0.95, k + '번 버티고 멈춤: ' + rtp);
  }
});

test('하이로우: 맞히면 배율이 오르고, 틀리면 끝. 불가능한 선택은 거절', () => {
  const g = hiloStart(100, () => 0.5);   // 7
  assert.equal(g.cards[0].rank, 7);
  hiloGuess(g, 'high', () => 0.9);       // 12
  assert.equal(g.steps, 1); assert.equal(hiloView(g).mult, Math.floor(96 * 13 / 6) / 100);
  hiloGuess(g, 'low', () => 0.95);       // 13 → 틀림
  assert.equal(g.outcome, 'miss'); assert.equal(g.payout, 0);
  const k = hiloStart(10, () => 0.99);   // K
  throwsArcade(() => hiloGuess(k, 'high'), /K보다/);
  throwsArcade(() => hiloGuess(k, 'middle'), /골라/);
  assert.equal(hiloView(k).high, null);
});

test('하이로우 기대 환수율: 어느 카드·방향이든 한 단계 기대값 ≤ 96%, 무작위 전략 시뮬레이션도 96% 근처', () => {
  for (let rank = 1; rank <= 13; rank++) for (const guess of ['high', 'low']) {
    const ways = guess === 'high' ? 13 - rank : rank - 1; if (!ways) continue;
    const g = hiloStart(1000, () => (rank - 1) / 13 + 0.01), v = hiloView(g);
    assert.ok(ways / 13 * v[guess] <= 0.96 + 1e-9, rank + guess);
  }
  const rng = seeded(11); let bet = 0, back = 0;
  for (let i = 0; i < 40000; i++) {
    const g = hiloStart(100, rng), stop = 1 + Math.floor(rng() * 3);
    while (!g.done && g.steps < stop) { const r = g.cards.at(-1).rank; hiloGuess(g, r <= 7 ? 'high' : 'low', rng); }
    if (!g.done) cashOut(g);
    bet += 100; back += g.payout;
  }
  assert.ok(back / bet > 0.93 && back / bet < 0.975, 'RTP ' + back / bet);
});

test('마인즈: 지뢰 자리는 끝나야 보이고, 같은 칸·잘못된 칸·지뢰 수는 거절', () => {
  const g = minesStart(100, 3, seeded(5));
  assert.equal(minesView(g).bombs, null);
  assert.ok(!JSON.stringify(minesView(g)).includes('"bombs":['));
  const safe = [...Array(25).keys()].filter(c => !g.bombs.includes(c));
  minesPick(g, safe[0]);
  throwsArcade(() => minesPick(g, safe[0]), /이미 연/);
  throwsArcade(() => minesPick(g, 25), /칸을/);
  throwsArcade(() => minesStart(100, 2), /지뢰 수/);
  assert.equal(minesView(g).mult, minesMult(3, 1));
  minesPick(g, g.bombs[0]);
  assert.equal(g.outcome, 'boom'); assert.equal(g.payout, 0);
  assert.deepEqual(minesView(g).bombs, g.bombs);
  const all = minesStart(10, 1, seeded(2));
  for (const c of [...Array(25).keys()].filter(c => !all.bombs.includes(c))) if (!all.done) minesPick(all, c);
  assert.equal(all.outcome, 'max'); assert.equal(all.payout, pay(10, minesMult(1, 24)));
});

test('마인즈 기대 환수율: 지뢰 수·연 칸 수와 상관없이 96% 이하', () => {
  for (const m of ARCADE.mines.counts) for (let n = 1; n <= 25 - m; n++) {
    const rtp = minesMult(m, n) / minesFair(m, n);
    assert.ok(rtp <= 0.96 + 1e-9, m + '개 ' + n + '칸: ' + rtp);
    if (minesMult(m, n) < ARCADE.mines.maxMult) assert.ok(rtp > 0.95, m + '개 ' + n + '칸 너무 낮음');
  }
});

test('시간 만료: 한 번이라도 버텼으면 멈춤 정산, 아니면 원금 환불', () => {
  const a = rouletteStart(100, () => 0.99); expire(a);
  assert.equal(a.outcome, 'refund'); assert.equal(a.payout, 100);
  const b = rouletteStart(100, () => 0.99); roulettePull(b); expire(b);
  assert.equal(b.outcome, 'cash'); assert.equal(b.payout, pay(100, rouletteMult(1)));
});

test('바카라 규칙과 기대 환수율(플레이어·뱅커·타이 모두 92~98%)', () => {
  const rng = seeded(3), n = 120000, sum = {player: 0, banker: 0, tie: 0};
  for (let i = 0; i < n; i++) {
    const d = baccaratDeal(rng);
    assert.ok(d.player.length <= 3 && d.banker.length <= 3);
    for (const side of Object.keys(sum)) sum[side] += baccaratPayout(100, side, d.winner);
  }
  for (const side of Object.keys(sum)) { const rtp = sum[side] / (100 * n); assert.ok(rtp > 0.92 && rtp < 0.98, side + ' ' + rtp); }
  assert.equal(baccaratPayout(100, 'player', 'tie'), 100, '타이면 플/뱅 베팅은 돌려준다');
  assert.equal(baccaratPayout(100, 'tie', 'tie'), 1000);
  throwsArcade(() => arcadeOneShot('baccarat', 100, 'dealer'), /골라/);
});

test('럭키박스 기대 환수율 ≈ 95.2%, 상자 가격은 정해진 세 가지', () => {
  const w = ARCADE.boxPrizes.reduce((a, p) => a + p[1], 0), ev = ARCADE.boxPrizes.reduce((a, p) => a + p[1] / w * p[2], 0);
  assert.ok(ev > 0.94 && ev < 0.96, 'EV ' + ev);
  assert.equal(boxOpen('gold', () => 0.999999).prize, '전설의 황금 쪼꼬미');
  assert.equal(boxOpen('small', () => 0).payout, 20);
  throwsArcade(() => boxOpen('huge'), /상자/);
});

test('룰렛 휠: 모든 걸 곳의 기대 환수율 36/37, 이상한 걸 곳은 거절', () => {
  for (const choice of ['red', 'black', 'odd', 'even', 'low', 'high', 'd1', 'd2', 'd3', 'n0', 'n17', 'n36']) {
    const b = wheelBet(choice); let hits = 0;
    for (let x = 0; x <= 36; x++) if (b.hit(x)) hits++;
    assert.equal(hits * b.mult, 36, choice);
  }
  for (const bad of ['n37', 'green', 'd4', '', null]) assert.equal(wheelBet(bad), null);
  throwsArcade(() => arcadeOneShot('wheel', 100, 'n99'), /걸 곳/);
  assert.equal(arcadeOneShot('slots', 100, null), null, '기존 게임은 그대로 넘긴다');
});

test('구걸: 대부분 소액, 가끔 꽝', () => {
  const rng = seeded(8), got = Array.from({length: 2000}, () => begAlms(rng));
  assert.ok(got.every(x => x >= 0 && x <= 300));
  assert.ok(got.filter(x => x === 0).length > 700 && got.filter(x => x === 0).length < 1100);
});

// ── 🚀 크래시 ──
test('크래시 배율: 6초마다 두 배, 터지는 배율 분포 P(≥x) ≈ 0.96/x', () => {
  assert.equal(multAt(0), 1); assert.equal(multAt(CRASH.doubleMs), 2); assert.ok(multAt(msFor(3.33)) >= 3.33);
  assert.ok(multAt(msFor(3.33) - 1) < 3.33);
  const rng = seeded(21), n = 100000, pts = Array.from({length: n}, () => crashPoint(rng));
  for (const x of [1.5, 2, 5, 10]) { const p = pts.filter(v => v >= x).length / n; assert.ok(Math.abs(p - 0.96 / x) < 0.01, x + ': ' + p); }
  assert.ok(pts.every(v => v >= 1 && v <= 100));
});

test('크래시 기대 환수율: 자동 멈춤 ×1.5·×2·×10 모두 96% 근처', () => {
  for (const target of [1.5, 2, 10]) {
    const rng = seeded(31), n = 200000; let back = 0;
    for (let i = 0; i < n; i++) if (crashPoint(rng) >= target) back += pay(100, target);
    const rtp = back / (100 * n);
    assert.ok(rtp > 0.94 && rtp < 0.98, target + ': ' + rtp);
  }
});

const who = id => ({id, key: 'key-' + id, name: id});
test('크래시 한 판: 베팅 → 출발 → 멈춤 정산 → 터짐. 터지는 배율은 터지기 전에 보내지 않는다', () => {
  const c = newCrash();
  placeCrashBet(c, who('a'), 100, null, 0);
  placeCrashBet(c, who('b'), 200, 2, 10);
  assert.equal(c.phase, 'betting'); assert.equal(crashDue(c), CRASH.bettingMs);
  throwsArcade(() => placeCrashBet(c, who('a'), 100, null, 20), /이미 걸/);
  throwsArcade(() => placeCrashBet(c, who('c'), 5, null, 20), /베팅은/);
  throwsArcade(() => placeCrashBet(c, who('c'), 100, 0.5, 20), /자동 멈춤/);
  crashTick(c, CRASH.bettingMs, () => 0.5);   // u=0.5 → ×1.92
  assert.equal(c.phase, 'running'); assert.equal(c.point, 1.92);
  const v = crashView(c, 'a', CRASH.bettingMs + 100), json = JSON.stringify(v);
  assert.ok(!('point' in v) && !json.includes('crashAt') && !json.includes('1.92'), '터지는 배율·시각은 비밀');
  throwsArcade(() => placeCrashBet(c, who('c'), 100, null, CRASH.bettingMs + 1), /출발/);
  const start = c.startAt;
  throwsArcade(() => crashCash(c, 'a', start + 10), /부터/);
  const ev = crashCash(c, 'a', start + msFor(1.5));
  assert.equal(ev.cashOuts[0].amount, 150); assert.equal(ev.wins[0].game, 'crash');
  throwsArcade(() => crashCash(c, 'a', start + msFor(1.6)), /이미 멈/);
  // b의 자동 멈춤(×2)은 터지는 배율(×1.92)보다 높아서 정산되지 않는다
  assert.equal(crashDue(c), c.crashAt);
  throwsArcade(() => crashCash(c, 'b', c.crashAt), /터졌/);
  const end = crashTick(c, c.crashAt);
  assert.equal(end.cashOuts.length, 0);
  assert.equal(c.phase, 'betting'); assert.deepEqual(c.history, [1.92]);
  assert.equal(c.last.point, 1.92); assert.equal(c.last.bets.find(b => b.name === 'b').payout, 0);
  assert.equal(c.bets.length, 0);
  // 아무도 안 걸면 쉰다
  crashTick(c, c.bettingEnd); assert.equal(c.phase, 'idle'); assert.equal(crashDue(c), null);
});

test('크래시 자동 멈춤: 알람이 그 시각에 깨우고, 늦게 깨도 정한 배율로 정산', () => {
  const c = newCrash();
  placeCrashBet(c, who('a'), 100, 1.5, 0);
  crashTick(c, CRASH.bettingMs, () => 0.9);   // ×9.6
  assert.equal(crashDue(c), c.startAt + msFor(1.5));
  const ev = crashTick(c, c.startAt + msFor(3));
  assert.equal(ev.cashOuts[0].amount, 150);
  assert.equal(c.bets[0].cashed, 1.5);
  // 수동 멈춤 요청이 자동 배율을 지난 뒤에 와도 자동 배율로
  const d = newCrash(); placeCrashBet(d, who('a'), 100, 1.3, 0); crashTick(d, CRASH.bettingMs, () => 0.9);
  assert.equal(crashCash(d, 'a', d.startAt + msFor(2)).cashOuts[0].amount, 130);
});

// ── 🔫 총쏘기 서바이벌 ──
test('서바이벌: 혼자면 기다리다 환불, 둘이면 출발 예약, 나가면 환불', () => {
  const p = newParty();
  partyJoin(p, who('a'), 100, 0);
  assert.equal(partyDue(p), PARTY.aloneMs);
  const gone = partyTick(p, PARTY.aloneMs);
  assert.equal(gone.cashOuts[0].amount, 100); assert.equal(gone.cashOuts[0].reason, 'refund'); assert.equal(p.phase, 'idle');
  partyJoin(p, who('a'), 300, 0);
  assert.equal(partyJoin(p, who('b'), 999, 1000), 300, '참가비는 방장이 정한 금액');
  assert.equal(partyDue(p), 1000 + PARTY.lobbyMs);
  throwsArcade(() => partyJoin(p, who('a'), 300, 1), /이미/);
  const left = partyLeave(p, 'b');
  assert.equal(left.cashOuts[0].amount, 300); assert.equal(p.startDue, null);
  throwsArcade(() => partyLeave(p, 'zz'), /참가하지/);
  throwsArcade(() => partyJoin(newParty(), who('x'), 5, 0), /참가비/);
});

test('서바이벌: 한 명만 남을 때까지 쏘고, 앞으로 일어날 일은 보내지 않는다', () => {
  const p = newParty();
  for (const id of ['a', 'b', 'c']) partyJoin(p, who(id), 100, 0);
  partyTick(p, p.startDue, seeded(4));
  assert.equal(p.phase, 'playing');
  assert.equal(p.events.filter(e => e.bang).length, 2);
  const v = partyView(p, 'a', p.startAt), json = JSON.stringify(v);
  assert.equal(v.events.length, 0); assert.ok(!json.includes('winner":0') && !('endAt' in v));
  assert.ok(v.players.every(x => !x.dead && !x.winner));
  throwsArcade(() => partyLeave(p, 'a'), /출발한/);
  throwsArcade(() => partyJoin(p, who('d'), 100, p.startAt), /진행 중/);
  const mid = p.events[1].at;
  assert.equal(partyView(p, 'a', mid).events.length, 2);
  assert.equal(partyDue(p, mid), p.events[2]?.at ?? p.endAt);
  const ev = partyTick(p, p.endAt);
  assert.equal(ev.cashOuts.length, 1); assert.equal(ev.cashOuts[0].amount, partyPrize(300));
  assert.equal(ev.cashOuts[0].amount, 288);
  assert.equal(partyView(p, 'a', p.endAt).players.filter(x => x.winner).length, 1);
  partyTick(p, p.doneUntil); assert.equal(p.phase, 'idle');
});

test('서바이벌 공정성: 자리마다 이길 확률이 같다(기대 환수율 96%)', () => {
  const rng = seeded(9), n = 30000, wins = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) wins[partyScript(4, 0, rng).winner]++;
  for (const w of wins) assert.ok(Math.abs(w / n - 0.25) < 0.015, String(wins));
  assert.equal(partyPrize(4 * 100) / 400, 0.96);
});

// ── 🤠 총잡이 결투 ──
test('결투: 신호 시각은 비밀, 신호 뒤 먼저 도착한 사격이 이기고 판돈×2의 97%', () => {
  const d = newDuel();
  duelJoin(d, who('a'), 500, 0, () => 0.5);
  assert.equal(d.phase, 'lobby');
  throwsArcade(() => duelShoot(d, 'a', 10), /쏠 때가/);
  duelJoin(d, who('b'), 1, 100, () => 0.5);
  assert.equal(d.stake, 500); assert.equal(d.phase, 'ready');
  assert.equal(d.signalAt, 100 + DUEL.introMs + 2500 + 2250);
  const v = duelView(d, 'a', 200), json = JSON.stringify(v);
  assert.equal(v.fire, false); assert.ok(!json.includes(String(d.signalAt)) && !json.includes('signalAt'));
  throwsArcade(() => duelJoin(d, who('c'), 500, 200), /진행 중/);
  throwsArcade(() => duelLeave(d, 'a'), /물러날/);
  duelTick(d, d.signalAt); assert.equal(d.phase, 'fire'); assert.equal(duelView(d, 'b', d.signalAt).fire, true);
  throwsArcade(() => duelShoot(d, 'zz', d.signalAt + 1), /두 사람만/);
  const ev = duelShoot(d, 'b', d.signalAt + 230);
  assert.equal(ev.cashOuts[0].key, 'key-b'); assert.equal(ev.cashOuts[0].amount, 970);
  assert.equal(d.last.reaction, 230); assert.equal(d.last.how, 'shot');
  throwsArcade(() => duelShoot(d, 'a', d.signalAt + 240), /쏠 때가/);
  duelTick(d, d.doneUntil); assert.equal(d.phase, 'idle');
});

test('결투: 신호 전에 쏘면 반칙패, 둘 다 안 쏘면 환불, 혼자면 기다리다 환불', () => {
  const d = newDuel(); duelJoin(d, who('a'), 100, 0); duelJoin(d, who('b'), 100, 0);
  const foul = duelShoot(d, 'a', d.signalAt - 1);
  assert.equal(foul.cashOuts[0].key, 'key-b'); assert.equal(d.last.how, 'foul'); assert.equal(foul.cashOuts[0].amount, duelPrize(100));
  const q = newDuel(); duelJoin(q, who('a'), 100, 0); duelJoin(q, who('b'), 100, 0);
  duelTick(q, q.signalAt); const back = duelTick(q, duelDue(q));
  assert.deepEqual(back.cashOuts.map(c => [c.key, c.amount, c.reason]), [['key-a', 100, 'refund'], ['key-b', 100, 'refund']]);
  const lone = newDuel(); duelJoin(lone, who('a'), 100, 0);
  assert.equal(duelDue(lone), DUEL.aloneMs);
  assert.equal(duelTick(lone, DUEL.aloneMs).cashOuts[0].reason, 'refund');
  const left = newDuel(); duelJoin(left, who('a'), 100, 0);
  assert.equal(duelLeave(left, 'a').cashOuts[0].amount, 100); assert.equal(left.phase, 'idle');
  throwsArcade(() => duelJoin(newDuel(), who('x'), 9, 0), /판돈/);
});

test('결투 대기 시간은 봇과 같은 2.5~7초(+준비 1.5초) 안에서 고르게', () => {
  const rng = seeded(12), waits = Array.from({length: 5000}, () => { const d = newDuel(); duelJoin(d, who('a'), 10, 0, rng); duelJoin(d, who('b'), 10, 0, rng); return d.signalAt - DUEL.introMs; });
  assert.ok(Math.min(...waits) >= 2500 && Math.max(...waits) < 7000);
  assert.ok(Math.abs(waits.reduce((a, b) => a + b, 0) / waits.length - 4750) < 100);
});

// ── 지갑·방 연동 ──
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
const call = async (env, key, op, payload) => { const r = await env.LAND_PLAYERS.get(key).fetch(new Request('https://p/', {method: 'POST', body: JSON.stringify({key, name: key, op, payload, id: crypto.randomUUID(), issued: Date.now()})})); return {status: r.status, data: await r.json()}; };
const balance = async (env, key) => (await call(env, key, 'get')).data.wallet.balance;

test('지갑: 마인즈를 시작하면 베팅이 빠지고, 멈추면 정산되며 지뢰 자리는 끝난 뒤에만 온다', async () => {
  const w = wallet();
  const s = await call(w.env, 'm', 'arcadeStart', {game: 'mines', bet: 100, mines: 1});
  assert.equal(s.status, 200); assert.equal(s.data.wallet.balance, 900);
  assert.equal(s.data.arcade.bombs, null); assert.ok(!JSON.stringify(s.data).includes('"bombs":['));
  const again = await call(w.env, 'm', 'arcadeStart', {game: 'hilo', bet: 100});
  assert.equal(again.status, 400); assert.match(again.data.msg, /마인즈/);
  throwsArcade(() => cashOut(minesStart(1, 1)), /한 번은/);
  let last = s.data;
  for (let cell = 0; cell < 25 && !last.arcade.done && last.arcade.opened.length < 2; cell++) last = (await call(w.env, 'm', 'arcadeMove', {roundId: s.data.arcade.id, move: 'pick', cell})).data;
  if (!last.arcade.done) last = (await call(w.env, 'm', 'arcadeMove', {roundId: s.data.arcade.id, move: 'cash'})).data;
  assert.equal(last.arcade.done, true); assert.ok(Array.isArray(last.arcade.bombs));
  assert.equal(last.wallet.balance, 900 + last.arcade.payout);
  assert.deepEqual(last.settled, {game: 'mines', bet: 100, payout: last.arcade.payout});
  const stale = await call(w.env, 'm', 'arcadeMove', {roundId: s.data.arcade.id, move: 'cash'});
  assert.equal(stale.status, 409);
});

test('지갑: 바카라·룰렛·럭키박스는 한 번에 정산, 럭키박스는 상자 가격만큼 빠진다', async () => {
  const w = wallet();
  const box = await call(w.env, 'b', 'play', {game: 'luckybox', choice: 'small', bet: 1});
  assert.equal(box.status, 200); assert.equal(box.data.wallet.balance, 900 + box.data.result.payout);
  assert.equal(box.data.settled.bet, 100);
  const bad = await call(w.env, 'b2', 'play', {game: 'wheel', choice: 'purple', bet: 100});
  assert.equal(bad.status, 400); assert.equal(await balance(w.env, 'b2'), 1000);
  const bac = await call(w.env, 'b3', 'play', {game: 'baccarat', choice: 'banker', bet: 100});
  assert.equal(bac.status, 200); assert.ok(['player', 'banker', 'tie'].includes(bac.data.result.winner));
});

test('지갑: 구걸은 잔액이 적을 때만, 10분에 한 번', async () => {
  const w = wallet();
  assert.equal((await call(w.env, 'g', 'beg')).status, 400, '1,000초코면 거절');
  await call(w.env, 'g', 'play', {game: 'luckybox', choice: 'gold', bet: 1});   // 5,000 > 잔액 → 거절
  for (let i = 0; i < 9 && await balance(w.env, 'g') >= 300; i++) { const r = await call(w.env, 'g', 'arcadeStart', {game: 'roulette', bet: 100}); assert.equal(r.status, 200); w.players.get('g').sql.exec("UPDATE player SET data=json_set(data,'$.nextPlay',0,'$.arcade.done',json('true'))"); }
  const first = await call(w.env, 'g', 'beg');
  assert.equal(first.status, 200); assert.equal(first.data.result.game, 'beg');
  const second = await call(w.env, 'g', 'beg');
  assert.equal(second.status, 429); assert.match(second.data.msg, /분 뒤/);
});

test('손님 요청으로는 방 지갑 기능(roomBuyIn·roomCashOut·giftSend)을 부를 수 없다', async () => {
  const w = wallet();
  for (const op of ['roomBuyIn', 'roomCashOut', 'giftSend']) {
    const r = await call(w.env, 'x', op, {game: 'crash', amount: 99999});
    assert.equal(r.status, 404, op);
  }
  assert.equal(await balance(w.env, 'x'), 1000);
});

test('방 크래시: 베팅이 지갑에서 빠지고, 멈추면 정산이 들어온다. 화면에는 터지는 배율이 없다', async () => {
  const w = wallet(), f = room(w.env), a = resident('pilot'), ws = f.socket(a);
  await f.r.arcadeMessage(ws, a, {type: 'arcade', game: 'crash', op: 'bet', bet: 500}, Date.now());
  assert.equal(await balance(w.env, a.key), 500);
  assert.ok(ws.sent.some(m => m.type === 'wallet' && m.balance === 500));
  const c = f.r.arcadeState('crash');
  assert.equal(c.phase, 'betting'); assert.ok(f.alarms.includes(c.bettingEnd));
  c.bettingEnd = 0; await f.r.alarm();
  assert.equal(c.phase, 'running');
  c.point = 50; c.crashAt = c.startAt + msFor(50.01);
  const views = ws.sent.filter(m => m.type === 'arcade' && m.game === 'crash');
  assert.ok(views.length && views.every(m => !JSON.stringify(m).includes('crashAt')));
  await f.r.arcadeMessage(ws, ws.deserializeAttachment(), {type: 'arcade', game: 'crash', op: 'cash'}, c.startAt + msFor(2));
  assert.equal(await balance(w.env, a.key), 1500);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM poker_payouts').get().n, 0);
  await f.r.arcadeMessage(ws, ws.deserializeAttachment(), {type: 'arcade', game: 'crash', op: 'cash'}, c.startAt + msFor(3));
  assert.match(ws.sent.filter(m => m.type === 'arcadeError').at(-1).msg, /이미 멈/);
});

test('방 크래시: 잔액보다 큰 베팅은 거절되고 판에 들어가지 않는다', async () => {
  const w = wallet(), f = room(w.env), a = resident('poor'), ws = f.socket(a);
  await f.r.arcadeMessage(ws, a, {type: 'arcade', game: 'crash', op: 'bet', bet: 5000}, Date.now());
  assert.match(ws.sent.find(m => m.type === 'arcadeError').msg, /부족/);
  assert.equal(f.r.arcadeState('crash').bets.length, 0);
  assert.equal(await balance(w.env, a.key), 1000);
});

test('방 서바이벌: 둘이 들어와 한 명이 판돈의 96%를 받는다', async () => {
  const w = wallet(), f = room(w.env), a = resident('a1'), b = resident('b1'), wa = f.socket(a), wb = f.socket(b);
  await f.r.arcadeMessage(wa, a, {type: 'arcade', game: 'party', op: 'join', stake: 200}, Date.now());
  await f.r.arcadeMessage(wb, b, {type: 'arcade', game: 'party', op: 'join', stake: 1}, Date.now());
  assert.equal(await balance(w.env, a.key), 800); assert.equal(await balance(w.env, b.key), 800);
  const p = f.r.arcadeState('party');
  p.startDue = 0; await f.r.alarm();
  assert.equal(p.phase, 'playing');
  for (const e of p.events) e.at = 0;
  p.endAt = 0; await f.r.alarm();
  assert.equal(p.phase, 'done');
  const total = await balance(w.env, a.key) + await balance(w.env, b.key);
  assert.equal(total, 1600 + 384);
  assert.deepEqual([await balance(w.env, a.key), await balance(w.env, b.key)].sort(), [1184, 800]);
});

test('방 초코 선물: 같은 광장 주민에게만, 수수료 5% 빼고 도착, 하루 한도', async () => {
  const w = wallet(), f = room(w.env), a = resident('giver'), b = resident('taker'), wa = f.socket(a), wb = f.socket(b);
  await f.r.arcadeMessage(wa, a, {type: 'arcade', game: 'gift', op: 'send', to: 'taker', amount: 1000}, Date.now());
  assert.equal(await balance(w.env, a.key), 0); assert.equal(await balance(w.env, b.key), 1000 + giftNet(1000));
  assert.equal(giftNet(1000), 950);
  assert.ok(wb.sent.some(m => m.type === 'gift' && m.dir === 'got' && m.amount === 950));
  const errors = () => wa.sent.filter(m => m.type === 'arcadeError').map(m => m.msg);
  await f.r.arcadeMessage(wa, wa.deserializeAttachment(), {type: 'arcade', game: 'gift', op: 'send', to: 'nobody', amount: 100}, Date.now() + 5000);
  await f.r.arcadeMessage(wa, wa.deserializeAttachment(), {type: 'arcade', game: 'gift', op: 'send', to: 'giver', amount: 100}, Date.now() + 5000);
  await f.r.arcadeMessage(wa, wa.deserializeAttachment(), {type: 'arcade', game: 'gift', op: 'send', to: 'taker', amount: 5}, Date.now() + 5000);
  await f.r.arcadeMessage(wa, wa.deserializeAttachment(), {type: 'arcade', game: 'gift', op: 'send', to: 'taker', amount: 100}, Date.now() + 5000);
  const e = errors();
  assert.match(e[0], /이 광장/); assert.match(e[1], /자기 자신/); assert.match(e[2], /선물은/); assert.match(e[3], /부족/);
  // 하루 한도
  const c = resident('rich'), wc = f.socket(c); let now = Date.now() + 10000;
  for (let i = 0; i < 4; i++) { await call(w.env, c.key, 'daily'); }
  w.players.get(c.key).sql.exec("UPDATE player SET data=json_set(data,'$.balance',9000)");
  for (let i = 0; i < 4; i++, now += 4000) await f.r.arcadeMessage(wc, wc.deserializeAttachment(), {type: 'arcade', game: 'gift', op: 'send', to: 'taker', amount: 1000}, now);
  assert.match(wc.sent.filter(m => m.type === 'arcadeError').at(-1).msg, /남았어요/);
  assert.equal(GIFT.dailyLimit, 3000);
});

test('방 결투: 판돈이 빠지고, 신호 뒤 먼저 쏜 사람이 받는다', async () => {
  const w = wallet(), f = room(w.env), a = resident('d1'), b = resident('d2'), wa = f.socket(a), wb = f.socket(b);
  await f.r.arcadeMessage(wa, a, {type: 'arcade', game: 'duel', op: 'join', stake: 300}, Date.now());
  await f.r.arcadeMessage(wb, b, {type: 'arcade', game: 'duel', op: 'join', stake: 300}, Date.now());
  assert.equal(await balance(w.env, a.key), 700);
  const d = f.r.arcadeState('duel'); assert.equal(d.phase, 'ready');
  assert.ok(wa.sent.filter(m => m.type === 'arcade').every(m => !JSON.stringify(m).includes('signalAt')));
  d.signalAt = Date.now() - 10; await f.r.alarm();
  assert.equal(d.phase, 'fire'); assert.ok(wa.sent.some(m => m.type === 'arcade' && m.view.fire));
  await f.r.arcadeMessage(wb, wb.deserializeAttachment(), {type: 'arcade', game: 'duel', op: 'shoot'}, Date.now());
  await f.r.arcadeMessage(wa, wa.deserializeAttachment(), {type: 'arcade', game: 'duel', op: 'shoot'}, Date.now());
  assert.equal(await balance(w.env, b.key), 700 + 582); assert.equal(await balance(w.env, a.key), 700);
  assert.match(wa.sent.filter(m => m.type === 'arcadeError').at(-1).msg, /쏠 때가/);
});

test('큰 당첨 공지에 새 게임 이름이 나온다', () => {
  const n = winNotice('쪼꼬', {game: 'crash', bet: 100, payout: 5000});
  assert.ok(n && n.text.includes('크래시'), JSON.stringify(n));
});
