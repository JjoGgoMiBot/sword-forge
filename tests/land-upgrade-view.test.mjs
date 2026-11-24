import test from 'node:test';
import assert from 'node:assert/strict';
import {bigRoad,baccaratRoad} from '../land/baccarat-road.js';
import {rouletteTurnPlan} from '../land/roulette-motion.js';
import {hiloStart,hiloGuess,hiloView,cashOut} from '../server/src/land-arcade.js';
test('equal high-low guess uses one of thirteen ranks, accumulates and settles server payout',()=>{
  const g=hiloStart(100,()=>.5);assert.equal(hiloView(g).equal,12.48);assert.equal(hiloView(g).pEqual,1/13);
  hiloGuess(g,'equal',()=>.5);assert.equal(g.steps,1);assert.equal(hiloView(g).mult,12.48);cashOut(g);assert.equal(g.payout,1248);
  const miss=hiloStart(100,()=>.5);hiloGuess(miss,'equal',()=>.9);assert.equal(miss.outcome,'miss');assert.equal(miss.payout,0);
});
test('all live ranks offer equal payout with expected return no greater than 96 percent',()=>{
  for(let rank=1;rank<=13;rank++){const g=hiloStart(100,()=> (rank-.5)/13),v=hiloView(g);assert.equal(v.equal,12.48);assert.ok(v.equal/13<=.96+1e-9);}
});
test('roulette clocks slow down, lock, then trigger; every move is a full mechanical rotation',()=>{
  for(let shots=0;shots<5;shots++){const p=rouletteTurnPlan(shots);assert.ok(p.triggerAt>p.lockAt);assert.equal(p.lockAt,p.duration);assert.equal(Math.abs((p.angle+shots*60)%360),0);assert.ok(p.ticks.at(-1)-p.ticks.at(-2)>p.ticks[1]-p.ticks[0]);assert.ok(p.ticks.length>=12);}
});
test('baccarat big road attaches ties without changing winning side or overwriting occupied cells',()=>{
  const history=['tie',...Array(8).fill('banker'),'tie','player','player','banker'].map((winner,i)=>({winner,n:i+1}));
  const cells=bigRoad(history);assert.equal(cells[0].ties,1);assert.equal(cells[7].ties,1);assert.equal(cells.length,11);
  assert.equal(new Set(cells.map(c=>c.x+','+c.y)).size,cells.length);assert.ok(cells.every(c=>c.y>=0&&c.y<6));
  assert.ok(baccaratRoad(history).includes('최근 13판'));assert.ok(baccaratRoad([]).includes('첫 판이 끝나면'));
});
test('a blocked big-road run keeps its horizontal tail instead of dropping into a free lower row',()=>{
  const history=[...Array(7).fill('banker'),...Array(7).fill('player')].map((winner,i)=>({winner,n:i+1}));
  assert.deepEqual(bigRoad(history).slice(7).map(c=>[c.x,c.y]),[[1,0],[1,1],[1,2],[1,3],[1,4],[2,4],[3,4]]);
});
