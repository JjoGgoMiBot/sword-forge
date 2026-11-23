import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {LandPlayer} from '../server/src/land-player.js';
import {adminIds,isAdmin,ADMIN} from '../server/src/land-admin.js';
// 서버 없이 LandPlayer(Durable Object)의 관리자 지급·회수 규칙을 시험한다.
function makePlayer(){
  const db=new DatabaseSync(':memory:');
  const sql={exec(q,...a){const st=db.prepare(q);if(/^\s*SELECT/i.test(q))return {toArray:()=>st.all(...a)};st.run(...a);return {toArray:()=>[]};}};
  const storage={sql,transactionSync(f){db.exec('BEGIN');try{const r=f();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
  const lp=new LandPlayer({storage},{});
  const call=async(path,body)=>{const r=await lp.fetch(new Request('https://player/'+path,{method:'POST',body:JSON.stringify(body)}));return {status:r.status,...await r.json()};};
  return {lp,admin:b=>call('admin',b),user:b=>call('',b),db};
}
const uid=()=>crypto.randomUUID();
const ready=async()=>{const t=makePlayer();assert.equal((await t.user({key:'k',name:'tester',op:'get'})).wallet.balance,1000);return t;};

test('LAND_ADMIN_IDS는 쉼표 목록에서 올바른 디스코드 ID만 허용한다',()=>{
  const env={LAND_ADMIN_IDS:' 12345678901234567 ,abc,,98765432109876543 '};
  assert.deepEqual([...adminIds(env)],['12345678901234567','98765432109876543']);
  assert.equal(isAdmin(env,'12345678901234567'),true);
  for(const x of [undefined,null,'','123',12345678901234567,'12345678901234568','12345678901234567 '])assert.equal(isAdmin(env,x),false,String(x));
  assert.equal(isAdmin({},'12345678901234567'),false,'설정이 없으면 아무도 관리자가 아니에요');
  assert.equal(isAdmin({LAND_ADMIN_IDS:'*'},'12345678901234567'),false);
});
test('지급은 잔액을 늘리고 장부에 사유를 남긴다',async()=>{
  const {admin}=await ready();
  const r=await admin({op:'adjust',id:uid(),delta:500,reason:'관리자 지급 · 이벤트'});
  assert.equal(r.status,200);assert.equal(r.balance,1500);
  const p=await admin({op:'peek'});assert.equal(p.balance,1500);assert.equal(p.ledger[0].reason,'관리자 지급 · 이벤트');assert.equal(p.ledger[0].delta,500);
});
test('회수는 잔액까지만: 정확히 0은 되고 초과는 거절하며 잔액을 건드리지 않는다',async()=>{
  const {admin}=await ready();
  const over=await admin({op:'adjust',id:uid(),delta:-1001,reason:'관리자 회수 · 시험'});
  assert.equal(over.status,409);assert.match(over.msg,/잔액/);assert.equal((await admin({op:'peek'})).balance,1000);
  const exact=await admin({op:'adjust',id:uid(),delta:-1000,reason:'관리자 회수 · 시험'});
  assert.equal(exact.status,200);assert.equal(exact.balance,0);
  assert.equal((await admin({op:'adjust',id:uid(),delta:-1,reason:'관리자 회수 · 시험'})).status,409,'0에서 더 회수 못 해요');
});
test('0·소수·문자·너무 큰 금액·잘못된 요청 번호·빈 사유는 거절한다',async()=>{
  const {admin}=await ready();
  for(const delta of [0,1.5,'100',null,NaN,Infinity,ADMIN.maxAmount+1,-(ADMIN.maxAmount+1),Number.MAX_SAFE_INTEGER+2])assert.equal((await admin({op:'adjust',id:uid(),delta,reason:'x'})).status,400,String(delta));
  assert.equal((await admin({op:'adjust',id:'nope',delta:10,reason:'x'})).status,400);
  assert.equal((await admin({op:'adjust',id:uid(),delta:10,reason:''})).status,400);
  assert.equal((await admin({op:'adjust',id:uid(),delta:10,reason:'가'.repeat(121)})).status,400);
  assert.equal((await admin({op:'shred',id:uid()})).status,404);
  assert.equal((await admin({op:'peek'})).balance,1000);
});
test('같은 요청 번호는 한 번만 반영되고, 내용이 다르면 거절한다',async()=>{
  const {admin}=await ready();const id=uid(),b={op:'adjust',id,delta:300,reason:'관리자 지급 · 중복'};
  assert.equal((await admin(b)).balance,1300);
  const again=await admin(b);assert.equal(again.status,200);assert.equal(again.replayed,true);assert.equal(again.balance,1300);
  assert.equal((await admin({...b,delta:400})).status,409);
  assert.equal((await admin({op:'peek'})).balance,1300);
});
test('동시 회수 요청도 잔액이 0 아래로 내려가지 않는다',async()=>{
  const {admin}=await ready();
  const rs=await Promise.all(Array.from({length:8},()=>admin({op:'adjust',id:uid(),delta:-300,reason:'관리자 회수 · 동시'})));
  assert.equal(rs.filter(r=>r.status===200).length,3);assert.equal(rs.filter(r=>r.status===409).length,5);
  assert.equal((await admin({op:'peek'})).balance,100);
});
test('입장한 적 없는 주민은 만들지 않고 404로 거절한다',async()=>{
  const {admin}=makePlayer();
  assert.equal((await admin({op:'peek'})).status,404);
  assert.equal((await admin({op:'adjust',id:uid(),delta:100,reason:'x'})).status,404);
});
test('일반 사용자 요청으로는 관리자 작업을 부를 수 없다',async()=>{
  const {user,admin}=await ready();
  for(const op of ['adjust','peek','adminAdjust']){const r=await user({key:'k',name:'tester',op,id:uid(),issued:Date.now(),payload:{delta:99999,reason:'x'},delta:99999});assert.notEqual(r.status,200,op);}
  assert.equal((await admin({op:'peek'})).balance,1000);
});
