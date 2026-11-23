import {newRace,checkRaceBet,raceBet,raceTick,raceDue,raceView} from './land-race.js';
import {WORLD,move,avatar,canStand} from '../../land/world.js';
export {LandPlayer} from './land-player.js';
import {NOTICE,winNotice,joinNotice,leaveNotice} from './land-notice.js';
import {newTable,checkSit,sit as pokerSit,standUp,setAway,act as pokerAct,tick as pokerTick,nextDue,view as pokerView} from './land-poker.js';
import {newCrash,checkCrashBet,placeCrashBet,crashCash,crashTick,crashDue,crashView,newParty,checkPartyJoin,partyJoin,partyLeave,partyTick,partyDue,partyView,newDuel,checkDuelJoin,duelJoin,duelLeave,duelShoot,duelTick,duelDue,duelView} from './land-crash.js';
import {GIFT} from './land-player.js';
import {handleAdmin} from './land-admin.js';
const enc=new TextEncoder(),hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const hash=async s=>hex(await crypto.subtle.digest('SHA-256',enc.encode(s)));
const equal=(a,b)=>{if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;};
const hmac=async (secret,s)=>hex(await crypto.subtle.sign('HMAC',await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']),enc.encode(s)));
async function sign(env,data){if(!env.LAND_SIGNING_KEY)throw Error('마을 연결을 준비하고 있어요.');const raw=btoa(String.fromCharCode(...enc.encode(JSON.stringify(data)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');return raw+'.'+await hmac(env.LAND_SIGNING_KEY,raw);}
async function verify(env,ticket){try{if(!env.LAND_SIGNING_KEY||ticket.length>4096)return null;const [raw,signature]=ticket.split('.');if(!equal(signature,await hmac(env.LAND_SIGNING_KEY,raw)))return null;const data=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(raw.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))));return data.exp>Date.now()?data:null;}catch{return null;}}
const player=(env,key)=>env.LAND_PLAYERS.get(env.LAND_PLAYERS.idFromName(key));
const room=(env,key)=>env.LAND_ROOMS.get(env.LAND_ROOMS.idFromName(key));
const publicRoom=s=>/^public:[1-5]$/.test(s);
const dcId=s=>typeof s==='string'&&/^\d{16,21}$/.test(s);
const permissionsCache=new Map();
async function discord(env,path){if(!env.DISCORD_BOT_TOKEN)throw Error('Discord 연결을 준비하고 있어요.');const r=await fetch('https://discord.com/api/v10'+path,{headers:{Authorization:'Bot '+env.DISCORD_BOT_TOKEN}});if(!r.ok)throw Error('Discord 채널에 접근할 수 없어요. 잠시 후 다시 확인해주세요.');return r.json();}
export async function channelAccess(env,user,guild,channel){
  if(!dcId(user)||!dcId(guild)||!dcId(channel))return null;
  const cacheKey=[user,guild,channel].join(':'),cached=permissionsCache.get(cacheKey);if(cached&&cached.expires>Date.now())return cached.value;
  try{
    const [g,m,c]=await Promise.all([discord(env,'/guilds/'+guild),discord(env,'/guilds/'+guild+'/members/'+user),discord(env,'/channels/'+channel)]);
    if(c.guild_id!==guild||![0,2].includes(c.type))return null;
    let bits=0n;const roles=new Set([guild,...m.roles]);for(const r of g.roles)if(roles.has(r.id))bits|=BigInt(r.permissions);
    const admin=g.owner_id===user||(bits&8n)!==0n;
    if(!admin){const everyone=(c.permission_overwrites||[]).find(x=>x.id===guild);if(everyone)bits=(bits&~BigInt(everyone.deny))|BigInt(everyone.allow);let allow=0n,deny=0n;for(const o of c.permission_overwrites||[])if(o.type===0&&o.id!==guild&&roles.has(o.id)){allow|=BigInt(o.allow);deny|=BigInt(o.deny);}bits=(bits&~deny)|allow;const own=(c.permission_overwrites||[]).find(x=>x.type===1&&x.id===user);if(own)bits=(bits&~BigInt(own.deny))|BigInt(own.allow);}
    const has=n=>admin||(bits&BigInt(n))!==0n;
    const timed=m.communication_disabled_until&&Date.parse(m.communication_disabled_until)>Date.now();
    const value=has(1024)&&(c.type!==2||has(1048576))&&has(65536)?{guild,channel,name:c.name,kind:c.type===2?'voice':'text',canSend:has(2048)&&!timed}:null;
    if(permissionsCache.size>1000)permissionsCache.clear();permissionsCache.set(cacheKey,{expires:Date.now()+20000,value});return value;
  }catch{return null;}
}
// 초코 랭킹: 지갑 잔액이 바뀔 때마다 한 줄 갱신. 표는 처음 쓸 때 만든다(land-schema.sql에도 같은 정의)
let rankReady=null;const rankTable=env=>rankReady??=env.DB.prepare('CREATE TABLE IF NOT EXISTS land_choco_rank (player_key TEXT PRIMARY KEY,name TEXT NOT NULL,balance INTEGER NOT NULL,updated INTEGER NOT NULL)').run().catch(e=>{rankReady=null;throw e;});
export async function saveRank(env,key,name,balance){if(!Number.isSafeInteger(balance))return;await rankTable(env);await env.DB.prepare('INSERT INTO land_choco_rank VALUES(?,?,?,?) ON CONFLICT(player_key) DO UPDATE SET name=excluded.name,balance=excluded.balance,updated=excluded.updated WHERE land_choco_rank.balance<>excluded.balance OR land_choco_rank.name<>excluded.name').bind(key,String(name||'주민').slice(0,24),balance,Date.now()).run();}
let rankCache=null;export const clearRankCache=()=>{rankCache=null;rankReady=null;};
export async function chocoRanking(env,now=Date.now()){if(rankCache&&now-rankCache.at<NOTICE.rankingCacheMs)return rankCache.list;await rankTable(env);const list= (await env.DB.prepare('SELECT name,balance FROM land_choco_rank ORDER BY balance DESC,updated ASC LIMIT ?').bind(NOTICE.rankingSize).all()).results.map((r,i)=>({rank:i+1,name:r.name,balance:r.balance}));rankCache={at:now,list};return list;}
const later=(ctx,work)=>{const p=Promise.resolve().then(work).catch(e=>console.error('land later',e.message));if(ctx?.waitUntil)ctx.waitUntil(p);return p;};
export async function handleLand(req,env,ctx,h){
  const url=new URL(req.url),path=url.pathname;
  try{
    if(path==='/land/health')return h.J(req,{ok:true,version:2,discord:!!env.LAND_BRIDGE_SECRET,features:{sharedRace:true,sharedRaceLobbyMs:60000,hiloEqual:true,baccaratHistory:true}});
    if(path==='/land/ws'){
      if(req.headers.get('Upgrade')?.toLowerCase()!=='websocket')return h.E(req,'upgrade','WebSocket 연결이 필요해요.',426);
      const ticket=await verify(env,url.searchParams.get('ticket')||'');if(!ticket)return h.E(req,'auth','접속권이 만료됐어요. 다시 연결해주세요.',401);
      if(!publicRoom(ticket.room)&&!await channelAccess(env,ticket.discordId,ticket.guild,ticket.channel))return h.E(req,'access','채널 권한을 확인해주세요.',403);
      return room(env,ticket.room).fetch(new Request('https://room/connect',{headers:{Upgrade:'websocket','X-Land-User':encodeURIComponent(JSON.stringify(ticket))}}));
    }
    if(path==='/land/bridge/ws'){
      if(!env.LAND_BRIDGE_SECRET||!equal(req.headers.get('Authorization'),env.LAND_BRIDGE_SECRET))return h.E(req,'auth','인증 실패',401);
      const key=url.searchParams.get('room'),channel=await env.DB.prepare('SELECT * FROM land_channels WHERE room=?').bind(key).first();if(!channel)return h.E(req,'room','연결된 채널이 없어요.',404);
      return room(env,key).fetch(new Request('https://room/connect',{headers:{Upgrade:'websocket','X-Land-User':encodeURIComponent(JSON.stringify({bridge:true,room:key,channel:channel.channel_id}))}}));
    }
    if(req.method!=='POST')return h.E(req,'method','POST가 필요해요.',405);
    const ip=req.headers.get('CF-Connecting-IP')||'local';if(!await h.allowRequest(env,'land:ip:'+ip,240,60000,Date.now()))return h.E(req,'rate','조금 쉬었다가 다시 시도해주세요.',429);
    const b=await h.readBody(req);if(path==='/land/ranking')return h.J(req,{ranking:await chocoRanking(env)});
    if(path.startsWith('/land/bridge/')){
      if(!env.LAND_BRIDGE_SECRET||!equal(req.headers.get('Authorization'),env.LAND_BRIDGE_SECRET))return h.E(req,'auth','인증 실패',401);
      if(path==='/land/bridge/channels')return h.J(req,{channels:(await env.DB.prepare('SELECT * FROM land_channels LIMIT 30').all()).results});
      if(path==='/land/bridge/register'){
        if(!dcId(b.guild)||!dcId(b.channel)||typeof b.name!=='string')return h.E(req,'channel','잘못된 채널');
        const roomId='d:'+b.guild+':'+b.channel;await env.DB.prepare('INSERT INTO land_channels VALUES(?,?,?,?) ON CONFLICT(room) DO UPDATE SET name=excluded.name').bind(roomId,b.guild,b.channel,b.name.slice(0,80)).run();permissionsCache.clear();return h.J(req,{ok:true,room:roomId});
      }
      if(path==='/land/bridge/unregister'){
        if(!dcId(b.guild)||!dcId(b.channel))return h.E(req,'channel','잘못된 채널');const key='d:'+b.guild+':'+b.channel;await env.DB.prepare('DELETE FROM land_channels WHERE room=?').bind(key).run();await room(env,key).fetch(new Request('https://room/invalidate',{headers:{'X-Land-User':encodeURIComponent(JSON.stringify({bridge:true}))}}));permissionsCache.clear();return h.J(req,{ok:true});
      }
      if(path==='/land/bridge/link'){
        if(!dcId(b.discordId)||typeof b.code!=='string')return h.E(req,'code','잘못된 연결 코드');
        const codeHash=await hash(b.code.trim().toUpperCase()),code=await env.DB.prepare('SELECT * FROM land_link_codes WHERE hash=? AND expires>?').bind(codeHash,Date.now()).first();if(!code)return h.E(req,'code','코드가 만료되었거나 잘못됐어요. 마을에서 새로 받아주세요.');
        const existing=await env.DB.prepare('SELECT * FROM land_discord_links WHERE player_key=? OR discord_id=?').bind(code.player_key,b.discordId).all();if(existing.results.some(x=>x.player_key!==code.player_key||x.discord_id!==b.discordId))return h.E(req,'linked','이미 다른 주민과 연결되어 있어요. 기존 주민으로 로그인해주세요.',409);
        await env.DB.batch([env.DB.prepare('INSERT INTO land_discord_links SELECT player_key,?,? FROM land_link_codes WHERE hash=? AND expires>? ON CONFLICT(player_key) DO NOTHING').bind(b.discordId,Date.now(),codeHash,Date.now()),env.DB.prepare('DELETE FROM land_link_codes WHERE hash=?').bind(codeHash)]);
        return h.J(req,{ok:true});
      }
      return h.E(req,'404','없는 주소',404);
    }
    const p=await h.byToken(env,b.token);if(!p)return h.E(req,'auth','다시 로그인해주세요.',401);
    if(!await h.allowRequest(env,'land:user:'+p.key,120,60000,Date.now()))return h.E(req,'rate','조금 쉬었다가 다시 시도해주세요.',429);
    const linked=await env.DB.prepare('SELECT discord_id FROM land_discord_links WHERE player_key=?').bind(p.key).first();
    if(path.startsWith('/land/admin/'))return handleAdmin(req,env,h,{path,b,p,linked,saveRank});
    if(path==='/land/voice/config'){
      if(!env.DISCORD_CLIENT_SECRET||!env.DISCORD_APPLICATION_ID)return h.J(req,{available:false,reason:'setup'});
      const c=await env.DB.prepare('SELECT * FROM land_channels WHERE room=?').bind(b.room||'').first();const access=c&&linked?await channelAccess(env,linked.discord_id,c.guild_id,c.channel_id):null;
      if(!access||access.kind!=='voice')return h.J(req,{available:false,reason:'voice_room'});
      return h.J(req,{available:true,applicationId:env.DISCORD_APPLICATION_ID,channel:access.channel,userId:linked.discord_id,state:await sign(env,{type:'voice-auth',key:p.key,room:b.room,exp:Date.now()+300000})});
    }
    if(path==='/land/voice/auth'){
      if(!env.DISCORD_CLIENT_SECRET||!env.DISCORD_APPLICATION_ID)return h.E(req,'setup','Discord 발화 표시 설정이 아직 준비되지 않았어요.',503);
      const state=await verify(env,b.state||'');if(!state||state.type!=='voice-auth'||state.key!==p.key||!linked||typeof b.code!=='string'||b.code.length>1000)return h.E(req,'auth','음성 연결을 다시 시작해주세요.',401);
      const c=await env.DB.prepare('SELECT * FROM land_channels WHERE room=?').bind(state.room).first();const access=c?await channelAccess(env,linked.discord_id,c.guild_id,c.channel_id):null;if(!access||access.kind!=='voice')return h.E(req,'access','음성방 접근 권한을 확인해주세요.',403);
      const tokenResponse=await fetch('https://discord.com/api/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.DISCORD_APPLICATION_ID,client_secret:env.DISCORD_CLIENT_SECRET,grant_type:'authorization_code',code:b.code})});const oauth=await tokenResponse.json();if(!tokenResponse.ok||!oauth.access_token||!String(oauth.scope||'').split(' ').includes('rpc.voice.read'))return h.E(req,'scope','Discord 음성 상태 권한을 확인해주세요.',403);
      const meResponse=await fetch('https://discord.com/api/users/@me',{headers:{Authorization:'Bearer '+oauth.access_token}});const me=await meResponse.json();if(!meResponse.ok||me.id!==linked.discord_id)return h.E(req,'identity','연결된 Discord 계정과 같은 계정으로 인증해주세요.',403);
      const data=await player(env,p.key).fetch(new Request('https://player/',{method:'POST',body:JSON.stringify({key:p.key,name:p.name,op:'get',discordId:linked.discord_id})})).then(r=>r.json());
      return h.J(req,{accessToken:oauth.access_token,proof:await sign(env,{type:'voice',resident:data.resident.id,room:state.room,exp:Date.now()+3600000})});
    }
    if(path==='/land/player'){
      const r=await player(env,p.key).fetch(new Request('https://player/',{method:'POST',body:JSON.stringify({key:p.key,name:p.name,discordId:linked?.discord_id,op:b.op||'get',payload:b.payload,id:b.id,issued:b.issued})}));const data=await r.json();if(r.ok&&!data.replayed){const name=data.resident?.name||p.name,notice=data.settled&&winNotice(name,data.settled);if(notice)later(ctx,()=>Promise.all(NOTICE.winRooms.map(k=>room(env,k).fetch(new Request('https://room/notice',{method:'POST',body:JSON.stringify({notice,id:p.key+':'+String(b.id||Date.now())})})))));if(data.wallet)later(ctx,()=>saveRank(env,p.key,name,data.wallet.balance));}return h.J(req,{...data,discord:{linked:!!linked,available:!!env.LAND_BRIDGE_SECRET}},r.status);
    }
    if(path==='/land/session'){
      const key=b.room||'public:1';let access=null;if(!publicRoom(key)){const c=await env.DB.prepare('SELECT * FROM land_channels WHERE room=?').bind(key).first();if(!c||!linked)return h.E(req,'access','Discord 연결과 채널 권한이 필요해요.',403);access=await channelAccess(env,linked.discord_id,c.guild_id,c.channel_id);if(!access)return h.E(req,'access','채널을 보고 참여할 권한이 필요해요.',403);}
      const r=await player(env,p.key).fetch(new Request('https://player/',{method:'POST',body:JSON.stringify({key:p.key,name:p.name,op:'get',discordId:linked?.discord_id})}));const data=await r.json();
      if(b.worldVersion!==WORLD.version)return h.E(req,'version','마을이 넓어졌어요. 새로고침 후 다시 들어와주세요.',409);
      const ticket=await sign(env,{version:WORLD.version,id:data.resident.id,key:p.key,name:p.name,avatar:data.resident.avatar,room:key,chatOnly:b.chatOnly===true,discordId:linked?.discord_id||null,guild:access?.guild||null,channel:access?.channel||null,canSend:access?access.canSend:true,tokenHash:await hash(b.token),exp:Date.now()+60000});return h.J(req,{ticket,room:key,name:access?.name||'광장 '+key.split(':')[1],kind:access?.kind||'public'});
    }
    if(path==='/land/channels'){
      const channels=[];if(linked)for(const c of (await env.DB.prepare('SELECT * FROM land_channels LIMIT 15').all()).results){const access=await channelAccess(env,linked.discord_id,c.guild_id,c.channel_id);if(access)channels.push({room:c.room,name:c.name,kind:access.kind});}return h.J(req,{channels});
    }
    if(path==='/land/link'){
      if(!env.LAND_BRIDGE_SECRET)return h.E(req,'unavailable','Discord 연결을 준비하고 있어요.',503);if(linked)return h.J(req,{linked:true});
      const code=hex(crypto.getRandomValues(new Uint8Array(5))).toUpperCase();await env.DB.batch([env.DB.prepare('DELETE FROM land_link_codes WHERE player_key=? OR expires<?').bind(p.key,Date.now()),env.DB.prepare('INSERT INTO land_link_codes VALUES(?,?,?)').bind(await hash(code),p.key,Date.now()+300000)]);return h.J(req,{code,expires:Date.now()+300000});
    }
    return h.E(req,'404','없는 주소',404);
  }catch(e){console.error('land',e.name,e.message);return h.E(req,'land','연결을 확인할 수 없어요. 잠시 후 다시 시도해주세요.',503);}
}
export const giftNet=amount=>Math.floor(amount*(100-GIFT.feePercent)/100);
export class LandRoom{
  constructor(ctx,env){this.ctx=ctx;this.env=env;this.sql=ctx.storage.sql;this.sql.exec('CREATE TABLE IF NOT EXISTS presence (id TEXT PRIMARY KEY,name TEXT NOT NULL,joined INTEGER NOT NULL DEFAULT 0,leave_due INTEGER)');this.noticeIds=new Set();this.sql.exec('CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT,client_id TEXT UNIQUE,uid TEXT NOT NULL,name TEXT NOT NULL,text TEXT NOT NULL,source TEXT NOT NULL,created INTEGER NOT NULL,discord_id TEXT,pending INTEGER NOT NULL DEFAULT 0)');this.sql.exec('CREATE TABLE IF NOT EXISTS poker (id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL)');this.sql.exec('CREATE TABLE IF NOT EXISTS poker_payouts (id TEXT PRIMARY KEY,key TEXT NOT NULL,name TEXT NOT NULL,amount INTEGER NOT NULL,created INTEGER NOT NULL,due INTEGER NOT NULL,tries INTEGER NOT NULL DEFAULT 0)');for(const col of ['op TEXT','extra TEXT'])try{this.sql.exec('ALTER TABLE poker_payouts ADD COLUMN '+col);}catch{}this.sql.exec('CREATE TABLE IF NOT EXISTS arcade (game TEXT PRIMARY KEY,data TEXT NOT NULL)');this.sql.exec('CREATE TABLE IF NOT EXISTS race_requests (id TEXT PRIMARY KEY,key TEXT NOT NULL,data TEXT NOT NULL,state TEXT NOT NULL,due INTEGER,created INTEGER NOT NULL)');this.arcadeS={};if(ctx.blockConcurrencyWhile&&this.sql.exec("SELECT id FROM race_requests WHERE state='pending' LIMIT 1").toArray().length)ctx.blockConcurrencyWhile(()=>this.schedule());if(ctx.setWebSocketAutoResponse)ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'));}
  sockets(){return this.ctx.getWebSockets().filter(ws=>ws.readyState===1);}
  users(){const users=new Map();for(const ws of this.sockets()){const a=ws.deserializeAttachment();if(!a.bridge&&!a.chatOnly)users.set(a.id,{id:a.id,name:a.name,avatar:a.avatar,x:a.x,y:a.y});}return [...users.values()];}
  send(ws,value){try{ws.send(JSON.stringify(value));}catch{}}
  broadcast(value,exclude=null){for(const ws of this.sockets())if(ws!==exclude&&!ws.deserializeAttachment().bridge)this.send(ws,value);}
  history(){return this.sql.exec('SELECT id,uid,name,text,source,created,pending FROM messages ORDER BY id DESC LIMIT 40').toArray().reverse();}
  async validateAudience(){
    const now=Date.now();await Promise.all(this.sockets().map(async ws=>{const a=ws.deserializeAttachment();if(a.bridge||a.authUntil>=now)return;const valid=await this.env.DB.prepare('SELECT hash FROM tokens WHERE hash=? AND created>=?').bind(a.tokenHash,now-30*86400000).first();const access=a.channel?await channelAccess(this.env,a.discordId,a.guild,a.channel):null;if(!valid||a.channel&&!access||now-a.connected>3600000){ws.close(4003,'계정 또는 채널 권한이 바뀌었어요.');return;}const current=ws.deserializeAttachment();current.canSend=access?access.canSend:true;current.authUntil=now+20000;ws.serializeAttachment(current);}));
  }
  async fetch(req){
    if(this.env.LAND_ENABLED!=='true')return Response.json({error:'land_disabled',msg:'쪼꼬미랜드는 개발 중이에요.'},{status:503});
    if(new URL(req.url).pathname==='/notice'){const b=await req.json().catch(()=>null);return Response.json({sent:this.notice(b?.notice,b?.id)});}
    const a=JSON.parse(decodeURIComponent(req.headers.get('X-Land-User')||'null'));if(!a)return new Response('Forbidden',{status:403});
    if(new URL(req.url).pathname==='/invalidate'&&a.bridge){for(const ws of this.sockets())ws.close(4003,'채널 연동이 해제되었어요.');return Response.json({ok:true});}
    if(!a.bridge&&!a.chatOnly&&this.users().filter(u=>u.id!==a.id).length>=20||this.sockets().length>=60)return new Response('이 광장은 가득 찼어요. 다른 광장을 선택해주세요.',{status:429});
    for(const old of this.sockets()){const u=old.deserializeAttachment();if(a.bridge?u.bridge:u.id===a.id&&!!u.chatOnly===!!a.chatOnly){old.close(4002,'다른 창에서 접속했어요.');}}
    const returning=this.sockets().some(s=>{const u=s.deserializeAttachment();return !u.bridge&&!u.chatOnly&&u.id===a.id;});const pair=new WebSocketPair(),[client,server]=Object.values(pair);this.ctx.acceptWebSocket(server,[a.bridge?'bridge':a.id]);
    server.serializeAttachment({...a,x:WORLD.spawn.x,y:WORLD.spawn.y,lastMove:Date.now(),seq:0,lastChat:0,authUntil:Date.now()+20000,connected:Date.now()});
    if(!a.bridge&&!a.chatOnly&&setAway(this.pokerState(),a.id,false))this.pokerSave();
    if(a.bridge){this.send(server,{type:'outbox',messages:this.sql.exec('SELECT * FROM messages WHERE pending=1 ORDER BY id LIMIT 100').toArray()});this.broadcast({type:'relay',online:true});}
    else{this.send(server,{type:'welcome',self:a.id,users:this.users(),messages:this.history()});if(a.channel)this.send(server,{type:'relay',online:this.sockets().some(s=>s.deserializeAttachment().bridge)});this.broadcast({type:'users',users:this.users()},server);if(!a.chatOnly)this.arrive(a,returning,server);}
    return new Response(null,{status:101,webSocket:client});
  }
  async webSocketMessage(ws,raw){
    if(this.env.LAND_ENABLED!=='true'){for(const peer of this.sockets())peer.close(1013,'쪼꼬미랜드는 개발 중이에요.');return;}
    if(typeof raw!=='string'||raw.length>2048){ws.close(1009,'메시지가 너무 커요.');return;}
    let m;try{m=JSON.parse(raw);}catch{return;}
    await this.ctx.blockConcurrencyWhile(async()=>{
      await this.validateAudience();if(ws.readyState!==1)return;
      let a=ws.deserializeAttachment(),now=Date.now();
      if(a.bridge){this.bridgeMessage(ws,m,a);return;}
      if(a.version!==WORLD.version){ws.close(4001,'새로고침 후 넓어진 마을에 들어와주세요.');return;}
      if(now-a.connected>3600000){ws.close(4001,'접속을 새로 확인해주세요.');return;}
      if(a.authUntil<now){const valid=await this.env.DB.prepare('SELECT hash FROM tokens WHERE hash=? AND created>=?').bind(a.tokenHash,now-30*86400000).first();let access=null;if(a.channel)access=await channelAccess(this.env,a.discordId,a.guild,a.channel);if(!valid||a.channel&&!access){ws.close(4003,'계정 또는 채널 권한이 바뀌었어요.');return;}a.canSend=access?access.canSend:true;a.authUntil=now+20000;}
      if(m.type==='poker'){await this.pokerMessage(ws,a,m,now);return;}
      if(m.type==='arcade'){await this.arcadeMessage(ws,a,m,now);return;}
      if(m.type==='voice'){
        if(a.chatOnly||typeof m.speaking!=='boolean')return;const proof=await verify(this.env,m.proof||'');if(!proof||proof.type!=='voice'||proof.resident!==a.id||proof.room!==a.room)return;a.voiceUntil=m.speaking?now+4500:0;ws.serializeAttachment(a);this.broadcast({type:'voice',id:a.id,speaking:m.speaking});
      }else if(m.type==='move'){
        if(a.chatOnly)return;
        if(!Number.isSafeInteger(m.seq)||m.seq<=a.seq||![-1,0,1].includes(m.dx)||![-1,0,1].includes(m.dy))return;
        // 지난 메시지 뒤로 흐른 시간은 그때 받은 방향으로 걷고(클라이언트 예측과 같은 계산), 새 방향은 다음 구간에 쓴다. 멈춤은 65ms 안이라도 받는다.
        const elapsed=now-a.lastMove,stopping=!m.dx&&!m.dy&&(a.dx||a.dy);if(elapsed<65&&!stopping)return;const pos=move(a,a.dx||0,a.dy||0,Math.min(.15,elapsed/1000));a.x=pos.x;a.y=pos.y;a.dx=m.dx;a.dy=m.dy;a.lastMove=now;a.seq=m.seq;ws.serializeAttachment(a);this.broadcast({type:'move',user:{id:a.id,name:a.name,avatar:a.avatar,x:a.x,y:a.y},seq:a.seq});
      }else if(m.type==='history'){this.send(ws,{type:'history',messages:this.history()});
      }else if(m.type==='chat'){
        if(!a.canSend){this.send(ws,{type:'error',msg:'이 채널에 메시지를 보낼 권한이 없어요.'});return;}
        if(typeof m.text!=='string'||m.text.length>300||!/^[0-9a-f-]{36}$/i.test(m.clientId||''))return;
        const text=m.text.normalize('NFC').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim();if(!text)return;
        const old=this.sql.exec('SELECT id FROM messages WHERE client_id=?',a.id+':'+m.clientId).toArray()[0];if(old){this.send(ws,{type:'ack',clientId:m.clientId,id:old.id});return;}
        if(now-a.lastChat<1500){this.send(ws,{type:'error',msg:'메시지는 잠시 간격을 두고 보내주세요.',clientId:m.clientId});return;}
        a.lastChat=now;ws.serializeAttachment(a);
        const row=this.sql.exec('INSERT INTO messages(client_id,uid,name,text,source,created,pending) VALUES(?,?,?,?,?,?,?) RETURNING *',a.id+':'+m.clientId,a.id,a.name,text,'land',now,a.channel?1:0).toArray()[0];
        this.broadcast({type:'chat',message:{id:row.id,uid:row.uid,name:row.name,text:row.text,source:row.source,created:row.created,pending:row.pending},clientId:m.clientId});this.send(ws,{type:'ack',clientId:m.clientId,id:row.id});
        if(a.channel)for(const s of this.sockets())if(s.deserializeAttachment().bridge)this.send(s,{type:'outbox',messages:[row]});this.prune();
      }else if(m.type==='avatar'){a.avatar=avatar(m.avatar);ws.serializeAttachment(a);this.broadcast({type:'users',users:this.users()});}
    });
  }
  bridgeMessage(ws,m){this.applyBridge(ws,m);if(typeof m.eventId==='string'&&/^[0-9a-f-]{36}$/i.test(m.eventId))this.send(ws,{type:'bridgeAck',eventId:m.eventId});}
  applyBridge(ws,m){
    if(m.type==='pullOutbox'){this.send(ws,{type:'outbox',messages:this.sql.exec('SELECT * FROM messages WHERE pending=1 ORDER BY id LIMIT 100').toArray()});return;}
    if(m.type==='delivered'&&Number.isSafeInteger(m.id)&&dcId(m.discordId)){this.sql.exec('UPDATE messages SET pending=0,discord_id=? WHERE id=?',m.discordId,m.id);this.broadcast({type:'delivery',id:m.id});return;}
    if(m.type==='discord'&&dcId(m.id)&&dcId(m.author)&&typeof m.text==='string'&&typeof m.name==='string'){
      if(this.sql.exec('SELECT id FROM messages WHERE discord_id=?',m.id).toArray().length)return;
      const row=this.sql.exec('INSERT INTO messages(client_id,uid,name,text,source,created,discord_id) VALUES(?,?,?,?,?,?,?) RETURNING *','discord:'+m.id,'d:'+m.author,m.name.slice(0,40),m.text.slice(0,300),'discord',Date.now(),m.id).toArray()[0];this.broadcast({type:'chat',message:{id:row.id,uid:row.uid,name:row.name,text:row.text,source:row.source,created:row.created}});this.prune();
    }else if(m.type==='discordEdit'&&dcId(m.id)&&typeof m.text==='string'){const row=this.sql.exec('UPDATE messages SET text=? WHERE discord_id=? RETURNING id',m.text.slice(0,300),m.id).toArray()[0];if(row)this.broadcast({type:'edit',id:row.id,text:m.text.slice(0,300)});}
    else if(m.type==='discordDelete'&&dcId(m.id)){const row=this.sql.exec('DELETE FROM messages WHERE discord_id=? RETURNING id',m.id).toArray()[0];if(row)this.broadcast({type:'delete',id:row.id});}
    else if(m.type==='deliveryError'&&Number.isSafeInteger(m.id))this.broadcast({type:'deliveryError',id:m.id,msg:'Discord 전송 결과를 확인하지 못했어요. 마을 대화는 유지돼요.'});
  }
  // 공지: 같은 id는 한 번만. 방 밖 요청(/notice)과 입장·퇴장이 함께 쓴다
  notice(notice,id=null,exclude=null){if(!notice||typeof notice.text!=='string')return false;if(id){if(this.noticeIds.has(id))return false;this.noticeIds.add(id);if(this.noticeIds.size>200)this.noticeIds.delete(this.noticeIds.values().next().value);}this.broadcast({type:'notice',notice:{kind:String(notice.kind||''),text:notice.text.slice(0,120),at:Date.now()}},exclude);return true;}
  // 입장: 잠깐 끊겼다 돌아온 사람(퇴장 대기 중)은 조용히, 같은 사람은 joinCooldownMs 안에 한 번만
  arrive(a,returning,exclude){const now=Date.now(),row=this.sql.exec('SELECT * FROM presence WHERE id=?',a.id).toArray()[0];
    if(row?.leave_due!=null||returning){this.sql.exec('UPDATE presence SET leave_due=NULL,name=? WHERE id=?',a.name,a.id);return;}
    if(row&&now-row.joined<NOTICE.joinCooldownMs)return;
    this.sql.exec('INSERT INTO presence(id,name,joined) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,joined=excluded.joined,leave_due=NULL',a.id,a.name,now);this.notice(joinNotice(a.name),null,exclude);}
  // 퇴장: 마지막 창이 닫히면 leaveDelayMs 뒤에 아직 없을 때만 알린다
  depart(a){if(!a||a.bridge||a.chatOnly||this.users().some(u=>u.id===a.id))return;const due=Date.now()+NOTICE.leaveDelayMs;this.sql.exec('UPDATE presence SET leave_due=? WHERE id=?',due,a.id);this.schedule().catch(e=>console.error("land alarm",e.message));}
  // 알람 하나로 퇴장 공지·포커 차례·포커 정산 재시도를 모두 깨운다
  async schedule(){const leave=this.sql.exec('SELECT MIN(leave_due) AS due FROM presence WHERE leave_due IS NOT NULL').toArray()[0]?.due,pay=this.sql.exec('SELECT MIN(due) AS due FROM poker_payouts').toArray()[0]?.due;const next=Math.min(...[leave,nextDue(this.pokerState()),pay,crashDue(this.arcadeState('crash')),partyDue(this.arcadeState('party'),Date.now()),duelDue(this.arcadeState('duel')),raceDue(this.arcadeState('horse'),Date.now()),this.sql.exec("SELECT MIN(due) AS due FROM race_requests WHERE state='pending'").toArray()[0]?.due].filter(x=>x!=null));if(Number.isFinite(next)&&this.ctx.storage.setAlarm)await this.ctx.storage.setAlarm(next);}
  async alarm(){const now=Date.now(),online=new Set(this.users().map(u=>u.id));
    for(const row of this.sql.exec('SELECT * FROM presence WHERE leave_due IS NOT NULL AND leave_due<=?',now).toArray()){this.sql.exec('UPDATE presence SET leave_due=NULL WHERE id=?',row.id);if(!online.has(row.id))this.notice(leaveNotice(row.name));}
    this.sql.exec('DELETE FROM presence WHERE leave_due IS NULL AND joined<?',now-86400000);await this.pokerAlarm();await this.raceRecover();await this.arcadeAlarm();await this.schedule();}
  // ── 포커: 방마다 테이블 하나. 덱·남의 패는 이 DO 안에만 있고 손님에게는 각자 view()만 보낸다 ──
  pokerState(){if(!this.pokerT){const row=this.sql.exec('SELECT data FROM poker WHERE id=1').toArray()[0];this.pokerT=row?JSON.parse(row.data):newTable();}return this.pokerT;}
  pokerSave(){this.sql.exec('INSERT INTO poker(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',JSON.stringify(this.pokerT));}
  pokerPush(now=Date.now()){const t=this.pokerState();for(const ws of this.sockets()){const a=ws.deserializeAttachment();if(a.poker&&!a.bridge)this.send(ws,{type:'poker',table:pokerView(t,a.id,now)});}}
  async pokerMessage(ws,a,m,now){
    if(a.chatOnly||typeof m.op!=='string')return;
    const t=this.pokerState();if(a.room)t.room=a.room;
    let ev={cashOuts:[],wins:[]};
    try{
      if(m.op==='watch'){a.poker=m.on!==false;ws.serializeAttachment(a);if(a.poker){if(setAway(t,a.id,false))this.pokerSave();this.send(ws,{type:'poker',table:pokerView(t,a.id,now)});}return;}
      if(m.op==='sit'){
        const seat=Number(m.seat),amount=Number(m.buyIn),who={id:a.id,key:a.key,name:a.name};checkSit(t,seat,who,amount);
        const paid=await this.pokerWallet(a.key,a.name,'pokerBuyIn',crypto.randomUUID(),amount);if(!paid.ok){this.send(ws,{type:'pokerError',msg:paid.msg});return;}
        try{pokerSit(t,seat,who,amount,Date.now());}catch(e){ev.cashOuts.push({key:a.key,id:a.id,name:a.name,amount,reason:'refund'});this.send(ws,{type:'pokerError',msg:e.message});}
        if(!a.poker){a.poker=true;ws.serializeAttachment(a);}
      }else if(m.op==='leave')ev=standUp(t,a.id,now);
      else if(m.op==='act'){if(m.hand!==t.hand){this.send(ws,{type:'pokerError',msg:'이미 지난 판이에요.'});return;}ev=pokerAct(t,a.id,{type:m.action,amount:m.amount},now);}
      else return;
    }catch(e){if(!e.poker)throw e;this.send(ws,{type:'pokerError',msg:e.message});return;}
    await this.pokerCommit(ev);
  }
  // 저장 → 돌려줄 칩은 먼저 표에 적고(재시도 가능) → 큰 당첨 공지 → 지급 → 화면 갱신 → 알람
  async pokerCommit(ev,now=Date.now()){this.pokerSave();for(const c of ev.cashOuts)this.sql.exec('INSERT INTO poker_payouts(id,key,name,amount,created,due) VALUES(?,?,?,?,?,?)',crypto.randomUUID(),c.key,c.name,c.amount,now,now);
    const t=this.pokerT;for(const w of ev.wins){const n=winNotice(w.name,{game:'poker',bet:w.contributed,payout:w.amount});if(!n)continue;const id='poker:'+(t.room||'')+':'+w.hand+':'+w.seat;this.notice(n,id);const others=NOTICE.winRooms.filter(k=>k!==t.room);if(this.env.LAND_ROOMS&&others.length)Promise.all(others.map(k=>room(this.env,k).fetch(new Request('https://room/notice',{method:'POST',body:JSON.stringify({notice:n,id})})))).catch(e=>console.error('poker notice',e.message));}
    this.pokerPush(now);await this.pokerPay();await this.schedule();}
  async pokerPay(){const now=Date.now();for(const row of this.sql.exec('SELECT * FROM poker_payouts WHERE due<=? ORDER BY created LIMIT 20',now).toArray()){let extra={};try{extra=JSON.parse(row.extra||'{}');}catch{}const r=await this.pokerWallet(row.key,row.name,row.op||'pokerCashOut',row.id,row.amount,extra);if(r.ok)this.sql.exec('DELETE FROM poker_payouts WHERE id=?',row.id);else this.sql.exec('UPDATE poker_payouts SET tries=tries+1,due=? WHERE id=?',now+Math.min(600000,5000*2**Math.min(row.tries,7)),row.id);}}
  // 지갑(LandPlayer)에 바이인·정산을 적는다. 같은 id는 지갑이 한 번만 반영한다(재시도 안전)
  async pokerWallet(key,name,op,id,amount,extra={}){
    if(!key||!this.env.LAND_PLAYERS)return {ok:false,msg:'지갑에 연결할 수 없어요. 잠시 후 다시 해주세요.'};
    try{const r=await player(this.env,key).fetch(new Request('https://player/',{method:'POST',body:JSON.stringify({key,name,op,internal:true,id,issued:Date.now(),payload:{...extra,amount}})}));const data=await r.json();
      if(!r.ok)return {ok:false,status:r.status,msg:data.msg||'지갑 처리에 실패했어요.'};
      const balance=data.wallet?.balance;if(Number.isSafeInteger(balance)){for(const ws of this.sockets()){const a=ws.deserializeAttachment();if(a.key===key&&!a.bridge)this.send(ws,{type:'wallet',balance});}Promise.resolve().then(()=>saveRank(this.env,key,data.resident?.name||name,balance)).catch(e=>console.error('poker rank',e.message));}
      return {ok:true,balance};
    }catch{return {ok:false,msg:'지갑에 연결할 수 없어요. 잠시 후 다시 해주세요.'};}
  }
  async pokerAlarm(){const run=async()=>{const now=Date.now(),t=this.pokerState(),due=nextDue(t);if(due!=null&&due<=now)await this.pokerCommit(pokerTick(t,now),now);else await this.pokerPay();};return this.ctx.blockConcurrencyWhile?this.ctx.blockConcurrencyWhile(run):run();}
  // ── 🚀 크래시 · 🔫 총쏘기 서바이벌 · 🎁 초코 선물: 포커와 같은 길(상태 표 → 정산 표 → 지갑 → 화면 → 알람) ──
  arcadeState(game){if(!this.arcadeS[game]){const row=this.sql.exec('SELECT data FROM arcade WHERE game=?',game).toArray()[0];this.arcadeS[game]=row?JSON.parse(row.data):game==='crash'?newCrash():game==='duel'?newDuel():game==='horse'?newRace():newParty();if(game==='horse')this.arcadeSave(game);}return this.arcadeS[game];}
  arcadeSave(game){this.sql.exec('INSERT INTO arcade(game,data) VALUES(?,?) ON CONFLICT(game) DO UPDATE SET data=excluded.data',game,JSON.stringify(this.arcadeS[game]));}
  arcadeView(game,id,now){const s=this.arcadeState(game);return game==='crash'?crashView(s,id,now):game==='duel'?duelView(s,id,now):game==='horse'?raceView(s,id,now):partyView(s,id,now);}
  arcadePush(game,now=Date.now()){for(const ws of this.sockets()){const a=ws.deserializeAttachment();if(a.arcade===game&&!a.bridge)this.send(ws,{type:'arcade',game,view:this.arcadeView(game,a.id,now)});}}
  payout(c,now,op='roomCashOut',extra=null){this.sql.exec('INSERT INTO poker_payouts(id,key,name,amount,created,due,op,extra) VALUES(?,?,?,?,?,?,?,?)',crypto.randomUUID(),c.key,c.name,c.amount,now,now,op,JSON.stringify(extra||{game:c.game,reason:c.reason}));}
  winBroadcast(n,id){this.notice(n,id);const here=this.roomKey,others=NOTICE.winRooms.filter(k=>k!==here);if(this.env.LAND_ROOMS&&others.length)Promise.all(others.map(k=>room(this.env,k).fetch(new Request('https://room/notice',{method:'POST',body:JSON.stringify({notice:n,id})})))).catch(e=>console.error('arcade notice',e.message));}
  async arcadeMessage(ws,a,m,now){
    if(a.chatOnly||typeof m.op!=='string'||!['crash','party','duel','gift','horse'].includes(m.game))return;
    if(a.room)this.roomKey=a.room;
    const err=msg=>this.send(ws,{type:'arcadeError',game:m.game,msg});
    if(m.game==='gift'){if(m.op==='send')await this.giftMessage(ws,a,m,now,err);return;}
    if(m.game==='horse'&&m.op==='bet'){await this.raceMessage(ws,a,m,now,err);return;}
    const game=m.game,s=this.arcadeState(game),who={id:a.id,key:a.key,name:a.name};let ev={cashOuts:[],wins:[]};
    try{
      if(m.op==='watch'){a.arcade=m.on===false?null:game;ws.serializeAttachment(a);if(a.arcade)this.send(ws,{type:'arcade',game,view:this.arcadeView(game,a.id,now)});return;}
      if(game==='crash'&&m.op==='bet'){
        const bet=Number(m.bet),auto=m.auto==null||m.auto===''?null:Number(m.auto);checkCrashBet(s,who,bet,auto);
        const paid=await this.pokerWallet(a.key,a.name,'roomBuyIn',crypto.randomUUID(),bet,{game});if(!paid.ok){err(paid.msg);return;}
        try{placeCrashBet(s,who,bet,auto,Date.now());}catch(e){ev.cashOuts.push({...who,amount:bet,game,reason:'refund'});err(e.message);}
      }else if(game==='crash'&&m.op==='cash')ev=crashCash(s,a.id,now);
      else if(game==='party'&&m.op==='join'){
        const amount=checkPartyJoin(s,who,Number(m.stake));
        const paid=await this.pokerWallet(a.key,a.name,'roomBuyIn',crypto.randomUUID(),amount,{game});if(!paid.ok){err(paid.msg);return;}
        try{partyJoin(s,who,amount,Date.now());}catch(e){ev.cashOuts.push({...who,amount,game,reason:'refund'});err(e.message);}
      }else if(game==='party'&&m.op==='leave')ev=partyLeave(s,a.id);
      else if(game==='duel'&&m.op==='join'){
        const amount=checkDuelJoin(s,who,Number(m.stake));
        const paid=await this.pokerWallet(a.key,a.name,'roomBuyIn',crypto.randomUUID(),amount,{game});if(!paid.ok){err(paid.msg);return;}
        try{duelJoin(s,who,amount,Date.now());}catch(e){ev.cashOuts.push({...who,amount,game,reason:'refund'});err(e.message);}
      }else if(game==='duel'&&m.op==='leave')ev=duelLeave(s,a.id);
      // 사격 시각은 이 DO가 메시지를 받은 시각(now). 지갑을 기다리지 않으므로 먼저 도착한 사격이 먼저 처리된다
      else if(game==='duel'&&m.op==='shoot')ev=duelShoot(s,a.id,now);
      else return;
      if(a.arcade!==game){a.arcade=game;ws.serializeAttachment(a);}
    }catch(e){if(!e.arcade)throw e;err(e.message);return;}
    await this.arcadeCommit(game,ev);
  }
  async arcadeCommit(game,ev,now=Date.now()){const commit=()=>{this.arcadeSave(game);for(const c of ev.cashOuts)this.payout(c,now);};if(this.ctx.storage.transactionSync)this.ctx.storage.transactionSync(commit);else commit();
    for(const w of ev.wins){const n=winNotice(w.name,{game:w.game,bet:w.bet,payout:w.payout});if(n)this.winBroadcast(n,(this.roomKey||'')+':'+w.noticeId);}
    this.arcadePush(game,now);await this.pokerPay();await this.schedule();}
  async arcadeAlarm(){const run=async()=>{for(const game of ['crash','party','duel','horse']){const now=Date.now(),s=this.arcadeState(game),due=game==='crash'?crashDue(s):game==='duel'?duelDue(s):game==='horse'?raceDue(s,now):partyDue(s,now);if(due==null||due>now)continue;const ev=game==='crash'?crashTick(s,now):game==='duel'?duelTick(s,now):game==='horse'?raceTick(s,now):partyTick(s,now);await this.arcadeCommit(game,ev,now);}};return this.ctx.blockConcurrencyWhile?this.ctx.blockConcurrencyWhile(run):run();}
  // 경마 참가 요청을 지갑 호출 전에 기록한다. 응답 유실/DO 재시작에도 같은 지갑 요청 번호로 복구한다.
  async raceMessage(ws,a,m,now,err){
    if(!/^[0-9a-f-]{36}$/i.test(m.requestId||'')||!Number.isSafeInteger(m.issued)||Math.abs(now-m.issued)>300000){err('요청 시간이 지났어요. 새로고침 후 참가해주세요.');return;}
    const old=this.sql.exec('SELECT * FROM race_requests WHERE id=?',m.requestId).toArray()[0];
    if(old){const p=JSON.parse(old.data);if(old.key!==a.key||p.bet!==m.bet||p.choice!==m.choice||p.clientRound!==m.round||p.raceId!==m.raceId){err('같은 요청 번호의 내용이 달라요.');return;}if(old.state==='pending')await this.raceRecoverOne(old);this.send(ws,{type:'arcade',game:'horse',view:this.arcadeView('horse',a.id,Date.now())});return;}
    const s=this.arcadeState('horse');
    try{if(m.round!==s.round||m.raceId!==s.id)throw Object.assign(Error('새 경주표를 확인한 뒤 참가해주세요.'),{arcade:true});checkRaceBet(s,a,m.bet,m.choice,now);}catch(e){err(e.message);return;}
    const p={id:m.requestId,key:a.key,name:a.name,resident:a.id,bet:m.bet,choice:m.choice,clientRound:m.round,raceId:s.id,round:s.round+(s.phase==='idle'?1:0)};
    this.sql.exec('INSERT INTO race_requests VALUES(?,?,?,?,?,?)',p.id,a.key,JSON.stringify(p),'pending',now,now);
    a.arcade='horse';ws.serializeAttachment(a);await this.schedule();
    const ok=await this.raceRecoverOne({id:p.id,data:JSON.stringify(p)});if(!ok)err('참가 결제를 확인하고 있어요. 같은 판에 다시 걸지 않아도 자동으로 확인해요.');
    await this.schedule();
  }
  async raceRecoverOne(row){
    const p=JSON.parse(row.data),now=Date.now(),paid=await this.pokerWallet(p.key,p.name,'roomBuyIn',p.id,p.bet,{game:'horse'});
    if(!paid.ok){if(paid.status>=400&&paid.status<500){this.sql.exec("UPDATE race_requests SET state='failed',due=NULL WHERE id=?",p.id);for(const ws of this.sockets())if(ws.deserializeAttachment().key===p.key)this.send(ws,{type:'arcadeError',game:'horse',msg:paid.msg});return true;}this.sql.exec('UPDATE race_requests SET due=? WHERE id=?',now+5000,p.id);return false;}
    const s=this.arcadeState('horse'),who={id:p.resident,key:p.key,name:p.name,requestId:p.id},refund=[];
    try{if(s.id!==p.raceId||s.round+(s.phase==='idle'?1:0)!==p.round)throw Error('지난 경주');raceBet(s,who,p.bet,p.choice,now);}catch{if(!s.bets.some(b=>b.requestId===p.id))refund.push({...who,amount:p.bet,game:'horse',reason:'refund'});}
    const commit=()=>{this.arcadeSave('horse');for(const c of refund)this.payout(c,now);this.sql.exec("UPDATE race_requests SET state='done',due=NULL WHERE id=?",p.id);};
    if(this.ctx.storage.transactionSync)this.ctx.storage.transactionSync(commit);else commit();
    this.arcadePush('horse',now);await this.pokerPay();return true;
  }
  async raceRecover(){const run=async()=>{for(const row of this.sql.exec("SELECT * FROM race_requests WHERE state='pending' AND due<=? LIMIT 20",Date.now()).toArray())await this.raceRecoverOne(row);this.sql.exec("DELETE FROM race_requests WHERE state<>'pending' AND created<?",Date.now()-7*86400000);};return this.ctx.blockConcurrencyWhile?this.ctx.blockConcurrencyWhile(run):run();}
  // 선물: 같은 광장에 지금 있는 주민에게만. 보내는 사람 지갑에서 먼저 빼고, 받는 사람 몫(수수료 뺀 값)은 정산 표로 넘겨 재시도한다
  async giftMessage(ws,a,m,now,err){
    const amount=Number(m.amount);if(!Number.isSafeInteger(amount)||amount<GIFT.min||amount>GIFT.max){err('선물은 '+GIFT.min+'~'+GIFT.max.toLocaleString('ko-KR')+'초코로 보낼 수 있어요.');return;}
    if(m.to===a.id){err('자기 자신에게는 보낼 수 없어요.');return;}
    const target=this.sockets().map(w=>w.deserializeAttachment()).find(x=>!x.bridge&&!x.chatOnly&&x.id===m.to);if(!target){err('지금 이 광장에 있는 주민에게만 보낼 수 있어요.');return;}
    if(target.key===a.key){err('자기 자신에게는 보낼 수 없어요.');return;}
    if(now-(a.lastGift||0)<3000){err('선물은 잠시 간격을 두고 보내주세요.');return;}
    a.lastGift=now;ws.serializeAttachment(a);
    const sent=await this.pokerWallet(a.key,a.name,'giftSend',crypto.randomUUID(),amount,{to:target.name});if(!sent.ok){err(sent.msg);return;}
    const got=giftNet(amount);this.payout({key:target.key,name:target.name,amount:got},now,'roomCashOut',{game:'gift',from:a.name});
    for(const w of this.sockets()){const x=w.deserializeAttachment();if(x.bridge)continue;if(x.id===a.id)this.send(w,{type:'gift',dir:'sent',to:target.name,amount,net:got});else if(x.id===target.id)this.send(w,{type:'gift',dir:'got',from:a.name,amount:got});}
    await this.pokerPay();await this.schedule();
  }
  prune(){this.sql.exec('DELETE FROM messages WHERE id<(SELECT COALESCE(MAX(id),0)-199 FROM messages) AND pending=0');}
  webSocketClose(ws,code,reason){try{ws.close(code>=1000&&![1005,1006,1015].includes(code)?code:1000,String(reason||'').slice(0,60));}catch{}const gone=ws.deserializeAttachment();if(gone?.bridge)this.broadcast({type:'relay',online:false});this.broadcast({type:'users',users:this.users()});this.depart(gone);
    if(gone&&!gone.bridge&&!gone.chatOnly&&!this.sockets().some(s=>s.deserializeAttachment().id===gone.id)&&setAway(this.pokerState(),gone.id,true)){this.pokerSave();this.pokerPush();this.schedule().catch(e=>console.error('land alarm',e.message));}}
  webSocketError(ws){try{ws.close(1011,'다시 연결해주세요.');}catch{}}
}
