import '../../game-core.js';
// Account economy is authoritative; clients submit actions, never balances.
// POST /register {name,pin}       → {token,name,save,saved}
// POST /login    {name,pin}       → {token,name,save,saved}
// POST /action   {token,rev,requestId,action} → {state,out,saved}
// POST /save     rejects obsolete snapshot uploads
// POST /load     {token}          → {name,save,saved}
const ORIGINS = ["https://seungjaehh.github.io", "http://localhost:5188"];
const MAX_SAVE = 64 * 1024, ITER = 20000;
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

function cors(req) {
  const o = req.headers.get("Origin");
  return { "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0], "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400", "Vary": "Origin" };
}
const J = (req, body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors(req) } });
const E = (req, code, msg, status = 400) => J(req, { error: code, msg }, status);
const secureRandom = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
const parseSave = p => { try { return JSON.parse(p.save) || {}; } catch { return {}; } };
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
  return env.DB.prepare("SELECT p.* FROM tokens t JOIN players p ON p.key=t.key WHERE t.hash=?").bind(await sha(token)).first();
}
// 기기 5대까지 동시 로그인: 새 토큰을 넣고 오래된 것부터 지운다
async function addToken(env, key, token, now) {
  await env.DB.batch([
    env.DB.prepare("INSERT INTO tokens(hash,key,created) VALUES(?,?,?)").bind(await sha(token), key, now),
    env.DB.prepare("DELETE FROM tokens WHERE key=? AND hash NOT IN (SELECT hash FROM tokens WHERE key=? ORDER BY created DESC LIMIT 5)").bind(key, key),
  ]);
}

export default {
  async fetch(req, env) {
    const origin=req.headers.get('Origin');
    if(origin&&!ORIGINS.includes(origin))return E(req,'origin','허용되지 않은 출처입니다.',403);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname === "/") return J(req, { ok: true });
    if (req.method !== "POST") return E(req, "method", "POST만 됩니다", 405);
    let b; try { const body=await req.text();if(body.length>MAX_SAVE*2)return E(req,'size','요청이 너무 큽니다.',413);b=JSON.parse(body);if(!b||typeof b!=='object'||Array.isArray(b))throw Error(); } catch { return E(req, "json", "잘못된 요청"); }
    const now = Date.now();

    if (url.pathname === "/register") {
      const name = cleanName(b.name), key = name.toLowerCase();
      if (!NAME_RE.test(name)) return E(req, "name", "닉네임은 한글·영문·숫자 2~12자");
      if (!okPin(b.pin)) return E(req, "pin", "비밀번호는 숫자 4~8자리");
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
      const p = await env.DB.prepare("SELECT * FROM players WHERE key=?").bind(key).first();
      if (!p) return E(req, "bad", "닉네임 또는 비밀번호가 맞지 않아요", 401);
      if (p.lock_until > now) return E(req, "locked", `너무 많이 틀렸어요. ${Math.ceil((p.lock_until - now) / 60000)}분 뒤 다시`, 429);
      if (!eq(await pbkdf2(b.pin, p.salt), p.hash)) {
        const f = p.fails + 1, lock = f >= 5 ? now + Math.min(60, 5 * 2 ** (f - 5)) * 60000 : 0;
        await env.DB.prepare("UPDATE players SET fails=?, lock_until=? WHERE key=?").bind(f, lock, key).run();
        return E(req, "bad", "닉네임 또는 비밀번호가 맞지 않아요", 401);
      }
      const token = rand(32);
      await env.DB.prepare("UPDATE players SET fails=0, lock_until=0 WHERE key=?").bind(key).run();
      await addToken(env, key, token, now);
      await accountState(env,p,now);
      return J(req, { token, name: p.name, save: p.save, saved: p.saved });
    }

    if (url.pathname === "/save") {
      return E(req,'upgrade','보호 기능이 업데이트됐어요. 새로고침해 주세요.',409);
    }

    if (url.pathname === '/action') {
      const p=await byToken(env,b.token);if(!p)return E(req,'auth','다시 로그인해 주세요.',401);
      const raw=await accountState(env,p,now);
      if(typeof b.requestId!=='string'||!/^[-0-9a-f]{36}$/i.test(b.requestId))return E(req,'id','잘못된 요청 번호입니다.');
      if(raw.lastRequest===b.requestId)return J(req,{state:raw,out:raw.lastOut||{},saved:p.saved,replayed:true});
      if(!Number.isSafeInteger(b.rev)||b.rev!==raw.rev)return J(req,{error:'conflict',msg:'다른 창의 최신 기록을 불러왔어요. 다시 시도해 주세요.',state:raw},409);
      let result;try{result=Forge.transition(raw,b.action,now,secureRandom);}catch(e){return E(req,'action',e.message);}
      result.state.name=p.name;result.state.lastRequest=b.requestId;result.state.lastOut=result.out;
      const next=JSON.stringify(result.state);
      const r=await env.DB.prepare('UPDATE players SET save=?,saved=? WHERE key=? AND save IS ?').bind(next,now,p.key,p.save).run();
      if(!r.meta.changes){const latest=await env.DB.prepare('SELECT save FROM players WHERE key=?').bind(p.key).first();return J(req,{error:'conflict',msg:'다른 요청이 먼저 처리됐어요.',state:parseSave(latest)},409);}
      return J(req,{...result,saved:now});
    }

    if (url.pathname === "/load") {
      const p = await byToken(env, b.token); if (!p) return E(req, "auth", "다시 로그인해 주세요", 401);
      await accountState(env,p,now);
      return J(req, { name: p.name, save: p.save, saved: p.saved });
    }
    return E(req, "404", "없는 주소", 404);
  },
};
