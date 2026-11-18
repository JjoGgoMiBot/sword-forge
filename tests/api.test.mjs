// Run only against a disposable LOCAL Wrangler/D1 instance.
import test from 'node:test';
import assert from 'node:assert/strict';
const API='http://127.0.0.1:8797';
async function post(path,b){const r=await fetch(API+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});return {status:r.status,...await r.json()};}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
test('server rejects save forgery, duplicate requests, stale revisions and job replay',async()=>{
  const name='QA'+Date.now().toString(36).slice(-8),pin='12345678';
  const acc=await post('/register',{name,pin,save:JSON.stringify({gold:1e12,lv:20})});assert.equal(acc.status,200);
  let s=JSON.parse(acc.save);assert.equal(s.gold,3000);assert.equal(s.lv,0);
  const auth={token:acc.token};
  assert.equal((await post('/save',{...auth,save:JSON.stringify({gold:1e12})})).status,409);
  const b={...auth,rev:s.rev,requestId:crypto.randomUUID(),action:{type:'enhance'}};
  const both=await Promise.all([post('/action',b),post('/action',b)]);assert.ok(both.some(r=>r.status===200));
  let loaded=await post('/load',auth);s=JSON.parse(loaded.save);assert.equal(s.st.tries,1);assert.equal(s.gold,2920);
  const repeat=await post('/action',b);assert.equal(repeat.status,200);assert.equal(repeat.replayed,true);assert.equal(repeat.state.st.tries,1);
  assert.equal((await post('/action',{...b,requestId:crypto.randomUUID()})).status,409);
  await sleep(700);
  if(s.event){const ev=await post('/action',{...auth,rev:s.rev,requestId:crypto.randomUUID(),action:{type:'event',id:s.event.id,accept:false}});s=ev.state;}
  const start=await post('/action',{...auth,rev:s.rev,requestId:crypto.randomUUID(),action:{type:'workStart',kind:'chores'}});assert.equal(start.status,200);s=start.state;
  const w=s.work,body={...auth,rev:s.rev,requestId:crypto.randomUUID(),action:{type:'workStep',id:w.id,roundId:w.roundId,cell:w.cells.indexOf(w.target)}};
  assert.equal((await post('/action',body)).status,400);
  await sleep(1000);
  const race=await Promise.all([post('/action',body),post('/action',{...body,requestId:crypto.randomUUID()})]);assert.deepEqual(race.map(x=>x.status).sort(),[200,409]);
  s=JSON.parse((await post('/load',auth)).save);assert.equal(s.work.step,1);assert.equal(s.gold,2920);
  const old=await post('/action',{...body,rev:s.rev,requestId:crypto.randomUUID()});assert.equal(old.status,400);
  for(let i=1;i<4;i++){await sleep(1000);const q=s.work;const r=await post('/action',{...auth,rev:s.rev,requestId:crypto.randomUUID(),action:{type:'workStep',id:q.id,roundId:q.roundId,cell:q.cells.indexOf(q.target)}});assert.equal(r.status,200);s=r.state;}
  assert.equal(s.gold,3100);assert.equal(s.st.jobs,1);assert.equal(s.work,null);
  const login=await post('/login',{name,pin});assert.equal(login.status,200);assert.equal(JSON.parse(login.save).gold,3100);
  assert.equal((await post('/action',{token:'a'.repeat(64),rev:0,requestId:crypto.randomUUID(),action:{type:'sell'}})).status,401);
});
