import test from 'node:test';
import assert from 'node:assert/strict';
// 실제 Worker(+D1+Durable Object)로 관리자 API를 시험한다. 일회용 Worker에 아래 값이 필요하다:
//   wrangler dev --var LAND_ADMIN_IDS:12345678901234567 --var LAND_BRIDGE_SECRET:<시험용 아무 값>
const API=process.env.FORGE_TEST_API||'http://127.0.0.1:8907';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(API))throw Error('Tests must use a disposable loopback Worker.');
const ADMIN_ID=process.env.FORGE_TEST_ADMIN_ID||'12345678901234567',BRIDGE=process.env.FORGE_TEST_BRIDGE_SECRET||'local-test-bridge';
const post=async(path,b,headers={})=>{const r=await fetch(API+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(b),signal:AbortSignal.timeout(10000)});return {status:r.status,...await r.json()};};
const tag=Date.now().toString(36).slice(-6).toUpperCase();
let n=0;const uniqueDiscord=()=>String(7e16+Math.floor(Math.random()*1e15)+(n++));
async function resident(prefix){const r=await post('/register',{name:prefix+tag,pin:'12345678'});assert.equal(r.status,200,'가입 실패 '+JSON.stringify(r));await post('/land/player',{token:r.token});return {token:r.token,name:r.name,key:r.name.toLowerCase()};}
async function link(token,discordId){const c=await post('/land/link',{token});assert.equal(c.status,200,'연결 코드 실패 — LAND_BRIDGE_SECRET 필요: '+JSON.stringify(c));const l=await post('/land/bridge/link',{discordId,code:c.code},{Authorization:BRIDGE});assert.equal(l.status,200,JSON.stringify(l));}
const balance=async t=>(await post('/land/player',{token:t.token})).wallet.balance;
const adm=(who,path,b={})=>post('/land/admin/'+path,{token:who.token,...b});
const uid=()=>crypto.randomUUID();
let A,B,U,T;
test('준비: 관리자 A, 일반 연결 B, 연결 안 한 U, 대상 T',async()=>{
  A=await resident('AA');await link(A.token,ADMIN_ID);
  B=await resident('BB');await link(B.token,uniqueDiscord());
  U=await resident('UU');T=await resident('TT');
  const me=await adm(A,'me');assert.equal(me.status,200,'일회용 Worker에 LAND_ADMIN_IDS='+ADMIN_ID+'가 있어야 해요: '+JSON.stringify(me));
});
test('비관리자는 모든 관리자 경로에서 403, 토큰이 틀리면 401',async()=>{
  const reqs={me:{},search:{q:'TT'},player:{key:T.key},adjust:{key:T.key,kind:'grant',amount:100,reason:'침입',id:uid()},log:{}};
  for(const who of [B,U])for(const [p,b] of Object.entries(reqs)){const r=await adm(who,p,b);assert.equal(r.status,403,who.name+' '+p);}
  assert.equal((await post('/land/admin/me',{token:'a'.repeat(64)})).status,401);
  assert.equal((await post('/land/admin/me',{})).status,401);
  assert.equal(await balance(T),1000,'비관리자 시도로 잔액이 바뀌면 안 돼요');
});
test('검색: 이름 일부·디스코드 ID로 찾고, 와일드카드 문자는 글자로 취급한다',async()=>{
  const r=await adm(A,'search',{q:'TT'+tag.slice(0,3)});assert.equal(r.status,200);assert(r.players.some(p=>p.key===T.key&&p.linked===false));
  const d=await adm(A,'search',{q:ADMIN_ID});assert.deepEqual(d.players.map(p=>p.key),[A.key]);assert.equal(d.players[0].linked,true);
  assert.deepEqual((await adm(A,'search',{q:'%'})).players,[]);assert.deepEqual((await adm(A,'search',{q:'_'})).players,[]);
  assert.equal((await adm(A,'search',{q:''})).status,400);assert.equal((await adm(A,'search',{q:5})).status,400);
});
test('지급: 잔액·장부·기록이 함께 바뀐다',async()=>{
  const id=uid();const r=await adm(A,'adjust',{key:T.key,kind:'grant',amount:500,reason:'이벤트 보상',id});
  assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.entry.balance,1500);assert.equal(await balance(T),1500);
  const d=await adm(A,'player',{key:T.key});assert.equal(d.balance,1500);assert.match(d.ledger[0].reason,/관리자 지급 · 이벤트 보상/);
  const log=await adm(A,'log');const e=log.entries.find(x=>x.id===id);
  assert.deepEqual({admin:e.admin,target:e.target,delta:e.delta,balance:e.balance,reason:e.reason},{admin:A.name,target:T.name,delta:500,balance:1500,reason:'이벤트 보상'});
  assert(Math.abs(e.created-Date.now())<60000);assert(log.summary.count>=1&&log.summary.granted>=500);
});
test('같은 요청을 다시 보내도 한 번만 반영·기록된다',async()=>{
  const b={key:T.key,kind:'grant',amount:50,reason:'중복 시험',id:uid()};
  const rs=await Promise.all([adm(A,'adjust',b),adm(A,'adjust',b),adm(A,'adjust',b)]);assert(rs.every(r=>r.status===200));
  assert.equal(await balance(T),1550);
  assert.equal((await adm(A,'log',{limit:50})).entries.filter(x=>x.id===b.id).length,1);
  assert.equal((await adm(A,'adjust',{...b,amount:51})).status,409);
});
test('회수: 잔액 초과는 거절(잔액·기록 그대로), 정확히 잔액만큼은 0까지',async()=>{
  const before=(await adm(A,'log',{limit:50})).entries.length;
  const over=await adm(A,'adjust',{key:T.key,kind:'revoke',amount:1551,reason:'초과',id:uid()});
  assert.equal(over.status,409);assert.match(over.msg,/잔액/);assert.equal(await balance(T),1550);
  assert.equal((await adm(A,'log',{limit:50})).entries.length,before,'실패한 요청은 기록에 남기지 않아요');
  const ok=await adm(A,'adjust',{key:T.key,kind:'revoke',amount:550,reason:'회수 시험',id:uid()});assert.equal(ok.status,200);assert.equal(ok.entry.delta,-550);assert.equal(await balance(T),1000);
});
test('입력 검증: 음수·0·소수·문자·과대 금액, 잘못된 종류·사유·요청 번호·대상',async()=>{
  const base={key:T.key,kind:'grant',amount:10,reason:'검증',id:uid()};
  for(const amount of [-10,0,1.5,'10',null,1e12,10000001])assert.equal((await adm(A,'adjust',{...base,id:uid(),amount})).status,400,String(amount));
  for(const kind of ['give','',null,undefined])assert.equal((await adm(A,'adjust',{...base,id:uid(),kind})).status,400,String(kind));
  for(const reason of ['','   ',undefined,'가'.repeat(81)])assert.equal((await adm(A,'adjust',{...base,id:uid(),reason})).status,400,String(reason));
  assert.equal((await adm(A,'adjust',{...base,id:'x'})).status,400);
  assert.equal((await adm(A,'adjust',{...base,id:uid(),key:'없는주민zz'})).status,404);
  assert.equal((await adm(A,'adjust',{...base,id:uid(),key:undefined})).status,400);
  assert.equal((await adm(A,'player',{key:'없는주민zz'})).status,404);
  assert.equal(await balance(T),1000);
});
test('동시 회수 6건(각 300, 잔액 1000)은 3건만 되고 잔액은 0 미만이 되지 않는다',async()=>{
  const before=(await adm(A,'log',{limit:50})).summary.count;
  const rs=await Promise.all(Array.from({length:6},()=>adm(A,'adjust',{key:T.key,kind:'revoke',amount:300,reason:'동시 시험',id:uid()})));
  assert.equal(rs.filter(r=>r.status===200).length,3);assert.equal(rs.filter(r=>r.status===409).length,3);
  assert.equal(await balance(T),100);
  assert.equal((await adm(A,'log',{limit:50})).summary.count,before+3);
});
test('지급 후 랭킹 거울과 검색 잔액이 따라온다, 기록 limit은 상한을 지킨다',async()=>{
  const r=await adm(A,'search',{q:T.name});assert.equal(r.players.find(p=>p.key===T.key).balance,100);
  assert((await adm(A,'log',{limit:9999})).entries.length<=50);
});
