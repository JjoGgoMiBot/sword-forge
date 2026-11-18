import '../game-core.js';
const F=globalThis.Forge;
// Virtual-clock simulation: no real accounts, balances, timers or network calls are used.
const START=1_000_000_000;
const seeded=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const tier=l=>l>=20?5:l>=17?4:l>=13?3:l>=9?2:l>=5?1:0;
const statPlan=[['dex',10],['trade',5],['focus',5],['dex',20],['focus',15],['trade',10],['str',5],['luck',5],['dex',25],['focus',25],['trade',25],['str',25],['luck',25]];

export function simulate(seed){
  const rng=seeded(seed);let s=F.fresh(),now=START,mode='farm',target=8;
  const stats={seed,rolls:0,farmRolls:0,pushRolls:0,sales:0,saleIncome:0,wages:0,jobs:0,paidGold:0,protectionBought:0,merchantScrolls:0,scrollsUsed:0,destructions:0,events:0,quotaWaitMs:0,miningMs:0,enhancementMs:0,otherMs:0};
  const checkpoints={};
  function action(a,manual=true){
    now=Math.max(now,s.nextAction);
    const r=F.transition(s,a,now,rng);s=r.state;
    now+=150+(manual?1000:0);return r;
  }
  function spendPoints(){while(s.smith.pts){const goal=statPlan.find(([k,v])=>s.smith.st[k]<v);if(!goal)break;action({type:'stat',key:goal[0]});}}
  function mine(){
    const before=now;
    now=Math.max(now,s.workUntil);
    if(s.workCount>=30&&now-s.workWindow<600000){const wait=s.workWindow+600001-now;stats.quotaWaitMs+=wait;now+=wait;}
    action({type:'workStart',kind:'mine'});
    while(s.work){const w=s.work;now=Math.max(now,w.ready)+1100;action({type:'workStep',id:w.id,roundId:w.roundId,cell:w.cells.indexOf(w.target)},false);}
    stats.jobs++;stats.wages=s.st.wages;stats.miningMs+=now-before;
  }
  function sell(){const r=action({type:'sell'});stats.sales++;stats.saleIncome+=r.out.price;mode='farm';}
  let operations=0;
  while(s.lv<20){
    if(++operations>20000000||now-START>365*86400000)throw Error(`Run ${seed} exceeded its safety bound`);
    const otherStart=now;
    if(s.event){
      const e=s.event;let accept=['smith','star','cat','vein'].includes(e.kind);
      if(e.kind==='merchant')accept=mode==='push'&&s.lv>=12&&s.prot<3&&s.gold>Math.max(50000,e.price*10);
      if(e.kind==='noble')accept=mode==='farm'&&s.lv>=target-1;
      const r=action({type:'event',id:e.id,accept});stats.events++;
      if(accept&&e.kind==='merchant'){stats.merchantScrolls++;}
      if(accept&&e.kind==='noble'){stats.sales++;stats.saleIncome+=r.out.price;}
    }
    spendPoints();
    if(mode==='farm'&&s.gold>=100000)mode='push';
    if(s.lv===0&&mode==='farm')target=s.gold<5000?8:s.gold<20000?10:12;
    if(mode==='farm'&&s.lv>=target){sell();stats.otherMs+=now-otherStart;continue;}
    const use=mode==='push'&&s.lv>=12;
    if(s.useProt!==use)action({type:'useProt',value:use});
    if(use&&!s.prot&&s.shard>=F.PROT_COST){action({type:'buyProt'});stats.protectionBought++;}
    stats.otherMs+=now-otherStart;
    if(!s.buffs.cat&&s.gold<F.cost(s)){
      if(mode==='push'&&s.lv>=8){const t=now;sell();stats.otherMs+=now-t;continue;}
      mine();continue;
    }
    const from=s.lv,oldBest=s.best,oldSmith=s.smith.lv,oldGold=s.gold,rollStart=now;
    const r=action({type:'enhance'},false),o=r.out;
    stats.rolls++;stats[mode==='farm'?'farmRolls':'pushRolls']++;stats.paidGold+=oldGold-s.gold;
    now+=from>=10?550:160;
    if(o.fork)now+=['leek','pan'].includes(o.fork)?1500:850;
    if(o.result==='ok'&&tier(s.lv)>tier(from))now+=700+(s.lv===20?2300:800);
    if(o.result==='boom'&&!o.protected){now+=900;stats.destructions++;}
    if(o.protected)stats.scrollsUsed++;
    // The hold loop already supports unattended hammering while held. Account for
    // animation/cooldown, and a fresh press after event/record/tier/destruction stops.
    now=Math.max(now,s.nextAction)+100;
    if(s.event||o.result==='boom'||(o.fork&&['leek','pan'].includes(o.fork))||tier(s.lv)>tier(from)||(s.lv>oldBest&&s.lv>=8))now+=1000;
    if(F.rankOf(s.smith.lv)>F.rankOf(oldSmith))now+=2000;
    stats.enhancementMs+=now-rollStart;
    for(const lv of [10,12,15,17,18,19,20])if(s.lv>=lv&&checkpoints[lv]===undefined)checkpoints[lv]={seconds:Math.round((now-START)/1000),rolls:stats.rolls};
  }
  return {...stats,completed:true,finalWeaponLevel:s.lv,seconds:Math.round((now-START)/1000),hours:(now-START)/3600000,smithLevel:s.smith.lv,finalStats:s.smith.st,finalGold:s.gold,finalPath:s.path,finalScrolls:s.prot,finalShards:s.shard,checkpoints};
}


export {statPlan};
