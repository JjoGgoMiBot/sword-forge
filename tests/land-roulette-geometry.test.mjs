import test from 'node:test';
import assert from 'node:assert/strict';
import { slotPos, slotAngle, cursorSlot, slotStates, pullStep, rouletteSvg, STEP_MS } from '../land/revolver.js';
import { WHEEL_ORDER, pocketAngle, orbitFrames, SPIN_MS } from '../land/wheel-view.js';
import { pullCues, casinoCues } from '../land/sound/cues.js';
import { SFX_IDS } from '../land/sound/recipes.js';

test('약실은 중심에서 같은 거리, 같은 각도 간격(정다각)', () => {
  for (const n of [3, 5, 6, 8]) {
    const ps = Array.from({ length: n }, (_, i) => slotPos(i, n));
    for (const p of ps) assert.ok(Math.abs(Math.hypot(p.x - 100, p.y - 100) - 54) < 0.01, n + '칸 반지름');
    const sum = ps.reduce((a, p) => [a[0] + p.x, a[1] + p.y], [0, 0]);
    assert.ok(Math.abs(sum[0] - 100 * n) < 0.05 && Math.abs(sum[1] - 100 * n) < 0.05, n + '칸 무게중심이 중심');
    for (let i = 0; i < n; i++) assert.ok(Math.abs(slotAngle((i + 1) % n || n, n) - slotAngle(i, n) - 360 / n) < 1e-9 || i === n - 1);
    const d = ps.map((p, i) => Math.hypot(p.x - ps[(i + 1) % n].x, p.y - ps[(i + 1) % n].y));
    assert.ok(Math.max(...d) - Math.min(...d) < 0.02, n + '칸 이웃 간격 같음');
  }
  assert.deepEqual(slotPos(0, 6), { x: 100, y: 46 }); // 첫 칸은 위쪽
});

test('방아쇠 칸은 한 칸씩 옆으로 간다', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(s => cursorSlot(s, 6)), [0, 1, 2, 3, 4, 5]);
  const st = slotStates({ shots: 2, done: false }, 6);
  assert.deepEqual(st.map(s => [s.spent, s.cur]), [[true, false], [true, false], [false, true], [false, false], [false, false], [false, false]]);
  assert.equal(slotStates({ shots: 3, done: true, outcome: 'bang' }, 6)[3].boom, true);
  const prev = { id: 'a', shots: 1, done: false };
  assert.equal(pullStep(prev, { id: 'a', shots: 2, done: false }), 'safe');
  assert.equal(pullStep(prev, { id: 'a', shots: 1, done: true, outcome: 'bang' }), 'bang');
  assert.equal(pullStep(prev, { id: 'a', shots: 1, done: false }), null, '같은 상태 다시 그림');
  assert.equal(pullStep(prev, { id: 'b', shots: 2, done: false }), null, '다른 판은 연출 없음');
  assert.equal(pullStep(null, { id: 'a', shots: 2, done: false }), null);
  assert.equal(pullStep({ ...prev, done: true }, { id: 'a', shots: 1, done: true, outcome: 'bang' }), null, '끝난 판 다시 그림');
  const svg = rouletteSvg({ id: 'a', shots: 2, done: false }, 6, 1);
  assert.equal((svg.match(/class="ac-hole/g) || []).length, 6);
});

test('소리 순서: 철컥 → 틱, 총알이면 철컥 → 폭발, 움직임 줄이기는 틱 없음', () => {
  const safe = pullCues('safe');
  assert.deepEqual(safe.map(c => c.id), ['revolver.click', 'revolver.tick']);
  assert.equal(safe[1].at, STEP_MS);
  assert.deepEqual(pullCues('bang').map(c => c.id), ['revolver.click', 'vfx.explosion', 'lose']);
  assert.deepEqual(pullCues('safe', { reduced: true }).map(c => c.id), ['revolver.click']);
  assert.deepEqual(pullCues('cash').map(c => c.id), ['win']);
  assert.deepEqual(pullCues('max').map(c => c.id), ['revolver.click', 'revolver.tick', 'win']);
  assert.deepEqual(pullCues(null), []);
  for (const s of ['safe', 'bang', 'max', 'cash']) for (const c of pullCues(s)) assert.ok(SFX_IDS.includes(c.id), c.id);
  for (const s of ['safe', 'bang', 'max']) { const t = pullCues(s).map(c => c.at); assert.deepEqual(t, [...t].sort((a, b) => a - b)); }
});

test('룰렛 휠: 37칸이 한 번씩, 공은 멈춘 칸 각도에서 끝난다', () => {
  assert.deepEqual([...WHEEL_ORDER].sort((a, b) => a - b), Array.from({ length: 37 }, (_, i) => i));
  assert.equal(pocketAngle(0), 0);
  for (const n of WHEEL_ORDER) assert.ok(Math.abs(pocketAngle(n) * 37 / 360 - Math.round(pocketAngle(n) * 37 / 360)) < 1e-9);
  const f = orbitFrames(pocketAngle(17), 5);
  assert.equal(f.spin.at(-1).transform, 'rotate(' + pocketAngle(17) + 'deg)');
  assert.ok(parseFloat(f.spin[0].transform.slice(7)) - pocketAngle(17) === 1800);
  const w = casinoCues('wheel', 'win');
  assert.deepEqual(w.map(c => c.id), ['roulette.spin', 'roulette.stop', 'win']);
  assert.ok(w[1].at < SPIN_MS && w[2].at >= SPIN_MS, '멈춤음은 공이 멈출 때, 결과음은 그 뒤');
  assert.deepEqual(casinoCues('wheel', 'win', { reduced: true }).map(c => c.id), ['win']);
});
