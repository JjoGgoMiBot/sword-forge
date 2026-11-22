import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/src/index.js';

for (const origin of ['https://jjoggomibot.github.io', 'https://seungjaehh.github.io']) {
  test(`migration keeps API available to ${origin}`, async () => {
    for (const method of ['GET', 'OPTIONS']) {
      const response = await worker.fetch(new Request('https://example.test/', {
        method, headers: { Origin: origin }
      }), {}, {});
      assert.equal(response.status, method === 'OPTIONS' ? 204 : 200);
      assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
    }
  });
}
test('unrelated origins remain rejected after migration', async () => {
  const response = await worker.fetch(new Request('https://example.test/', {
    headers: { Origin: 'https://unrelated.example' }
  }), {}, {});
  assert.equal(response.status, 403);
});
