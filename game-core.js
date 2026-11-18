/* Shared, deterministic rules. Account randomness and state transitions run on the Worker. */
(() => {
  const VERSION=3, MAX=20, LIMIT=1e12, PROT_COST=80;
  const P=[
    [95,5,0,0],[94,6,0,0],[92,8,0,0],[90,9,1,0],[87,11,2,0],
    [83,13,4,0],[78,15,6.5,.5],[72,18,9,1],[65,22,11.5,1.5],[58,26,13.5,2.5],
    [50,32,15,3],[42,37,17,4],[34,43,18,5],[20,56,18,6],[11.5,63.5,18,7],
    [6.5,68.5,17,8],[3.5,71.5,16,9],[1.8,73.2,15,10],[1,74,14,11],[.5,75.5,12,12]
  ];
  const PATHS={blade:{s:1,f:1,d:1,sell:1,cost:1,great:3},dagger:{s:1.12,f:1,d:1.12,sell:.8,cost:.7,great:0},club:{s:.95,f:1.15,d:.75,sell:.95,cost:1,great:0},leek:{s:1,f:1,d:1.15,sell:1.8,cost:1,great:0},pan:{s:.92,f:1,d:.6,sell:1.3,cost:1,great:0}};
  const VALUES=[0,40,95,175,300,520,900,1600,2800,4800,8500,14500,25000,45000,80000,150000,300000,650000,1600000,6000000,40000000];
  const RANKS=[1,5,10,16,23,31,40,50];
  const int=(v,hi=LIMIT,lo=0)=>typeof v==='number'&&Number.isFinite(v)?Math.min(hi,Math.max(lo,Math.floor(v))):lo;
  const xpNeed=l=>Math.round(40*l**1.6);
  const rankOf=l=>RANKS.filter(x=>l>=x).length-1;
  function fresh(){return {version:VERSION,rev:0,lv:0,path:null,gold:3000,shard:0,prot:0,best:0,pity:0,buffs:{},seen:['root'],cleared:{},useProt:true,invested:0,t:0,nextAction:0,work:null,workUntil:0,workWindow:0,workCount:0,event:null,smith:{lv:1,xp:0,pts:0,st:{dex:0,focus:0,str:0,luck:0,trade:0}},st:{tries:0,ok:0,keep:0,fail:0,boom:0,great:0,earned:0,saved:0,jobs:0,wages:0}};}
  function normalize(raw){
    const s=fresh(), v=raw&&typeof raw==='object'?raw:{};
    for(const k of ['rev','gold','shard','prot','invested','t','nextAction','workUntil','workWindow','workCount']) s[k]=int(v[k]);
    if(v.gold===undefined)s.gold=3000;
    s.lv=int(v.lv,MAX);s.best=Math.max(s.lv,int(v.best,MAX));s.pity=int(v.pity,10);
    s.path=s.lv?(Object.hasOwn(PATHS,v.path)?v.path:'blade'):null;
    s.name=typeof v.name==='string'?v.name.slice(0,12):'대장장이';s.useProt=v.useProt!==false;
    for(const k of ['smith','cat','star','curse'])s.buffs[k]=int(v.buffs?.[k],k==='cat'?2:k==='smith'?3:1);
    if(Array.isArray(v.seen))s.seen=[...new Set(['root',...v.seen.filter(x=>typeof x==='string'&&(/^(blade|dagger|club|leek|pan):([1-9]|1[0-9]|20)$/.test(x)||/^path:(blade|dagger|club|leek|pan)$/.test(x)))])];
    for(const k of Object.keys(PATHS))if(v.cleared?.[k]===true)s.cleared[k]=true;
    s.smith.lv=int(v.smith?.lv,60,1);s.smith.xp=int(v.smith?.xp,xpNeed(s.smith.lv)-1);
    let budget=s.smith.lv-1+2*rankOf(s.smith.lv);
    for(const k of Object.keys(s.smith.st)){const n=int(v.smith?.st?.[k],Math.min(25,budget));s.smith.st[k]=n;budget-=n;}
    s.smith.pts=Math.min(budget,int(v.smith?.pts,budget));
    for(const k of Object.keys(s.st))s.st[k]=int(v.st?.[k]);
    // Pre-v3 saves did not track paid material. Grandfather one root attempt,
    // including already migrated rev=0 accounts, rather than making their sword worthless.
    // A real v3 free-roll weapon always has rev>0 and retains its zero-cost sale cap.
    if(s.lv>0&&!s.invested&&(v.version!==VERSION||s.rev===0))s.invested=Math.max(10,Math.round(80*(1-s.smith.st.trade*.012)/10)*10);
    // Only server-owned version 3 state may carry live challenges/events.
    if(v.version===VERSION){s.work=v.work&&typeof v.work==='object'?structuredClone(v.work):null;s.event=v.event&&typeof v.event==='object'?structuredClone(v.event):null;}
    return s;
  }
  const pm=s=>PATHS[s.path]||{s:1,f:1,d:1,sell:1,cost:1,great:0};
  const cost=(s,l=s.lv)=>Math.max(10,Math.round(80*1.32**l*pm(s).cost*(1-s.smith.st.trade*.012)/10)*10);
  const sellPrice=(s,l=s.lv)=>{
    if(!l)return 0;
    const price=Math.round(VALUES[l]*pm(s).sell*(1+s.smith.st.trade*.015)/10)*10;
    // A +2 great success, rare branch or free roll must not create a root-sale loop.
    return l<=2?Math.min(price,Math.floor(s.invested*.7/10)*10):price;
  };
  function odds(s){
    if(s.lv>=MAX)return [0,0,0,0];
    let [a,k,f,d]=P[s.lv];const m=pm(s),st=s.smith.st,b=s.buffs;
    a*=m.s;f*=m.f;d*=m.d;if(b.star){k+=d;d=0;}if(b.curse){a*=1.5;d*=2;}
    // Focus always helps: protected players must not get extra downgrades for investing in it.
    const red=d*st.focus*.015;d-=red;k+=red;
    // Relative bonuses keep their full effect: high-level progression rewards stat investment.
    a=Math.min(97,a*(1+s.pity*.05+st.dex*.02+(b.smith?.3:0)));
    const sum=k+f+d,rem=100-a;return [a,k*rem/sum,f*rem/sum,d*rem/sum];
  }
  function gainXP(s,n){const sm=s.smith;if(sm.lv>=60)return;sm.xp+=Math.round(n);while(sm.lv<60&&sm.xp>=xpNeed(sm.lv)){sm.xp-=xpNeed(sm.lv);const r=rankOf(sm.lv++);sm.pts+=1+(rankOf(sm.lv)>r?2:0);}if(sm.lv===60)sm.xp=0;}
  const fail=msg=>{throw new Error(msg);};
  const addGold=(s,n)=>{s.gold=Math.min(LIMIT,s.gold+n);};
  function pickPath(s,rng){const r=rng()*100,c=3+s.smith.st.luck*.2;return r<c?'leek':r<c*2?'pan':['blade','dagger','club'][Math.floor(rng()*3)];}
  const EVENTS=['smith','star','curse','merchant','noble','cat','vein'];
  function makeEvent(s,rng,now){
    const pool=EVENTS.filter(k=>!['star','curse','noble'].includes(k)||s.lv>=6),kind=pool[Math.floor(rng()*pool.length)];
    const e={id:crypto.randomUUID(),kind,expires:now+120000,lv:s.lv,path:s.path};
    if(kind==='merchant')e.price=1500+cost(s)*3;
    if(kind==='noble')e.price=Math.round(sellPrice(s)*1.35/10)*10;
    if(kind==='vein')e.amount=4+Math.floor(rng()*5);
    s.event=e;
  }
  const SYMBOLS=['철','구리','은','석탄','돌','금'];
  const TASKS=['장작','물통','망치','상자','모루','숯'];
  function challenge(w,rng,now){
    const a=(w.kind==='mine'?SYMBOLS:TASKS).slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
    w.cells=a;w.target=a[Math.floor(rng()*a.length)];w.roundId=crypto.randomUUID();w.ready=now+900;w.deadline=now+14000;
  }
  function transition(raw,action,now=Date.now(),rng=Math.random){
    const s=normalize(raw),a=action||{},out={};
    if(typeof a.type!=='string')fail('잘못된 행동입니다.');
    const expiredEvent=s.event&&now>s.event.expires?s.event.id:null;
    if(expiredEvent)s.event=null;
    const expiredWork=s.work&&now>s.work.deadline?s.work.id:null;
    if(expiredWork){s.workUntil=Math.max(s.workUntil,s.work.deadline+5000);s.work=null;}
    if(s.work&&!['workStep','workCancel'].includes(a.type))fail('진행 중인 작업을 마치거나 그만두세요.');
    if(s.event&&!['event','dismissEvent'].includes(a.type))fail('먼저 이벤트를 선택해 주세요.');
    if(now<s.nextAction)fail('잠시 후 다시 시도해 주세요.');
    if(a.type==='enhance'){
      if(s.lv>=MAX)fail('이미 최대 강화입니다.');
      const from=s.lv,c=cost(s),free=s.buffs.cat>0,o=odds(s);
      if(!free&&s.gold<c)fail('골드가 부족해요. 광산이나 잡일로 벌어 보세요.');
      if(free)s.buffs.cat--;else{s.gold-=c;s.invested+=c;}
      let r=rng()*100;const result=r<o[0]?'ok':r<o[0]+o[1]?'keep':r<o[0]+o[1]+o[2]?'fail':'boom';
      s.st.tries++;s.buffs.smith=Math.max(0,(s.buffs.smith||0)-1);delete s.buffs.star;delete s.buffs.curse;
      let xp=4+from*3;
      if(result==='ok'){
        out.great=from<=12&&rng()*100<5+s.smith.st.str*.4+pm(s).great;
        if(from===0){s.path=pickPath(s,rng);out.fork=s.path;s.seen.push('path:'+s.path);}
        s.lv=Math.min(MAX,from+(out.great?2:1));s.pity=0;s.st.ok++;if(out.great)s.st.great++;xp*=1.5;
      }else if(result==='keep'){s.pity=Math.min(10,s.pity+1);s.st.keep++;}
      else if(result==='fail'){s.pity=Math.min(10,s.pity+1);s.st.fail++;s.lv=Math.max(0,from-1);if(!s.lv){s.path=null;s.invested=0;}}
      else if(s.useProt&&s.prot>0){s.prot--;s.pity=Math.min(10,s.pity+1);s.st.saved++;out.protected=true;}
      else {out.shards=Math.round((from*from/5+2)*(1+s.smith.st.luck*.03));s.shard+=out.shards;s.st.boom++;s.pity=0;s.lv=0;s.path=null;s.invested=0;xp=6+from*8;}
      gainXP(s,xp);s.best=Math.max(s.best,s.lv);s.seen=[...new Set([...s.seen,s.lv?s.path+':'+s.lv:'root'])];
      if(s.lv===MAX&&!s.cleared[s.path]){s.cleared[s.path]=true;out.ending=true;}
      else if(rng()*100<6+s.smith.st.luck*.25)makeEvent(s,rng,now);
      out.result=result;out.from=from;s.nextAction=now+650;
    }else if(a.type==='sell'){
      if(!s.lv)fail('판매할 무기가 없어요.');out.price=sellPrice(s);out.from=s.lv;addGold(s,out.price);s.st.earned+=out.price;s.lv=0;s.path=null;s.invested=0;s.pity=0;s.nextAction=now+400;
      // Sales grant no XP: repeatedly selling the first successful weapon cannot farm stats.
    }else if(a.type==='buyProt'){
      if(s.shard<PROT_COST)fail('파편이 부족해요.');s.shard-=PROT_COST;s.prot++;s.nextAction=now+300;
    }else if(a.type==='stat'){
      if(!Object.hasOwn(s.smith.st,a.key)||s.smith.pts<1||s.smith.st[a.key]>=25)fail('올릴 수 없는 능력치입니다.');s.smith.pts--;s.smith.st[a.key]++;
    }else if(a.type==='useProt'){
      if(typeof a.value!=='boolean'||a.value===s.useProt)fail('설정 변경이 없거나 잘못된 값입니다.');
      s.useProt=a.value;
    }
    else if(a.type==='event'||a.type==='dismissEvent'){
      const e=s.event;
      if(expiredEvent&&!e&&a.id===expiredEvent){s.rev++;s.t=now;s.nextAction=Math.max(s.nextAction,now+100);out.eventExpired=true;return {state:s,out};}
      if(!e||a.id!==e.id)fail('이미 끝났거나 만료된 이벤트입니다.');s.event=null;
      if(a.type==='event'&&a.accept===true){
        if(e.kind==='smith')s.buffs.smith=3;
        if(e.kind==='star')s.buffs.star=1;
        if(e.kind==='curse')s.buffs.curse=1;
        if(e.kind==='cat')s.buffs.cat=Math.min(2,(s.buffs.cat||0)+2);
        if(e.kind==='vein')s.shard+=e.amount;
        if(e.kind==='merchant'){if(s.gold<e.price)fail('골드가 부족합니다.');s.gold-=e.price;s.prot++;}
        if(e.kind==='noble'){if(s.lv!==e.lv||s.path!==e.path)fail('무기가 달라졌습니다.');addGold(s,e.price);s.st.earned+=e.price;s.lv=0;s.path=null;s.invested=0;s.pity=0;out.price=e.price;}
      }
    }else if(a.type==='workStart'){
      if(!['mine','chores'].includes(a.kind))fail('없는 일거리입니다.');if(now<s.workUntil)fail('잠깐 쉬었다가 다시 일해요.');
      if(!s.workWindow||now-s.workWindow>=600000){s.workWindow=now;s.workCount=0;}
      if(s.workCount>=30)fail('일감이 준비 중이에요. 잠시 후 다시 와 주세요.');
      s.workCount++;s.work={id:crypto.randomUUID(),kind:a.kind,step:0,total:a.kind==='mine'?5:4,reward:(a.kind==='mine'?260:180)*(s.gold<1000?1.5:1),started:now};challenge(s.work,rng,now);
    }else if(a.type==='workStep'){
      const w=s.work;if(!w||a.id!==w.id||a.roundId!==w.roundId)fail('만료되었거나 이미 처리한 작업입니다.');
      if(now<w.ready)fail('표식을 확인하고 천천히 작업해 주세요.');
      if(!Number.isInteger(a.cell)||a.cell<0||a.cell>=w.cells.length)fail('잘못된 작업 위치입니다.');
      if(w.cells[a.cell]!==w.target){s.work=null;s.workUntil=now+5000;out.workFailed=true;}
      else if(++w.step>=w.total){addGold(s,w.reward);s.st.jobs++;s.st.wages+=w.reward;out.wage=w.reward;s.work=null;s.workUntil=now+6000;}
      else challenge(w,rng,now);
    }else if(a.type==='workCancel'){
      if(!s.work&&!expiredWork)fail('진행 중인 작업이 없습니다.');
      s.work=null;s.workUntil=now+5000;
    }
    else fail('지원하지 않는 행동입니다.');
    s.rev++;s.t=now;s.nextAction=Math.max(s.nextAction,now+100);return {state:s,out};
  }
  globalThis.Forge={VERSION,MAX,P,PROT_COST,PATHS,fresh,normalize,cost,sellPrice,odds,xpNeed,rankOf,transition};
})();
