import test from 'node:test';
import assert from 'node:assert/strict';
import {stickKeys, clampKnob, STICK} from '../land/joystick.js';

const at = deg => [Math.cos(deg * Math.PI / 180) * 40, Math.sin(deg * Math.PI / 180) * 40];

test('데드존 안의 작은 움직임은 멈춤', () => {
  assert.deepEqual(stickKeys(0, 0), []);
  assert.deepEqual(stickKeys(5, -6), []);
  assert.deepEqual(stickKeys(STICK.radius * STICK.deadZone - 0.1, 0), []);
});

test('8방향: 각 45° 구간 가운데는 정확히 그 방향', () => {
  const expect = {0: ['ArrowRight'], 45: ['ArrowDown', 'ArrowRight'], 90: ['ArrowDown'], 135: ['ArrowDown', 'ArrowLeft'],
    180: ['ArrowLeft'], 225: ['ArrowUp', 'ArrowLeft'], 270: ['ArrowUp'], 315: ['ArrowUp', 'ArrowRight']};
  for (const [deg, keys] of Object.entries(expect)) assert.deepEqual(stickKeys(...at(+deg)), keys, deg + '°');
});

test('구간 경계(22.5°) 양쪽이 서로 다른 방향으로 갈린다', () => {
  assert.deepEqual(stickKeys(...at(20)), ['ArrowRight']);
  assert.deepEqual(stickKeys(...at(25)), ['ArrowDown', 'ArrowRight']);
});

test('깨진 입력은 멈춤으로', () => {
  assert.deepEqual(stickKeys(NaN, 3), []);
  assert.deepEqual(stickKeys(Infinity, 0), []);
});

test('손잡이는 반지름 밖으로 나가지 않는다', () => {
  const k = clampKnob(300, 400);
  assert.ok(Math.abs(Math.hypot(k.x, k.y) - STICK.radius) < 1e-9);
  assert.deepEqual(clampKnob(3, 4), {x: 3, y: 4});
});
