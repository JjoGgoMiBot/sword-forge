export function rouletteTurnPlan(shots=0){
  const steps=shots?13:12,duration=1780;
  const ticks=Array.from({length:steps},(_,i)=>Math.round(duration*Math.pow((i+1)/steps,1.8)));
  return {duration,ticks,angle:-shots*60-720,lockAt:duration,triggerAt:duration+240};
}
export function turnCylinder(root,round,sound){
  const rotor=root.querySelector('.ac-cylwrap'),plan=rouletteTurnPlan(round?.shots||0);
  const reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let animation,cues,cancelled=false;
  const label=root.querySelector('.ac-cyl-note');if(label)label.textContent='실린더 회전 중…';
  root.querySelectorAll('[data-ac]').forEach(b=>b.disabled=true);
  if(rotor&&!reduced){
    const start=Number(rotor.style.transform.match(/rotate\((-?[\d.]+)/)?.[1]||0),distance=plan.angle-start;
    const frames=[{transform:`rotate(${start}deg)`,offset:0},...plan.ticks.map((at,i)=>({transform:`rotate(${start+distance*(i+1)/plan.ticks.length}deg)`,offset:at/plan.duration,easing:'cubic-bezier(.15,.7,.3,1)'}))];
    animation=rotor.animate?.(frames,{duration:plan.duration,fill:'forwards'});
    cues=sound?.cue?.([...plan.ticks.map(at=>({at:Math.max(0,at-20),id:'cylinder.step'})),{at:plan.lockAt,id:'cylinder.lock'}]);
  }
  const finished=animation?animation.finished.catch(()=>{}):Promise.resolve();
  return {cancel(){cancelled=true;animation?.cancel();cues?.cancel();},async reveal(result){await finished;if(cancelled||!root.isConnected)return;const bang=result?.outcome==='bang';if(label)label.textContent='실린더 고정 · 방아쇠';await new Promise(r=>setTimeout(r,reduced?0:240));if(cancelled||!root.isConnected)return;sound?.play?.(bang?'gun.bang':'gun.empty');}};
}
