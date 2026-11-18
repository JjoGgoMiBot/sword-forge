import '../game-core.js';
const F=globalThis.Forge;

// Absorbing Markov model over (weapon level, pity), with three independent
// right-hand sides: success probability, rolls and paid gold per excursion.
// Stats are fixed, random events are declined, and protection is either absent
// or always stocked. A +19 success is counted as reaching the target; the
// awakening-crack count and fatigue pacing are covered in tests/core.test.mjs.
// Scroll acquisition, income farming and animations are excluded.
function solve(A,B){
  const n=A.length,m=B[0].length;
  for(let i=0;i<n;i++){
    let p=i;for(let k=i+1;k<n;k++)if(Math.abs(A[k][i])>Math.abs(A[p][i]))p=k;
    if(Math.abs(A[p][i])<1e-18)throw Error('Singular progression model');
    [A[i],A[p]]=[A[p],A[i]];[B[i],B[p]]=[B[p],B[i]];
    for(let k=i+1;k<n;k++){const f=A[k][i]/A[i][i];if(!f)continue;A[k][i]=0;for(let j=i+1;j<n;j++)A[k][j]-=f*A[i][j];for(let j=0;j<m;j++)B[k][j]-=f*B[i][j];}
  }
  const X=Array.from({length:n},()=>new Float64Array(m));
  for(let i=n-1;i>=0;i--)for(let c=0;c<m;c++){let v=B[i][c];for(let j=i+1;j<n;j++)v-=A[i][j]*X[j][c];X[i][c]=v/A[i][i];}
  return X;
}
function excursion(target,path,stats,protect){
  const N=target*11,A=Array.from({length:N},()=>new Float64Array(N)),B=Array.from({length:N},()=>new Float64Array(4));
  for(let lv=0;lv<target;lv++)for(let pity=0;pity<=10;pity++){
    const i=lv*11+pity,s=F.fresh();s.lv=lv;s.path=lv?path:null;s.pity=pity;s.smith.lv=60;s.smith.st={...s.smith.st,...stats};
    A[i][i]=1;B[i][1]=1;B[i][2]=F.cost(s);
    const o=F.odds(s).map(p=>p/100),great=lv<=12?(5+(stats.str||0)*.4+(lv?F.PATHS[path].great:0))/100:0;
    function edge(prob,to,pt){if(to>=target)B[i][0]+=prob;else A[i][to*11+pt]-=prob;}
    edge(o[0]*(1-great),lv+1,0);edge(o[0]*great,Math.min(20,lv+2),0);
    edge(o[1],lv,Math.min(10,pity+1));edge(o[2],Math.max(0,lv-1),Math.min(10,pity+1));
    if(protect){edge(o[3],lv,Math.min(10,pity+1));B[i][3]=o[3];}
  }
  const X=solve(A,B);
  // +20 needs CRACK_N successes at +19; after each crack the weapon stays at +19 with pity reset.
  if(target!==20)return X[0];
  const first=X[0],again=X[19*11],n=F.CRACK_N-1;
  // After a crack the weapon stays at +19 (pity 0). A destruction from there costs a full
  // climb back to the next +19 success, i.e. one more first-excursion chain.
  const per=i=>first[i]/first[0],next=i=>again[i]+(1-again[0])*per(i);
  return [1,per(1)+n*next(1),per(2)+n*next(2),per(3)+n*next(3)];
}
export function expectedProgression(target,stats={},protect=false){
  const rc=(3+(stats.luck||0)*.2)/100,weights={blade:(1-2*rc)/3,dagger:(1-2*rc)/3,club:(1-2*rc)/3,leek:rc,pan:rc},total=[0,0,0,0];
  for(const [path,w]of Object.entries(weights)){const v=excursion(target,path,stats,protect);v.forEach((a,i)=>total[i]+=a*w);}
  return {target,protect,attempts:Math.round(total[1]/total[0]),gold:Math.round(total[2]/total[0]),scrolls:Math.round(total[3]/total[0]),successPerExcursion:total[0]};
}
