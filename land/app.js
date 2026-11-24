import {chips,chipLegend} from './chips.js?v=1';
import {tarotPhoto} from './tarot-photo.js?v=1';
import {WORLD,BUILDINGS,BOUNDARY,OFFSET,SHIRTS,SKINS,avatar,move,near} from './world.js?v=4';
import {drawResident,drawResidentFast} from './resident-art.js?v=5';
import {isActivity,connectDiscordVoice} from './discord-voice.js';
import {casinoOutcome as classifyOutcome,playCasinoFx,playSceneFx,settleMs,reelStopMs} from './casino-fx.js?v=13';
import {raceMarkup,playRace,RACE} from './race-script.js?v=2';
import {createPoker} from './poker-ui.js?v=4';
import {createArcade,ARCADE_TABS,ARCADE_RULES} from './arcade-ui.js?v=11';
import {getSound} from './sound/sound.js?v=7';
import {casinoCues,fortuneCues,PREWARM} from './sound/cues.js?v=5';
import {mountSoundControl} from './sound/ui.js?v=2';
// 소리: 첫 입력 전에는 AudioContext 를 만들지 않는다(sound.js). 첫 입력 뒤 자주 쓰는 소리를 미리 그린다.
const sound=getSound();sound.setScene('town');let soundRun={cancel(){}};
mountSoundControl(sound,document.querySelector('.top-actions'));
addEventListener('pointerdown',()=>setTimeout(()=>sound.prewarm(PREWARM),400),{once:true});
const $=id=>document.getElementById(id),local=['localhost','127.0.0.1'].includes(location.hostname);
const API=local?'http://127.0.0.1:8907':'https://sword-forge-api.aicore-sj-relay.workers.dev';
const money=n=>Number(n||0).toLocaleString('ko-KR'),h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const store={get:(k,session=false)=>{try{return JSON.parse((session?sessionStorage:localStorage).getItem(k));}catch{return null;}},set:(k,v,session=false)=>{try{const s=session?sessionStorage:localStorage;v===null?s.removeItem(k):s.setItem(k,JSON.stringify(v));}catch{}}};
let account=store.get('swordforge-acc'),profile=null,forge=null,socket=null,self=null,peers=new Map(),messages=[],chatPending=new Map(),epoch=0,reconnectTimer=null,reconnectCount=0,manualDisconnect=false,activeRoom='public:1',authMode='login',busy=false,venue=null,fortuneTab='daily',casinoTab='slots',lastResult=null,lastBet=100,casinoFx=null,selectedAvatar={shirt:0,hat:0},deck=null,linkCommand='',linkTimer=null,toastTimer=null;
const position={...WORLD.spawn},held=new Set(),movingKeys=new Map([['KeyW',[0,-1]],['ArrowUp',[0,-1]],['KeyS',[0,1]],['ArrowDown',[0,1]],['KeyA',[-1,0]],['ArrowLeft',[-1,0]],['KeyD',[1,0]],['ArrowRight',[1,0]]]);
const GAME_NAMES={slots:'슬롯',blackjack:'블랙잭',dice:'홀짝',horse:'경마',rps:'가위바위보',poker:'포커',quiz:'초성퀴즈',ledger:'이용 기록',...ARCADE_TABS};
// 탭이 많아 묶음(혼자·함께·그 밖)을 먼저 고르고 그 안의 게임을 고른다
const GAME_GROUPS={solo:['혼자 하기',['slots','blackjack','dice','rps','roulette','hilo','mines','baccarat','wheel','luckybox']],live:['함께 하기',['horse','crash','party','duel','poker']],etc:['그 밖',['gift','beg','quiz','ledger']]};
// 포커는 방(LandRoom)이 판을 돌리고 소켓으로 상태를 보낸다. 탭을 열면 구경(watch)을 켜고 닫으면 끈다.
const poker=createPoker({money,h,toast,sound,balance:()=>profile?.wallet?.balance||0,send:m=>{if(socket?.readyState===1)socket.send(JSON.stringify({type:'poker',...m}));else toast('마을 연결이 끊겼어요. 잠시 뒤 다시 해주세요.');}});
let pokerWatching=false;
function pokerWatch(on){if(pokerWatching===on)return;pokerWatching=on;if(socket?.readyState===1)socket.send(JSON.stringify({type:'poker',op:'watch',on}));}
setInterval(()=>{if(pokerWatching)poker.tick();},250);
const arcade=createArcade({money,h,toast,act,sound,history:()=>profile?.baccaratHistory||[],fx:(stage,outcome,game,delay=0,silent=false)=>{playCasinoFx(stage,{outcome,game,delay});if(silent)return;soundRun.cancel();soundRun=sound.cue(casinoCues(game,outcome,{reduced:reduceMotion()}).map(c=>({...c,at:c.at+delay})));},sfx:list=>{soundRun.cancel();soundRun=sound.cue(list);},reduced:()=>reduceMotion(),sfx:list=>{soundRun.cancel();soundRun=sound.cue(list);},balance:()=>profile?.wallet?.balance||0,wallet:()=>profile?.wallet||{},round:()=>profile?.arcade||null,
  peers:()=>[...peers.values()].filter(p=>p.id!==self&&p.name).map(p=>({id:p.id,name:p.name})),
  send:m=>{if(socket?.readyState===1)socket.send(JSON.stringify({type:'arcade',...m}));else if(m.op!=='watch')toast('마을 연결이 끊겼어요. 잠시 뒤 다시 해주세요.');},
  refresh:tab=>{if(tab)casinoTab=tab;if(venue==='casino'&&profile)renderCasino();}});
const RPS={rock:'✊ 바위',paper:'✋ 보',scissors:'✌ 가위'};
const SLOT_ART={'🍒':'arcade-slot-cherry.png','🍋':'arcade-slot-lemon.png','🍇':'arcade-slot-grape.png','🔔':'arcade-slot-bell.png','⭐':'arcade-slot-star.png','💎':'arcade-slot-diamond.png','7️⃣':'arcade-slot-seven.png'};
// 실사 WebP(assets/photo)를 먼저 쓰고, 없거나 깨지면 기존 그림 PNG로 되돌린다.
const art=name=>'assets/photo/'+name.replace(/\.png$/,'.webp');
document.addEventListener('error',event=>{const img=event.target;if(img?.tagName!=='IMG'||img.dataset.fallback||!img.src.includes('/assets/photo/'))return;img.dataset.fallback='1';img.src=img.src.replace('/assets/photo/','/assets/').replace(/\.webp(\?.*)?$/,'.png');},true);
Promise.all(['arcade-slot-machine','arcade-card-back','choco-coin'].map(n=>new Promise((ok,no)=>{const i=new Image();i.onload=ok;i.onerror=no;i.src='assets/photo/'+n+'.webp';}))).then(()=>document.documentElement.classList.add('photo-ok'),()=>console.warn('photo assets missing; using painted fallback'));
const canWalk=()=>!document.querySelector('dialog[open]')&&(!account||socket?.readyState===1);
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
async function api(path,body={},authenticated=true){const token=account?.token;const response=await fetch(API+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,...(authenticated?{token}:{})}),signal:AbortSignal.timeout(18000)});const data=await response.json();if(authenticated&&token!==account?.token)throw Error('계정이 바뀌었어요.');if(!response.ok){const error=Error(data.msg||'서버와 연결할 수 없어요.');error.status=response.status;error.code=data.error;throw error;}return data;}
function adopt(data){if(!profile||data.rev>=profile.rev)profile=data;renderHeader();}
async function refresh(){const data=await api('/land/player');adopt(data);return data;}
function pendingKey(){return 'jj-land-pending:'+account?.name;}
async function act(op,payload={}){
  if(!account){showAuth();throw Error('주민 등록 후 이용해주세요.');}if(busy)throw Error('앞선 요청을 처리하고 있어요.');
  const key=pendingKey(),prior=store.get(key,true);let request=prior;
  if(prior&&(prior.op!==op||JSON.stringify(prior.payload)!==JSON.stringify(payload))){throw Error('앞선 요청의 결과 확인이 필요해요. ‘기록 새로 확인’을 눌러주세요.');}
  if(!request){request={op,payload,id:crypto.randomUUID(),issued:Date.now()};store.set(key,request,true);}
  busy=true;setBusy(true);
  try{const data=await api('/land/player',request);store.set(key,null,true);adopt(data);return data;}
  catch(error){if(error.status&&error.status<500){store.set(key,null,true);if(error.status===401)showAuth();}throw error;}
  finally{busy=false;setBusy(false);}
}
function setBusy(value){document.querySelectorAll('[data-action],#saveAvatar').forEach(b=>{if(value){if(!b.hasAttribute('data-was-disabled'))b.dataset.wasDisabled=String(b.disabled);b.disabled=true;}else if(b.hasAttribute('data-was-disabled')){b.disabled=b.dataset.wasDisabled==='true';delete b.dataset.wasDisabled;}});}
async function recover(){if(busy)return;const request=store.get(pendingKey(),true);if(request){try{const data=await act(request.op,request.payload);lastResult=data.result;toast('앞선 요청의 결과를 확인했어요.');}catch(error){if(error.status===409){await refresh();toast('서버의 최신 기록을 불러왔어요. 이용 기록을 확인해주세요.');}else throw error;}}else await refresh();if(venue)renderVenue();}
function stop(){held.clear();if(socket?.readyState===1)sendMovement(true);}
function open(dialog){stop();if(!dialog.open)dialog.showModal();}
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(dialog=>{dialog.addEventListener('close',async()=>{if(dialog===$('venueDialog')){venue=null;if(poker.state&&poker.state.you!=null&&socket?.readyState===1)socket.send(JSON.stringify({type:'poker',op:'leave'}));pokerWatch(false);arcade.unmount();soundRun.cancel();sound.setScene(null);$('venueContent').replaceChildren();$('venueDialog').classList.remove('forge-mode');if(account){try{const data=await api('/load');forge=JSON.parse(data.save);renderHeader();}catch{}}}if(dialog===$('profileDialog'))clearInterval(linkTimer);$('world').focus({preventScroll:true});});dialog.addEventListener('cancel',stop);});
function renderHeader(){$('profileButton').textContent=account?account.name+' 주민':'주민 등록 / 로그인';$('gold').textContent=forge?money(forge.gold)+' G':'—';$('choco').textContent=profile?money(profile.wallet.balance)+' C':'—';}
function setAccount(value){closeSidebar();sidebarRoom='';$('chatChannel').value='';epoch++;account=value;store.set('swordforge-acc',value);profile=null;forge=null;self=null;chatPending.clear();messages=[];peers.clear();Object.assign(position,WORLD.spawn);closeSocket();renderChat(true);renderHeader();}
function showAuth(){open($('authDialog'));$('authError').textContent='';$('nameInput').focus();}
function authTab(mode){authMode=mode;$('loginTab').setAttribute('aria-pressed',String(mode==='login'));$('registerTab').setAttribute('aria-pressed',String(mode==='register'));$('authTitle').textContent=mode==='login'?'반가워요, 주민님':'작은 마을의 새 주민';$('authSubmit').textContent=mode==='login'?'마을에 들어가기':'주민 만들고 시작하기';$('pinInput').minLength=mode==='login'?4:6;$('pinInput').pattern=mode==='login'?'[0-9]{4,8}':'[0-9]{6,8}';$('pinInput').autocomplete=mode==='login'?'current-password':'new-password';$('pinInput').placeholder=mode==='login'?'기존 숫자 비밀번호':'숫자 6~8자리';$('authError').textContent='';}
$('loginTab').onclick=()=>authTab('login');$('registerTab').onclick=()=>authTab('register');
$('authForm').addEventListener('submit',async event=>{event.preventDefault();if($('authSubmit').disabled)return;$('authSubmit').disabled=true;$('authError').textContent='';const mode=authMode;try{const data=await api(mode==='login'?'/login':'/register',{name:$('nameInput').value.trim(),pin:$('pinInput').value},false);setAccount({token:data.token,name:data.name});forge=JSON.parse(data.save);$('pinInput').value='';$('authDialog').close();await boot();toast(mode==='login'?'돌아오셨네요. 기존 검도 함께 왔어요.':'주민 등록 완료! 첫 초코 1,000을 받았어요.');}catch(error){$('authError').textContent=error.message;if(!$('authDialog').open)showAuth();}finally{$('authSubmit').disabled=false;}});
$('profileButton').onclick=()=>account?showProfile():showAuth();$('guideButton').onclick=()=>open($('guideDialog'));$('rankButton').onclick=()=>{open($('rankDialog'));loadRanking();};$('rankRefresh').onclick=()=>loadRanking();
$('logoutButton').onclick=async()=>{if(busy){toast('앞선 요청을 먼저 확인해주세요.');return;}const token=account?.token;setAccount(null);$('profileDialog').close();connection('둘러보는 중');try{await api('/logout',{token},false);}catch{toast('서버 로그아웃을 확인하지 못했어요. 연결 후 다시 확인해주세요.');}};
window.addEventListener('storage',event=>{if(event.key==='swordforge-acc'){const next=store.get('swordforge-acc');if(next?.token!==account?.token){setAccount(next);if(next)boot();else connection('다른 창에서 로그아웃했어요.');}}});
async function boot(){const mine=epoch;if(!account){renderHeader();return;}connection('주민 기록을 불러오는 중');try{const [saved,data]=await Promise.all([api('/load'),api('/land/player')]);if(mine!==epoch)return;forge=JSON.parse(saved.save);adopt(data);await loadChannels();await joinRoom(activeRoom);const pending=store.get(pendingKey(),true);if(pending)toast('확인 중이던 요청이 있어요. 도박장의 기록 새로 확인을 눌러주세요.');}catch(error){connection(error.message,false);$('reconnectButton').hidden=false;if(error.status===401){setAccount(null);showAuth();}}}
let sidebarSocket=null,sidebarRoom='',sidebarGeneration=0,availableChannels=[];
const chatPicker=document.createElement('div');chatPicker.className='chat-channel-picker';chatPicker.innerHTML='<label for="chatChannel">옆에서 볼 대화</label><select id="chatChannel"><option value="">지금 광장 채팅</option></select>';$('chatNotice').before(chatPicker);
function chatTransport(){return sidebarRoom?sidebarSocket:socket;}
function chatAvailability(){const online=chatTransport()?.readyState===1;$('chatInput').disabled=!online;$('sendButton').disabled=!online;$('chatInput').placeholder=online?'인사를 건네볼까요?':account?'대화 연결을 기다리고 있어요':'로그인하고 인사해요';}
function closeSidebar(){sidebarGeneration++;if(sidebarSocket){sidebarSocket.onclose=null;sidebarSocket.close();sidebarSocket=null;}}
const chatReconnect=document.createElement('button');chatReconnect.type='button';chatReconnect.className='quiet';chatReconnect.textContent='대화 다시 연결';chatReconnect.hidden=true;chatPicker.append(chatReconnect);chatReconnect.onclick=()=>selectChat(sidebarRoom);
async function selectChat(key){
 const previous=sidebarRoom;if((key||activeRoom)!==(previous||activeRoom))$('chatInput').value='';closeSidebar();sidebarRoom=key;messages=[];if(previous!==key)chatPending.clear();chatReconnect.hidden=true;renderChat(true);chatAvailability();
 if(!key||key===activeRoom){sidebarRoom='';$('chatChannel').value='';$('chatScope').textContent=activeRoom.startsWith('d:')?'Discord 모임 · 마을 채팅':'광장 '+activeRoom.split(':')[1]+' · 마을 채팅';$('chatNotice').textContent='지금 광장의 주민들과 이야기해요.';if(socket?.readyState===1)socket.send(JSON.stringify({type:'history'}));chatAvailability();return;}
 const generation=sidebarGeneration;
 try{const data=await api('/land/session',{room:key,chatOnly:true,worldVersion:WORLD.version});if(generation!==sidebarGeneration)return;const url=new URL(API+'/land/ws');url.protocol=url.protocol==='https:'?'wss:':'ws:';url.searchParams.set('ticket',data.ticket);const ws=new WebSocket(url);sidebarSocket=ws;$('chatScope').textContent=(data.kind==='text'?'# ':'♬ ')+data.name;$('chatNotice').textContent='이 채널의 Discord 문자 채팅을 함께 보고 있어요. 마을 위치는 그대로예요.';
 ws.onopen=()=>{if(ws!==sidebarSocket)return;chatAvailability();chatReconnect.hidden=true;};ws.onmessage=event=>{if(ws!==sidebarSocket||event.data==='pong')return;try{handleSocket(JSON.parse(event.data),true);}catch{}};ws.onclose=event=>{if(ws!==sidebarSocket)return;chatAvailability();chatReconnect.hidden=false;$('chatNotice').textContent=event.code===4003?'이 채널의 접근 권한이 바뀌었어요.':'대화 연결이 끊어졌어요. 다시 연결해 전송 결과를 확인할 수 있어요.';};
 }catch(error){$('chatNotice').textContent=error.message;chatReconnect.hidden=false;chatAvailability();}
}
$('chatChannel').onchange=()=>{if(!account){$('chatChannel').value='';showAuth();return;}selectChat($('chatChannel').value);};
function connection(text,online=false){$('connection').textContent=text;$('connection').className=online?'online':account?'offline':'';}
let connectionAttempt=0;
function closeSocket(){connectionAttempt++;manualDisconnect=true;clearTimeout(reconnectTimer);if(socket){socket.onclose=null;socket.close();socket=null;}chatAvailability();}
async function loadChannels(){if(!account)return;try{const {channels}=await api('/land/channels');availableChannels=channels;$('roomSelect').querySelectorAll('option[data-discord]').forEach(el=>el.remove());const picker=$('chatChannel');picker.replaceChildren();const current=document.createElement('option');current.value='';current.textContent='지금 광장 채팅';picker.append(current);for(const channel of channels){const option=document.createElement('option');option.value=channel.room;option.textContent=(channel.kind==='text'?'# ':'♬ ')+channel.name;picker.append(option.cloneNode(true));if(channel.kind==='voice'){option.dataset.discord='true';$('roomSelect').append(option);}}picker.value=sidebarRoom;}catch{/* Public rooms remain available. */}}
async function joinRoom(key){
  if(!account)return;stop();closeSocket();manualDisconnect=false;const mine=epoch,attempt=connectionAttempt,previousRoom=activeRoom;activeRoom=key;$('roomSelect').value=key;if(!sidebarRoom){messages=[];if(previousRoom!==key){chatPending.clear();$('chatInput').value='';}renderChat(true);}peers.clear();connection('광장으로 들어가는 중');
  try{
    const data=await api('/land/session',{room:key,worldVersion:WORLD.version});if(mine!==epoch||key!==activeRoom||attempt!==connectionAttempt)return;
    const url=new URL(API+'/land/ws');url.protocol=url.protocol==='https:'?'wss:':'ws:';url.searchParams.set('ticket',data.ticket);const ws=new WebSocket(url);socket=ws;
    if(!sidebarRoom){$('chatScope').textContent=data.name+' · '+(key.startsWith('d:')?'Discord 음성채널 채팅':'마을 채팅');$('chatNotice').textContent=key.startsWith('d:')?'이 음성채널의 문자 채팅과 양방향으로 이어져요.':'같은 광장의 주민에게만 보여요. 최근 200개까지 보관해요.';}
    ws.onopen=()=>{if(ws!==socket)return;reconnectCount=0;connection('함께 접속 중',true);$('reconnectButton').hidden=true;chatAvailability();};
    ws.onmessage=event=>{if(ws!==socket||event.data==='pong')return;let data;try{data=JSON.parse(event.data);}catch{return;}handleSocket(data);};
    ws.onclose=event=>{if(ws!==socket)return;stop();chatAvailability();peers.clear();$('population').textContent='연결이 끊어졌어요';connection(event.code===4002?'다른 창에서 접속했어요.':event.code===4003?'계정·채널 권한을 확인해주세요.':'연결이 끊어졌어요. 다시 연결합니다.');$('reconnectButton').hidden=false;if(!manualDisconnect&&![4002,4003].includes(event.code)){const wait=Math.min(30000,1000*2**reconnectCount++)+Math.random()*500;reconnectTimer=setTimeout(()=>joinRoom(activeRoom),wait);}};
    ws.onerror=()=>connection('광장 연결을 확인하고 있어요.');
  }catch(error){connection(error.message);$('reconnectButton').hidden=false;}
}
function peerUpdate(users){const ids=new Set(users.map(u=>u.id));for(const id of peers.keys())if(!ids.has(id))peers.delete(id);for(const u of users){if(u.avatar)avatarByUid.set(u.id,u.avatar);const old=peers.get(u.id);peers.set(u.id,{...old,...u,drawX:old?.drawX??u.x,drawY:old?.drawY??u.y});}$('population').textContent=users.length+' / 20 주민';}
function handleSocket(data,sidebar=false){if(['chat','ack','edit','delete','delivery','deliveryError','relay','error','history'].includes(data.type)&&sidebar!==!!sidebarRoom)return;
  if(data.type==='welcome'){if(!sidebar){self=data.self;if(pokerWatching)socket?.send(JSON.stringify({type:'poker',op:'watch',on:true}));arcade.rewatch();peerUpdate(data.users);const mine=peers.get(self);if(mine)Object.assign(position,{x:mine.x,y:mine.y});}if(sidebar===!!sidebarRoom){messages=data.messages;renderChat(true);for(const [clientId,p] of chatPending)chatTransport()?.send(JSON.stringify({type:'chat',clientId,text:p.text}));}}
  else if(data.type==='history'){messages=data.messages;renderChat(true);}
  else if(data.type==='users'&&!sidebar)peerUpdate(data.users);
  else if(data.type==='move'&&!sidebar){const u=data.user;if(u.id===self){const err=Math.hypot(position.x-u.x,position.y-u.y);if(err>90||(!held.size&&u.seq===moveSeq&&err>1.5)||(held.size&&err>48))selfFix={x:u.x-position.x,y:u.y-position.y};}const previous=peers.get(u.id);peers.set(u.id,{...previous,...u,drawX:previous?.drawX??u.x,drawY:previous?.drawY??u.y,track:[...(previous?.track||[]).slice(-5),{t:performance.now(),x:u.x,y:u.y}]});}
  else if(data.type==='voice'&&!sidebar){const p=peers.get(data.id);if(p)p.speakingUntil=data.speaking?Date.now()+4500:0;}
  else if(data.type==='chat'){putMessage(data.message);const p=peers.get(data.message.uid);if(p){p.bubble=data.message.text;p.bubbleUntil=performance.now()+4500;}}
  else if(data.type==='ack'){const p=chatPending.get(data.clientId);if(p&&!messages.some(m=>m.id===data.id))putMessage({id:data.id,uid:self,name:account.name,text:p.text,source:'land',created:Date.now()});chatPending.delete(data.clientId);}
  else if(data.type==='edit'){const m=messages.find(m=>m.id===data.id);if(m){m.text=data.text;renderChat(true);}}
  else if(data.type==='delete'){messages=messages.filter(m=>m.id!==data.id);renderChat(true);}
  else if(data.type==='delivery'){const m=messages.find(m=>m.id===data.id);if(m){m.pending=0;renderChat(true);}}
  else if(data.type==='deliveryError'){toast(data.msg);}
  else if(data.type==='error'){if(data.clientId){const pending=chatPending.get(data.clientId);if(pending&&!$('chatInput').value)$('chatInput').value=pending.text;chatPending.delete(data.clientId);}toast(data.msg);}
  else if(data.type==='notice'){if(!sidebar)notices?.push(data.notice);}
  else if(data.type==='poker'&&!sidebar)poker.update(data.table);
  else if(data.type==='arcade'&&!sidebar)arcade.update(data.game,data.view);
  else if(data.type==='arcadeError'&&!sidebar)arcade.error(data.game,data.msg);
  else if(data.type==='gift'&&!sidebar)arcade.gift(data);
  else if(data.type==='pokerError'&&!sidebar){toast(data.msg);if(poker.state)poker.update(poker.state);}
  else if(data.type==='wallet'&&!sidebar){if(profile){profile.wallet.balance=data.balance;renderHeader();const shown=document.querySelector('.casino-wallet strong');if(shown)shown.textContent=money(data.balance);}}
  else if(data.type==='relay'){$('chatNotice').textContent=data.online?'Discord 채널의 문자 채팅과 연결됐어요.':'중계가 잠시 쉬고 있어요. 마을 대화는 가능하며 Discord 전달은 대기해요.';}
}
function putMessage(message){if(messages.some(m=>m.id===message.id))return;messages.push(message);messages=messages.slice(-100);renderChat();}
const faceUrls=new Map(),avatarByUid=new Map();
function faceUrl(a){const key=a.shirt+'.'+a.skin+'.'+a.hat+'.'+a.accessory;let url=faceUrls.get(key);if(url)return url;try{const c=document.createElement('canvas');c.width=c.height=56;const g=c.getContext('2d');g.beginPath();g.arc(28,28,28,0,Math.PI*2);g.clip();g.fillStyle='#f1e9dc';g.fillRect(0,0,56,56);g.translate(28,98);g.scale(1.5,1.5);drawResident(g,a);url=c.toDataURL();}catch{url='';}faceUrls.set(key,url);return url;}
function faceElement(message){const face=document.createElement('span');face.className='msg-face';face.setAttribute('aria-hidden','true');const known=message.uid===self?profile?.resident?.avatar:avatarByUid.get(message.uid);const url=message.source!=='discord'&&known?faceUrl(avatar(known)):'';if(url){const img=document.createElement('img');img.src=url;img.alt='';face.append(img);}else{face.classList.add('plain');face.textContent=message.source==='discord'?'D':[...String(message.name||'?')][0];}return face;}
function messageElement(message){const row=document.createElement('div');row.className='chat-message'+(message.uid===self?' mine':'')+(message.source==='discord'?' discord':'');row.dataset.messageId=message.id;const body=document.createElement('p');body.className='msg-line';const name=document.createElement('strong');name.className='msg-name';name.textContent=message.name;const source=document.createElement('span');source.className='message-source';source.textContent=message.source==='discord'?'Discord':'마을';const text=document.createElement('span');text.className='msg-text';text.textContent=' : '+message.text;body.append(name,source,text);row.append(faceElement(message),body);if(message.pending){const status=document.createElement('span');status.className='message-status';status.textContent='Discord 전달 대기';body.append(status);}return row;}
function renderChat(reset=false){const log=$('chatLog'),atBottom=log.scrollHeight-log.scrollTop-log.clientHeight<90;if(reset)log.replaceChildren();if(!messages.length){log.innerHTML='<p class="empty-chat">아직 조용하네요.<br>먼저 인사를 건네볼까요?</p>';return;}log.querySelector('.empty-chat')?.remove();for(const message of messages)if(!log.querySelector('[data-message-id="'+message.id+'"]'))log.append(messageElement(message));while(log.children.length>100)log.firstElementChild.remove();if(atBottom||reset)log.scrollTop=log.scrollHeight;}
let composing=false;$('chatInput').addEventListener('compositionstart',()=>composing=true);$('chatInput').addEventListener('compositionend',()=>composing=false);$('chatInput').onfocus=stop;
$('chatForm').onsubmit=event=>{event.preventDefault();if(composing||chatTransport()?.readyState!==1)return;const text=$('chatInput').value.trim();if(!text)return;if(chatPending.size>=3){toast('앞선 메시지 전송을 확인하고 있어요.');return;}const clientId=crypto.randomUUID();chatPending.set(clientId,{text});chatTransport().send(JSON.stringify({type:'chat',clientId,text}));$('chatInput').value='';};
$('chatInput').addEventListener('keydown',event=>{if(event.code==='Escape'){event.preventDefault();$('world').focus({preventScroll:true});}if(event.code==='Enter'&&(event.isComposing||composing))event.preventDefault();});
$('roomSelect').onchange=()=>account?joinRoom($('roomSelect').value):(toast('로그인하면 다른 주민들과 만날 수 있어요.'),$('roomSelect').value='public:1',showAuth());$('reconnectButton').onclick=()=>account?boot():showAuth();
setInterval(()=>{if(socket?.readyState===1)socket.send('ping');if(sidebarSocket?.readyState===1)sidebarSocket.send('ping');},25000);
$('voiceButton').onclick=()=>{if(activeRoom.startsWith('d:')){const [,guild,channel]=activeRoom.split(':');window.open('https://discord.com/channels/'+guild+'/'+channel,'_blank','noopener,noreferrer');}else{toast('프로필에서 Discord를 연결하고 음성방 광장을 선택해주세요.');if(account)showProfile();else showAuth();}};
function showProfile(){if(!profile){refresh().then(showProfile).catch(e=>toast(e.message));return;}$('profileName').textContent=account.name+' 주민';$('residentId').textContent='주민번호 '+profile.resident.id.slice(0,8)+' · 외형이 바뀌어도 기록은 그대로';selectedAvatar=avatar(profile.resident.avatar);renderAvatarChoices();renderExtraAvatar();renderDiscord();open($('profileDialog'));}
function renderAvatarChoices(){const shirts=$('shirtChoices');shirts.replaceChildren();SHIRTS.forEach((color,index)=>{const button=document.createElement('button');button.className='swatch';button.style.setProperty('--swatch',color);button.setAttribute('aria-label',['벽돌','파랑','풀','분홍','모래','청록','보라','먹색'][index]+' 옷');button.setAttribute('aria-pressed',String(index===selectedAvatar.shirt));button.onclick=()=>{selectedAvatar.shirt=index;renderAvatarChoices();renderExtraAvatar();};shirts.append(button);});$('hatChoices').replaceChildren();$('hatChoices').hidden=true;}
const avatarExtras=document.createElement('section');
avatarExtras.innerHTML='<div class="avatar-preview-row"><canvas id="avatarPreview" width="240" height="300" aria-label="선택한 주민 모습 미리보기"></canvas><div><strong>나만의 작은 주민</strong><p class="muted">옷과 볼 색을<br>골라보고 저장해요.</p></div></div><h3>볼 색</h3><div class="swatches" id="skinChoices"></div>';
$('saveAvatar').before(avatarExtras);
function renderExtraAvatar(){
 const skin=$('skinChoices');skin.replaceChildren();SKINS.forEach((color,index)=>{const b=document.createElement('button');b.className='swatch';b.style.setProperty('--swatch',color);b.setAttribute('aria-label','피부 톤 '+(index+1));b.setAttribute('aria-pressed',String(index===selectedAvatar.skin));b.onclick=()=>{selectedAvatar.skin=index;renderExtraAvatar();};skin.append(b);});

 if(townView?.preview){townView.preview($('avatarPreview'),selectedAvatar);return;}
 const c=$('avatarPreview').getContext('2d'),a=avatar(selectedAvatar);c.setTransform(2,0,0,2,0,0);c.clearRect(0,0,120,150);c.fillStyle='#e6ddcb';c.beginPath();c.ellipse(60,124,25,7,0,0,Math.PI*2);c.fill();c.translate(60,124);c.scale(1.45,1.45);drawResident(c,a);c.setTransform(1,0,0,1,0,0);
}
$('saveAvatar').onclick=async()=>{try{await act('avatar',selectedAvatar);if(socket?.readyState===1)socket.send(JSON.stringify({type:'avatar',avatar:profile.resident.avatar}));toast('이 모습으로 저장했어요.');}catch(error){toast(error.message);}};
function renderDiscord(){const d=profile.discord;$('discordState').textContent=d.linked?'Discord와 연결된 주민이에요. 음성방은 광장 목록에서, 일반 채널은 옆 채팅창에서 선택하세요.':d.available?'쪼꼬미 봇에서 코드로 본인 계정을 연결해요.':'Discord 연결을 준비하고 있어요. 마을 게임과 공개 채팅은 지금 이용할 수 있어요.';$('linkDiscord').hidden=d.linked;$('linkDiscord').disabled=!d.available;$('linkCodeBox').hidden=d.linked||!linkCommand;}
$('linkDiscord').onclick=async()=>{try{const data=await api('/land/link');if(data.linked){await refresh();renderDiscord();return;}linkCommand='/랜드연결 '+data.code;$('linkCode').textContent=linkCommand;$('linkCodeBox').hidden=false;clearInterval(linkTimer);linkTimer=setInterval(async()=>{try{await refresh();if(profile.discord.linked){renderDiscord();await loadChannels();clearInterval(linkTimer);toast('Discord 연결이 완료됐어요.');}}catch{}},10000);}catch(error){toast(error.message);}};
$('copyLinkCode').onclick=async()=>{try{await navigator.clipboard.writeText(linkCommand);toast('명령을 복사했어요.');}catch{toast('표시된 명령을 직접 복사해주세요.');}};const voiceSection=document.createElement('div');voiceSection.innerHTML='<p id="voiceStatus" class="status-note">Discord 발화 표시: 앱 인증 설정 후 연결할 수 있어요.</p><button id="voiceConnect" hidden>Discord 발화 표시 연결</button>';$('refreshDiscord').after(voiceSection);$('voiceConnect').hidden=!isActivity();let disconnectVoice=null;$('voiceConnect').onclick=async()=>{try{if(disconnectVoice)await disconnectVoice();disconnectVoice=await connectDiscordVoice({api,room:activeRoom,transport:()=>socket,onStatus:message=>$('voiceStatus').textContent=message});toast('실제 Discord 발화 표시를 연결했어요.');}catch(error){$('voiceStatus').textContent=error.message;toast(error.message);}};
$('refreshDiscord').onclick=async()=>{try{await refresh();renderDiscord();await loadChannels();toast('연결 상태를 새로 확인했어요.');}catch(error){toast(error.message);}};
// Keyboard and touch input share the same normalized movement rules.
$('world').addEventListener('pointerdown',()=>$('world').focus({preventScroll:true}));
window.addEventListener('keydown',event=>{if(document.activeElement!==$('world')||event.isComposing||!canWalk())return;if(movingKeys.has(event.code)){event.preventDefault();held.add(event.code);}else if(event.code==='Space')event.preventDefault();else if(event.code==='KeyE'&&!event.repeat){event.preventDefault();enter();}else if(event.code==='Enter'){event.preventDefault();stop();if(account)$('chatInput').focus({preventScroll:true});else showAuth();}});
window.addEventListener('keyup',event=>{held.delete(event.code);if(!held.size&&movingKeys.has(event.code))sendMovement(true);});window.addEventListener('blur',stop);$('world').addEventListener('blur',stop);document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
let notices=null,noticeUi=null;import('./notice-ui.js?v=1').then(m=>{noticeUi=m;notices=m.mountNotices($('noticeBanner'),{onWin:notice=>{const log=$('chatLog'),line=document.createElement('p');line.className='chat-system notice-line';line.setAttribute('aria-hidden','true');line.textContent=notice.text;log.querySelector('.empty-chat')?.remove();log.append(line);log.scrollTop=log.scrollHeight;if($('rankDialog').open)loadRanking();}});}).catch(error=>console.warn('notice',error));
async function loadRanking(){const list=$('rankList'),state=$('rankState');state.textContent='불러오는 중…';try{const data=await api('/land/ranking',{},false);(noticeUi||await import('./notice-ui.js?v=1')).renderRanking(list,data.ranking||[],account?.name||'');state.textContent='잔액 순 상위 '+(data.ranking||[]).length+'명 · 한 판 끝날 때마다 갱신';}catch(error){state.textContent='랭킹을 불러오지 못했어요. 잠시 후 다시 눌러 주세요.';}}
let stickHeld=[];const TOUCH=matchMedia('(pointer:coarse)');import('./joystick.js?v=1').then(({mountJoystick})=>mountJoystick($('stage'),{canStart:()=>canWalk(),onStart:()=>$('world').focus({preventScroll:true}),onKeys:keys=>{for(const code of stickHeld)held.delete(code);stickHeld=keys;for(const code of keys)held.add(code);if(!keys.length)sendMovement(true);}})).catch(error=>console.warn('joystick',error));
let moveSeq=0,lastSent=0,previousMoving=false,selfFix=null;const shown=new Map();function setText(id,text,hidden){const key=text+'|'+hidden,el=$(id);if(shown.get(id)===key)return;shown.set(id,key);el.textContent=text;if(hidden!==undefined)el.hidden=hidden;}function directions(){let dx=0,dy=0;for(const code of held){const v=movingKeys.get(code);if(v){dx+=v[0];dy+=v[1];}}return {dx:Math.sign(dx),dy:Math.sign(dy)};}
function sendMovement(force=false){if(socket?.readyState!==1)return;const {dx,dy}=directions(),active=!!(dx||dy);if(force||active||previousMoving){socket.send(JSON.stringify({type:'move',seq:++moveSeq,dx,dy}));lastSent=performance.now();previousMoving=active;}}
$('enterButton').onclick=enter;async function enter(){const building=near(position);if(!building){toast('건물 입구 가까이로 와주세요.');return;}if(!account){showAuth();return;}venue=building.id;stop();soundRun.cancel();sound.setScene(venue);if(venue==='fortune')soundRun=sound.cue(fortuneCues('open'));$('venueTitle').textContent=building.name;$('venueEyebrow').textContent={forge:'ONE MORE TRY',fortune:'TAROT · SAJU · LOVE',casino:'PLAY WITH CHOCO'}[venue];const embed=EMBEDDED[venue];$('venueDialog').classList.toggle('forge-mode',!!embed);$('venueDialog').addEventListener('close',()=>{const box=$('venueDialog');if(box.querySelector('iframe'))$('venueContent').replaceChildren();box.classList.remove('forge-mode');},{once:true});open($('venueDialog'));if(embed){const frame=document.createElement('iframe');frame.className='forge-frame';frame.title=embed.title;const loading=document.createElement('p');loading.className='forge-loading muted';loading.textContent=embed.title.split(' · ')[0]+' 불러오는 중…';frame.addEventListener('load',()=>loading.remove(),{once:true});frame.src=embed.src;$('venueContent').replaceChildren(loading,frame);}else{try{await refresh();if(venue==='fortune'&&fortuneTab==='deck')await loadDeck();renderVenue();}catch(error){$('venueContent').innerHTML='<p class="error">'+h(error.message)+'</p><button data-retry>다시 불러오기</button>';$('venueContent').querySelector('[data-retry]').onclick=()=>refresh().then(renderVenue).catch(e=>toast(e.message));}}}
// Venues served by a full existing web app: the forge game and the 쪼꼬미 운세 web (tarot·saju·love·zodiac).
const EMBEDDED={forge:{src:'../?land=1',title:'검 강화하기 · 기존 계정 진행'},fortune:{src:'https://jjoggomibot.github.io/fortune/',title:'쪼꼬미 운세 · 타로·사주·궁합·별자리'}};
function renderVenue(){if(!venue||EMBEDDED[venue]||!profile)return;if(venue==='fortune')renderFortune();else renderCasino();setBusy(busy);}
function cardMarkup(card){return '<div class="tarot-display"><div class="tarot-card'+(card.reversed?' is-reversed':'')+'"><span class="card-number">'+h(card.number)+'</span>'+tarotPhoto(card)+'<span class="card-label">'+h(card.ko)+'</span></div><div><h3>'+h(card.ko)+'</h3><p class="card-direction">'+(card.reversed?'역방향':'정방향')+(card.day?' · '+h(card.day):'')+'</p><div class="keyword-list">'+(card.reversed?card.rev_kw:card.up_kw).map(k=>'<span class="keyword">'+h(k)+'</span>').join('')+'</div><p class="tarot-meaning">'+h(card.reversed?card.rev:card.up)+'</p><p class="card-advice">'+h(card.advice)+'</p></div></div>';}
async function loadDeck(){if(deck)return deck;const r=await fetch('cards.json',{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('카드도감을 불러올 수 없어요.');deck=await r.json();return deck;}
function renderFortune(){const box=$('venueContent'),tabs=[['daily','오늘의 타로'],['spread','3장 타로'],['deck','78장 카드도감'],['saju','사주·궁합']];let html='<p class="venue-intro">마음에 드는 카드를 만나고, 오늘의 작은 힌트를 얻어가요.</p><div class="venue-tabs">'+tabs.map(([id,label])=>'<button data-fortune-tab="'+id+'" aria-pressed="'+(id===fortuneTab)+'">'+label+'</button>').join('')+'</div>';
  if(fortuneTab==='daily')html+='<button class="primary" data-action="dailyTarot">오늘의 카드 뽑기</button><p class="status-note">하루 한 장 · 같은 주민에게는 같은 날 같은 카드가 찾아와요.</p>'+(profile.dailyCard?cardMarkup(profile.dailyCard):'<div class="game-stage"><p>아직 만나지 않은 오늘의 카드.</p><p class="muted">가볍게 마음을 모으고 한 장 뽑아보세요.</p></div>')+(profile.history.length?'<details class="rules"><summary>지난 카드 기록 · 최근 30일</summary>'+profile.history.map(c=>'<p>'+h(c.day)+' · '+h(c.ko)+' '+(c.reversed?'역방향':'정방향')+'</p>').join('')+'</details>':'');
  if(fortuneTab==='spread'){const spread=profile.spread;html+='<button class="primary" data-action="spreadStart">'+(spread?'카드 새로 펼치기':'카드 펼치기')+'</button><p class="status-note">여덟 장 중 마음이 가는 세 장을 골라요. 과거 · 현재 · 미래.</p>';if(spread)html+='<div class="spread-grid">'+Array.from({length:8},(_,i)=>'<button class="card-back" aria-label="'+(i+1)+'번째 카드 선택" data-card-index="'+i+'" '+(spread.picked.includes(i)||spread.picked.length>=3?'disabled':'')+'></button>').join('')+'</div><div class="spread-results">'+spread.results.map((c,i)=>'<section><h3>'+['과거','현재','미래'][i]+'</h3>'+cardMarkup(c)+'</section>').join('')+'</div>';}
  if(fortuneTab==='deck')html+='<label for="deckSearch">카드 이름 찾기</label><input class="deck-search" id="deckSearch" placeholder="바보, 완드, 컵…"><div id="deckGrid" class="deck-grid"></div><div id="deckDetail"></div>';
  if(fortuneTab==='saju')html+='<div class="game-stage"><h3>쪼꼬미에게 물어보는 사주와 궁합</h3><p class="muted">기존 쪼꼬미 봇의 사주·궁합 기능을 이용할 수 있어요.</p><p class="status-note">Discord 음성방을 선택한 뒤 Discord를 열어 쪼꼬미 봇의 명령 목록에서 사주·궁합을 골라주세요.</p><div class="inline-actions"><button data-open-discord>Discord 열기</button><button data-open-profile>내 Discord 연결</button></div></div>';
  box.innerHTML=html;box.querySelectorAll('[data-fortune-tab]').forEach(button=>button.onclick=async()=>{fortuneTab=button.dataset.fortuneTab;try{if(fortuneTab==='deck')await loadDeck();renderFortune();}catch(error){toast(error.message);}});
  box.querySelector('[data-action="dailyTarot"]')?.addEventListener('click',async()=>{try{await act('tarotDaily');renderFortune();soundRun=sound.cue(fortuneCues('result'));}catch(e){toast(e.message);}});box.querySelector('[data-action="spreadStart"]')?.addEventListener('click',async()=>{try{await act('spreadStart');renderFortune();}catch(e){toast(e.message);}});box.querySelectorAll('[data-card-index]').forEach(button=>button.onclick=async()=>{try{await act('spreadPick',{spreadId:profile.spread.id,index:Number(button.dataset.cardIndex)});renderFortune();}catch(e){toast(e.message);}});
  box.querySelector('[data-open-discord]')?.addEventListener('click',()=>$('voiceButton').click());box.querySelector('[data-open-profile]')?.addEventListener('click',showProfile);
  if(fortuneTab==='deck'){const draw=()=>{const query=$('deckSearch').value.trim();$('deckGrid').innerHTML=(deck||[]).filter(c=>c.ko.includes(query)||c.en.toLowerCase().includes(query.toLowerCase())).map(c=>'<button class="deck-item" data-deck="'+c.id+'">'+tarotPhoto(c)+h(c.ko)+'</button>').join('');$('deckGrid').querySelectorAll('[data-deck]').forEach(button=>button.onclick=()=>{$('deckDetail').innerHTML=cardMarkup({...deck.find(c=>c.id===Number(button.dataset.deck)),reversed:false})+'<button id="reverseCard">역방향 해석 보기</button>';let reversed=false;$('reverseCard').onclick=()=>{reversed=!reversed;const c=deck.find(c=>c.id===Number(button.dataset.deck));$('deckDetail').querySelector('.tarot-display').outerHTML=cardMarkup({...c,reversed});$('reverseCard').textContent=reversed?'정방향 해석 보기':'역방향 해석 보기';};$('deckDetail').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'nearest'});});};$('deckSearch').oninput=draw;draw();}
}
function resultText(r){if(!r)return '';if(r.message)return r.message;if(r.game==='blackjack'){const b=r.round;return b.done?({blackjack:'블랙잭!',win:'승리!',dealer_bust:'딜러 버스트!',push:'무승부',bust:'버스트',lose:'이번엔 딜러 승리'})[b.outcome]+' · 지급 '+money(b.payout)+'초코':'한 장 더 받을까요, 여기서 멈출까요?';}return (r.payout>r.bet?'당첨! ':r.payout===r.bet?'무승부 · ':'다음 기회에 · ')+'지급 '+money(r.payout)+'초코 (원금 포함)';}
function casinoOutcome(result,game=casinoTab){return classifyOutcome(result,game);}
function outcomeBanner(result,game){const outcome=casinoOutcome(result,game),labels={win:'승리',loss:'아쉬운 패배',draw:'무승부',blackjack:'BLACKJACK',jackpot:'JACKPOT'};return labels[outcome]?'<div class="outcome-banner '+outcome+'" role="status">'+labels[outcome]+'</div>':'';}
// 릴 = 세로 심볼 띠. 맨 위 여분 1칸 + 결과 1칸 + 채움 칸들. 결과 칸(rest=1)에서 멈추고, 처음엔 맨 아래 근처(from)에서 출발해 아래로 굴러 내려온다.
// 오른쪽 릴일수록 띠가 길고 오래 돌아 같은 속도로 돌다가 왼쪽부터 차례로 멈춘다. 움직임 줄이기 설정이면 띠 없이 결과만 둔다.
const SLOT_KEYS=Object.keys(SLOT_ART),reduceMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
function reelStrip(symbol,i,spin){const cell=s=>'<span class="reel-cell"><img src="'+art(SLOT_ART[s]||SLOT_ART['⭐'])+'" alt=""></span>';if(!spin)return '<span class="reel-strip">'+cell(symbol)+'</span>';
  const n=20+i*6,cells=[];const pick=prev=>{let s;do s=SLOT_KEYS[Math.random()*SLOT_KEYS.length|0];while(s===prev||s===symbol&&cells.length<5);return s;};cells.push(pick(symbol),symbol);while(cells.length<n)cells.push(pick(cells[cells.length-1]));
  return '<span class="reel-strip" style="--cells:'+n+';--from:'+(n-2)+'">'+cells.map(cell).join('')+'</span>';}
function reelBox(cls,symbol,i,spin,label=''){return '<span class="'+cls+(spin?' rolling':'')+'" style="--reel:'+i+(spin?';--spin:'+reelStopMs(i)+'ms':'')+'"'+(label?' role="img" aria-label="'+h(label)+'"':'')+'>'+reelStrip(symbol,i,spin)+'</span>';}
// 주사위: 두 알을 가죽 통에 담아 흔든 뒤 엎었다가 들어 올려 결과를 보인다. 흔들기 전 주사위(pre)는 아무 눈이나, 결과는 통 아래에서 나온다.
function diceScene(dice){const show=dice||[3,5],die=(n,i,cls)=>'<img class="'+cls+'" style="--i:'+i+'" src="'+art('die-'+n+'.png')+'?v=2" alt="">';
  return '<div class="dice-scene" role="img" aria-label="'+(dice?'주사위 '+dice.join('과 ')+' · 합계 '+(dice[0]+dice[1]):'가죽 통과 주사위 두 개')+'"><span class="dice-felt"></span>'+(dice?[1+Math.random()*6|0,1+Math.random()*6|0].map((n,i)=>die(n,i,'die die-pre')).join(''):'')+show.map((n,i)=>die(n,i,'die die-roll')).join('')+'<img class="dice-cup" src="'+art('arcade-dice-cup-down.png')+'?v=2" alt=""></div>';}
// 가위바위보: 두 주먹이 마주 보고 "가위·바위·보!" 박자에 맞춰 위아래로 흔들다 '보!'에서 앞으로 내밀며 모양을 바꾼다.
const RPS_CHANT=['가위','바위','보!'];
function rpsScene(r){const o=r?classifyOutcome(r,'rps'):'idle',fate=me=>o==='draw'||o==='idle'?'':(o==='win')===me?' won':' lost';
  const hand=(me,shape)=>'<div class="rps-hand '+(me?'mine':'bot')+fate(me)+'"><span class="rps-pump"><img class="fist" src="'+art('arcade-hand-rock.png')+'?v=2" alt=""><img class="shape" src="'+art('arcade-hand-'+shape+'.png')+'?v=2" alt=""></span><small>'+(me?'나':'쪼꼬미')+(r?' · '+h(RPS[shape]):'')+'</small></div>';
  return '<div class="rps-arena'+(r?' played':'')+(o==='draw'?' tie':'')+'" role="img" aria-label="'+(r?'나 '+h(RPS[r.choice])+', 쪼꼬미 '+h(RPS[r.opponent]):'가위바위보')+'">'+hand(true,r?.choice||'rock')+'<div class="rps-chant" aria-hidden="true">'+(r?RPS_CHANT.map((w,i)=>'<b style="--i:'+i+'">'+w+'</b>').join('')+(o==='draw'?'<b class="again">비겼다, 한 번 더!</b>':''):'<b class="still">가위바위보</b>')+'</div>'+hand(false,r?.opponent||'rock')+'</div>';}
// 블랙잭 테이블: GPT 실사 테이블 위에 카드가 슈에서 날아와 뒤집힌다. 순서는 실제처럼 나·딜러·나·딜러(히든), 결과가 나면 히든을 뒤집고 딜러 추가 카드.
// 단위는 테이블 폭 기준 cqw. 각 동작 k는 k*BJ_GAP에 시작해 BJ_DUR 뒤에 끝난다(casino-fx SETTLE.blackjack 과 같은 값).
const BJ_GAP=300,BJ_FLY=330,BJ_W=8,BJ_STEP=5.6,BJ_SHOE=[84,8],BJ_ROW={dealer:16,player:36.6},bjStep=n=>n<=3?BJ_STEP:n===4?4.6:3.8;let bjPrev=null,bjEnd=0;
function bjValue(cards){let t=0,a=0;for(const c of cards){const n=c.slice(0,-1);if(n==='A'){t+=11;a++;}else t+=['J','Q','K'].includes(n)?10:Number(n)||0;}while(t>21&&a){t-=10;a--;}return t;}
function bjTable(b,live){const prev=b&&bjPrev?.id===b.id?bjPrev:null,order=[];bjPrev=b?{id:b.id,p:b.player.length,hidden:!b.done}:null;
  if(b&&live){if(!prev){order.push(['player',0],['dealer',0],['player',1],['dealer',1]);for(let i=2;i<b.player.length;i++)order.push(['player',i]);}else for(let i=prev.p;i<b.player.length;i++)order.push(['player',i]);
    if(b.done&&(!prev||prev.hidden)){order.push(['dealer',1,'reveal']);for(let i=2;i<b.dealer.length;i++)order.push(['dealer',i]);}}
  bjEnd=order.length?(order.length-1)*BJ_GAP+BJ_FLY+300:0;
  const slot=(row,cards,i)=>{const card=cards[i],n=cards.length,x=50+(i-(n-1)/2)*bjStep(n),y=BJ_ROW[row],hidden=card==='?',red=/[♥♦]/.test(card);
    const k=order.findIndex(o=>o[0]===row&&o[1]===i&&!o[2]),r=order.findIndex(o=>o[0]===row&&o[1]===i&&o[2]),flipAt=r>=0?r*BJ_GAP+BJ_FLY:k>=0&&!hidden?k*BJ_GAP+BJ_FLY:-1;
    return '<span class="bj-slot'+(k>=0?' bj-anim deal':'')+'" style="left:'+(x-BJ_W/2).toFixed(2)+'cqw;top:'+y+'cqw;z-index:'+(i+1)+';--fx:'+(BJ_SHOE[0]-x).toFixed(2)+'cqw;--fy:'+(BJ_SHOE[1]-y).toFixed(2)+'cqw'+(k>=0?';--dd:'+k*BJ_GAP+'ms':'')+'"><span class="playing-card'+(hidden?' card-hidden':'')+(red?' red':'')+(flipAt>=0?' flip'+(r>=0?' bj-anim':''):'')+'"'+(flipAt>=0?' style="--fd:'+flipAt+'ms"':'')+'>'+(hidden?'':'<span>'+h(card.slice(0,-1))+'<i>'+card.slice(-1)+'</i></span><em>'+card.slice(-1)+'</em><span class="rev">'+h(card.slice(0,-1))+'<i>'+card.slice(-1)+'</i></span>')+'</span></span>';};
  const badge=(row,cards,label,total)=>{const n=cards.length,x=50+((n-1)/2)*bjStep(n)+BJ_W/2+1.2,state=total>21?' bust':total===21&&n===2?' natural':'';if(state===' bust')label+=' BUST';else if(state)label='BLACKJACK';return '<b class="bj-total'+state+'" style="left:'+x.toFixed(2)+'cqw;top:'+(BJ_ROW[row]+3.6)+'cqw" aria-label="'+label+'">'+label+'</b>';};
  const dealerTotal=b&&b.done?bjValue(b.dealer):b?bjValue([b.dealer[0]]):0;
  return '<div class="bj-wrap"><div class="bj-table" role="img" aria-label="'+(b?'딜러 '+b.dealer.join(' ')+(b.done?' 합계 '+dealerTotal:'')+' · 나 '+b.player.join(' ')+' 합계 '+b.total:'블랙잭 테이블')+'"><img class="bj-felt-art" src="'+art('arcade-blackjack-felt.png')+'?v=1" alt="">'
    +'<svg class="bj-print" viewBox="0 0 1000 603" aria-hidden="true"><defs><path id="bjArc1" d="M170,200 Q500,452 830,200"/><path id="bjArc2" d="M160,236 Q500,484 840,236"/></defs><text class="bj-pays"><textPath href="#bjArc1" startOffset="50%" text-anchor="middle">BLACKJACK PAYS 3 TO 2</textPath></text><text class="bj-rule"><textPath href="#bjArc2" startOffset="50%" text-anchor="middle">DEALER MUST STAND ON 17 AND DRAW TO 16</textPath></text></svg>'
    +(b?b.dealer.map((c,i)=>slot('dealer',b.dealer,i)).join('')+b.player.map((c,i)=>slot('player',b.player,i)).join('')+badge('dealer',b.dealer,b.done?String(dealerTotal):dealerTotal+'+?',b.done?dealerTotal:0)+badge('player',b.player,String(b.total),b.total)
      +'<span class="bj-bet" aria-hidden="true">'+[0,1,2].map(i=>'<img style="--i:'+i+'" src="'+art('choco-coin.png')+'" alt="">').join('')+'</span>':'<p class="bj-empty">21을 넘지 않으면서 딜러보다 높게.</p>')+'</div></div>';}
function casinoStageClass(result,game){const outcome=casinoOutcome(result,game);return 'game-stage casino-stage fx-'+outcome+(game==='slots'&&result?' fx-reels':'')+(game==='horse'&&result?' fx-race':'')+(game==='dice'&&result?' fx-dice':'')+(game==='rps'&&result?' fx-rps':'')+(game==='blackjack'&&result?' fx-cards':'');}
let raceRun={cancel(){}};
function runCasinoFx(box,result,game){
  const stage=box.querySelector('.casino-stage')||box.querySelector('.casino-wallet');
  const outcome=casinoOutcome(result,game);
  // 움직이는 동안의 상황 연출(말 흙먼지·릴 멈춤) → 움직임이 끝난 뒤 결과 연출 순서로 겹치지 않게 재생한다.
  raceRun.cancel();if(game==='horse'&&result&&box.querySelector('.casino-stage'))raceRun=playRace(box.querySelector('.casino-stage'),result);
  if(result&&box.querySelector('.casino-stage'))playSceneFx(box.querySelector('.casino-stage'),game,{outcome});
  playCasinoFx(stage,{outcome,game});
  // 소리는 같은 시간표(casino-fx settle·릴 멈춤·카드 날기)에 맞춰 예약한다. 움직임 줄이기면 결과음만.
  const count=game==='slots'?box.querySelectorAll('.slots-reels .reel').length||3:game==='blackjack'?box.querySelectorAll('.bj-anim').length:1;
  soundRun.cancel();soundRun=sound.cue(casinoCues(game,outcome,{count,reduced:reduceMotion()}));
}
function renderCasino(){const box=$('venueContent'),wallet=profile.wallet;let html='<div class="casino-wallet"><div>'+chips(wallet.balance)+'<small>내 랜드 초코</small><strong>'+money(wallet.balance)+'</strong><span> C</span></div><div class="wallet-actions"><button data-action="daily" '+(wallet.daily?'disabled':'')+'>'+(wallet.daily?'출석 완료':'출석 +300')+'</button><button data-action="rescue" '+(wallet.rescue||wallet.balance>=100?'disabled':'')+'>응원 +300</button></div></div><p class="venue-intro">랜드 초코는 대장간 골드·기존 Discord 서버별 초코와 따로예요. 배당은 원금을 포함한 총 지급액입니다.</p>'+chipLegend()+casinoTabs();
  const same=lastResult?.game===casinoTab?lastResult:null;
  if(casinoTab==='ledger')html+='<h3>최근 초코 이용 내역</h3><table class="ledger"><thead><tr><th>시각 / 내역</th><th>변동</th></tr></thead><tbody>'+profile.ledger.map(row=>'<tr><td>'+h(new Date(row.created).toLocaleString('ko-KR'))+'<br>'+h(row.reason)+'</td><td class="'+(row.delta>0?'positive':'')+'">'+(row.delta>0?'+':'')+money(row.delta)+' C<br><span class="muted">잔액 '+money(row.balance)+'</span></td></tr>').join('')+'</tbody></table>';
  else if(casinoTab==='quiz'){const q=profile.quiz,quizResult=lastResult&&'correct' in lastResult?lastResult:null;html+='<div class="'+casinoStageClass(quizResult,'quiz')+' quiz-stage">'+outcomeBanner(quizResult,'quiz')+'<img class="quiz-board-art" src="'+art('arcade-quiz-board-coin.png')+'" alt="질문표와 초코 코인"><div class="quiz-copy"><p>오늘 정답 '+wallet.quizWins+' / 25 · 정답 보상 40초코</p>'+(q?'<div class="quiz-initials">'+h(q.initials)+'</div><p>'+h(q.hint)+'</p><p class="status-note">남은 시간 <span id="quizTime">'+Math.max(0,Math.ceil((q.expires-Date.now())/1000))+'</span>초 · '+(3-q.tries)+'번 도전 가능</p>':'<p class="muted">초성을 보고 단어를 맞혀보세요.</p>')+'</div></div><div class="casino-controls">'+(q?'<label>답<input id="quizAnswer" class="quiz-answer" maxlength="30" autocomplete="off"></label><button class="primary" data-action="quizAnswer">정답 확인</button>':'<button class="primary" data-action="quiz">문제 받기</button>')+'</div><p class="game-result">'+h(lastResult?.message||'')+'</p>';}
  else if(casinoTab==='poker')html+='<div id="pokerBox" class="poker-box"></div>';
  else if(ARCADE_TABS[casinoTab])html+='<div id="arcadeBox" class="arcade-box"></div>';
  else if(casinoTab==='blackjack'){
    const b=profile.blackjack,bjResult=same||b?{game:'blackjack',round:b}:null;const bjHtml=bjTable(b,!!same);html+='<div class="'+casinoStageClass(same,'blackjack')+' blackjack-stage" style="--bj-end:'+bjEnd+'ms">'+outcomeBanner(same,'blackjack')+bjHtml+(b?'<p class="bj-info"><span>베팅 '+money(b.bet)+' C</span><b class="game-result">'+h(resultText(bjResult))+'</b></p>':'')+'</div>';
    if(b&&!b.done)html+='<div class="inline-actions"><button class="primary" data-action="bj" data-choice="hit">한 장 더</button><button data-action="bj" data-choice="stand">멈추기</button><button data-action="bj" data-choice="double" '+(!b.canDouble||wallet.balance<b.bet?'disabled':'')+'>더블</button></div><p class="status-note">5분 뒤에도 미완료라면 자동으로 멈추기 처리돼요. 나가도 베팅은 취소되지 않아요.</p>';else html+=betControls();
  }else{
    html+='<div class="'+casinoStageClass(same,casinoTab)+'"'+(casinoTab==='slots'?' style="--settle:'+settleMs('slots',3)+'ms"':casinoTab==='horse'?' style="--settle:'+RACE.settle+'ms"':casinoTab==='rps'?' style="--settle:'+settleMs('rps')+'ms"':'')+'>'+outcomeBanner(same,casinoTab);
    if(casinoTab==='slots'){const reels=same?.reels||['🍒','⭐','7️⃣'],spin=!!same&&!reduceMotion();html+='<div class="slot-cabinet"><div class="slot-machine"><img class="slot-machine-art" src="'+art('arcade-slot-machine.png')+'" alt="슬롯머신"><span class="slot-windows" aria-hidden="true">'+reels.map((symbol,i)=>reelBox('slot-window',symbol,i,spin)).join('')+'</span></div><div class="slots-reels">'+reels.map((symbol,i)=>reelBox('reel',symbol,i,spin,symbol)).join('')+'</div></div>';}
    if(casinoTab==='dice')html+=diceScene(same?.dice)+'<p>'+(same?'주사위 합계 '+same.dice.reduce((a,b)=>a+b,0):'두 주사위 합계의 홀·짝을 골라요.')+'</p>';
    if(casinoTab==='rps')html+=rpsScene(same);
    if(casinoTab==='horse'){const race=same?{horses:same.horses}:profile.race;html+='<div class="race-heading"><img src="'+art('arcade-racetrack.png')+'" alt="" loading="lazy"><p>개인 경주 · '+(same?'사진 판정까지 약 '+Math.round(RACE.settle/1000)+'초':'게이트 안에서 출발 대기 중')+'</p></div><div class="race-field">'+raceMarkup(race,same,{esc:h,horseSrc:art('arcade-racehorse.png'),narrow:matchMedia('(max-width:420px)').matches})+'</div>'+(same?'<p class="status-note">우승: '+h(same.horses[same.winner].name)+'</p>':'');}
    html+='<p class="game-result '+(same&&same.payout>same.bet?'win':'')+'">'+h(resultText(same))+'</p></div>';
    html+=casinoTab==='horse'&&!profile.race?'<div class="inline-actions"><button class="primary" data-action="race">다음 경주표 받기</button></div>':betControls();
  }
  html+='<div class="inline-actions"><button class="quiet" data-action="recover">기록 새로 확인</button></div>'+casinoRules(casinoTab);box.innerHTML=html;
  if(casinoTab==='poker'){poker.mount($('pokerBox'));pokerWatch(true);}else pokerWatch(false);
  if(ARCADE_TABS[casinoTab])arcade.mount($('arcadeBox'),casinoTab);else arcade.unmount();
  box.querySelectorAll('[data-casino-tab]').forEach(button=>button.onclick=()=>{sound.play('ui.tap');casinoTab=button.dataset.casinoTab;lastResult=null;casinoFx=null;renderCasino();});
  box.querySelector('#betInput')?.addEventListener('change',event=>lastBet=Number(event.target.value));
  box.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',async()=>{
    const kind=button.dataset.action;sound.play(kind==='play'||kind==='bj'&&button.dataset.choice==='double'?'chip.place':'ui.tap');try{
      if(kind==='recover'){await recover();return;}
      let data;
      if(kind==='play'){const bet=Number($('betInput').value);lastBet=bet;const choice=$('gameChoice')?.value;const payload={game:casinoTab,bet};if(choice!==undefined)payload.choice=casinoTab==='horse'?Number(choice):choice;if(casinoTab==='horse')payload.raceId=profile.race?.id;data=await act('play',payload);}
      else if(kind==='bj')data=await act('blackjack',{roundId:profile.blackjack.id,choice:button.dataset.choice});
      else if(kind==='quizAnswer')data=await act('quizAnswer',{quizId:profile.quiz.id,answer:$('quizAnswer').value});
      else data=await act(kind);
      lastResult=data.result;casinoFx={game:kind==='play'||kind==='bj'||kind==='quizAnswer'?casinoTab:kind,result:data.result};if(kind==='daily'||kind==='rescue')toast(data.result.message);if(kind==='race'){lastResult=null;casinoFx=null;}renderCasino();if(casinoFx)runCasinoFx(box,casinoFx.result,casinoFx.game);
    }catch(error){toast(error.message);}
  }));
  box.querySelector('#quizAnswer')?.addEventListener('keydown',event=>{if(event.code==='Enter'&&!event.isComposing){event.preventDefault();box.querySelector('[data-action="quizAnswer"]').click();}});
  setBusy(busy);
}
function casinoTabs(){const group=Object.keys(GAME_GROUPS).find(k=>GAME_GROUPS[k][1].includes(casinoTab))||'solo';return '<div class="venue-groups" role="group" aria-label="게임 묶음">'+Object.entries(GAME_GROUPS).map(([id,[name,list]])=>'<button data-casino-tab="'+(id===group?casinoTab:list[0])+'" aria-pressed="'+(id===group)+'">'+name+' <small>'+list.length+'</small></button>').join('')+'</div><div class="venue-tabs">'+GAME_GROUPS[group][1].map(id=>'<button data-casino-tab="'+id+'" aria-pressed="'+(id===casinoTab)+'">'+GAME_NAMES[id]+'</button>').join('')+'</div>';}
function betControls(){let choice='';if(casinoTab==='dice')choice='<label>내 선택<select id="gameChoice"><option value="odd">홀수</option><option value="even">짝수</option></select></label>';if(casinoTab==='rps')choice='<label>내 선택<select id="gameChoice">'+Object.entries(RPS).map(([id,name])=>'<option value="'+id+'">'+name+'</option>').join('')+'</select></label>';if(casinoTab==='horse')choice='<label>응원할 말<select id="gameChoice">'+profile.race.horses.map((horse,i)=>'<option value="'+i+'">'+h(horse.name)+' · '+(horse.rate/10).toFixed(1)+'배</option>').join('')+'</select></label>';return '<div class="casino-controls"><label>베팅 초코<input id="betInput" type="number" inputmode="numeric" min="10" max="5000" step="1" value="'+Math.min(5000,Math.max(10,lastBet||100))+'"></label>'+choice+'<button class="primary" data-action="play">'+(casinoTab==='blackjack'?'카드 받기':'한 판 시작')+'</button></div><p class="status-note">10~5,000초코 · 확정하면 베팅금이 차감돼요. 자동 연속 베팅은 없어요.</p>';}
function casinoRules(game){const rules={poker:'텍사스 홀덤 노리밋, 블라인드 10/20, 최대 6명. 서버가 매 판 52장을 새로 섞어 나눠 주고, 다른 사람 패는 쇼다운 전까지 누구에게도 보내지 않아요. 사람이 앉으면 빈자리는 봇이 채워요(봇도 자기 패와 보드만 봐요). 내 차례는 20초, 넘기면 체크할 수 있으면 체크·아니면 폴드되고, 두 번 연속이면 판이 끝날 때 자리에서 일어나요. 일어나면 남은 칩이 바로 지갑으로 돌아와요.',slots:'세 그림 일치: 체리 4배, 레몬 6배, 포도 10배, 종 20배, 별 50배, 다이아 120배, 7은 777배. 두 그림 일치: 체리 1.5배, 나머지 1.2배. 그림 가중치는 순서대로 30·24·18·13·8·5·2입니다.',dice:'두 개의 공정한 주사위를 굴려 합계를 맞혀요. 맞히면 1.9배, 틀리면 0. 지급액의 소수점은 버립니다.',blackjack:'4덱을 매 판 새로 섞어요. 딜러는 소프트 17에서도 멈춰요. 일반 승리 2배, 내추럴 블랙잭 2.5배, 무승부 원금 반환. 첫 선택에서만 더블할 수 있어요. 보험·스플릿은 없습니다.',horse:'각 말의 승률은 경주표 생성 시 정해지며, 배당은 0.92/승률을 소수 첫째 자리에서 내린 값입니다. 첫 참가 후 60초 동안 같은 광장에서 참가를 받고 출발해요. 혼자여도 출발하며 모두 같은 경주를 봐요.',rps:'봇은 가위·바위·보를 같은 확률로 선택해요. 이기면 2배, 비기면 원금 반환, 지면 0입니다.',quiz:'정답은 서버에서 확인해요. 한 문제 세 번까지, 제한 시간 90초. 정답마다 40초코, 하루 25번까지 보상해요. 다음 문제까지 10초 쉬어요.',ledger:'재시작·새로고침 뒤에도 서버의 잔액과 정산 기록이 유지돼요. 결과 확인이 안 된 요청은 같은 번호로 다시 조회합니다.'};return '<details class="rules"><summary>규칙과 지급 기준</summary><p>'+h(rules[game]||ARCADE_RULES[game]||'')+'</p><p>랜드 초코는 현금 가치·환전·대장간 골드 교환이 없어요. 출석 300초코, 잔액 100 미만이면 하루 한 번 응원 300초코를 받을 수 있어요.</p></details>';}
setInterval(()=>{if(venue==='casino'&&profile?.quiz&&$('quizTime'))$('quizTime').textContent=Math.max(0,Math.ceil((profile.quiz.expires-Date.now())/1000));},1000);
// Native canvas art: an isometric floor, tiny houses and customizable residents.
const canvas=$('world'),ctx=canvas.getContext('2d');let width=0,height=0,zoom=1,camera={x:0,y:0};
function resize(){const r=$('stage').getBoundingClientRect();width=r.width;height=r.height;const dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);zoom=width>=700?1:.85;}
new ResizeObserver(resize).observe($('stage'));resize();
function path(points,fill,stroke=null){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}}
function round(x,y,w,hh,r,fill,stroke=null){ctx.beginPath();ctx.roundRect(x,y,w,hh,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}}
function ellipse(x,y,rx,ry,fill){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();}
function label(text,x,y,fill='#4b392e',size=14){ctx.fillStyle=fill;ctx.font='500 '+Math.max(size,11/zoom)+'px "Noto Sans KR",sans-serif';ctx.textAlign='center';ctx.fillText(text,x,y);}
function house(b){
  const x=b.x,y=b.y;ellipse(x+4,y-19,100,28,'#51453118');
  path([{x:x-80,y:y-30},{x,y},{x,y:y-102},{x:x-80,y:y-132}],'#efd9af');path([{x,y},{x:x+80,y:y-30},{x:x+80,y:y-132},{x,y:y-102}],'#cfb184');
  path([{x:x-95,y:y-134},{x:x-10,y:y-185},{x:x+95,y:y-137},{x,y:y-85}],b.roof);path([{x,y:y-85},{x:x+95,y:y-137},{x:x+95,y:y-127},{x,y:y-75}],b.side);
  ctx.fillStyle=b.side;ctx.beginPath();ctx.moveTo(x-44,y-16);ctx.lineTo(x-44,y-56);ctx.quadraticCurveTo(x-28,y-80,x-13,y-49);ctx.lineTo(x-13,y-5);ctx.closePath();ctx.fill();
  path([{x:x-70,y:y-87},{x:x-52,y:y-80},{x:x-52,y:y-60},{x:x-70,y:y-67}],'#fff7d7', '#c8ab78');path([{x:x+37,y:y-62},{x:x+55,y:y-69},{x:x+55,y:y-50},{x:x+37,y:y-43}],'#f4e5bb');
  ellipse(x-24,y-92,17,16,'#fffaf0');label(b.icon,x-24,y-86,b.side,21);
  if(b.id==='forge'){path([{x:x+43,y:y-165},{x:x+56,y:y-172},{x:x+56,y:y-205},{x:x+43,y:y-198}],b.side);ellipse(x+50,y-219,7,8,'#eadfc9');ellipse(x+57,y-234,10,11,'#f0e7d5');}
  const nameSize=Math.max(14,12/zoom);ctx.font='600 '+nameSize+'px "Noto Sans KR",sans-serif';const w=ctx.measureText(b.name).width+30;round(x-w/2,y+12,w,30,9,'#fffaf0',near(position)?.id===b.id?'#80604b':'#ddcdb3');label(b.name,x,y+33,'#4b392e',nameSize);
}
function tree(x,y,scale=1){ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);ellipse(0,3,20,7,'#51453112');round(-4,-27,8,29,3,'#947556');ellipse(0,-44,23,31,'#9cb48a');ellipse(-8,-48,13,23,'#b0c299');ctx.restore();}
function resident(p,mine=false){const x=mine?position.x:p.drawX,y=mine?position.y:p.drawY,a=avatar(mine?profile?.resident.avatar||selectedAvatar:p.avatar),shirt=SHIRTS[a.shirt];ctx.save();ctx.translate(x,y);ctx.save();ctx.scale(.8,.8);drawResidentFast(ctx,a,0,0,ctx.getTransform().a);ctx.restore();const text=mine?(account?.name||'둘러보는 주민'):p.name;ctx.font='500 '+Math.max(11,11/zoom)+'px "Noto Sans KR",sans-serif';const textWidth=ctx.measureText(text).width+14;round(-textWidth/2,8,textWidth,21,6,mine?'#f3e3c8':'#fffbf3');label(text,0,23,'#544037',11);if(p.bubble&&p.bubbleUntil>performance.now()){const t=p.bubble.slice(0,27)+(p.bubble.length>27?'…':'');ctx.font='500 '+Math.max(12,11/zoom)+'px "Noto Sans KR",sans-serif';const w=Math.min(300,ctx.measureText(t).width+20);round(-w/2,-100,w,29,9,'#fffaf0','#e1d4bd');label(t,0,-80,'#5c493c',12);}ctx.restore();}
function drawGround(){
  ctx.fillStyle='#8fa772';ctx.fillRect(0,0,WORLD.width,WORLD.height);path(BOUNDARY,'#c7d9ae');ctx.save();ctx.translate(OFFSET.x,OFFSET.y);
  path([{x:290,y:555},{x:330,y:530},{x:800,y:800},{x:1280,y:530},{x:1320,y:555},{x:800,y:861}],'#e6d2ae');
  path([{x:780,y:330},{x:820,y:330},{x:820,y:941},{x:780,y:941}],'#e6d2ae');
  ellipse(800,730,78,43,'#e6d2ae');
  ellipse(500,786,104,56,'#aec7ad');ellipse(500,780,96,49,'#92b8bc');ellipse(495,774,79,34,'#a7cbd0');ellipse(469,786,9,5,'#86aa7a');ellipse(538,771,11,5,'#86aa7a');
  ellipse(800,700,37,21,'#b4aa91');ellipse(800,692,34,18,'#d2c9b1');ellipse(800,691,27,13,'#9bc0bf');round(793,660,14,29,4,'#d8cfbb');ellipse(800,660,19,9,'#e6dcc5');ellipse(800,655,13,6,'#a1c2c2');
  for(const [x,y] of [[600,790],[1015,790],[700,940]]){round(x-28,y-10,56,11,3,'#b68b60');round(x-28,y-22,56,10,3,'#c39c71');round(x-23,y,5,10,1,'#806b4e');round(x+18,y,5,10,1,'#806b4e');}
  for(const [x,y] of [[630,480],[970,480],[700,855],[900,855]]){round(x-3,y-55,6,56,2,'#8b7b60');round(x-9,y-68,18,18,4,'#dfc99a');round(x-6,y-65,12,12,3,'#fff1bf');}
  label('작은 연못',430,866,'#768869',13);label('느긋한 산책길',800,985,'#8b7e64',13);ctx.restore();
}
const minimap=$('minimap'),mini=minimap.getContext('2d');
let townView=null;
import('./scene-illustrated.js?v=9').then(module=>module.createIllustratedTown($('stage'))).then(view=>{townView=view;$('world').style.opacity='0';}).catch(error=>{console.warn('Illustrated renderer unavailable:',error.message);toast('일러스트를 불러오지 못해 간단한 마을로 표시해요. 이동과 게임은 이용할 수 있어요.');});
// 미니맵: 땅 전체(숲 포함)를 그리고, 걸을 수 있는 초원을 밝게, 실제 화면 카메라 범위를 사각형으로 보여 준다.
function drawMinimap(){const W=minimap.width,H=minimap.height,sx=W/WORLD.width,sy=H/WORLD.height,view=townView?.camera||{x:camera.x,y:camera.y,w:width/zoom,h:height/zoom};mini.clearRect(0,0,W,H);mini.fillStyle='#3f5233';mini.fillRect(0,0,W,H);mini.beginPath();BOUNDARY.forEach((p,i)=>i?mini.lineTo(p.x*sx,p.y*sy):mini.moveTo(p.x*sx,p.y*sy));mini.closePath();mini.fillStyle='#c7d9ae';mini.fill();mini.font='600 10px "Noto Sans KR",sans-serif';for(const b of BUILDINGS){const x=b.x*sx,y=b.y*sy,side=b.x<WORLD.width/2-100?-1:b.x>WORLD.width/2+100?1:0;mini.fillStyle=b.roof;mini.fillRect(x-5,y-7,10,7);
  // 건물이 가까워 이름이 겹치므로 왼쪽 건물은 왼쪽으로, 오른쪽 건물은 오른쪽으로, 가운데는 위로 붙인다.
  mini.textAlign=side<0?'right':side>0?'left':'center';const tx=x+side*8,ty=side?y-1:y-10;mini.lineWidth=3;mini.strokeStyle='#f4f0dcd9';mini.strokeText(b.name,tx,ty);mini.fillStyle='#3d2f24';mini.fillText(b.name,tx,ty);}mini.beginPath();mini.arc(position.x*sx,position.y*sy,3.5,0,Math.PI*2);mini.fillStyle='#9b5941';mini.fill();mini.strokeStyle='#fffaf0cc';mini.lineWidth=1;mini.strokeRect(Math.max(0,view.x*sx)+.5,Math.max(0,view.y*sy)+.5,Math.min(W,view.w*sx)-1,Math.min(H,view.h*sy)-1);}
let previousTime=performance.now(),lastMinimap=0;function drawFrame(now){const dt=Math.min(.05,(now-previousTime)/1000);previousTime=now;
// 대장간·운세처럼 다른 페이지를 통째로 띄운 동안에는 뒤에 가려진 마을을 그리지 않는다(무거운 페이지 두 개가 함께 돌아 렉이 걸렸다).
const venueBox=$('venueDialog');if(venueBox.open&&venueBox.classList.contains('forge-mode'))return;if(canWalk()){const {dx,dy}=directions();if(dx||dy)Object.assign(position,move(position,dx,dy,dt));if(selfFix){const k=1-Math.exp(-dt*9),fx=selfFix.x*k,fy=selfFix.y*k;position.x+=fx;position.y+=fy;selfFix.x-=fx;selfFix.y-=fy;if(Math.hypot(selfFix.x,selfFix.y)<.3)selfFix=null;}if(now-lastSent>100&&(held.size||previousMoving))sendMovement();}const entrance=near(position);setText('enterButton',entrance?entrance.name+' 입장 · E':'',!entrance||!!venue);setText('walkHint',!account?(TOUCH.matches?'왼쪽 화면에 엄지를 대고 끌어서 걸어보세요':'마을을 누르고 WASD · 방향키로 걸어보세요'):socket?.readyState!==1?'연결을 기다리고 있어요. 위에서 다시 접속할 수 있어요.':entrance?entrance.name+(TOUCH.matches?' 입구 · 입장 버튼을 눌러요':' 입구 · E로 들어가요'):(TOUCH.matches?'왼쪽에 엄지를 대고 끌면 걸어요':'WASD · 방향키로 걷기 / Enter 채팅'));
  if(townView){townView.update({position,self,name:account?.name||'둘러보는 주민',avatar:profile?.resident.avatar||selectedAvatar,peers});if(now-lastMinimap>100){lastMinimap=now;drawMinimap();}return;}
  ctx.clearRect(0,0,width,height);const visibleW=width/zoom,visibleH=height/zoom;const targetX=Math.max(0,Math.min(WORLD.width-visibleW,position.x-visibleW/2)),targetY=Math.max(0,Math.min(WORLD.height-visibleH,position.y-visibleH*.6));camera.x+=(targetX-camera.x)*.12;camera.y+=(targetY-camera.y)*.12;ctx.save();ctx.scale(zoom,zoom);ctx.translate(-camera.x,-camera.y);
  drawGround();
  for(const [x,y] of [[650,660],[950,650],[730,900],[1180,650],[450,720],[600,860],[1000,880]]){ellipse(x+OFFSET.x,y+OFFSET.y,3,3,'#f1dca5');ellipse(x+OFFSET.x+8,y+OFFSET.y-5,3,3,'#fff4d8');}
  const drawables=BUILDINGS.map(b=>({y:b.y,draw:()=>house(b)}));for(const [x,y,s] of [[250,590,1.2],[360,680,1],[1250,650,1.2],[1100,760,.9],[1020,350,1.1],[580,390,.9],[660,930,1.1],[930,950,1],[350,520,.8],[1190,500,1]])drawables.push({y:y+OFFSET.y,draw:()=>tree(x+OFFSET.x,y+OFFSET.y,s)});
  for(const p of peers.values()){if(p.id===self)continue;p.drawX+=(p.x-p.drawX)*Math.min(1,dt*12);p.drawY+=(p.y-p.drawY)*Math.min(1,dt*12);drawables.push({y:p.drawY,draw:()=>resident(p)});}drawables.push({y:position.y,draw:()=>resident(peers.get(self)||{},true)});drawables.sort((a,b)=>a.y-b.y);drawables.forEach(d=>d.draw());ctx.restore();drawMinimap();}
// Keep the animation scheduler alive even if a renderer fails for one frame.
let lastFrameErrorAt=-Infinity;
function frame(now){
  try{drawFrame(now);}
  catch(error){
    if(townView){
      try{townView.dispose();}catch{}
      townView=null;$('world').style.opacity='1';
      delete $('stage').dataset.renderer;
      toast('일러스트 표시가 중단되어 기본 마을로 복구했어요. 이동과 게임을 계속 이용할 수 있어요.');
    }
    if(now-lastFrameErrorAt>5000){console.error('Town frame recovered:',error);lastFrameErrorAt=now;}
  }
  finally{requestAnimationFrame(frame);}
}
requestAnimationFrame(frame);renderHeader();boot();
