import test from 'node:test';
import assert from 'node:assert/strict';
import {casinoOutcome,fxPlanFor,playCasinoFx,playSceneFx,settleMs} from '../land/casino-fx.js';

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

test('결과 연출은 움직임이 끝난 뒤에: 릴·말 수만큼 늦춘다',()=>{
 assert.equal(settleMs('slots',3),1050+320*2);
 assert.equal(settleMs('horse',5),1650+55*4);
 assert.equal(settleMs('dice'),1760);
 assert.equal(settleMs('quiz'),0);
});

test('기다리는 중에 취소하면 터뜨리지 않고 조용히 끝난다',async()=>{
 const stage={isConnected:true,querySelectorAll:()=>[]};
 const h=playCasinoFx(stage,{outcome:'win',game:'slots',reduced:false,delay:60});
 h.cancel();await h.done;
 const gone={isConnected:false,querySelectorAll:()=>[]};
 const g=playCasinoFx(gone,{outcome:'win',game:'slots',reduced:false,delay:5});
 await g.done; // 화면이 사라졌으면 그리지 않고 끝난다(document 없이도 통과해야 한다)
});

test('상황 이펙트: 무대·대상이 없거나 움직임 줄이기면 아무것도 안 한다',async()=>{
 for(const h of [playSceneFx(null,'horse'),playSceneFx({querySelectorAll:()=>[]},'horse',{reduced:false}),playSceneFx({querySelectorAll:()=>[1]},'dice',{reduced:false}),playSceneFx({querySelectorAll:()=>[1]},'horse',{reduced:true})]){
  await h.done;h.cancel();
 }
});
