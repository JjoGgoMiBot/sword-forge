import test from 'node:test';
import assert from 'node:assert/strict';
import '../game-core.js';
const F=globalThis.Forge;
const run=(s,a,t=1e6,r=()=>.5)=>F.transition(s,a,t,r);
test('gentle opening, severe endgame, all probability rows total 100',()=>{
  assert.deepEqual(F.P.slice(0,4).map(x=>x[0]),[95,94,92,90]);assert.equal(F.P[19][0],.5);
  F.P.forEach((r,i)=>{assert.ok(Math.abs(r.reduce((a,b)=>a+b,0)-100)<1e-9);if(i)assert.ok(r[0]<F.P[i-1][0]);});
});
test('every path/stat/buff combination has valid normalized odds',()=>{
  for(const path of Object.keys(F.PATHS))for(let lv=0;lv<20;lv++)for(const max of [0,25]){
    const s=F.fresh();s.path=lv?path:null;s.lv=lv;s.pity=10;s.buffs={smith:3,curse:1};Object.keys(s.smith.st).forEach(k=>s.smith.st[k]=max);
    const o=F.odds(s);assert.ok(o.every(x=>x>=0&&Number.isFinite(x)));assert.ok(Math.abs(o.reduce((a,b)=>a+b,0)-100)<1e-8);
  }
});
test('no starter-weapon quick-sale profit, including rare paths and max trade',()=>{
  for(const path of Object.keys(F.PATHS))for(let trade=0;trade<=25;trade++){
    const s=F.fresh();s.path=path;s.smith.st.trade=trade;
    // First attempt always costs the root weapon price, before a path is picked.
    const root={...s,path:null};s.invested=F.cost(root,0);assert.ok(F.sellPrice(s,1)<F.cost(root,0));assert.ok(F.sellPrice(s,2)<F.cost(root,0));
  }
});
test('insufficient funds cannot produce a roll or mutate the source',()=>{
  const s=F.fresh();s.gold=0;assert.throws(()=>run(s,{type:'enhance'}),/골드/);assert.equal(s.rev,0);assert.equal(s.st.tries,0);
});
test('roll charges once and enforces action cooldown',()=>{
  const a=run(F.fresh(),{type:'enhance'});assert.equal(a.state.gold,2920);assert.equal(a.state.st.tries,1);assert.equal(a.state.lv,1);
  assert.throws(()=>run(a.state,{type:'enhance'},1e6+1),/잠시/);
});
test('free attempts are consumed, capped and persisted in the result',()=>{
  const s=F.fresh();s.buffs.cat=200;const r=run(s,{type:'enhance'});assert.equal(r.state.gold,3000);assert.equal(r.state.buffs.cat,1);
});
test('sale consumes weapon once and grants no farming XP',()=>{
  const s=F.fresh();s.lv=3;s.path='blade';const a=run(s,{type:'sell'});assert.equal(a.state.gold,3180);assert.equal(a.state.smith.xp,0);assert.equal(a.state.lv,0);
  assert.throws(()=>run(a.state,{type:'sell'},1e6+1000),/무기/);
});
test('protection consumes exactly one scroll and grants no shards',()=>{
  const s=F.fresh();s.lv=19;s.path='blade';s.gold=1e6;s.prot=2;const r=run(s,{type:'enhance'},1e6,()=>.9999);assert.equal(r.state.lv,19);assert.equal(r.state.prot,1);assert.equal(r.state.shard,0);assert.equal(r.out.protected,true);
});
test('stats reject forged keys and the cap, migration clamps invalid data',()=>{
  const s=F.fresh();s.smith.lv=60;s.smith.pts=30;s.smith.st.trade=25;assert.throws(()=>run(s,{type:'stat',key:'trade'}));assert.throws(()=>run(s,{type:'stat',key:'__proto__'}));
  const n=F.normalize({lv:999,path:'bad',gold:-1,shard:Infinity,smith:{lv:1,pts:999,st:{dex:999}}});assert.equal(n.lv,20);assert.equal(n.path,'blade');assert.equal(n.gold,0);assert.equal(n.shard,0);assert.equal(n.smith.pts,0);assert.equal(n.smith.st.dex,0);
});
test('event reward has a single use, no concurrent sale and no forged price',()=>{
  const s=F.fresh();s.lv=7;s.path='blade';s.event={id:'one',kind:'noble',price:2200,lv:7,path:'blade',expires:2e6};
  assert.throws(()=>run(s,{type:'sell'}),/이벤트/);
  const r=run(s,{type:'event',id:'one',accept:true,price:1e12});assert.equal(r.state.gold,5200);assert.equal(r.state.lv,0);
  assert.throws(()=>run(r.state,{type:'event',id:'one',accept:true},1e6+1000),/이벤트/);
});
test('job steps require matching challenge IDs, time and actual answer',()=>{
  const r=run(F.fresh(),{type:'workStart',kind:'mine'}),s=r.state,w=s.work;
  assert.throws(()=>run(s,{type:'workStep',id:w.id,roundId:w.roundId,cell:0},1e6+100),/천천히/);
  assert.throws(()=>run(s,{type:'workStep',id:w.id,roundId:'old',cell:0},1e6+1000),/작업/);
  assert.throws(()=>run(s,{type:'sell'},1e6+1000),/작업/);
  const wrong=w.cells.findIndex(c=>c!==w.target),bad=run(s,{type:'workStep',id:w.id,roundId:w.roundId,cell:wrong},1e6+1000);
  assert.equal(bad.state.work,null);assert.equal(bad.state.gold,3000);assert.throws(()=>run(bad.state,{type:'workStart',kind:'mine'},1e6+1100),/쉬었다가/);
});
test('completing all steps pays once, low funds receive bounded assistance',()=>{
  for(const kind of ['mine','chores'])for(const gold of [0,1000]){
    let s=F.fresh();s.gold=gold;let t=1e6;let r=run(s,{type:'workStart',kind},t);s=r.state;const reward=s.work.reward;
    while(s.work){t+=1000;const w=s.work;r=run(s,{type:'workStep',id:w.id,roundId:w.roundId,cell:w.cells.indexOf(w.target)},t);s=r.state;}
    assert.equal(s.gold,gold+reward);assert.equal(s.st.jobs,1);assert.equal(s.st.wages,reward);assert.equal(s.shard,0);
    assert.throws(()=>run(s,{type:'workStep',id:'old',roundId:'old',cell:0},t+1000));
  }
});
test('job timeouts, cancellation and rolling quota cannot mint money',()=>{
  let s=run(F.fresh(),{type:'workStart',kind:'chores'}).state;
  assert.throws(()=>run(s,{type:'workStep',id:s.work.id,roundId:s.work.roundId,cell:0},1e6+15000),/작업/);
  s=run(s,{type:'workCancel'},1e6+1000).state;assert.equal(s.gold,3000);assert.equal(s.work,null);
  s.workWindow=1e6;s.workCount=30;assert.throws(()=>run(s,{type:'workStart',kind:'mine'},1e6+10000),/일감/);
  assert.ok(run(s,{type:'workStart',kind:'mine'},1e6+600001).state.work);
});
test('expired events can close without payout and expired jobs do not cause permanent cooldown',()=>{
  const s=F.fresh();s.event={id:'expired',kind:'vein',amount:100,expires:1};
  const r=run(s,{type:'event',id:'expired',accept:true});assert.equal(r.state.event,null);assert.equal(r.state.shard,0);assert.equal(r.out.eventExpired,true);
  const w=run(F.fresh(),{type:'workStart',kind:'mine'}).state;
  const restarted=run(w,{type:'workStart',kind:'chores'},1e6+20000);assert.equal(restarted.state.work.kind,'chores');assert.equal(restarted.state.gold,3000);
});
test('legacy starter weapons retain sale value while genuine free v3 rolls cannot invent investment',()=>{
  const legacy=F.normalize({lv:1,path:'blade',gold:1234});assert.equal(legacy.gold,1234);assert.equal(F.sellPrice(legacy),40);
  const migrated=F.normalize({...legacy,version:3,rev:0,invested:0});assert.equal(F.sellPrice(migrated),40);
  const free=F.fresh();free.buffs.cat=1;const r=run(free,{type:'enhance'});assert.equal(r.state.invested,0);assert.equal(F.sellPrice(F.normalize(r.state)),0);
});
test('focus reduces destruction into keep, never into extra downgrades',()=>{
  for(const path of Object.keys(F.PATHS))for(let lv=6;lv<20;lv++){
    const s=F.fresh();s.lv=lv;s.path=path;const before=F.odds(s);s.smith.st.focus=25;const after=F.odds(s);
    assert.ok(after[3]<before[3]);assert.ok(after[1]>before[1]);assert.ok(Math.abs(after[2]-before[2])<1e-10);assert.equal(after[0],before[0]);
  }
});
test('late-stage dexterity and pity retain their advertised relative bonuses',()=>{
  const s=F.fresh();s.lv=19;s.path='blade';const base=F.odds(s)[0];s.smith.st.dex=25;
  assert.ok(Math.abs(F.odds(s)[0]-base*1.5)<1e-10);s.pity=10;assert.ok(Math.abs(F.odds(s)[0]-base*2)<1e-10);
});
test('every path and trade build pays strictly increasing upgrade costs',()=>{
  for(const path of Object.keys(F.PATHS))for(const trade of [0,10,25]){const s=F.fresh();s.path=path;s.smith.st.trade=trade;for(let lv=0;lv<19;lv++)assert.ok(F.cost(s,lv+1)>F.cost(s,lv));}
});
test('star blessing prevents destruction without worsening downgrade risk',()=>{
  for(const path of Object.keys(F.PATHS))for(let lv=6;lv<20;lv++){
    const s=F.fresh();s.lv=lv;s.path=path;s.prot=1;const before=F.odds(s);s.buffs.star=1;const after=F.odds(s);
    assert.equal(after[3],0);assert.ok(after[1]>before[1]);assert.ok(Math.abs(after[2]-before[2])<1e-10);assert.equal(after[0],before[0]);
  }
});
test('empty event IDs and no-op actions cannot mint revisions or write continuously',()=>{
  const s=F.fresh();for(const id of [null,undefined,'',0])assert.throws(()=>run(s,{type:'event',id,accept:true}),/이벤트/);
  assert.throws(()=>run(s,{type:'dismissEvent',id:null}),/이벤트/);
  assert.throws(()=>run(s,{type:'workCancel'}),/작업/);
  assert.throws(()=>run(s,{type:'useProt',value:true}),/변경/);
  assert.throws(()=>run(s,{type:'useProt',value:'false'}),/변경/);
  const changed=run(s,{type:'useProt',value:false}).state;
  assert.throws(()=>run(changed,{type:'useProt',value:true},1e6+1),/잠시/);assert.equal(s.rev,0);
});
