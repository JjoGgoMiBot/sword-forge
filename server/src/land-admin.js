// 쪼꼬미랜드 관리자 API. 로그인은 기존 로그인 토큰 → 연결된 디스코드 ID가 LAND_ADMIN_IDS(쉼표 구분)에 있는지로 판별한다.
// 잔액은 플레이어별 Durable Object가 단독으로 바꾼다(트랜잭션·동시 요청 직렬화). 조작 기록은 D1 land_admin_log.
export const ADMIN={maxAmount:10000000,maxReason:80,logPage:50,searchMax:20};
const dcId=s=>typeof s==='string'&&/^\d{16,21}$/.test(s);
const UUID=/^[0-9a-f-]{36}$/i;
export const adminIds=env=>new Set(String(env.LAND_ADMIN_IDS||'').split(',').map(s=>s.trim()).filter(dcId));
export const isAdmin=(env,discordId)=>dcId(discordId)&&adminIds(env).has(discordId);
const DDL=['CREATE TABLE IF NOT EXISTS land_choco_rank (player_key TEXT PRIMARY KEY,name TEXT NOT NULL,balance INTEGER NOT NULL,updated INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS land_admin_log (id TEXT PRIMARY KEY,admin_key TEXT NOT NULL,admin_name TEXT NOT NULL,target_key TEXT NOT NULL,target_name TEXT NOT NULL,delta INTEGER NOT NULL,balance_after INTEGER NOT NULL,reason TEXT NOT NULL,created INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS land_admin_log_created ON land_admin_log(created DESC)'];
let ready=null;
const ensure=env=>ready??=env.DB.batch(DDL.map(s=>env.DB.prepare(s))).catch(e=>{ready=null;throw e;});
const fail=(h,req,code,msg,status)=>h.E(req,code,msg,status);
const cleanReason=s=>typeof s==='string'?s.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim():'';
const like=q=>'%'+q.replace(/[\\%_]/g,m=>'\\'+m)+'%';
const player=(env,key)=>env.LAND_PLAYERS.get(env.LAND_PLAYERS.idFromName(key));
const ask=async(env,key,body)=>{const r=await player(env,key).fetch(new Request('https://player/admin',{method:'POST',body:JSON.stringify(body)}));return {status:r.status,data:await r.json()};};

// 관리자가 아니면 어떤 경로든 403. 호출 전에 p(로그인 주민)와 linked(디스코드 연결)가 확인돼 있어야 한다.
export async function handleAdmin(req,env,h,{path,b,p,linked,saveRank}){
  if(!isAdmin(env,linked?.discord_id))return fail(h,req,'forbidden','관리자만 쓸 수 있어요.',403);
  await ensure(env);
  if(path==='/land/admin/me')return h.J(req,{admin:true,name:p.name});
  if(path==='/land/admin/search'){
    const q=typeof b.q==='string'?b.q.normalize('NFC').trim().slice(0,40):'';if(q.length<1)return fail(h,req,'query','검색어를 입력해주세요.');
    const rows=dcId(q)
      ?(await env.DB.prepare('SELECT p.key,p.name,1 AS linked,r.balance FROM land_discord_links l JOIN players p ON p.key=l.player_key LEFT JOIN land_choco_rank r ON r.player_key=p.key WHERE l.discord_id=? LIMIT 1').bind(q).all()).results
      :(await env.DB.prepare("SELECT p.key,p.name,(l.discord_id IS NOT NULL) AS linked,r.balance FROM players p LEFT JOIN land_discord_links l ON l.player_key=p.key LEFT JOIN land_choco_rank r ON r.player_key=p.key WHERE p.name LIKE ? ESCAPE '\\' ORDER BY (lower(p.name)=lower(?)) DESC,p.name LIMIT ?").bind(like(q),q,ADMIN.searchMax).all()).results;
    return h.J(req,{players:rows.map(r=>({key:r.key,name:r.name,linked:!!r.linked,balance:Number.isSafeInteger(r.balance)?r.balance:null}))});
  }
  if(path==='/land/admin/player'){
    if(typeof b.key!=='string'||!b.key||b.key.length>64)return fail(h,req,'target','대상 주민을 골라주세요.');
    const t=await env.DB.prepare('SELECT key,name FROM players WHERE key=?').bind(b.key).first();if(!t)return fail(h,req,'target','없는 주민이에요.',404);
    const r=await ask(env,t.key,{op:'peek'});if(r.status!==200)return fail(h,req,'target',r.data.msg||'주민 정보를 읽지 못했어요.',r.status);
    return h.J(req,{key:t.key,name:t.name,balance:r.data.balance,ledger:r.data.ledger});
  }
  if(path==='/land/admin/adjust'){
    const amount=b.amount,kind=b.kind,reason=cleanReason(b.reason);
    if(kind!=='grant'&&kind!=='revoke')return fail(h,req,'kind','지급 또는 회수를 골라주세요.');
    if(!Number.isSafeInteger(amount)||amount<=0)return fail(h,req,'amount','금액은 1 이상의 정수로 입력해주세요.');
    if(amount>ADMIN.maxAmount)return fail(h,req,'amount','한 번에 '+ADMIN.maxAmount.toLocaleString('ko-KR')+'초코까지만 바꿀 수 있어요.');
    if(reason.length<1||reason.length>ADMIN.maxReason)return fail(h,req,'reason','사유를 1~'+ADMIN.maxReason+'자로 적어주세요.');
    if(typeof b.id!=='string'||!UUID.test(b.id))return fail(h,req,'id','요청 번호가 올바르지 않아요.');
    if(typeof b.key!=='string'||!b.key||b.key.length>64)return fail(h,req,'target','대상 주민을 골라주세요.');
    const t=await env.DB.prepare('SELECT key,name FROM players WHERE key=?').bind(b.key).first();if(!t)return fail(h,req,'target','없는 주민이에요.',404);
    const delta=kind==='grant'?amount:-amount;
    const r=await ask(env,t.key,{op:'adjust',id:b.id,delta,reason:(kind==='grant'?'관리자 지급 · ':'관리자 회수 · ')+reason});
    if(r.status!==200)return fail(h,req,r.status===409?'balance':'target',r.data.msg||'바꾸지 못했어요.',r.status);
    const created=r.data.created;
    try{await env.DB.prepare('INSERT OR IGNORE INTO land_admin_log VALUES(?,?,?,?,?,?,?,?,?)').bind(b.id,p.key,p.name,t.key,t.name,delta,r.data.balance,reason,created).run();}
    catch(e){console.error('admin log',e.message);return fail(h,req,'log','초코는 바뀌었지만 기록 저장에 실패했어요. 같은 요청을 다시 보내면 기록만 이어서 저장돼요.',503);}
    try{await saveRank(env,t.key,t.name,r.data.balance);}catch(e){console.error('admin rank',e.message);}
    return h.J(req,{ok:true,replayed:!!r.data.replayed,entry:{id:b.id,admin:p.name,target:t.name,delta,balance:r.data.balance,reason,created}});
  }
  if(path==='/land/admin/log'){
    const limit=Number.isSafeInteger(b.limit)?Math.min(Math.max(b.limit,1),ADMIN.logPage):20,since=Date.now()-86400000;
    const rows=(await env.DB.prepare('SELECT id,admin_name,target_key,target_name,delta,balance_after,reason,created FROM land_admin_log ORDER BY created DESC,rowid DESC LIMIT ?').bind(limit).all()).results;
    const sum=await env.DB.prepare('SELECT COUNT(*) AS n,COALESCE(SUM(CASE WHEN delta>0 THEN delta END),0) AS granted,COALESCE(SUM(CASE WHEN delta<0 THEN -delta END),0) AS revoked FROM land_admin_log WHERE created>=?').bind(since).first();
    return h.J(req,{summary:{count:sum.n,granted:sum.granted,revoked:sum.revoked,hours:24},entries:rows.map(r=>({id:r.id,admin:r.admin_name,targetKey:r.target_key,target:r.target_name,delta:r.delta,balance:r.balance_after,reason:r.reason,created:r.created}))});
  }
  return fail(h,req,'404','없는 주소',404);
}

// LandPlayer(Durable Object) 쪽 관리자 작업. 사용자 요청과 주소가 달라(https://player/admin) 밖에서는 부를 수 없다.
export function playerAdmin(self,b,{fail,Response,now=Date.now()}){
  return self.ctx.storage.transactionSync(()=>{
    const row=self.sql.exec('SELECT data FROM player WHERE id=1').toArray()[0];if(!row)fail('아직 마을에 입장한 적 없는 주민이에요.',404);
    const s=JSON.parse(row.data);
    if(b.op==='peek')return Response.json({balance:s.balance,ledger:self.sql.exec('SELECT delta,balance,reason,created FROM ledger ORDER BY id DESC LIMIT 10').toArray()});
    if(b.op!=='adjust')fail('없는 기능이에요.',404);
    if(typeof b.id!=='string'||!UUID.test(b.id))fail('요청 번호가 올바르지 않아요.');
    if(!Number.isSafeInteger(b.delta)||b.delta===0||Math.abs(b.delta)>ADMIN.maxAmount)fail('금액이 올바르지 않아요.');
    if(typeof b.reason!=='string'||!b.reason||b.reason.length>120)fail('사유가 올바르지 않아요.');
    const key='admin:'+b.id,fingerprint=JSON.stringify({delta:b.delta,reason:b.reason});
    const prev=self.sql.exec('SELECT * FROM actions WHERE id=?',key).toArray()[0];
    if(prev){if(prev.fingerprint!==fingerprint)fail('같은 요청 번호의 내용이 달라요.',409);return Response.json({...JSON.parse(prev.response),replayed:true});}
    if(s.balance+b.delta<0)fail('회수할 초코가 잔액보다 많아요. 현재 잔액은 '+s.balance.toLocaleString('ko-KR')+'초코예요.',409);
    if(!Number.isSafeInteger(s.balance+b.delta)||s.balance+b.delta>1e12)fail('잔액 한도를 넘어요.',409);
    self.entry(s,b.delta,b.reason,now);s.rev++;
    self.sql.exec('INSERT INTO player(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',JSON.stringify(s));
    const out={balance:s.balance,created:now};self.sql.exec('INSERT INTO actions VALUES(?,?,?)',key,fingerprint,JSON.stringify(out));
    return Response.json(out);
  });
}
