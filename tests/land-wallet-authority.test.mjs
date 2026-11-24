import test from 'node:test';
import assert from 'node:assert/strict';
// 재화(초코)는 서버만 바꾼다. 클라이언트가 F12로 잔액·변동량을 만들어 보내도 서버 잔액은 그대로여야 한다.
// 실제 Worker(+D1+Durable Object)가 필요하다. 일회용 Worker 주소를 FORGE_TEST_API로 준다(기본 127.0.0.1:8907).
const API=process.env.FORGE_TEST_API||'http://127.0.0.1:8907';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(API))throw Error('Tests must use a disposable loopback Worker.');
const post=async(path,b)=>{const r=await fetch(API+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b),signal:AbortSignal.timeout(10000)});return {status:r.status,...await r.json()};};
const tag=Date.now().toString(36).slice(-6).toUpperCase();
const uid=()=>crypto.randomUUID();
let me;
// 클라이언트가 보내는 모양 그대로(op·payload·id·issued)에 조작 필드를 얹는다.
const act=(op,payload,extra={})=>post('/land/player',{token:me.token,op,payload,id:uid(),issued:Date.now(),...extra});
const balance=async()=>(await post('/land/player',{token:me.token})).wallet.balance;
test('준비: 새 주민은 서버가 1000을 준다',async()=>{
  const r=await post('/register',{name:'WA'+tag,pin:'12345678'});assert.equal(r.status,200,JSON.stringify(r));
  me={token:r.token,name:r.name};assert.equal(await balance(),1000);
});
test('조회 요청에 잔액·지갑·변동량을 얹어도 무시한다',async()=>{
  const r=await post('/land/player',{token:me.token,balance:999999999,wallet:{balance:999999999},delta:5e8,s:{balance:999999999}});
  assert.equal(r.status,200);assert.equal(r.wallet.balance,1000);assert.equal(await balance(),1000);
});
test('행동 요청의 최상위·payload에 잔액을 얹어도 정해진 보상만 반영된다',async()=>{
  const r=await act('daily',{balance:999999999,delta:999999,wallet:{balance:999999999}},{balance:999999999,delta:999999,wallet:{balance:999999999}});
  assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.wallet.balance,1300);assert.equal(await balance(),1300);
});
test('이미 받은 보상은 다시 못 받고, 조작 값이 있어도 잔액은 그대로다',async()=>{
  const r=await act('daily',{balance:0},{balance:0});assert.notEqual(r.status,200);
  const g=await act('rescue',{balance:0},{balance:0});assert.notEqual(g.status,200,'잔액이 100 이상이면 응원 초코가 없어야 해요');
  assert.equal(await balance(),1300);
});
test('음수·과대·문자 선물 금액은 거절되고 잔액이 늘지 않는다',async()=>{
  for(const amount of [-500,0,1.5,'500',null,1e12,99999999]){
    const r=await act('giftSend',{to:me.name,amount});assert.notEqual(r.status,200,'금액 '+String(amount));
    assert.equal(await balance(),1300,'금액 '+String(amount)+' 뒤 잔액');
  }
});
test('토큰이 없거나 틀리면 잔액을 바꿀 수 없다',async()=>{
  assert.equal((await post('/land/player',{op:'daily',id:uid(),issued:Date.now()})).status,401);
  assert.equal((await post('/land/player',{token:'a'.repeat(64),op:'daily',id:uid(),issued:Date.now()})).status,401);
  assert.equal(await balance(),1300);
});
test('같은 요청 번호에 다른 내용을 보내면 거절되고 같은 내용은 한 번만 반영된다',async()=>{
  const id=uid(),issued=Date.now();
  const a=await post('/land/player',{token:me.token,op:'avatar',payload:{shirt:1,hat:1},id,issued});assert.equal(a.status,200,JSON.stringify(a));
  const b=await post('/land/player',{token:me.token,op:'avatar',payload:{shirt:2,hat:0},id,issued});assert.equal(b.status,409);
  const c=await post('/land/player',{token:me.token,op:'avatar',payload:{shirt:1,hat:1},id,issued});assert.equal(c.status,200);assert.equal(c.replayed,true);
  assert.equal(await balance(),1300);
});
