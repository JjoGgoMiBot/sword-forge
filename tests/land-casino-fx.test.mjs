import test from 'node:test';
import assert from 'node:assert/strict';
import {casinoOutcome,fxPlanFor,playCasinoFx} from '../land/casino-fx.js';

test('결과 분류: 상황마다 다른 연출 이름을 낸다',()=>{
 assert.equal(casinoOutcome(null,'slots'),'idle');
 assert.equal(casinoOutcome({bet:10,payout:200},'slots'),'jackpot');
 assert.equal(casinoOutcome({bet:10,payout:30},'slots'),'win');
 assert.equal(casinoOutcome({bet:10,payout:10},'dice'),'draw');
 assert.equal(casinoOutcome({bet:10,payout:0},'dice'),'loss');
 assert.equal(casinoOutcome({bet:'x',payout:0},'dice'),'idle');
 assert.equal(casinoOutcome({round:{done:false}},'blackjack'),'deal');
 assert.equal(casinoOutcome({round:{done:true,outcome:'blackjack'}},'blackjack'),'blackjack');
 assert.equal(casinoOutcome({round:{done:true,outcome:'push'}},'blackjack'),'draw');
 assert.equal(casinoOutcome({round:{done:true,outcome:'lose'}},'blackjack'),'loss');
 assert.equal(casinoOutcome({correct:true},'quiz'),'win');
 assert.equal(casinoOutcome({correct:false},'quiz'),'loss');
});

test('연출표: 잭팟 > 블랙잭 > 승리 순으로 세고, 모르는 상황은 아무것도 안 한다',()=>{
 const j=fxPlanFor('jackpot','slots'),b=fxPlanFor('blackjack','slots'),w=fxPlanFor('win','slots');
 assert.ok(j.dur>b.dur&&b.dur>w.dur&&j.sparks>b.sparks&&b.sparks>w.sparks&&j.coins>w.coins);
 assert.ok(fxPlanFor('loss','horse').dust>0&&fxPlanFor('loss','horse').coins===0);
 assert.equal(fxPlanFor('idle','slots'),null);
 assert.equal(fxPlanFor('deal','blackjack'),null);
});

test('재생 실패 경로: 무대가 없거나 연출이 없으면 조용히 끝난다',async()=>{
 const a=playCasinoFx(null,{outcome:'win',game:'slots'});
 await a.done;a.cancel();
 const b=playCasinoFx({},{outcome:'idle',game:'slots'});
 await b.done;
});
