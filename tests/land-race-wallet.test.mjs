import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {LandRoom} from '../server/src/land.js';
import {LandPlayer} from '../server/src/land-player.js';
import {raceTick,SHARED_RACE} from '../server/src/land-race.js';
function database(){const db=new DatabaseSync(':memory:');return {db,sql:{exec(q,...args){const rows=db.prepare(q).all(...args);return {toArray:()=>rows};}},transactionSync(fn){db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};}
function fixture(){
  const roomDb=database(),playerDb=database(),player=new LandPlayer({storage:playerDb},{}),sockets=[],alarms=[];let drop=false;
  const env={DB:{prepare(){return {bind(){return {run:async()=>({}),all:async()=>({results:[]})};},run:async()=>({})};}},LAND_PLAYERS:{idFromName:k=>k,get:()=>({async fetch(req){const result=await player.fetch(req);if(drop){drop=false;throw Error('response lost after commit');}return result;}})}};
  const ctx={storage:{...roomDb,setAlarm:async n=>alarms.push(n)},getWebSockets:()=>sockets,blockConcurrencyWhile:fn=>fn()},room=new LandRoom(ctx,env);
  const a={id:'resident',key:'test-key',name:'tester',room:'public:1'},ws={readyState:1,sent:[],attachment:a,deserializeAttachment(){return {...this.attachment};},serializeAttachment(x){this.attachment=x;},send(s){this.sent.push(JSON.parse(s));}};sockets.push(ws);
  const get=async()=>{const r=await player.fetch(new Request('https://player/',{method:'POST',body:JSON.stringify({key:a.key,name:a.name,op:'get'})}));return r.json();};
  return {room,roomDb,playerDb,player,ctx,env,a,ws,get,drop(){drop=true;},close(){roomDb.db.close();playerDb.db.close();}};
}
test('race buy-in recovers a committed debit with lost reply, and repeat request cannot debit twice',async()=>{
  const f=fixture();try{
    const m={requestId:crypto.randomUUID(),issued:Date.now(),round:0,raceId:f.room.arcadeState('horse').id,bet:100,choice:0};f.drop();const errors=[];
    await f.room.raceMessage(f.ws,f.a,m,Date.now(),e=>errors.push(e));assert.equal((await f.get()).wallet.balance,900);assert.equal(f.room.arcadeState('horse').bets.length,0);
    const pending=f.room.sql.exec("SELECT * FROM race_requests WHERE state='pending'").toArray()[0];assert.ok(pending);
    // Durable Object re-created using the exact same persisted database.
    const before=f.room.arcadeState('horse').horses;const restored=new LandRoom(f.ctx,f.env);assert.deepEqual(restored.arcadeState('horse').horses,before);await restored.raceRecoverOne(pending);assert.equal(restored.arcadeState('horse').bets.length,1);assert.equal((await f.get()).wallet.balance,900);
    await restored.raceMessage(f.ws,f.a,m,Date.now(),e=>errors.push(e));assert.equal((await f.get()).wallet.balance,900);assert.equal(restored.arcadeState('horse').bets.length,1);
    const s=restored.arcadeState('horse');raceTick(s,s.closesAt,()=>.001);const ev=raceTick(s,s.startAt+SHARED_RACE.runMs);await restored.arcadeCommit('horse',ev);
    const expected=900+Math.floor(100*s.horses[0].rate/10);assert.equal((await f.get()).wallet.balance,expected);await restored.pokerPay();assert.equal((await f.get()).wallet.balance,expected);
  }finally{f.close();}
});
test('late recovery refunds a confirmed race debit after its intended round, once',async()=>{
  const f=fixture();try{const m={requestId:crypto.randomUUID(),issued:Date.now(),round:0,raceId:f.room.arcadeState('horse').id,bet:100,choice:0};f.drop();await f.room.raceMessage(f.ws,f.a,m,Date.now(),()=>{});const row=f.room.sql.exec("SELECT * FROM race_requests WHERE state='pending'").toArray()[0];const s=f.room.arcadeState('horse');s.round=2;s.phase='idle';await f.room.raceRecoverOne(row);assert.equal((await f.get()).wallet.balance,1000);assert.equal(s.bets.length,0);await f.room.pokerPay();assert.equal((await f.get()).wallet.balance,1000);}finally{f.close();}
});
test('baccarat result history persists and replays without duplicating a road entry',async()=>{
  const f=fixture();try{const b={key:'test-key',name:'tester',op:'play',payload:{game:'baccarat',bet:100,choice:'player'},id:crypto.randomUUID(),issued:Date.now()},request=()=>new Request('https://player/',{method:'POST',body:JSON.stringify(b)});const one=await (await f.player.fetch(request())).json();const two=await (await f.player.fetch(request())).json();assert.equal(one.baccaratHistory.length,1);assert.deepEqual(one.baccaratHistory,two.baccaratHistory);const restored=new LandPlayer({storage:f.playerDb},{});const result=await (await restored.fetch(new Request('https://player/',{method:'POST',body:JSON.stringify({key:b.key,name:b.name,op:'get'})}))).json();assert.equal(result.baccaratHistory.length,1);assert.equal(result.baccaratHistory[0].winner,one.result.winner);}finally{f.close();}
});
