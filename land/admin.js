// 쪼꼬미랜드 관리자 패널. 로그인은 마을과 같은 토큰을 쓰고, 관리자 여부는 서버가 판단한다(화면의 숨김은 보안이 아니다).
const $=id=>document.getElementById(id);
const local=['localhost','127.0.0.1'].includes(location.hostname);
const wanted=new URLSearchParams(location.search).get('api');
// 내 PC에서 열었을 때만 다른 로컬 서버를 쓸 수 있다. 바깥 주소로는 토큰을 보내지 않는다.
const API=local&&/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(wanted||'')?wanted:local?'http://127.0.0.1:8907':'https://sword-forge-api.aicore-sj-relay.workers.dev';
const money=n=>Number(n||0).toLocaleString('ko-KR');
const store={get(k){try{return JSON.parse(localStorage.getItem(k));}catch{return null;}},set(k,v){try{v===null?localStorage.removeItem(k):localStorage.setItem(k,JSON.stringify(v));}catch{}}};
let account=store.get('swordforge-acc'),target=null,pending=null,toastTimer=0,busy=false;

async function call(path,body={}){
  let r;try{r=await fetch(API+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:account?.token,...body}),signal:AbortSignal.timeout(15000)});}
  catch{const e=Error('서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.');e.status=0;throw e;}
  const data=await r.json().catch(()=>({}));
  if(!r.ok){const e=Error(data.msg||'요청을 처리하지 못했어요.');e.status=r.status;e.code=data.error;throw e;}
  return data;
}
function toast(msg){const t=$('toast');t.textContent=msg;t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{t.hidden=true;},3500);}
function el(tag,attrs={},...kids){const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(k==='class')n.className=v;else if(k==='text')n.textContent=v;else n.setAttribute(k,v);}n.append(...kids);return n;}
const when=ms=>new Date(ms).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
const signed=n=>(n>0?'+':n<0?'−':'')+money(Math.abs(n));

function gate(msg,showLogin){$('panel').hidden=true;$('gate').hidden=false;$('gateMsg').textContent=msg;$('loginForm').hidden=!showLogin;$('who').textContent='';if(showLogin)$('loginName').focus();}
async function start(){
  if(!account?.token)return gate('관리자 계정으로 로그인해주세요. 마을과 같은 이름·비밀번호를 써요.',true);
  try{const me=await call('/land/admin/me');$('who').textContent=me.name+' 관리자';$('gate').hidden=true;$('panel').hidden=false;await loadLog();$('q').focus();}
  catch(e){
    if(e.status===401){store.set('swordforge-acc',null);account=null;return gate('로그인이 끝났어요. 다시 로그인해주세요.',true);}
    if(e.status===403)return gate('이 계정은 관리자가 아니에요. 마을에서 디스코드를 연결한 관리자 계정으로 로그인해주세요.',true);
    gate(e.message,false);
  }
}
$('loginForm').addEventListener('submit',async ev=>{
  ev.preventDefault();
  try{const r=await fetch(API+'/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$('loginName').value.trim(),pin:$('loginPin').value})});const d=await r.json();
    if(!r.ok||!d.token)throw Error(d.msg||'이름이나 비밀번호를 확인해주세요.');
    // 마을 화면이 쓰는 값과 같은 모양으로 저장해 마을에서도 그대로 로그인돼 있게 한다.
    account={name:d.name,token:d.token};store.set('swordforge-acc',account);$('loginPin').value='';await start();}
  catch(e){$('gateMsg').textContent=e.message;}
});

async function loadLog(){
  const d=await call('/land/admin/log',{limit:30});
  $('sCount').textContent=money(d.summary.count);$('sGrant').textContent=money(d.summary.granted);$('sRevoke').textContent=money(d.summary.revoked);
  const body=$('logBody');body.replaceChildren(...d.entries.map(e=>el('div',{class:'tr',role:'row'},
    el('span',{text:when(e.created)}),el('span',{text:e.admin+' → '+e.target}),
    el('span',{class:'r '+(e.delta>0?'plus':'minus'),text:signed(e.delta)}),el('span',{class:'r',text:money(e.balance)}),el('span',{text:e.reason}))));
  $('logEmpty').hidden=d.entries.length>0;
}
$('reload').addEventListener('click',()=>loadLog().then(()=>toast('기록을 새로 불러왔어요.')).catch(e=>toast(e.message)));

$('searchForm').addEventListener('submit',async ev=>{
  ev.preventDefault();$('searchMsg').textContent='찾는 중…';$('results').replaceChildren();
  try{const d=await call('/land/admin/search',{q:$('q').value.trim()});
    $('searchMsg').textContent=d.players.length?d.players.length+'명을 찾았어요.':'찾는 주민이 없어요.';
    $('results').replaceChildren(...d.players.map(p=>{const b=el('button',{type:'button'},el('span',{text:p.name}),el('span',{class:'meta',text:(p.linked?'디스코드 연결':'연결 안 함')+(p.balance===null?'':' · '+money(p.balance)+' 초코')}));b.addEventListener('click',()=>pick(p.key));return el('li',{},b);}));
  }catch(e){$('searchMsg').textContent=e.message;}
});
async function pick(key){
  try{const d=await call('/land/admin/player',{key});target={key:d.key,name:d.name};resetForm();showTarget(d);$('target').hidden=false;$('amount').focus();}
  catch(e){toast(e.message);}
}
function showTarget(d){
  $('tName').textContent=d.name;$('tBal').textContent=money(d.balance);target.balance=d.balance;
  $('ledger').replaceChildren(...d.ledger.map(l=>el('li',{},el('span',{text:l.reason}),el('span',{text:signed(l.delta)+' → '+money(l.balance)}))));
}
const kind=()=>document.querySelector('input[name=kind]:checked').value;
function resetForm(){pending=null;$('confirmRow').hidden=true;$('adjSubmit').hidden=false;$('adjNote').className='muted';$('adjNote').textContent='';$('amount').value='';$('reason').value='';syncLabel();}
function syncLabel(){$('adjSubmit').textContent=kind()==='grant'?'지급하기':'회수하기';}
document.querySelectorAll('input[name=kind]').forEach(r=>r.addEventListener('change',()=>{syncLabel();cancel();}));
function read(){
  const amount=Number($('amount').value),reason=$('reason').value.trim();
  if(!Number.isSafeInteger(amount)||amount<1)throw Error('금액은 1 이상의 정수로 입력해주세요.');
  if(!reason)throw Error('사유를 적어주세요.');
  if(kind()==='revoke'&&target.balance!==undefined&&amount>target.balance)throw Error('잔액('+money(target.balance)+')보다 많이 회수할 수 없어요.');
  return {key:target.key,kind:kind(),amount,reason};
}
function note(msg,alert=false){const n=$('adjNote');n.textContent=msg;n.className=alert?'alert':'muted';}
function cancel(){$('confirmRow').hidden=true;$('adjSubmit').hidden=false;if(!pending)note('');}
$('cancelBtn').addEventListener('click',cancel);
$('adjForm').addEventListener('submit',ev=>{
  ev.preventDefault();if(busy)return;
  let f;try{f=read();}catch(e){return note(e.message,true);}
  if(f.kind==='revoke'){ // 회수는 되돌리기 번거로우니 한 번 더 확인한다. 지급은 바로 보낸다.
    $('confirmBtn').textContent=target.name+'에게서 '+money(f.amount)+' 초코 회수 확정';$('confirmRow').hidden=false;$('adjSubmit').hidden=true;$('confirmBtn').focus();return;
  }
  send(f);
});
$('confirmBtn').addEventListener('click',()=>{let f;try{f=read();}catch(e){return note(e.message,true);}send(f);});
async function send(f){
  busy=true;$('adjSubmit').disabled=$('confirmBtn').disabled=true;note('보내는 중…');
  // 같은 내용을 다시 보낼 때는 같은 요청 번호를 써서 서버가 한 번만 반영한다.
  const sig=JSON.stringify(f);if(!pending||pending.sig!==sig)pending={sig,id:crypto.randomUUID()};
  try{const r=await call('/land/admin/adjust',{...f,id:pending.id});
    pending=null;$('confirmRow').hidden=true;$('adjSubmit').hidden=false;
    const e=r.entry;toast(target.name+' '+(e.delta>0?'지급':'회수')+' '+money(Math.abs(e.delta))+' 초코 · 잔액 '+money(e.balance));
    $('amount').value='';$('reason').value='';note('');
    const d=await call('/land/admin/player',{key:target.key});showTarget(d);await loadLog();
  }catch(e){
    $('confirmRow').hidden=true;$('adjSubmit').hidden=false;
    if(e.status===0||e.code==='log'){note(e.message+' 같은 내용으로 [다시 보내기]를 누르면 중복 없이 이어져요.',true);$('adjSubmit').textContent='다시 보내기';}
    else{pending=null;note(e.message,true);}
    if(e.status===401)start();
  }finally{busy=false;$('adjSubmit').disabled=$('confirmBtn').disabled=false;if(!pending)syncLabel();}
}
// 입력을 고치면 이전 경고·확정 단계·재시도 요청 번호를 모두 버린다. 확정 버튼 글자가 옛 금액을 말하는 채로 남지 않게 한다.
const edited=()=>{if(busy)return;pending=null;$('confirmRow').hidden=true;$('adjSubmit').hidden=false;note('');syncLabel();};
$('amount').addEventListener('input',edited);
$('reason').addEventListener('input',edited);
start();
