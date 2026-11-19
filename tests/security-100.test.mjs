// Exactly 100 reproducible checks against the actual Worker with disposable in-memory SQLite.
// D1 SQL is exercised here; tests/api.test.mjs also exercises real local workerd/D1.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash,pbkdf2Sync} from 'node:crypto';
import worker from '../server/src/index.js';
const F=globalThis.Forge,token='a'.repeat(64),key='securityqa',salt='fixture-salt',pin='12345678';
const digest=s=>createHash('sha256').update(s).digest('hex');
const oldHash=pbkdf2Sync(pin,salt,20000,32,'sha256').toString('hex');
const cases=[];let fixtureId=0;
function fixture(){
  const db=new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../server/schema.sql',import.meta.url),'utf8'));
  db.exec(fs.readFileSync(new URL('../server/ranking-schema.sql',import.meta.url),'utf8'));
  const s=F.fresh();s.name='SecurityQA';
  db.prepare('INSERT INTO players(key,name,salt,hash,save,saved,created) VALUES(?,?,?,?,?,?,?)').run(key,s.name,salt,oldHash,JSON.stringify(s),Date.now(),Date.now());
  db.prepare('INSERT INTO tokens VALUES(?,?,?)').run(digest(token),key,Date.now());
  function statement(query,args=[]){return {
    bind(...values){return statement(query,values);},
    async first(){return db.prepare(query).get(...args)||null;},
    async all(){return {results:db.prepare(query).all(...args)};},
    async run(){const r=db.prepare(query).run(...args);return {meta:{changes:Number(r.changes)}};}
  };}
  const env={DB:{prepare:statement,async batch(statements){db.exec('BEGIN');try{const values=[];for(const s of statements)values.push(await s.run());db.exec('COMMIT');return values;}catch(e){db.exec('ROLLBACK');throw e;}}}};
  const ip='2001:db8::'+(++fixtureId).toString(16);
  async function request(path,body={},options={}){
    const {method='POST',origin,media='application/json',raw,url='http://127.0.0.1:8798'}=options;
    const headers={'CF-Connecting-IP':ip};if(media!==null)headers['Content-Type']=media;if(origin!==undefined)headers.Origin=origin;
    const req=new Request(url+path,{method,headers,...(!['GET','HEAD'].includes(method)?{body:raw===undefined?JSON.stringify(body):raw}:{})});
    const response=await worker.fetch(req,env);const text=await response.text();
    return {status:response.status,headers:response.headers,text,data:text?JSON.parse(text):null};
  }
  return {db,env,request,state:()=>JSON.parse(db.prepare('SELECT save FROM players WHERE key=?').get(key).save),seed:state=>db.prepare('UPDATE players SET save=? WHERE key=?').run(JSON.stringify(state),key),action:(action,extra={})=>request('/action',{token,cv:F.RULES,rev:0,requestId:crypto.randomUUID(),action,...extra})};
}
const add=(name,run)=>cases.push({name,run});
const reject=(name,action,extra={})=>add(name,async f=>{const before=f.state();const r=await f.action(action,extra);assert.ok(r.status>=400&&r.status<500,JSON.stringify(r));assert.deepEqual(f.state(),before);});

// 01–12: routing, methods and browser origins.
for(const route of ['/__proto__','/constructor','/toString','/hasOwnProperty','/admin','/action/'])add('없는 주소 '+route,async f=>assert.equal((await f.request(route)).status,404));
for(const method of ['GET','PUT','DELETE'])add('행동 메서드 제한 '+method,async f=>assert.equal((await f.request('/action',{}, {method})).status,405));
for(const origin of ['https://evil.example','null'])add('외부 출처 거절 '+origin,async f=>assert.equal((await f.request('/load',{token},{origin})).status,403));
add('운영 API에서 localhost 출처 차단',async f=>assert.equal((await f.request('/load',{token},{origin:'http://localhost:5188',url:'https://sword-forge-api.aicore-sj-relay.workers.dev'})).status,403));

// 13–24: bounded JSON and credential parsing, no object-to-string coercion.
for(const raw of ['{','null','[]','"text"','123'])add('잘못된 JSON 객체 '+raw,async f=>assert.equal((await f.request('/login',{}, {raw})).status,400));
for(const media of ['text/plain','application/x-www-form-urlencoded',null])add('JSON 이외 형식 '+media,async f=>assert.equal((await f.request('/login',{}, {media})).status,415));
add('8192바이트 초과 본문 차단',async f=>assert.equal((await f.request('/login',{}, {raw:' '.repeat(8193)})).status,413));
for(const name of [{toString:null},['SecurityQA'],123])add('닉네임 자료형 '+JSON.stringify(name),async f=>assert.equal((await f.request('/login',{name,pin})).status,401));

// 25–36: token shape, expiration and revocation.
for(const value of [undefined,null,123,{},[],token.slice(1),'a'.repeat(65),'z'.repeat(64),'A'.repeat(64),'b'.repeat(64)])add('인증 토큰 거절 '+JSON.stringify(value),async f=>assert.equal((await f.request('/load',{token:value})).status,401));
add('30일 만료 토큰 거절',async f=>{f.db.prepare('UPDATE tokens SET created=?').run(Date.now()-31*86400000);assert.equal((await f.request('/load',{token})).status,401);});
add('로그아웃한 토큰 재사용 거절',async f=>{assert.equal((await f.request('/logout',{token})).status,200);assert.equal((await f.request('/load',{token})).status,401);});

// 37–48: protocol version, UUID structure and exact revision.
for(const rev of [-1,0.5,'0',null,1,Number.MAX_SAFE_INTEGER+1])reject('기록 버전 거절 '+JSON.stringify(rev),{type:'enhance'},{rev});
for(const requestId of ['-'.repeat(36),'a'.repeat(36),'not-a-uuid',null])reject('요청 UUID 거절 '+JSON.stringify(requestId),{type:'enhance'},{requestId});
for(const cv of [F.RULES-1,String(F.RULES)])reject('클라이언트 규칙 버전 '+cv,{type:'enhance'},{cv});

// 49–68: action type/field/value validation, including prototype/coercion payloads.
for(const action of [null,[],{},{type:[]},{type:'__proto__'},{type:'constructor'},{type:'toString'},{type:'grantGold'},{type:'stat',key:['dex']},{type:'stat',key:'__proto__'},{type:'stat',key:'constructor'},{type:'useProt',value:'false'},{type:'event',id:'x',accept:'true'},{type:'event',id:null,accept:true},{type:'dismissEvent',id:[]},{type:'workStart',kind:['mine']},{type:'workStep',id:'x',roundId:'y',cell:'1'},{type:'workStep',id:'x',roundId:'y',cell:1.5},{type:'workStep',id:'x',roundId:'y',cell:-1},{type:'workStep',id:'x',roundId:'y',cell:6}])reject('행동 형식 '+JSON.stringify(action),action);

// 69–80: clients cannot submit economic values, RNG, time or entire saves as actions.
for(const [field,value] of Object.entries({gold:1e12,lv:20,shard:99999,prot:99999,price:1e12,reward:1e12,now:Date.now()+1e12,rng:0,result:'ok',state:{lv:20},save:{gold:1e12},'__unused__':true}))reject('행동에 위조한 '+field,{type:'enhance',[field]:value});

// 81–90: state ownership and exactly-once economic effects.
add('구형 저장 업로드 차단',async f=>{assert.equal((await f.request('/save',{token,save:JSON.stringify({lv:20,gold:1e12})})).status,409);assert.equal(f.state().gold,3000);});
add('가입 시 제출한 진행도 무시',async f=>{const r=await f.request('/register',{name:'FreshQA',pin,save:JSON.stringify({gold:1e12,lv:20}),best:20});assert.equal(r.status,200);assert.equal(JSON.parse(r.data.save).gold,3000);assert.equal(JSON.parse(r.data.save).lv,0);});
add('토큰 소유자만 변경하고 난수·시간은 서버가 결정',async f=>{const r=await f.action({type:'enhance'},{name:'other',key:'other',gold:1e12,lv:20,now:Date.now()+1e12,random:0});assert.equal(r.status,200);assert.equal(f.state().gold,2920);assert.ok(f.state().lv<=2);assert.ok(f.state().t<=Date.now());});
add('동일 요청 재전송은 1회만 결제',async f=>{const requestId=crypto.randomUUID();const a=await f.action({type:'enhance'},{requestId});const b=await f.action({type:'enhance'},{requestId});assert.equal(a.status,200);assert.equal(b.data.replayed,true);assert.equal(f.state().st.tries,1);assert.equal(f.state().gold,2920);});
add('서로 다른 동시 강화 요청은 1개만 반영',async f=>{const r=await Promise.all([f.action({type:'enhance'}),f.action({type:'enhance'})]);assert.deepEqual(r.map(x=>x.status).sort(),[200,409]);assert.equal(f.state().st.tries,1);});
add('작업 시간 위조로 조기 보상 불가',async f=>{const a=await f.action({type:'workStart',kind:'mine'}),s=a.data.state,w=s.work;const r=await f.action({type:'workStep',id:w.id,roundId:w.roundId,cell:w.cells.indexOf(w.target)},{rev:s.rev,now:Date.now()+1e12});assert.equal(r.status,400);assert.equal(f.state().gold,3000);assert.equal(f.state().work.step,0);});
add('판매한 무기 재판매 불가',async f=>{const s=f.state();s.lv=3;s.path='blade';f.seed(s);const a=await f.action({type:'sell'});assert.equal(a.status,200);const next=a.data.state;next.nextAction=0;f.seed(next);assert.equal((await f.action({type:'sell'},{rev:next.rev})).status,400);assert.equal(f.state().gold,3180);});
add('진행 이벤트 없는 보상 청구 거절',async f=>assert.equal((await f.action({type:'event',id:'missing',accept:true})).status,400));
add('스탯 포인트 없이 능력치 증가 불가',async f=>{assert.equal((await f.action({type:'stat',key:'dex'})).status,400);assert.equal(f.state().smith.st.dex,0);});
add('성공 확률·피로·균열 위조는 저장되지 않음',async f=>{await f.action({type:'enhance'},{pity:10,fat:0,crack:9,smith:{lv:60,st:{dex:25}}});const s=f.state();assert.equal(s.crack,0);assert.equal(s.smith.st.dex,0);assert.equal(s.smith.lv,1);});

// 91–100: authentication storage, public output and browser execution policy.
add('비밀번호를 원문 저장하지 않고 강화된 해시 사용',async f=>{const r=await f.request('/register',{name:'HashQA',pin});assert.equal(r.status,200);const p=f.db.prepare('SELECT hash FROM players WHERE key=?').get('hashqa');assert.match(p.hash,/^pbkdf2:100000:[0-9a-f]{64}$/);});
add('기존 비밀번호 로그인과 해시 자동 이전',async f=>{const r=await f.request('/login',{name:'SecurityQA',pin});assert.equal(r.status,200);assert.match(f.db.prepare('SELECT hash FROM players WHERE key=?').get(key).hash,/^pbkdf2:100000:/);assert.equal((await f.request('/login',{name:'SecurityQA',pin})).status,200);});
add('병렬 로그인 추측은 5회에서 잠금',async f=>{const r=await Promise.all(Array.from({length:10},()=>f.request('/login',{name:'SecurityQA',pin:'00000000'})));assert.equal(r.filter(x=>x.status===401).length,5);assert.equal(r.filter(x=>x.status===429).length,5);});
add('정상·오류 응답 캐시 금지 및 MIME 보호',async f=>{for(const r of [await f.request('/load',{token}),await f.request('/load',{token:'bad'})]){assert.equal(r.headers.get('Cache-Control'),'no-store');assert.equal(r.headers.get('X-Content-Type-Options'),'nosniff');assert.equal(r.headers.get('Referrer-Policy'),'no-referrer');}});
add('공개 랭킹에서 해시·토큰·개인 저장값 제외',async f=>{const r=await f.request('/ranking',{}, {method:'GET'});assert.equal(r.status,200);assert.deepEqual(Object.keys(r.data).sort(),['at','top']);for(const p of r.data.top)assert.deepEqual(Object.keys(p).sort(),['best','name','rank']);assert.ok(!r.text.includes(token)&&!r.text.includes(oldHash));});
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
add('CSP는 임의 인라인 스크립트·eval 차단',async()=>{const policy=html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];const scripts=policy.match(/script-src ([^;]+)/)[1];assert.ok(!scripts.includes('unsafe-inline')&&!scripts.includes('unsafe-eval'));assert.ok(policy.includes("object-src 'none'")&&policy.includes("base-uri 'none'"));});
add('실제 UI 스크립트의 CSP 해시 일치',async()=>{for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)){const hash=createHash('sha256').update(m[1].replace(/\r\n?/g,'\n')).digest('base64');assert.ok(html.includes("'sha256-"+hash+"'"));}});
add('HTML 이벤트 속성에 실행 코드가 없음',async()=>{assert.ok(!/\s(?:onclick|onerror|onload)="/.test(html));assert.ok(!html.includes('javascript:'));});
add('다른 탭의 저장값을 계정 상태로 채택하지 않음',async()=>{const section=html.slice(html.indexOf('// Cross-tab storage'),html.indexOf('document.addEventListener("visibilitychange"'));assert.ok(section.includes('cloudBoot()'));assert.ok(!section.includes('Forge.normalize')&&!section.includes('JSON.parse'));});
add('개발자 도구·전체화면 키를 보안 경계로 사용하지 않음',async()=>{assert.ok(!/e\.(?:key|code)\s*===?\s*["']F1[12]["']/.test(html));assert.ok(html.includes('Accounts are mandatory: every roll is decided by the server.'));});

assert.equal(cases.length,100,'Keep the review manifest at exactly 100 checks.');
for(const [index,c] of cases.entries())test(`${String(index+1).padStart(3,'0')} ${c.name}`,async()=>{const f=fixture();try{await c.run(f);}finally{f.db.close();}});

for(const action of [{type:'useProt',value:false},{type:'workStart',kind:'mine'},{type:'sell'}])test('랭킹: 과거 +20 저장은 '+action.type+'로 등록되지 않음',async()=>{
  const f=fixture();try{const s=f.state();s.lv=20;s.path='blade';s.best=20;f.seed(s);assert.equal((await f.action(action)).status,200);const p=f.db.prepare('SELECT best,best_at FROM players WHERE key=?').get(key);assert.equal(p.best,0);assert.equal(p.best_at,0);}finally{f.db.close();}
});
test('랭킹: 클라이언트 best·rank·달성시각을 무시하고 실제 성공만 기록',async()=>{
  const f=fixture(),original=crypto.getRandomValues;
  crypto.getRandomValues=a=>a.fill(2147483648);
  try{const r=await f.action({type:'enhance'},{best:20,rank:1,best_at:1,save:{lv:20}});assert.equal(r.status,200);assert.equal(r.data.state.lv,1);const p=f.db.prepare('SELECT best,best_at FROM players WHERE key=?').get(key);assert.equal(p.best,1);assert.ok(p.best_at>1);}finally{crypto.getRandomValues=original;f.db.close();}
});
test('랭킹: 유지 판정과 +19 균열은 새로 달성한 단계가 아님',async()=>{
  const f=fixture(),original=crypto.getRandomValues;
  try{for(const [level,draw] of [[18,2147483648],[19,0]]){const s=F.fresh();s.lv=level;s.path='blade';s.gold=1e9;f.seed(s);crypto.getRandomValues=a=>a.fill(draw);const r=await f.action({type:'enhance'});assert.equal(r.status,200);assert.equal(r.data.state.lv,level);assert.equal(f.db.prepare('SELECT best FROM players WHERE key=?').get(key).best,0);}}finally{crypto.getRandomValues=original;f.db.close();}
});
test('인증: 검증 후 쓰기 직전 토큰이 폐기돼도 결제·랭킹은 반영되지 않음',async()=>{
  const f=fixture(),prepare=f.env.DB.prepare;
  f.env.DB.prepare=query=>{if(query.startsWith('UPDATE players SET save=?,saved=?,best_at='))f.db.prepare('DELETE FROM tokens').run();return prepare(query);};
  try{const before=f.state();assert.equal((await f.action({type:'enhance'})).status,401);assert.deepEqual(f.state(),before);}finally{f.db.close();}
});
