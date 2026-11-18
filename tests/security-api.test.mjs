// Disposable loopback Worker/D1 only. Direct SQLite changes seed test fixtures;
// they never access a deployed database or real credentials.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,pbkdf2Sync,createHash} from 'node:crypto';
const API='http://127.0.0.1:8797';
const newIp=()=>`2001:db8:${randomBytes(12).toString('hex').match(/.{4}/g).join(':')}`;
async function post(route,body,ip=newIp()){
  const r=await fetch(API+route,{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':ip},body:JSON.stringify(body)});
  return {status:r.status,headers:r.headers,...await r.json()};
}
async function account(){
  const name='QT'+randomBytes(5).toString('hex'),pin='12345678',r=await post('/register',{name,pin});
  assert.equal(r.status,200);return {name,pin,...r};
}
function localDb(){
  const dir=path.resolve('server/.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
  const files=fs.readdirSync(dir).filter(f=>f.endsWith('.sqlite'));
  for(const file of files){
    const db=new DatabaseSync(path.join(dir,file));db.exec('PRAGMA busy_timeout=5000');
    if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='players'").get())return db;
    db.close();
  }
  throw Error('Disposable local D1 was not initialized');
}
test('parallel password guesses are reserved atomically and expired locks recover',async()=>{
  const acc=await account(),ip=newIp();
  const wrong=await Promise.all(Array.from({length:20},()=>post('/login',{name:acc.name,pin:'00000000'},ip)));
  assert.equal(wrong.filter(r=>r.status===401).length,5);
  assert.equal(wrong.filter(r=>r.status===429).length,15);
  assert.equal((await post('/login',{name:acc.name,pin:acc.pin},ip)).status,429);
  const db=localDb();db.prepare('UPDATE players SET lock_until=? WHERE key=?').run(Date.now()-1,acc.name.toLowerCase());db.close();
  assert.equal((await post('/login',{name:acc.name,pin:acc.pin},ip)).status,200);
});
test('logout revokes its token and tokens expire after thirty days',async()=>{
  const acc=await account();
  assert.equal((await post('/load',{token:acc.token})).status,200);
  assert.equal((await post('/logout',{token:acc.token})).status,200);
  assert.equal((await post('/load',{token:acc.token})).status,401);
  const logged=await post('/login',{name:acc.name,pin:acc.pin});assert.equal(logged.status,200);
  const db=localDb();db.prepare('UPDATE tokens SET created=? WHERE key=?').run(Date.now()-31*86400000,acc.name.toLowerCase());db.close();
  assert.equal((await post('/load',{token:logged.token})).status,401);
});
test('new short PINs are rejected while legacy four-digit accounts still log in',async()=>{
  assert.equal((await post('/register',{name:'QL'+randomBytes(4).toString('hex'),pin:'1234'})).status,400);
  const acc=await account(),db=localDb();
  const player=db.prepare('SELECT salt FROM players WHERE key=?').get(acc.name.toLowerCase());
  const hash=pbkdf2Sync('1234',player.salt,20000,32,'sha256').toString('hex');
  db.prepare('UPDATE players SET hash=? WHERE key=?').run(hash,acc.name.toLowerCase());db.close();
  assert.equal((await post('/login',{name:acc.name,pin:'1234'})).status,200);
});
test('request budgets persist in D1 and oversized chunked bodies are rejected',async()=>{
  // Avoid splitting the burst over a fixed-minute boundary.
  const remaining=60000-Date.now()%60000;if(remaining<1500)await new Promise(r=>setTimeout(r,remaining+20));
  const ip=newIp();
  const responses=await Promise.all(Array.from({length:35},()=>post('/login',{name:'QTmissing',pin:'12345678'},ip)));
  assert.equal(responses.filter(r=>r.status===401).length,30);assert.equal(responses.filter(r=>r.status===429).length,5);
  const db=localDb(),key=createHash('sha256').update(`ip:/login:${ip}`).digest('hex');
  assert.equal(db.prepare('SELECT hits FROM request_limits WHERE key=?').get(key).hits,30);db.close();
  const body=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('x'.repeat(5000)));controller.enqueue(new TextEncoder().encode('y'.repeat(5000)));controller.close();}});
  const r=await fetch(API+'/login',{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':newIp()},body,duplex:'half'});
  assert.equal(r.status,413);
});
test('missing events and forged client time cannot advance state or work',async()=>{
  const acc=await account(),auth={token:acc.token};
  const invalid=await post('/action',{...auth,rev:0,requestId:crypto.randomUUID(),action:{type:'event',id:null,accept:true}});
  assert.equal(invalid.status,400);
  let state=JSON.parse((await post('/load',auth)).save);assert.equal(state.rev,0);
  const started=await post('/action',{...auth,rev:state.rev,requestId:crypto.randomUUID(),action:{type:'workStart',kind:'mine'}});assert.equal(started.status,200);state=started.state;
  const w=state.work;
  const early=await post('/action',{...auth,rev:state.rev,requestId:crypto.randomUUID(),now:Date.now()+1e9,action:{type:'workStep',id:w.id,roundId:w.roundId,cell:w.cells.indexOf(w.target),now:Date.now()+1e9}});
  assert.equal(early.status,400);
  const fresh=JSON.parse((await post('/load',auth)).save);assert.equal(fresh.work.step,0);assert.equal(fresh.gold,3000);
  assert.equal(invalid.headers.get('cache-control'),'no-store');
});
test('a token cannot select another account by submitting its name',async()=>{
  const a=await account(),b=await account();
  const r=await post('/action',{token:a.token,name:b.name,key:b.name.toLowerCase(),rev:0,requestId:crypto.randomUUID(),action:{type:'enhance'}});assert.equal(r.status,200);
  assert.equal(JSON.parse((await post('/load',{token:a.token})).save).gold,2920);
  assert.equal(JSON.parse((await post('/load',{token:b.token})).save).gold,3000);
});
