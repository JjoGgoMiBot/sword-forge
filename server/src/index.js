import '../../game-core.js';
import {handleLand} from './land.js';
export {LandPlayer,LandRoom} from './land.js';
// Account economy is authoritative; clients submit actions, never balances.
// POST /register {name,pin}       → {token,name,save,saved}
// POST /login    {name,pin}       → {token,name,save,saved}
// POST /action   {token,rev,requestId,action} → {state,out,saved}
// POST /save     rejects obsolete snapshot uploads
// POST /load     {token}          → {name,save,saved}
// GET  /ranking                   → {top:[{rank,name,best}],at}  server-verified peak level
// POST /myrank   {token}          → {rank,best}
const ORIGINS = ["https://seungjaehh.github.io", "http://localhost:5188", "http://127.0.0.1:5188"];
const MAX_BODY=8192, ITER=20000, TOKEN_TTL=30*86400000;
const ROUTE_LIMITS={'/register':[20,3600000],'/login':[30,60000],'/action':[600,60000],'/load':[120,60000],'/logout':[60,60000],'/myrank':[30,60000]};
const RANK_TTL=20000,RANK_SIZE=50;
let rankCache=null;
let lastLimitCleanup=0;
const blockedRequests=new Map();
const enc = new TextEncoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
const rand = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha = async s => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
async function pbkdf2(pin, salt) {
  const k = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: ITER }, k, 256));
}
const eq = (a, b) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
const NAME_RE = /^[0-9A-Za-z가-힣_]{2,12}$/;
const cleanName = n => String(n || "").normalize("NFC").trim();
const okPin = p => typeof p === "string" && /^\d{4,8}$/.test(p);
const okNewPin=p=>typeof p==='string'&&/^\d{6,8}$/.test(p);

function cors(req) {
  const o = req.headers.get("Origin");
  return { "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0], "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400", "Vary": "Origin" };
}
const J = (req, body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json",'Cache-Control':'no-store','X-Content-Type-Options':'nosniff', ...cors(req) } });
const E = (req, code, msg, status = 400) => J(req, { error: code, msg }, status);
const secureRandom = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
const parseSave = p => { try { return JSON.parse(p.save) || {}; } catch { return {}; } };
async function readBody(req){
  if(Number(req.headers.get('Content-Length'))>MAX_BODY)throw new RangeError('size');
  const reader=req.body?.getReader();if(!reader)throw Error('json');
  let size=0;const chunks=[];
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BODY){await reader.cancel();throw new RangeError('size');}chunks.push(value);}
  const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}
  const body=JSON.parse(new TextDecoder().decode(bytes));if(!body||typeof body!=='object'||Array.isArray(body))throw Error('json');return body;
}
async function allowRequest(env,key,max,windowMs,now){
  const hash=await sha(key),start=Math.floor(now/windowMs)*windowMs;
  if((blockedRequests.get(hash)||0)>now)return false;
  blockedRequests.delete(hash);
  // Most requests change only the unindexed counter, avoiding an index write.
  const reserved=await env.DB.prepare('UPDATE request_limits SET hits=hits+1 WHERE key=?1 AND window_start=?2 AND hits<?3 RETURNING hits').bind(hash,start,max).first();
  if(reserved)return true;
  const r=await env.DB.prepare(`INSERT INTO request_limits(key,window_start,hits) VALUES(?1,?2,1)
    ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN request_limits.window_start=excluded.window_start THEN request_limits.hits+1 ELSE 1 END,window_start=excluded.window_start
    WHERE request_limits.window_start<excluded.window_start OR (request_limits.window_start=excluded.window_start AND request_limits.hits<?3) RETURNING hits`).bind(hash,start,max).first();
  if(r)return true;
  if(blockedRequests.size>=10000)blockedRequests.delete(blockedRequests.keys().next().value);
  blockedRequests.set(hash,start+windowMs);return false;
}
async function accountState(env,p,now) {
  let raw=parseSave(p);
  if(raw.version!==Forge.VERSION){
    const state=Forge.normalize(raw);state.name=p.name;state.t=now;
    const next=JSON.stringify(state);
    const r=await env.DB.prepare('UPDATE players SET save=?,saved=? WHERE key=? AND save IS ?').bind(next,now,p.key,p.save).run();
    if(r.meta.changes){p.save=next;p.saved=now;raw=state;}
    else {const current=await env.DB.prepare('SELECT * FROM players WHERE key=?').bind(p.key).first();Object.assign(p,current);raw=parseSave(p);}
  }
  return raw;
}

async function byToken(env, token) {
  if (typeof token !== "string" || token.length !== 64) return null;
  return env.DB.prepare("SELECT p.* FROM tokens t JOIN players p ON p.key=t.key WHERE t.hash=? AND t.created>=?").bind(await sha(token),Date.now()-TOKEN_TTL).first();
}
// 기기 5대까지 동시 로그인: 새 토큰을 넣고 오래된 것부터 지운다
async function addToken(env, key, token, now) {
  await env.DB.batch([
    env.DB.prepare("INSERT INTO tokens(hash,key,created) VALUES(?,?,?)").bind(await sha(token), key, now),
    env.DB.prepare("DELETE FROM tokens WHERE key=? AND hash NOT IN (SELECT hash FROM tokens WHERE key=? ORDER BY created DESC LIMIT 5)").bind(key, key),
  ]);
}

export default {
  async fetch(req, env, ctx) {
    const activityOrigin=env.DISCORD_APPLICATION_ID&&/^\d{16,21}$/.test(env.DISCORD_APPLICATION_ID)?'https://'+env.DISCORD_APPLICATION_ID+'.discordsays.com':null;
    if(activityOrigin&&!ORIGINS.includes(activityOrigin))ORIGINS.push(activityOrigin);
    const origin=req.headers.get('Origin');
    if(origin&&!ORIGINS.includes(origin))return E(req,'origin','허용되지 않은 출처입니다.',403);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
    const url = new URL(req.url);
    if(url.pathname.startsWith('/land/'))return handleLand(req,env,ctx,{J,E,byToken,allowRequest,readBody});
    if (req.method === "GET" && url.pathname === "/") return J(req, { ok: true });
    if(req.method==='GET'&&url.pathname==='/ranking'){
      const now=Date.now(),ip=req.headers.get('CF-Connecting-IP')||'unknown';
      if(!await allowRequest(env,`ip:/ranking:${ip}`,30,60000,now))return E(req,'rate','요청이 너무 많아요. 잠시 후 다시 시도해 주세요.',429);
      if(!rankCache||now-rankCache.at>RANK_TTL){
        const {results}=await env.DB.prepare('SELECT name,best FROM players WHERE best>0 ORDER BY best DESC,best_at ASC,key ASC LIMIT ?').bind(RANK_SIZE).all();
        rankCache={at:now,top:results.map((r,i)=>({rank:i+1,name:r.name,best:r.best}))};
      }
      return J(req,rankCache);
    }
    if (req.method !== "POST") return E(req, "method", "POST만 됩니다", 405);
    if(url.pathname==='/save')return E(req,'upgrade','보호 기능이 업데이트됐어요. 새로고침해 주세요.',409);
    const limit=ROUTE_LIMITS[url.pathname];if(!limit)return E(req,'404','없는 주소',404);
    const now = Date.now();
    const ip=req.headers.get('CF-Connecting-IP')||'unknown';
    if(!await allowRequest(env,`ip:${url.pathname}:${ip}`,...limit,now))return E(req,'rate','요청이 너무 많아요. 잠시 후 다시 시도해 주세요.',429);
    if(now-lastLimitCleanup>3600000){lastLimitCleanup=now;const cleanup=env.DB.prepare('DELETE FROM request_limits WHERE window_start<?').bind(now-86400000).run();if(ctx)ctx.waitUntil(cleanup);else await cleanup;}
    let b;try{b=await readBody(req);}catch(e){return e instanceof RangeError?E(req,'size','요청이 너무 큽니다.',413):E(req,'json','잘못된 요청');}

    if (url.pathname === "/register") {
      const name = cleanName(b.name), key = name.toLowerCase();
      if (!NAME_RE.test(name)) return E(req, "name", "닉네임은 한글·영문·숫자 2~12자");
      if (!okNewPin(b.pin)) return E(req, "pin", "새 비밀번호는 숫자 6~8자리");
      const initial=Forge.fresh();initial.name=name;initial.t=now;
      const salt = rand(16), hash = await pbkdf2(b.pin, salt), token = rand(32);
      try {
        await env.DB.prepare("INSERT INTO players(key,name,salt,hash,save,saved,created) VALUES(?,?,?,?,?,?,?)")
          .bind(key, name, salt, hash, JSON.stringify(initial), now, now).run();
      } catch (e) { return E(req, "taken", "이미 있는 닉네임이에요", 409); }
      await addToken(env, key, token, now);
      return J(req, { token, name, save:JSON.stringify(initial), saved:now });
    }

    if (url.pathname === "/login") {
      const name = cleanName(b.name), key = name.toLowerCase();
      if (!NAME_RE.test(name) || !okPin(b.pin)) return E(req, "bad", "닉네임 또는 비밀번호가 맞지 않아요", 401);
      // Reserve a guess atomically BEFORE hashing, so parallel requests cannot
      // all observe the same failure count and evade the five-attempt lock.
      const p=await env.DB.prepare(`UPDATE players SET
        fails=CASE WHEN lock_until>0 AND lock_until<=?1 THEN 1 ELSE fails+1 END,
        lock_until=CASE WHEN (CASE WHEN lock_until>0 AND lock_until<=?1 THEN 1 ELSE fails+1 END)>=5 THEN ?2 ELSE 0 END
        WHERE key=?3 AND lock_until<=?1 RETURNING *`).bind(now,now+300000,key).first();
      if(!p){const exists=await env.DB.prepare('SELECT lock_until FROM players WHERE key=?').bind(key).first();return exists?E(req,'locked','너무 많이 시도했어요. 5분 뒤 다시 시도해 주세요.',429):E(req,'bad','닉네임 또는 비밀번호가 맞지 않아요',401);}
      if (!eq(await pbkdf2(b.pin, p.salt), p.hash)) {
        return E(req, "bad", "닉네임 또는 비밀번호가 맞지 않아요", 401);
      }
      const token = rand(32);
      await env.DB.prepare("UPDATE players SET fails=0, lock_until=0 WHERE key=?").bind(key).run();
      await addToken(env, key, token, now);
      await accountState(env,p,now);
      return J(req, { token, name: p.name, save: p.save, saved: p.saved });
    }

    if(url.pathname==='/logout'){
      if(typeof b.token==='string'&&b.token.length===64)await env.DB.prepare('DELETE FROM tokens WHERE hash=?').bind(await sha(b.token)).run();
      return J(req,{ok:true});
    }

    if (url.pathname === '/action') {
      if(b.cv!==Forge.RULES)return E(req,'upgrade','새 버전이 나왔어요! 새로고침(F5) 해 주세요.',426);
      const p=await byToken(env,b.token);if(!p)return E(req,'auth','다시 로그인해 주세요.',401);
      if(!await allowRequest(env,`account:action:${p.key}`,240,60000,now))return E(req,'rate','요청이 너무 많아요. 잠시 후 다시 시도해 주세요.',429);
      const raw=await accountState(env,p,now);
      if(typeof b.requestId!=='string'||!/^[-0-9a-f]{36}$/i.test(b.requestId))return E(req,'id','잘못된 요청 번호입니다.');
      if(raw.lastRequest===b.requestId)return J(req,{state:raw,out:raw.lastOut||{},saved:p.saved,replayed:true});
      if(!Number.isSafeInteger(b.rev)||b.rev!==raw.rev)return J(req,{error:'conflict',msg:'다른 창의 최신 기록을 불러왔어요. 다시 시도해 주세요.',state:raw},409);
      let result;try{result=Forge.transition(raw,b.action,now,secureRandom);}catch(e){return E(req,'action',e.message);}
      result.state.name=p.name;result.state.lastRequest=b.requestId;result.state.lastOut=result.out;
      const next=JSON.stringify(result.state);
      // Peak level is recorded in the same conditional write as the roll, so it can only come from a server roll.
      const lv=result.state.lv|0;
      const r=await env.DB.prepare('UPDATE players SET save=?,saved=?,best_at=CASE WHEN ?>best THEN ? ELSE best_at END,best=MAX(best,?) WHERE key=? AND save IS ?').bind(next,now,lv,now,lv,p.key,p.save).run();
      if(!r.meta.changes){const latest=await env.DB.prepare('SELECT save FROM players WHERE key=?').bind(p.key).first();return J(req,{error:'conflict',msg:'다른 요청이 먼저 처리됐어요.',state:parseSave(latest)},409);}
      return J(req,{...result,saved:now});
    }

    if(url.pathname==='/myrank'){
      const p=await byToken(env,b.token);if(!p)return E(req,'auth','다시 로그인해 주세요.',401);
      if(!p.best)return J(req,{rank:null,best:0});
      const r=await env.DB.prepare('SELECT COUNT(*) n FROM players WHERE best>?1 OR (best=?1 AND (best_at<?2 OR (best_at=?2 AND key<?3)))').bind(p.best,p.best_at,p.key).first();
      return J(req,{rank:r.n+1,best:p.best});
    }

    if (url.pathname === "/load") {
      const p = await byToken(env, b.token); if (!p) return E(req, "auth", "다시 로그인해 주세요", 401);
      await accountState(env,p,now);
      return J(req, { name: p.name, save: p.save, saved: p.saved });
    }
    return E(req, "404", "없는 주소", 404);
  },
};
