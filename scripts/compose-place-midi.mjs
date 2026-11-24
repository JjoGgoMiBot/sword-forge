// Original pastoral/ambient pieces: sparse phrases, recorded piano and guitar.
// node scripts/compose-place-midi.mjs <output-directory>
// Render three cycles, then master/extract the middle cycle for continuous releases.
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {MUSIC_PLAN} from '../land/sound/score.js';
const out=resolve(process.argv[2]||'music-build');mkdirSync(out,{recursive:true});
const TPQ=960,cycles=3,cycleBeats=128;
const themes={
 town:[[[67,1.5],[71,.5],[74,1],[76,.5],[0,.5]],[[74,2],[71,1],[0,1]],[[69,1],[71,.5],[74,.5],[78,1],[0,1]],[[76,1.5],[74,.5],[71,1],[0,1]],[[72,1],[76,1],[79,1],[0,1]],[[78,1.5],[76,.5],[74,1],[0,1]],[[71,1],[69,1],[67,1],[0,1]],[[69,1.5],[71,.5],[74,.75],[0,1.25]],[[71,1.5],[74,.5],[76,1],[0,1]],[[79,2],[78,.5],[76,.5],[0,1]],[[74,1],[71,1],[69,1],[0,1]],[[67,2.5],[0,1.5]],[[69,1],[72,1],[76,1],[0,1]],[[74,1.5],[71,.5],[67,1],[0,1]],[[69,1.5],[71,.5],[66,1],[0,1]],[[67,2.5],[0,1.5]]],
 casino:[[[69,1],[72,.667],[76,.333],[0,1],[74,1]],[[72,2],[69,.75],[0,1.25]],[[67,1],[71,.667],[74,.333],[0,1],[76,1]],[[74,1.5],[71,.5],[0,2]],[[69,1.5],[72,.5],[77,1],[0,1]],[[76,2],[72,1],[0,1]],[[71,1],[69,1],[67,.75],[0,1.25]],[[69,2.5],[0,1.5]],[[76,1],[79,.667],[81,.333],[0,1],[79,1]],[[76,2],[74,.75],[0,1.25]],[[72,1],[74,.667],[76,.333],[71,1],[0,1]],[[69,2.5],[0,1.5]],[[72,1.5],[76,.5],[77,1],[0,1]],[[76,1],[72,1],[69,1],[0,1]],[[71,1.5],[74,.5],[67,1],[0,1]],[[69,2],[0,2]]],
 forge:[[[62,1.5],[66,.5],[69,1],[0,1]],[[71,1],[69,1],[66,.75],[0,1.25]],[[67,1],[71,1],[74,1],[0,1]],[[73,1.5],[69,.5],[0,2]],[[66,1],[69,.5],[74,1.5],[0,1]],[[71,2],[69,.75],[0,1.25]],[[67,1],[66,1],[64,1],[0,1]],[[62,2.5],[0,1.5]],[[66,1],[69,1],[71,.75],[0,1.25]],[[74,2],[73,.5],[71,.5],[0,1]],[[69,1.5],[66,.5],[64,1],[0,1]],[[62,2],[0,2]],[[64,1],[67,1],[71,.75],[0,1.25]],[[69,1.5],[66,.5],[62,1],[0,1]],[[64,1],[66,1],[61,.75],[0,1.25]],[[62,2.5],[0,1.5]]],
 fortune:[[[69,2.5],[0,1.5]],[[76,1.5],[72,.5],[0,2]],[[71,2],[67,1],[0,1]],[[69,1.5],[64,.5],[0,2]],[[72,2],[76,1],[0,1]],[[79,2.5],[0,1.5]],[[76,1.5],[74,.5],[71,1],[0,1]],[[69,2],[0,2]],[[72,2.5],[0,1.5]],[[76,2],[79,.75],[0,1.25]],[[74,1.5],[71,.5],[0,2]],[[67,2.5],[0,1.5]],[[69,1.5],[72,.5],[0,2]],[[76,2],[74,.75],[0,1.25]],[[71,1.5],[67,.5],[0,2]],[[69,2],[0,2]]],
};
const harmony={
 town:[[43,50,54,59],[40,47,50,55],[48,52,55,62],[50,54,57,64],[45,52,55,60],[47,50,55,62],[48,52,55,62],[50,55,57,62]],
 casino:[[45,52,55,59],[41,48,52,57],[48,52,55,59],[43,50,55,59],[41,48,52,57],[45,52,55,60],[43,50,53,59],[45,52,55,59]],
 forge:[[50,54,57,64],[47,50,54,57],[43,50,54,59],[45,52,57,61],[50,54,57,62],[47,50,54,59],[52,55,59,62],[45,52,57,61]],
 fortune:[[45,52,55,59],[41,48,52,57],[48,52,55,59],[43,50,55,59],[41,48,52,59],[48,52,55,62],[43,50,53,59],[45,52,55,59]],
};
export function vlq(n){if(!Number.isInteger(n)||n<0||n>0x0fffffff)throw Error('MIDI delta out of range');const a=[n&127];while(n>>=7)a.unshift((n&127)|128);return a;}
function chunk(type,data){const h=Buffer.alloc(8);h.write(type);h.writeUInt32BE(data.length,4);return Buffer.concat([h,Buffer.from(data)]);}
function compose(id){
 const plan=MUSIC_PLAN[id],tracks=[],spb=60/plan.bpm;
 function track(name,ch,program,volume,pan,send){
  const label=Buffer.from(name),events=[{tick:0,data:[255,3,...vlq(label.length),...label]},{tick:0,data:[192|ch,program]},...[ [7,volume],[10,pan],[91,send] ].map(([cc,v])=>({tick:0,data:[176|ch,cc,v]}))];
  function note(pitch,beat,length,velocity){
   if(!pitch)return;
   // Repeatable millisecond offsets preserve the loop while avoiding rigid attacks.
   const phase=beat%cycleBeats,jitter=(Math.sin(phase*7.13+pitch*1.17)*.014)/spb;
   const at=Math.round(Math.max(0,beat+jitter)*TPQ),end=Math.max(at+1,Math.round((beat+length+jitter)*TPQ));
   const vel=Math.max(1,Math.min(127,Math.round(velocity+Math.sin(phase*2.3+pitch)*3)));
   events.push({tick:at,data:[144|ch,pitch,vel]},{tick:end,data:[128|ch,pitch,0]});
  }
  const t={name,events,note};tracks.push(t);return t;
 }
 const piano=track('Recorded upright piano',0,0,102,61,27);
 const guitar=track('Recorded classical guitar',1,24,94,43,16);
 const bass=track('Quiet bass',2,32,57,64,5);
 const air=track('Distant warm texture',3,89,29,77,35);
 const bell=track('Occasional celesta',4,8,48,84,28);
 const brush=track('Soft brush',9,40,48,69,7);
 let melodyNotes=0,restBeats=0;
 for(let repeat=0;repeat<cycles;repeat++)for(let bar=0;bar<32;bar++){
  const t=repeat*cycleBeats+bar*4,section=Math.floor(bar/8),phrase=bar%8,c=harmony[id][bar%8];
  const coda=bar>=28,intro=bar<4,quiet=bar===7||bar===15||bar===23||coda;
  const themeIndex=section===2?phrase+8:phrase;
  // A real intro and four-bar coda leave room for the game world.
  if(!intro&&!coda&&phrase!==7){
   let cursor=id==='fortune'?.25:0;
   for(const [pitch,len] of themes[id][themeIndex]){
    const lead=id==='forge'?guitar:piano,velocity=(id==='fortune'?49:57)+(section===1?4:0)-(phrase%2?4:0);
    if(pitch){lead.note(pitch,t+cursor,Math.min(len*.88,4-cursor),velocity);if(repeat===0)melodyNotes++;}
    else if(repeat===0)restBeats+=len;
    cursor+=len;
   }
  }else if(repeat===0)restBeats+=4;
  if(id==='town'){
   if(!coda){guitar.note(c[0],t+.035,2.9,intro?43:49);guitar.note(c[2],t+1.52,1.6,40);if(!quiet)guitar.note(c[1]+12,t+2.55,1.1,37);}
   if(intro||coda){piano.note(c[1]+12,t+.4,2.5,43);if(bar%2===0)piano.note(c[3]+12,t+2,1.7,38);}
   if(section===1&&phrase%2===0)bass.note(c[0]-12,t+.03,3.4,44);
   if(bar===18||bar===26)bell.note(c[3]+24,t+2.3,1.5,32);
  }else if(id==='casino'){
   if(!coda){c.slice(1,3).forEach((n,k)=>guitar.note(n,t+.08+k*.035,2.2,43));if(!quiet)piano.note(c[1],t+2.67,1.1,38);}
   if(!intro&&!coda&&bar%2===0)bass.note(c[0]-12,t+.02,2.7,48);
   if(section===1||section===2){brush.note(38,t+1,.14,23);if(!quiet)brush.note(42,t+3,.12,19);}
   if(intro||coda)piano.note(c[2]+12,t+.2,2.8,43);
  }else if(id==='forge'){
   if(!coda){guitar.note(c[0],t+.05,2.8,intro?44:48);if(!quiet)guitar.note(c[2],t+2,1.4,38);}
   if(bar%2===0)c.slice(1,3).forEach((n,k)=>piano.note(n,t+.35+k*.04,3.1,intro?38:42));
   if(section===2&&phrase%2===1&&!quiet)piano.note(c[3]+12,t+2.4,1.3,35);
  }else{
   // No constant arpeggio or drum grid: one gentle harmony every other bar.
   if(bar%2===0){piano.note(c[0],t+.06,5.4,37);piano.note(c[1],t+.12,5.1,33);}
   if(bar%4===1)guitar.note(c[2]+12,t+1.35,2.9,31);
   if(bar===11||bar===21)bell.note(c[3]+24,t+2.7,2,27);
  }
  if((section===2&&phrase<6)||(id==='fortune'&&bar%4===0&&!coda)){
   c.slice(1,3).forEach((n,k)=>air.note(n+12,t+.3+k*.04,id==='fortune'?7.3:3.2,35));
  }
 }
 const tempo=Math.round(60e6/plan.bpm),endTick=cycles*cycleBeats*TPQ;
 const master=chunk('MTrk',[0,255,81,3,tempo>>16&255,tempo>>8&255,tempo&255,...vlq(endTick),255,47,0]);
 const encoded=tracks.map(({events})=>{
  events.sort((a,b)=>a.tick-b.tick||Number((a.data[0]&240)!==128)-Number((b.data[0]&240)!==128));
  let tick=0;const data=[];for(const e of events){data.push(...vlq(e.tick-tick),...e.data);tick=e.tick;}
  data.push(...vlq(Math.max(endTick,tick)-tick),255,47,0);return chunk('MTrk',data);
 });
 function midi(name,items){writeFileSync(resolve(out,name+'.mid'),Buffer.concat([chunk('MThd',[0,1,0,items.length+1,TPQ>>8,TPQ&255]),master,...items]));}
 midi(id,encoded);midi(id+'-piano',[encoded[0]]);midi(id+'-guitar',[encoded[1]]);midi(id+'-texture',encoded.slice(2));
 return {id,bpm:plan.bpm,bars:32,duration:cycleBeats*spb,cycles,melodyNotes,restBeats,tracks:tracks.map(t=>({name:t.name,notes:t.events.filter(e=>(e.data[0]&240)===144).length/cycles}))};
}
const manifest=Object.keys(themes).map(compose);writeFileSync(resolve(out,'arrangements.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest,null,2));
