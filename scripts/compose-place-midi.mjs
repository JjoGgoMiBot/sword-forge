// Original 32-bar arrangements, rendered with sampled General MIDI instruments.
// node scripts/compose-place-midi.mjs <output-directory>
// Render three consecutive cycles, then extract the middle one (reverb-continuous loop).
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {MUSIC_PLAN} from '../land/sound/score.js';
const out=resolve(process.argv[2]||'music-build');mkdirSync(out,{recursive:true});
const TPQ=480,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const themes={
 town:[[[74,.75],[76,.25],[78,1],[81,1],[78,1]],[[76,.5],[74,1],[71,.5],[69,1],[0,1]],[[71,.5],[74,.5],[78,1],[76,.5],[74,.5],[71,1]],[[73,1],[76,.5],[81,.5],[78,1],[0,1]],[[78,.5],[81,.5],[86,1.5],[85,.5],[81,1]],[[78,1],[76,.5],[74,.5],[73,1],[71,1]],[[69,.5],[71,.5],[73,1],[76,.5],[73,.5],[69,.5],[0,.5]],[[74,2.5],[0,1.5]]],
 casino:[[[74,.667],[77,.333],[81,1],[79,.667],[77,.333],[76,1]],[[72,.667],[74,.333],[77,1.5],[76,.5],[74,.5],[0,.5]],[[79,.667],[82,.333],[86,1],[84,.667],[82,.333],[79,1]],[[81,1.5],[79,.5],[76,.667],[73,.333],[0,1]],[[77,.667],[81,.333],[84,1],[83,.5],[81,.5],[79,1]],[[77,.5],[76,.5],[74,1],[72,.667],[74,.333],[0,1]],[[73,.667],[76,.333],[79,1],[82,.667],[81,.333],[76,1]],[[74,2.5],[0,1.5]]],
 forge:[[[62,1],[65,.5],[69,.5],[74,1.5],[0,.5]],[[72,1],[69,1],[65,1],[62,.5],[0,.5]],[[65,.75],[67,.25],[69,1],[70,1],[69,1]],[[64,1.5],[61,.5],[64,1],[0,1]],[[65,.5],[69,.5],[74,1],[77,1.5],[0,.5]],[[76,1],[74,.5],[72,.5],[69,1],[65,1]],[[64,.5],[65,.5],[67,1],[69,1],[61,.5],[0,.5]],[[62,2.5],[0,1.5]]],
 fortune:[[[74,1.5],[76,.5],[77,1],[81,.5],[0,.5]],[[84,1.5],[81,.5],[77,1],[0,1]],[[79,1],[77,.5],[74,.5],[72,1.5],[0,.5]],[[73,1],[76,.5],[79,.5],[81,1],[0,1]],[[77,.5],[81,.5],[86,2],[84,.5],[0,.5]],[[81,1],[79,1],[77,.5],[76,.5],[74,1]],[[76,1.5],[73,.5],[69,1],[0,1]],[[74,2],[0,2]]],
};
const harmony={
 town:[[50,54,57,61],[47,50,54,57],[43,47,50,54],[45,49,52,57],[50,54,57,61],[54,57,61,64],[52,55,59,62],[45,49,52,55]],
 casino:[[50,53,57,60],[43,47,53,57],[48,52,55,59],[45,49,55,59],[50,53,57,64],[46,50,53,57],[52,55,58,62],[45,49,55,60]],
 forge:[[50,53,57,62],[46,50,53,57],[43,46,50,57],[45,49,52,57],[50,53,57,62],[48,52,55,60],[46,50,53,57],[45,49,52,57]],
 fortune:[[50,53,57,64],[46,50,53,60],[43,46,50,57],[45,49,55,59],[50,53,57,64],[48,52,55,62],[46,50,53,60],[45,49,52,59]],
};
function vlq(n){const a=[n&127];while(n>>=7)a.unshift((n&127)|128);return a;}
function chunk(type,data){const h=Buffer.alloc(8);h.write(type);h.writeUInt32BE(data.length,4);return Buffer.concat([h,Buffer.from(data)]);}
function build(id){
 const bpm=MUSIC_PLAN[id].bpm,tracks=[],cycle=128,cycles=3;
 const addTrack=(name,ch,program,volume,pan,reverb=20)=>{
  const events=[{tick:0,data:[0xff,3,...vlq(Buffer.byteLength(name)),...Buffer.from(name)]},{tick:0,data:[0xc0|ch,program]},{tick:0,data:[0xb0|ch,7,volume]},{tick:0,data:[0xb0|ch,10,pan]},{tick:0,data:[0xb0|ch,91,reverb]}];
  const note=(pitch,beat,length,vel=80)=>{if(!pitch)return;const at=Math.round(beat*TPQ),end=Math.round((beat+length)*TPQ);events.push({tick:at,data:[0x90|ch,pitch,clamp(Math.round(vel),1,127)]},{tick:end,data:[0x80|ch,pitch,0]});};
  const t={events,note};tracks.push(t);return t;
 };
 const lead=addTrack('Theme',0,{town:73,casino:11,forge:42,fortune:8}[id],101,59,18);
 const comp=addTrack('Harmony',1,{town:24,casino:0,forge:48,fortune:46}[id],90,35,16);
 const bass=addTrack('Bass',2,id==='casino'?32:42,88,64,8);
 const answer=addTrack('Answer',3,{town:68,casino:0,forge:60,fortune:73}[id],82,88,22);
 const detail=addTrack('Detail',4,{town:45,casino:59,forge:12,fortune:11}[id],73,84,20);
 const pad=addTrack('Strings',5,48,62,66,25);
 const drums=addTrack('Percussion',9,id==='casino'?40:0,75,69,8);
 for(let cycleIndex=0;cycleIndex<cycles;cycleIndex++)for(let bar=0;bar<32;bar++){
  const section=Math.floor(bar/8),phrase=bar%8,t=cycleIndex*cycle+bar*4,c=harmony[id][bar%8],next=harmony[id][(bar+1)%8],mel=themes[id][phrase];
  let cursor=0;
  for(let i=0;i<mel.length;i++){
   let [pitch,len]=mel[i];
   if(section===1&&pitch)pitch-=id==='forge'?0:12;
   if(section===2&&phrase<4&&id==='forge'&&pitch)pitch+=12;
   // Breath and articulation: velocity follows phrase, not a machine-gun fixed level.
   lead.note(pitch,t+cursor,len*(len>1?.88:.79),82+(section===2?6:0)-i*2+(phrase%2? -3:0));
   if(section===3&&phrase===7&&i===0)answer.note(pitch+12,t+cursor+.035,len*.9,66);
   cursor+=len;
  }
  if(id==='town'){
   for(const beat of [0,1.5,2.5])c.slice(0,3).forEach((n,k)=>comp.note(n+12,t+beat+k*.024,.9,beat===0?64:52));
   for(const beat of [0,2])bass.note(c[0]-12,t+beat,1.6,67);
   for(let j=0;j<4;j++)detail.note(c[[0,2,1,3][j]]+12,t+j+.45,.23,52+j%2*6);
   for(let j=0;j<4;j++)drums.note(70,t+j+.5,.08,28+(j%2)*5);
  }else if(id==='casino'){
   for(const beat of [.667,2,3.667])c.slice(1).forEach((n,k)=>comp.note(n+12,t+beat+k*.012,.42,58+(beat===2?7:0)));
   const walk=[c[0]-12,c[1]-12,c[2]-12,next[0]-13];
   walk.forEach((n,j)=>bass.note(n,t+j,.79,76-j*3));
   for(let j=0;j<4;j++){drums.note(51,t+j,.09,36+(j%2?8:0));drums.note(42,t+j+.667,.07,24);}
   for(const j of [1,3])drums.note(38,t+j,.12,42);
   if(bar%4===0)drums.note(36,t,.12,34);
  }else if(id==='forge'){
   for(const beat of [0,1.5,2.5])c.slice(0,3).forEach(n=>comp.note(n+12,t+beat,.48,61));
   for(const beat of [0,2])bass.note(c[0]-12,t+beat,1.65,73);
   for(let j=0;j<4;j++)detail.note(c[j%3]+12,t+j+.5,.36,54);
   for(const beat of [0,2])drums.note(41,t+beat,.16,55);
   drums.note(45,t+1.5,.12,39);drums.note(37,t+3,.09,32);
  }else{
   for(let j=0;j<8;j++)comp.note(c[[0,2,1,3,2,1,3,2][j]]+12,t+j*.5,.85,53+(j%4===0?8:0));
   bass.note(c[0]-12,t,3.7,57);
   if(section!==0&&phrase%2===0)detail.note(c[3]+24,t+2.5,1.15,47);
  }
  if(section>0&&phrase%2===1&&phrase!==7){
   answer.note(c[1]+24,t+2.6,.55,id==='forge'?66:55);
   answer.note(c[2]+24,t+3.25,.6,id==='forge'?62:51);
  }
  if((section===1||section===2)&&phrase<7)c.slice(1,3).forEach(n=>pad.note(n+12,t+.04,3.55,id==='fortune'?43:39));
 }
 const tempo=Math.round(60e6/bpm),master=chunk('MTrk',[0,0xff,0x51,3,(tempo>>16)&255,(tempo>>8)&255,tempo&255,...vlq(cycles*cycle*TPQ),0xff,0x2f,0]);
 const encoded=tracks.map(({events})=>{events.sort((a,b)=>a.tick-b.tick||((a.data[0]&0xf0)===0x80?-1:1));let tick=0,data=[];for(const e of events){data.push(...vlq(e.tick-tick),...e.data);tick=e.tick;}data.push(...vlq(Math.max(cycles*cycle*TPQ,tick)-tick),0xff,0x2f,0);return chunk('MTrk',data);});
 const header=Buffer.from([0,1,0,tracks.length+1,TPQ>>8,TPQ&255]);
 writeFileSync(resolve(out,id+'.mid'),Buffer.concat([chunk('MThd',header),master,...encoded]));
 return {id,bpm,bars:32,duration:cycle*60/bpm,cycles,instruments:{town:['flute','nylon guitar','oboe','pizzicato strings'],casino:['vibraphone','piano','upright bass','brush kit'],forge:['cello','strings','horn','marimba'],fortune:['celesta','harp','flute','strings']}[id]};
}
const manifest=Object.keys(themes).map(build);writeFileSync(resolve(out,'arrangements.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest,null,2));
