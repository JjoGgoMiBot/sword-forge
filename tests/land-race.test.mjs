import test from 'node:test';
import assert from 'node:assert/strict';
import {RACE,raceScript,sampler,marginName,raceMarkup,playRace} from '../land/race-script.js';
import {horses} from '../server/src/land-games.js';

const sample=(seed,winner)=>{let a=seed;const r=()=>((a=(a*16807)%2147483647)/2147483647);const hs=horses(r);return {game:'horse',horses:hs,winner,choice:seed%5,bet:100,payout:0};};

test('경주 대본: 서버가 정한 우승 말이 결승선에 가장 먼저 닿는다(5000판)',()=>{
 for(let s=1;s<=5000;s++){const res=sample(s,s%5),sc=raceScript(res);
  const at=sc.lanes.map(sampler);
  assert.equal(sc.order[0],res.winner);
  assert.ok(Math.abs(at[res.winner](RACE.finish)-1)<1e-9);
  for(let i=0;i<5;i++)if(i!==res.winner)assert.ok(at[i](RACE.finish)<1,'다른 말이 먼저 들어옴 '+s);
 }
});

test('경주 대본: 말은 뒤로 가지 않고, 게이트 전에는 제자리, 결과마다 같은 경주',()=>{
 for(let s=1;s<=400;s++){const res=sample(s,(s*3)%5),sc=raceScript(res);
  assert.deepEqual(sc,raceScript(res));
  for(const keys of sc.lanes){const at=sampler(keys);let prev=-1;
   assert.equal(at(RACE.gate-1),0);
   for(let t=0;t<=RACE.finish+RACE.runout;t+=20){const q=at(t);assert.ok(q>=prev-1e-9,'역주행 '+s);prev=q;}
   assert.ok(at(RACE.finish+RACE.runout)<1.09);}
 }
});

test('경주 대본: 중반에 순위가 바뀌고, 막판은 사진 판정할 만큼 붙는다',()=>{
 let changed=0,close=0;
 for(let s=1;s<=1000;s++){const res=sample(s,s%5),sc=raceScript(res),at=sc.lanes.map(sampler);
  const lead=t=>at.map(f=>f(t)).reduce((b,q,i,a)=>q>a[b]?i:b,0);
  if(new Set([2600,4200,5800,7400,8600,RACE.finish].map(lead)).size>1)changed++;
  if(1-at[sc.order[1]](RACE.finish)<0.016)close++;
 }
 assert.ok(changed>950,'선두가 바뀐 경주 '+changed);
 assert.equal(close,1000);
});

test('경주 시간 8~12초, 착차 이름, 깨진 결과는 조용히',()=>{
 assert.ok(RACE.settle>=8000&&RACE.settle<=12000&&RACE.gate<RACE.finish&&RACE.finish<RACE.settle);
 assert.equal(marginName(0.005),'코 차이');assert.equal(marginName(0.2),'2마신 이상');
 assert.equal(raceScript(null),null);assert.equal(raceScript({horses:[{name:'a',rate:20}],winner:3}),null);
 playRace(null,null).cancel();
 const html=raceMarkup({horses:[{name:'<b>',rate:20}]},null,{esc:s=>s.replace(/</g,'&lt;')});
 assert.ok(!html.includes('<b>')&&html.includes('게이트'));
});
