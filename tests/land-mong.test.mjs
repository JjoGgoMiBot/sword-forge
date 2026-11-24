import test from 'node:test';
import assert from 'node:assert/strict';
import {avatar} from '../land/world.js';
import {MONG_NAMES, MONG_COUNT, drawMong} from '../land/mong-art.js';

test('캐릭터 번호는 범위 안만 받고 나머지는 사람 모습(0)으로 돌린다', () => {
  assert.equal(avatar({char: 3}).char, 3);
  assert.equal(avatar({char: 6}).char, 6);
  for (const bad of [7, -1, 1.5, '2', null, undefined, NaN]) assert.equal(avatar({char: bad}).char, 0, String(bad));
  assert.equal(avatar().char, 0);
  assert.equal(avatar({shirt: 2, char: 4}).shirt, 2);
});
test('먼작귀 이름은 사람 모습 포함 7개이고 서버가 받는 개수와 같다', () => {
  assert.equal(MONG_COUNT, 7);
  assert.equal(new Set(MONG_NAMES).size, 7);
  assert.equal(avatar({char: MONG_COUNT - 1}).char, MONG_COUNT - 1);
  assert.equal(avatar({char: MONG_COUNT}).char, 0);
});
test('캐릭터 1~6은 그려지고 0과 범위 밖은 그리지 않는다(사람 모습으로 넘어간다)', () => {
  const calls = [];
  const g = new Proxy({}, {get: (_, k) => (...a) => { calls.push(k); }, set: () => true});
  for (let i = 1; i < MONG_COUNT; i++) assert.equal(drawMong(g, i, 1, 1, 0), true, 'char ' + i);
  assert.equal(drawMong(g, 0), false);
  assert.equal(drawMong(g, 99), false);
  assert.ok(calls.length > 100);
});
