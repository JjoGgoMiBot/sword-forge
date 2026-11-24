// Claude의 projects/creative/vfx 모듈을 원본 그대로 사용한다. 자세한 출처는 vendor/claude-vfx/README.md.
const ready=typeof window==='undefined'?Promise.resolve(false):(async()=>{await import('./vendor/claude-vfx/vfx-engine.js');await import('./vendor/claude-vfx/presets.js');await import('./vendor/claude-vfx/vfx-gl.js');return true;})().catch(e=>{console.warn('VFX module',e.message);return false;});
const active=new WeakMap();let activeHandle=null,sharedEngine=null;
export function playLandVfx(stage,kind,{delay=0,scale=1}={}){
  if(!stage||globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return {cancel(){},done:Promise.resolve()};
  activeHandle?.cancel();active.get(stage)?.cancel();let cancelled=false,timer,raf,canvas,engine,resolve;
  const done=new Promise(r=>resolve=r);
  const handle={done,cancel(){cancelled=true;clearTimeout(timer);cancelAnimationFrame(raf);canvas?.remove();if(active.get(stage)===handle)active.delete(stage);resolve();}};active.set(stage,handle);activeHandle=handle;
  if(kind==='loss'||kind==='draw'){timer=setTimeout(()=>{if(cancelled||!stage.isConnected)return handle.cancel();const a=stage.animate?.([{filter:'brightness(1)'},{filter:kind==='loss'?'brightness(.88)':'brightness(1.05)'},{filter:'brightness(1)'}],{duration:380});if(a)a.finished.catch(()=>{}).then(()=>handle.cancel());else handle.cancel();},delay);return handle;}
  ready.then(ok=>{if(!ok||cancelled)return handle.cancel();timer=setTimeout(()=>{
    if(cancelled||!stage.isConnected)return handle.cancel();
    const r=stage.getBoundingClientRect(),w=Math.max(1,r.width),h=Math.max(1,r.height);canvas=document.createElement('canvas');canvas.className='land-native-vfx';canvas.width=Math.round(w);canvas.height=Math.round(h);stage.append(canvas);
    engine=sharedEngine||=(new window.VFX.Engine());for(const key of ['trails','parts','hits','lines','shots','bodies'])engine[key]=[];engine.t=0;engine.freeze=0;engine.trauma=0;engine.resize(canvas.width,canvas.height);engine.impactFrames=false;
    const preset=window.VFX.fromColor(kind==='bang'?'#ffad54':kind==='loss'?'#a28a72':'#f4ce7d',kind==='bang'?'fire':kind==='loss'?'dark':'magic');
    // 실사 카드 게임에서는 전투용 광선이 패를 덮지 않게 프리셋의 크기/잔광을 낮춘다.
    if(preset.impact.flash){preset.impact.flash.size=kind==='bang'?70:34;preset.impact.flash.alpha=kind==='bang'?.7:.3;}
    if(preset.impact.star){preset.impact.star.count=kind==='bang'?3:1;preset.impact.star.needles=kind==='bang'?2:0;preset.impact.star.len=kind==='bang'?55:18;preset.impact.star.width=kind==='bang'?4:1.5;}
    if(preset.impact.ring){preset.impact.ring.size=kind==='bang'?45:70;preset.impact.ring.width=1;}
    preset.impact.shake=kind==='bang'?3:0;
    for(const b of preset.impact.burst||[]){b.count=Math.min(b.count,kind==='bang'?10:6);if(Array.isArray(b.size))b.size=b.size.map(v=>v*.55);if(Array.isArray(b.speed))b.speed=b.speed.map(v=>v*.55);}
    engine.impact(w/2,h*(kind==='bang'?.4:.48),preset,-Math.PI/2,{scale:(kind==='bang'?.42:kind==='loss'?.17:.28)*scale});
    engine.parts=engine.parts.slice(0,80);
    let previous=performance.now(),start=previous;const g=canvas.getContext('2d');
    const frame=now=>{if(cancelled||!stage.isConnected||document.hidden||now-start>1450)return handle.cancel();const dt=Math.min(.035,(now-previous)/1000);previous=now;g.clearRect(0,0,w,h);engine.update(dt);engine.render(g,ctx=>ctx.setTransform(1,0,0,1,0,0));raf=requestAnimationFrame(frame);};raf=requestAnimationFrame(frame);
    if(kind==='bang')stage.animate?.([{translate:'0 0'},{translate:'-4px 1px'},{translate:'3px -1px'},{translate:'0 0'}],{duration:210,easing:'ease-out'});
  },delay);});return handle;
}
export function dealCards(cards,sound,{spacing=150}={}){
  const list=Array.from(cards);if(!list.length)return;
  const reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  list.forEach((card,i)=>{if(!reduced)card.animate?.([{opacity:0,transform:'translate(26px,-40px) rotate(-9deg)'},{opacity:1,transform:'translate(0,0) rotate(0)'}],{duration:340,delay:i*spacing,fill:'backwards',easing:'cubic-bezier(.16,.7,.24,1)'});});
  return sound?.cue?.(list.map((_,i)=>({at:i*spacing,id:'card.deal'})));
}
