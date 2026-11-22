import {WORLD,move,avatar,canStand} from '../../land/world.js';
export {LandPlayer} from './land-player.js';
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
export async function handleLand(req,env,ctx,h){
  const url=new URL(req.url),path=url.pathname;
  try{
    if(path==='/land/health')return h.J(req,{ok:true,version:1,discord:!!env.LAND_BRIDGE_SECRET});
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
    const b=await h.readBody(req);
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
      const r=await player(env,p.key).fetch(new Request('https://player/',{method:'POST',body:JSON.stringify({key:p.key,name:p.name,discordId:linked?.discord_id,op:b.op||'get',payload:b.payload,id:b.id,issued:b.issued})}));return h.J(req,{...await r.json(),discord:{linked:!!linked,available:!!env.LAND_BRIDGE_SECRET}},r.status);
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
export class LandRoom{
  constructor(ctx,env){this.ctx=ctx;this.env=env;this.sql=ctx.storage.sql;this.sql.exec('CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT,client_id TEXT UNIQUE,uid TEXT NOT NULL,name TEXT NOT NULL,text TEXT NOT NULL,source TEXT NOT NULL,created INTEGER NOT NULL,discord_id TEXT,pending INTEGER NOT NULL DEFAULT 0)');if(ctx.setWebSocketAutoResponse)ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'));}
  sockets(){return this.ctx.getWebSockets().filter(ws=>ws.readyState===1);}
  users(){const users=new Map();for(const ws of this.sockets()){const a=ws.deserializeAttachment();if(!a.bridge&&!a.chatOnly)users.set(a.id,{id:a.id,name:a.name,avatar:a.avatar,x:a.x,y:a.y});}return [...users.values()];}
  send(ws,value){try{ws.send(JSON.stringify(value));}catch{}}
  broadcast(value,exclude=null){for(const ws of this.sockets())if(ws!==exclude&&!ws.deserializeAttachment().bridge)this.send(ws,value);}
  history(){return this.sql.exec('SELECT id,uid,name,text,source,created,pending FROM messages ORDER BY id DESC LIMIT 40').toArray().reverse();}
  async validateAudience(){
    const now=Date.now();await Promise.all(this.sockets().map(async ws=>{const a=ws.deserializeAttachment();if(a.bridge||a.authUntil>=now)return;const valid=await this.env.DB.prepare('SELECT hash FROM tokens WHERE hash=? AND created>=?').bind(a.tokenHash,now-30*86400000).first();const access=a.channel?await channelAccess(this.env,a.discordId,a.guild,a.channel):null;if(!valid||a.channel&&!access||now-a.connected>3600000){ws.close(4003,'계정 또는 채널 권한이 바뀌었어요.');return;}const current=ws.deserializeAttachment();current.canSend=access?access.canSend:true;current.authUntil=now+20000;ws.serializeAttachment(current);}));
  }
  async fetch(req){
    const a=JSON.parse(decodeURIComponent(req.headers.get('X-Land-User')||'null'));if(!a)return new Response('Forbidden',{status:403});
    if(new URL(req.url).pathname==='/invalidate'&&a.bridge){for(const ws of this.sockets())ws.close(4003,'채널 연동이 해제되었어요.');return Response.json({ok:true});}
    if(!a.bridge&&!a.chatOnly&&this.users().filter(u=>u.id!==a.id).length>=20||this.sockets().length>=60)return new Response('이 광장은 가득 찼어요. 다른 광장을 선택해주세요.',{status:429});
    for(const old of this.sockets()){const u=old.deserializeAttachment();if(a.bridge?u.bridge:u.id===a.id&&!!u.chatOnly===!!a.chatOnly){old.close(4002,'다른 창에서 접속했어요.');}}
    const pair=new WebSocketPair(),[client,server]=Object.values(pair);this.ctx.acceptWebSocket(server,[a.bridge?'bridge':a.id]);
    server.serializeAttachment({...a,x:WORLD.spawn.x,y:WORLD.spawn.y,lastMove:Date.now(),seq:0,lastChat:0,authUntil:Date.now()+20000,connected:Date.now()});
    if(a.bridge){this.send(server,{type:'outbox',messages:this.sql.exec('SELECT * FROM messages WHERE pending=1 ORDER BY id LIMIT 100').toArray()});this.broadcast({type:'relay',online:true});}
    else{this.send(server,{type:'welcome',self:a.id,users:this.users(),messages:this.history()});if(a.channel)this.send(server,{type:'relay',online:this.sockets().some(s=>s.deserializeAttachment().bridge)});this.broadcast({type:'users',users:this.users()},server);}
    return new Response(null,{status:101,webSocket:client});
  }
  async webSocketMessage(ws,raw){
    if(typeof raw!=='string'||raw.length>2048){ws.close(1009,'메시지가 너무 커요.');return;}
    let m;try{m=JSON.parse(raw);}catch{return;}
    await this.ctx.blockConcurrencyWhile(async()=>{
      await this.validateAudience();if(ws.readyState!==1)return;
      let a=ws.deserializeAttachment(),now=Date.now();
      if(a.bridge){this.bridgeMessage(ws,m,a);return;}
      if(a.version!==WORLD.version){ws.close(4001,'새로고침 후 넓어진 마을에 들어와주세요.');return;}
      if(now-a.connected>3600000){ws.close(4001,'접속을 새로 확인해주세요.');return;}
      if(a.authUntil<now){const valid=await this.env.DB.prepare('SELECT hash FROM tokens WHERE hash=? AND created>=?').bind(a.tokenHash,now-30*86400000).first();let access=null;if(a.channel)access=await channelAccess(this.env,a.discordId,a.guild,a.channel);if(!valid||a.channel&&!access){ws.close(4003,'계정 또는 채널 권한이 바뀌었어요.');return;}a.canSend=access?access.canSend:true;a.authUntil=now+20000;}
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
  prune(){this.sql.exec('DELETE FROM messages WHERE id<(SELECT COALESCE(MAX(id),0)-199 FROM messages) AND pending=0');}
  webSocketClose(ws,code,reason){try{ws.close(code>=1000&&![1005,1006,1015].includes(code)?code:1000,String(reason||'').slice(0,60));}catch{}if(ws.deserializeAttachment()?.bridge)this.broadcast({type:'relay',online:false});this.broadcast({type:'users',users:this.users()});}
  webSocketError(ws){try{ws.close(1011,'다시 연결해주세요.');}catch{}}
}
