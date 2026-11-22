import test from 'node:test';
import assert from 'node:assert/strict';
import {QUIZ, initials} from '../server/src/land-quiz.js';

test('초성 퀴즈: 500문항 이상, 정답 중복 없음', () => {
  assert.ok(QUIZ.length >= 500, `문항 ${QUIZ.length}개`);
  assert.equal(new Set(QUIZ.map(q => q[0])).size, QUIZ.length);
});

test('초성 퀴즈: 정답은 한글만, 힌트·분야가 비어 있지 않고 힌트가 정답을 드러내지 않음', () => {
  for (const [answer, hint, field] of QUIZ) {
    assert.match(answer, /^[가-힣]+$/, answer);
    assert.ok(hint && field, answer);
    assert.ok(!hint.includes(answer), `${answer} 힌트에 정답이 그대로 있음`);
  }
});

test('초성 퀴즈: 분야 10개 이상, 분야마다 25문항 이상', () => {
  const count = {};
  for (const q of QUIZ) count[q[2]] = (count[q[2]] || 0) + 1;
  assert.ok(Object.keys(count).length >= 10);
  for (const [f, n] of Object.entries(count)) assert.ok(n >= 25, `${f} ${n}개`);
});

test('initials: 한글은 초성으로, 그 밖의 글자는 그대로', () => {
  assert.equal(initials('대장간'), 'ㄷㅈㄱ');
  assert.equal(initials('까치'), 'ㄲㅊ');
  assert.equal(initials('A1'), 'A1');
});
