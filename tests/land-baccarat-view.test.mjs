import test from 'node:test';
import assert from 'node:assert/strict';
import {baccaratScene,baccaratOutcome} from '../land/baccarat-view.js';
const result={player:[{rank:2,suit:1},{rank:3,suit:0},{rank:1,suit:3}],banker:[{rank:4,suit:2},{rank:5,suit:0}],playerTotal:6,bankerTotal:9,winner:'banker',choice:'player',bet:100,payout:0};
test('baccarat displays all dealt cards, both server totals and the submitted choice',()=>{
  const html=baccaratScene(result);
  assert.equal((html.match(/class="ac-card(?: red)?"/g)||[]).length,5);
  for(const label of ['6<small>점','9<small>점','이번 판 베팅 · <b>플레이어','aria-label="A♣"'])assert.ok(html.includes(label),label);
  assert.equal((html.match(/ac-bacc-hand winner/g)||[]).length,1);
  assert.deepEqual(baccaratOutcome(result),{text:'뱅커 승리 · 미당첨',kind:'loss'});
});
test('tie distinguishes a returned side bet from a winning tie bet',()=>{
  const tie={...result,winner:'tie',playerTotal:6,bankerTotal:6,payout:100};
  assert.deepEqual(baccaratOutcome(tie),{text:'무승부 · 베팅금 반환',kind:''});
  assert.equal((baccaratScene(tie).match(/무승부/g)||[]).length,2);
  assert.deepEqual(baccaratOutcome({...tie,choice:'tie',payout:1000}),{text:'무승부 · 당첨!',kind:'win'});
});
test('before a deal there are only card backs and no invented scores',()=>{
  const html=baccaratScene();
  assert.equal((html.match(/ac-card-back/g)||[]).length,4);
  assert.equal((html.match(/—<small>점/g)||[]).length,2);
  assert.equal(html.includes('이번 판 베팅'),false);
});
