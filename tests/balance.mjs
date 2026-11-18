import '../game-core.js';
const F=globalThis.Forge;
let seed=20261118;
const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const rows=[];
for(const target of [1,2,3,5,6,7,8,9,10,12]){
  let spent=0,income=0,rolls=0,sold=0,broken=0;
  for(let i=0;i<2000;i++){
    let s=F.fresh(),t=1e6;s.gold=1e10;
    for(let j=0;j<10000;j++){
      if(s.event){s=F.transition(s,{type:'event',id:s.event.id,accept:false},t,rng).state;t+=1000;}
      const before=s.gold,r=F.transition(s,{type:'enhance'},t,rng);s=r.state;spent+=before-s.gold;t+=1000;rolls++;
      if(s.lv>=target){income+=F.sellPrice(s);sold++;break;}
      if(r.out.result==='boom'){broken++;break;}
    }
  }
  rows.push({target,attempts:rolls,successfullySold:sold,broken,spent,income,net:income-spent,netPerAttempt:Math.round((income-spent)/rolls)});
}
console.log(JSON.stringify({seed:20261118,runsPerTarget:2000,note:'Fresh smith per excursion; no events accepted, no protection; stop on sale target or destruction.',rows},null,2));
