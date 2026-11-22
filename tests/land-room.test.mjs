import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {LandRoom,channelAccess} from '../server/src/land.js';
function fixture(){const db=new DatabaseSync(':memory:'),sockets=[];const sql={exec(query,...args){const rows=db.prepare(query).all(...args);return {toArray:()=>rows};}};const ctx={storage:{sql},getWebSockets:()=>sockets,blockConcurrencyWhile:fn=>fn()};const env={DB:{prepare(){return {bind(){return {first:async()=>null};}};}}};const room=new LandRoom(ctx,env);const socket=a=>{const ws={readyState:1,attachment:a,sent:[],deserializeAttachment(){return {...this.attachment};},serializeAttachment(v){this.attachment=v;},send(raw){this.sent.push(JSON.parse(raw));},close(code){this.code=code;this.readyState=3;}};sockets.push(ws);return ws;};return {db,room,socket};}
test('Discord relay deduplicates incoming events and propagates edits/deletes',()=>{
 const f=fixture(),bridge=f.socket({bridge:true}),user=f.socket({id:'resident',name:'주민',authUntil:Date.now()+10000});
 const message={type:'discord',id:'123456789012345678',author:'123456789012345679',name:'친구',text:'첫 대화',eventId:crypto.randomUUID()};f.room.bridgeMessage(bridge,message);f.room.bridgeMessage(bridge,message);assert.equal(f.room.history().length,1);assert.equal(user.sent.filter(m=>m.type==='chat').length,1);assert.equal(bridge.sent.filter(m=>m.type==='bridgeAck').length,2);
 f.room.bridgeMessage(bridge,{type:'discordEdit',id:message.id,text:'수정된 대화',eventId:crypto.randomUUID()});assert.equal(f.room.history()[0].text,'수정된 대화');assert.equal(user.sent.at(-1).type,'edit');
 f.room.bridgeMessage(bridge,{type:'discordDelete',id:message.id,eventId:crypto.randomUUID()});assert.equal(f.room.history().length,0);assert.equal(user.sent.at(-1).type,'delete');f.db.close();
});
test('revoked or expired audience is removed before new relay content is broadcast',async()=>{
 const f=fixture(),bridge=f.socket({bridge:true}),revoked=f.socket({id:'revoked',authUntil:0,connected:Date.now(),tokenHash:'revoked'});await f.room.validateAudience();assert.equal(revoked.code,4003);f.room.bridgeMessage(bridge,{type:'discord',id:'123456789012345678',author:'123456789012345679',name:'친구',text:'비공개 대화',eventId:crypto.randomUUID()});assert.equal(revoked.sent.length,0);f.db.close();
});
test('channel gate applies role overrides and timeout instead of inheriting bot permissions',async()=>{
 const original=globalThis.fetch;const guild='123456789012345670',channel='123456789012345671',role='123456789012345672',allowed='123456789012345673',denied='123456789012345674',timed='123456789012345675';
 globalThis.fetch=async url=>{if(url.endsWith('/guilds/'+guild))return Response.json({owner_id:'123456789012345699',roles:[{id:guild,permissions:String(1024+1048576+65536+2048)},{id:role,permissions:'0'}]});if(url.includes('/members/'))return Response.json({roles:url.endsWith(denied)?[role]:[],communication_disabled_until:url.endsWith(timed)?new Date(Date.now()+60000).toISOString():null});return Response.json({guild_id:guild,type:2,name:'음성방',permission_overwrites:[{id:role,type:0,deny:'1024',allow:'0'}]});};
 try{const env={DISCORD_BOT_TOKEN:'unit-test-placeholder'};assert.equal((await channelAccess(env,allowed,guild,channel)).canSend,true);assert.equal(await channelAccess(env,denied,guild,channel),null);assert.equal((await channelAccess(env,timed,guild,channel)).canSend,false);}finally{globalThis.fetch=original;}
});
test('ordinary text channels require text permissions without an unrelated voice Connect bit',async()=>{
 const original=globalThis.fetch,guild='223456789012345670',channel='223456789012345671',user='223456789012345673';globalThis.fetch=async url=>{if(url.endsWith('/guilds/'+guild))return Response.json({owner_id:'223456789012345699',roles:[{id:guild,permissions:String(1024+65536+2048)}]});if(url.includes('/members/'))return Response.json({roles:[],communication_disabled_until:null});return Response.json({guild_id:guild,type:0,name:'일반',permission_overwrites:[]});};try{const access=await channelAccess({DISCORD_BOT_TOKEN:'unit-test-placeholder'},user,guild,channel);assert.equal(access.kind,'text');assert.equal(access.canSend,true);}finally{globalThis.fetch=original;}
});
test('walking applies elapsed time with the previous direction and accepts a quick stop',async()=>{
 const {WORLD}=await import('../land/world.js');const f=fixture(),now=Date.now();
 const ws=f.socket({id:'walker',name:'걷는 주민',avatar:{},x:WORLD.spawn.x,y:WORLD.spawn.y,seq:0,lastMove:now-500,version:WORLD.version,connected:now,authUntil:now+60000});
 await f.room.webSocketMessage(ws,JSON.stringify({type:'move',seq:1,dx:1,dy:0}));
 assert.equal(ws.attachment.x,WORLD.spawn.x,'a new direction must not move the resident backwards in time');
 ws.attachment.lastMove=Date.now()-100;await f.room.webSocketMessage(ws,JSON.stringify({type:'move',seq:2,dx:1,dy:0}));
 const walked=ws.attachment.x-WORLD.spawn.x;assert.ok(walked>15&&walked<25,'about 100ms at walking speed, got '+walked);
 await f.room.webSocketMessage(ws,JSON.stringify({type:'move',seq:3,dx:0,dy:0}));assert.equal(ws.attachment.seq,3,'a stop right after a step is still accepted');
 await f.room.webSocketMessage(ws,JSON.stringify({type:'move',seq:4,dx:-1,dy:0}));assert.equal(ws.attachment.seq,3,'other moves inside 65ms are still throttled');
 assert.equal(ws.sent.filter(m=>m.type==='move').length,3);f.db.close();
});
