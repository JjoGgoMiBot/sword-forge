import test from 'node:test';
import assert from 'node:assert/strict';
import {newRace,raceBet,raceTick,raceView,raceDue,checkRaceBet,SHARED_RACE} from '../server/src/land-race.js';
const who=i=>({id:'p'+i,key:'k'+i,name:'주민'+i});
test('first participant opens exactly 60 seconds, later joins do not extend the lobby',()=>{
  const s=newRace();raceBet(s,who(1),100,0,1000);raceBet(s,who(2),200,1,30000);
  assert.equal(s.closesAt,61000);assert.equal(raceDue(s,30000),61000);assert.equal(raceView(s,'p1',31000).closesIn,30000);
  assert.throws(()=>raceBet(s,who(3),100,0,61000),/출발/);
  assert.throws(()=>raceBet(s,who(1),100,0,50000),/이미/);
});
test('same room shares progress but never publishes winner, tracks or player wallet keys before finish',()=>{
  const s=newRace();raceBet(s,who(1),100,0,1000);raceBet(s,who(2),100,1,1001);raceTick(s,61000,()=>.001);
  const a=raceView(s,'p1',65000),b=raceView(s,'p2',65000);
  assert.deepEqual(a.positions,b.positions);assert.equal(a.last,null);
  for(const secret of ['winner','tracks','visualSeed','key'])assert.equal(Object.hasOwn(a,secret),false);
  assert.equal(JSON.stringify(a).includes('k1'),false);assert.equal(a.mine.choice,0);assert.equal(b.mine.choice,1);
  assert.equal(raceDue(s,61000),61350);
});
test('solo race runs; restart restoration preserves finish and pays exactly once',()=>{
  let s=newRace();raceBet(s,who(1),100,0,0);raceTick(s,60000,()=>.001);s=JSON.parse(JSON.stringify(s));
  const ev=raceTick(s,60000+SHARED_RACE.runMs);
  assert.equal(s.phase,'done');assert.equal(ev.cashOuts.length,1);assert.equal(ev.cashOuts[0].amount,Math.floor(100*s.horses[0].rate/10));
  assert.equal(raceTick(s,60000+SHARED_RACE.runMs+1).cashOuts.length,0);
  assert.equal(raceView(s,'p1',80000).last.winner,0);
  raceTick(s,s.doneAt+SHARED_RACE.doneMs);assert.equal(s.phase,'idle');assert.equal(s.round,1);assert.equal(s.bets.length,0);
});
test('invalid choices and amounts never enter a shared race',()=>{
  const s=newRace();for(const bet of [0,9,5001,10.2,NaN])assert.throws(()=>checkRaceBet(s,who(1),bet,0,0));
  for(const choice of [-1,5,1.2,'0'])assert.throws(()=>checkRaceBet(s,who(1),100,choice,0));assert.equal(s.phase,'idle');
});
