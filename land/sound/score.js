// Original place scores: 24 bars, A / A' / B-return. No external recordings.
const hz=n=>440*2**((n-69)/12);
const voice=(partials,a,d,r,cut)=>({src:{type:'osc',partials},env:{a,d,s:0,r},filter:{type:'lowpass',freq:cut,q:.4}});
const piano=voice([1,.42,.2,.1,.055,.025],.009,.85,.18,4200);
const felt=voice([1,.24,.08,.025],.018,1.2,.24,2300);
const celesta={src:{type:'fm',ratio:2,index:[[0,.75],[.5,.03]]},env:{a:.006,d:1.5,s:0,r:.5},filter:{type:'lowpass',freq:4800}};
const guitar={src:{type:'pluck',bright:.45,decay:.996},env:{a:.004,d:1.1,s:0,r:.2},filter:{type:'lowpass',freq:3400}};
const bass=voice([1,.34,.12],.013,.38,.13,850);
const string=voice([1,.36,.15,.06],.17,.65,.35,1700);
const note=(inst,midi,at,dur,gain,pan=0)=>({...inst,freq:hz(midi),at,dur,gain,pan});
const track=(name,clips,pan=0,reverb=.12)=>({name,clips,pan,fx:{reverb}});
const KEYS={
 town:{bpm:86,title:'햇살이 머무는 광장',feel:'어쿠스틱 기타·펠트 건반·가벼운 셰이커',chords:[[50,54,57,61],[47,50,54,57],[43,47,50,54],[45,49,52,57]],lead:guitar,comp:felt,mel:[74,76,78,81,78,76,74,69],swing:0,gain:-22},
 casino:{bpm:104,title:'초록 펠트의 밤',feel:'스윙 건반·워킹 베이스·브러시',chords:[[50,53,57,60],[43,47,53,57],[48,52,55,59],[45,49,55,59]],lead:piano,comp:felt,mel:[74,77,81,79,77,76,74,72],swing:.13,gain:-23},
 forge:{bpm:92,title:'불씨와 손길',feel:'낮은 현·뜯는 현·절제된 작업 리듬',chords:[[50,53,57,62],[46,50,53,57],[43,46,50,57],[45,49,52,57]],lead:guitar,comp:string,mel:[62,65,69,74,72,69,65,64],swing:0,gain:-23},
 fortune:{bpm:68,title:'별빛 아래 펼친 카드',feel:'하프·첼레스타·여백 있는 단조 화음',chords:[[50,53,57,64],[46,50,53,60],[43,46,50,57],[45,50,52,59]],lead:celesta,comp:felt,mel:[74,76,77,81,84,81,77,76],swing:0,gain:-25},
};
export const MUSIC_PLAN=Object.fromEntries(Object.entries(KEYS).map(([id,c])=>[id,{title:c.title,bpm:c.bpm,bars:24,sections:['A: 주제','A′: 응답과 악기 변화','B: 대비 후 주제 복귀'],feel:c.feel,duration:96*60/c.bpm}]));
export function placeScore(id){
 const c=KEYS[id]||KEYS.town,b=60/c.bpm,dur=b*96,melody=[],answer=[],chords=[],low=[],drums=[];
 const noise=(at,length,gain,freq)=>({at,dur:length,src:{type:'noise',color:'pink'},env:{a:.003,d:length*.8,s:0,r:.015},filter:{type:'bandpass',freq,q:.6},gain});
 for(let bar=0;bar<24;bar++){
  const section=Math.floor(bar/8),phrase=bar%8,ch=c.chords[bar%4],t=bar*4*b;
  // Sparse four-note motifs leave a breath at the end of each eight-bar phrase.
  if(phrase!==7)for(let j=0;j<4;j++){
   if(id==='fortune'&&j===3&&bar%2)continue;
   const index=(phrase%4*2+j)%8,m=c.mel[index]+(section===2&&phrase<4?-12:0),off=[0,.75,1.5,2.5][j];
   melody.push(note(c.lead,m,t+(off+(j%2?c.swing:0))*b, b*(j===3?1:.6),-10+(j===0?1:0),-.18));
  }
  if(section>0&&phrase%2===1&&phrase!==7)for(let j=0;j<2;j++)answer.push(note(id==='fortune'?guitar:felt,ch[j+1]+24,t+(3+j*.5)*b,b*.55,-19,.24));
  if(id==='town'||id==='fortune'){
   for(let j=0;j<8;j++){if(id==='fortune'&&j%2)continue;chords.push(note(id==='town'?felt:guitar,ch[[0,2,1,3,2,1,3,2][j]]+12,t+j*.5*b,b*.65,-22,-.28));}
  }else for(const beat of id==='casino'?[.5,2,3.5]:[0,2])for(let k=1;k<4;k++)chords.push(note(c.comp,ch[k]+12,t+(beat+k*.018)*b,b*(id==='forge'?1.5:.65),-23+k*.4,.15));
  for(let j=0;j<(id==='casino'?4:2);j++)low.push(note(bass,ch[j===1?2:0]-12,t+j*(id==='casino'?1:2)*b,b*.7,-16));
  if(id==='casino')for(let j=0;j<8;j++)drums.push(noise(t+(j*.5+(j%2?c.swing:0))*b,.065,j%2?-29:-33,4700));
  if(id==='town')for(let j=0;j<4;j++)drums.push(noise(t+(j+.5)*b,.055,-35,5400));
  if(id==='forge')for(const beat of [0,1.5,2.75]){drums.push(note(voice([1,.3],.002,.09,.03,350),beat===0?38:45,t+beat*b,.13,beat===0?-22:-28));drums.push(noise(t+beat*b,.035,-34,1800));}
 }
 return {id:'bgm.place.'+id,kind:'bgm',loop:true,dur,lufs:c.gain,variants:1,space:{seconds:id==='fortune'?2: .65,decay:3.5,damp:.65,predelay:.012},tracks:[track('주제',melody,-.1,id==='fortune'?.28:.1),track('응답',answer,.2,.14),track('화성',chords,0,.13),track('베이스',low,0,.03),track('리듬',drums,.08,.02)]};
}
export const PLACE_MUSIC=Object.fromEntries(Object.keys(KEYS).map(id=>[id,placeScore(id)]));
