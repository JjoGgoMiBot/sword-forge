import {WORLD,BUILDINGS,BOUNDARY,OFFSET,POND,FOUNTAIN,SHIRTS,SKINS,avatar} from './world.js?v=4';
const O=OFFSET;
const TREES=[[250,590,1],[360,680,.8],[1250,650,1],[1100,760,.82],[1020,350,.9],[580,390,.85],[660,930,.9],[930,950,.85],[350,520,.72],[1190,500,.8],[800,180,.95]];
// 넓힌 초원에 더한 나무(옛 좌표계 밖, v3 좌표 그대로).
const MEADOW=[[520,640,.95],[610,1180,1.05],[1660,600,.9],[1900,1110,1],[1780,1330,.85],[700,1420,.9],[1450,1430,.95],[1010,420,.8],[1960,700,.82],[450,960,.8]];
const PROPS=[...TREES.map(([x,y,s])=>({id:3,x:x+O.x,y:y+O.y,w:150*s,h:160*s,fade:true})),...MEADOW.map(([x,y,s])=>({id:3,x,y,w:150*s,h:160*s,fade:true})),...[[630,800],[1015,790],[700,940]].map(([x,y])=>({id:4,x:x+O.x,y:y+O.y,w:100,h:88})),...[[630,480],[970,480],[700,855],[900,855]].map(([x,y])=>({id:5,x:x+O.x,y:y+O.y,w:55,h:125})),{id:6,x:FOUNTAIN.x,y:FOUNTAIN.y,w:84,h:76}];
// 보이지 않는 경계 바깥을 숲으로 두른다: 경계선 바로 밖에 덤불, 그 뒤로 나무 두세 줄. 같은 씨앗으로 늘 같은 숲이 된다.
const CX=1200,CY=905;
function forestRing(){let seed=4127;const r=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};const out=[];
 BOUNDARY.forEach((p,i)=>{const q=BOUNDARY[(i+1)%BOUNDARY.length],mx=(p.x+q.x)/2,my=(p.y+q.y)/2;let nx=mx-CX,ny=(my-CY)*1.39;const l=Math.hypot(nx,ny);nx/=l;ny/=l;
  const place=(d,j)=>({x:mx+nx*d+(r()-.5)*j,y:my+ny*d/1.39+(r()-.5)*j*.6});
  // 덤불: 경계선을 따라 낮게(아래쪽 가장자리에서도 사람을 가리지 않는 높이).
  for(let k=0;k<2;k++){const b=place(4+r()*22,40);out.push({id:'bush',x:b.x,y:b.y,w:118+r()*60,h:66+r()*28,flip:r()<.5,tone:r()});}
  // 아래쪽 가장자리는 키 큰 나무가 걷는 사람을 덮으므로 한 줄 더 밖으로 민다.
  const push=ny>.55?70:0;
  for(const [row,[d,s]] of [[70+push,1],[150+push,1.15],[235+push,1.3]].entries()){if(row>0&&r()<.22)continue;const t=place(d+r()*30,60),k=(.85+r()*.4)*s;if(t.x<-60||t.x>WORLD.width+60||t.y<40||t.y>WORLD.height+150)continue;out.push({id:3,x:t.x,y:t.y,w:150*k,h:160*k,flip:r()<.5,tone:Math.min(.99,[.05,.4,.75][row]+r()*.25),fade:true});}
 });return out;}
PROPS.push(...forestRing());
function sheetCell(image,index){const canvas=document.createElement('canvas');canvas.width=444;canvas.height=444;canvas.getContext('2d').drawImage(image,index%4*image.width/4,Math.floor(index/4)*image.height/2,image.width/4,image.height/2,0,0,444,444);return canvas;}
function hex(c){return c.match(/[a-f0-9]{2}/gi).map(v=>parseInt(v,16));}
export async function createIllustratedTown(container){
 // 실사 아틀라스·바닥 사진을 먼저 쓰고, 하나라도 못 읽으면 기존 그림 아틀라스와 종이 질감 바닥으로 그린다.
 // decode()는 백그라운드 탭·숨은 창에서 화면에 보일 때까지 멈춰 있어, 그동안 그림 마을로 남는다. load 이벤트로 기다린다(drawImage가 필요할 때 디코딩한다).
 const load=src=>new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>no(new Error('image failed: '+src));i.src=new URL(src,import.meta.url).href;});
 let photo=null;try{const [atlas,grass,path]=await Promise.all(['./assets/photo/town-atlas.webp','./assets/photo/ground-grass.webp','./assets/photo/ground-path.webp'].map(load));photo={atlas,grass,path};}catch(error){console.warn('photo town unavailable, using painted atlas',error);}
 const atlas=photo?photo.atlas:await load('./assets/town-illustrated-alpha.png');container.dataset.art=photo?'photo':'painted';
 const sprites=Array.from({length:8},(_,i)=>sheetCell(atlas,i));
 // 덤불: 나무 사진의 잎 덩어리만 잘라 납작하게 눌러 쓴다. 깊은 숲일수록 어둡고 차가워지도록 톤 두 벌을 미리 굽는다.
 const crop=(src,sy,sh,w,h,shade)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.drawImage(src,0,sy,444,sh,0,0,w,h);if(shade){x.globalCompositeOperation='source-atop';x.fillStyle=shade;x.fillRect(0,0,w,h);}return c;};
 const tone=[sprites[3],crop(sprites[3],0,444,444,444,'#1420184a'),crop(sprites[3],0,444,444,444,'#0b140e80')];
 const bush=[crop(sprites[3],28,250,444,220,'#1a2a1418'),crop(sprites[3],28,250,444,220,'#0f1d1048')];
 const canvas=document.createElement('canvas');let g=canvas.getContext('2d');canvas.className='town-illustrated';canvas.setAttribute('aria-hidden','true');container.append(canvas);
 const variants=new Map(),actors=new Map(),terrain=document.createElement('canvas');terrain.width=WORLD.width;terrain.height=WORLD.height;let grassFill='#55663a';const t=terrain.getContext('2d',{willReadFrequently:true});
 let seed=9329;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 function polygon(ctx,points){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();}
 // 경계 밖 숲 바닥: 그늘을 깔고, 경계 안쪽은 넓게 번진 그림자 모양으로 지워 선이 보이지 않게 한다(shadowBlur는 사파리에서도 된다).
 function forestFloor(shade){const f=document.createElement('canvas');f.width=WORLD.width;f.height=WORLD.height;const x=f.getContext('2d');x.fillStyle=shade;x.fillRect(0,0,f.width,f.height);
  x.globalCompositeOperation='destination-out';x.shadowColor='#000';x.shadowBlur=90;x.shadowOffsetX=10000;x.translate(-10000,0);polygon(x,BOUNDARY.map(p=>({x:CX+(p.x-CX)*.97,y:CY+(p.y-CY)*.96})));x.fill();
  x.setTransform(1,0,0,1,0,0);x.globalCompositeOperation='source-over';x.shadowColor='transparent';
  // 낙엽·흙 얼룩: 경계 밖에만 작게 흩뿌린다.
  for(let i=0;i<2600;i++){const px=random()*f.width,py=random()*f.height,inside=((px-CX)/930)**4+((py-CY)/660)**4<1;if(inside)continue;x.fillStyle=['#3b2c1630','#5a442222','#1a241040','#7a6a3a1c'][i%4];x.beginPath();x.ellipse(px,py,2+random()*7,1+random()*3,random()*3,0,Math.PI*2);x.fill();}
  t.drawImage(f,0,0);}
 if(photo){
  // Photographed meadow and footpaths, tiled in world units, lit to match the sprites (sun from upper left).
  const pattern=(img,scale)=>{const p=t.createPattern(img,'repeat');p.setTransform(new DOMMatrix().scale(scale));return p;};
  grassFill=pattern(photo.grass,.5);t.fillStyle=grassFill;t.fillRect(0,0,WORLD.width,WORLD.height);t.save();
  const light=t.createLinearGradient(0,0,WORLD.width,WORLD.height);light.addColorStop(0,'#ffd9902a');light.addColorStop(.55,'#00000000');light.addColorStop(1,'#1a24102e');t.fillStyle=light;t.fillRect(0,0,WORLD.width,WORLD.height);
  t.lineCap='round';t.lineJoin='round';
  function road(points,width){t.beginPath();points.forEach(([x,y],i)=>i?t.lineTo(x,y):t.moveTo(x,y));t.save();t.shadowColor='#2a1d0e66';t.shadowBlur=14;t.strokeStyle='#5d4a2c80';t.lineWidth=width+10;t.stroke();t.restore();t.save();t.filter='blur(1.4px)';t.strokeStyle=pattern(photo.path,.36);t.lineWidth=width+4;t.stroke();t.restore();t.strokeStyle=pattern(photo.path,.36);t.lineWidth=width-6;t.stroke();}
  road([[470,800],[700,845],[940,925],[1200,1090],[1480,925],[1700,845],[1930,800]],48);road([[1200,650],[1200,1250],[1186,1420]],43);
  // Pond: wet earth bank, deep water with sky reflection and a sun glint.
  t.save();t.shadowColor='#1d1a0f88';t.shadowBlur=10;t.beginPath();t.ellipse(POND.x,POND.y,POND.rx+13,POND.ry+8,-.04,0,Math.PI*2);t.fillStyle=pattern(photo.path,.3);t.fill();t.restore();
  t.beginPath();t.ellipse(POND.x,POND.y-3,POND.rx,POND.ry-3,-.04,0,Math.PI*2);const water=t.createRadialGradient(POND.x-30,POND.y-20,8,POND.x,POND.y,100);water.addColorStop(0,'#9ec7cf');water.addColorStop(.55,'#4f7f86');water.addColorStop(1,'#25444a');t.fillStyle=water;t.fill();
  t.save();t.clip();t.globalCompositeOperation='screen';for(let i=0;i<26;i++){const x=POND.x-70+random()*140,y=POND.y-35+random()*60;t.strokeStyle='#ffe9c055';t.lineWidth=.8+random();t.beginPath();t.moveTo(x,y);t.quadraticCurveTo(x+8,y-2,x+16,y);t.stroke();}t.restore();
  t.restore();forestFloor('#0f1a0cb8');
 }else{
grassFill='#cad2a6';t.fillStyle=grassFill;t.fillRect(0,0,WORLD.width,WORLD.height);t.save();t.translate(O.x,O.y);
  // A cached paper-and-gouache field, with short irregular pencil marks.
  for(let i=0;i<29000;i++){const x=random()*WORLD.width-O.x,y=random()*WORLD.height-O.y;t.fillStyle=['#f6efcb20','#6e874511','#a2b47b22','#e7dfad22'][i%4];t.beginPath();t.ellipse(x,y,1+random()*5,.4+random()*2,random()*3,0,Math.PI*2);t.fill();}
  t.lineCap='round';t.lineJoin='round';
  function road(points,width){t.beginPath();points.forEach(([x,y],i)=>i?t.lineTo(x,y):t.moveTo(x,y));t.strokeStyle='#c0a97c55';t.lineWidth=width+7;t.stroke();t.strokeStyle='#e9d5af';t.lineWidth=width;t.stroke();t.strokeStyle='#f4e4c044';t.lineWidth=width*.64;t.stroke();}
  road([[300,545],[540,625],[800,790],[1080,625],[1300,545]],48);road([[800,350],[800,950]],43);
  for(let i=0;i<1700;i++){const x=random()*1600,y=random()*1120;if(t.getImageData(Math.floor(x+O.x),Math.floor(y+O.y),1,1).data[0]<220)continue;t.strokeStyle=i%2?'#bca47f25':'#fff0ce55';t.lineWidth=.7;t.beginPath();t.moveTo(x,y);t.lineTo(x+random()*4,y+random()*1.5);t.stroke();}
  t.beginPath();t.ellipse(500,780,105,61,-.04,0,Math.PI*2);t.fillStyle='#c2b995';t.fill();t.beginPath();t.ellipse(500,777,94,51,-.04,0,Math.PI*2);t.fillStyle='#99bdba';t.fill();
  for(let i=0;i<32;i++){const x=430+random()*140,y=745+random()*60;if(((x-500)/87)**2+((y-777)/45)**2>1)continue;t.strokeStyle='#f4e8cf80';t.lineWidth=1+random();t.beginPath();t.moveTo(x,y);t.quadraticCurveTo(x+8,y-3,x+17,y);t.stroke();}
  for(let i=0;i<330;i++){const x=150+random()*1300,y=180+random()*800;t.strokeStyle='#728c5e50';t.lineWidth=.7;t.beginPath();t.moveTo(x,y);t.lineTo(x-2,y-4);t.moveTo(x,y);t.lineTo(x+2,y-5);t.stroke();}
  t.restore();forestFloor('#56684255');
 }
 function variant(value){const a=avatar(value),key=a.shirt+':'+a.skin;if(variants.has(key))return variants.get(key);const c=document.createElement('canvas');c.width=c.height=444;const ctx=c.getContext('2d');ctx.drawImage(sprites[7],0,0);const data=ctx.getImageData(0,0,444,444),targetShirt=hex(SHIRTS[a.shirt]),targetSkin=hex(SKINS[a.skin]);
  for(let y=0;y<444;y++)for(let x=0;x<444;x++){const i=(y*444+x)*4,r=data.data[i],gr=data.data[i+1],b=data.data[i+2];if(data.data[i+3]<8)continue;const shirt=y>280&&y<365&&r>gr*1.13&&gr>b*1.1,skin=y>115&&y<282&&r>gr&&gr>b&&gr>140&&r>200;if(!shirt&&!skin)continue;const target=shirt?targetShirt:targetSkin,base=shirt?[204,128,71]:[245,218,171];for(let k=0;k<3;k++)data.data[i+k]=Math.min(255,data.data[i+k]*target[k]/base[k]);}
  ctx.putImageData(data,0,0);variants.set(key,c);return c;
 }
 let width=1,height=1,zoom=1,camera={x:0,y:0},last=performance.now(),initialized=false;
 const resize=()=>{const r=container.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);width=r.width;height=r.height;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);g.setTransform(dpr,0,0,dpr,0,0);zoom=width>=700?.74:.7;};new ResizeObserver(resize).observe(container);resize();container.dataset.renderer='painted-2d';
 function image(index,x,y,w,h,{flip=false,tone:shade=0}={}){const bushy=index==='bush';if(photo&&(bushy||index>=3&&index<=6)){g.fillStyle='#14100a40';g.beginPath();g.ellipse(x+w*.06,y-h*.03,w*(bushy?.46:.36),w*.09,0,0,Math.PI*2);g.fill();}
  const src=bushy?bush[shade>.5?1:0]:index===3?tone[Math.min(2,Math.floor(shade*3))]:sprites[index];if(!flip){g.drawImage(src,x-w/2,y-h,w,h);return;}g.save();g.translate(x,0);g.scale(-1,1);g.drawImage(src,-w/2,y-h,w,h);g.restore();}
 function plaque(text,x,y,{bubble=false,active=false}={}){g.font=(bubble?'500 ':'600 ')+(bubble?14:13)+'px "Noto Sans KR",sans-serif';const w=g.measureText(text).width+20;g.fillStyle=bubble?'#fff9e9f5':'#fff9e9e8';g.strokeStyle=active?'#9b6848':'#baab8c88';g.lineWidth=1;g.beginPath();g.roundRect(x-w/2,y-15,w,25,7);g.fill();g.stroke();g.fillStyle='#614a37';g.textAlign='center';g.fillText(text,x,y+2);}
 function person(p,dt,now){const a=avatar(p.avatar),old=actors.get(p.id)||{x:p.x,y:p.y,phase:0,weight:0},before={x:old.x,y:old.y};const smooth=p.mine?1:1-Math.exp(-dt*15);old.x+=(p.x-old.x)*smooth;old.y+=(p.y-old.y)*smooth;const speed=Math.hypot(old.x-before.x,old.y-before.y)/Math.max(.001,dt);old.weight+=(Math.min(1,speed/130)-old.weight)*(1-Math.exp(-dt*14));old.phase+=dt*10*Math.min(1,speed/30);actors.set(p.id,old);
  return {y:old.y,draw(){const x=old.x,y=old.y;g.save();g.translate(x,y);g.fillStyle='#68513620';g.beginPath();g.ellipse(0,-1,18,5,0,0,Math.PI*2);g.fill();g.rotate(Math.sin(old.phase)*.025*old.weight);g.drawImage(variant(a),-40,-80,80,80);g.restore();
   // Wardrobe layers stay independently selectable over the painted resident.
   g.save();g.translate(x,y);g.strokeStyle='#674a32';g.lineWidth=1.4;g.fillStyle=SHIRTS[a.shirt];if(a.hat===1){g.beginPath();g.ellipse(0,-66,23,7,-.1,0,Math.PI*2);g.fill();g.stroke();g.beginPath();g.moveTo(2,-72);g.lineTo(3,-78);g.stroke();}if(a.hat===2){for(const side of [-1,1]){g.beginPath();g.moveTo(side*22,-57);g.lineTo(side*24,-81);g.lineTo(side*8,-68);g.closePath();g.fill();g.stroke();}}if(a.hat===3){g.fillStyle='#e4bf67';g.beginPath();g.moveTo(-20,-65);g.lineTo(-23,-81);g.lineTo(-10,-73);g.lineTo(0,-85);g.lineTo(10,-73);g.lineTo(23,-81);g.lineTo(20,-65);g.closePath();g.fill();g.stroke();}if(a.accessory===1){for(const side of [-1,1]){g.beginPath();g.arc(side*11,-48,8,0,Math.PI*2);g.stroke();}g.beginPath();g.moveTo(-3,-48);g.lineTo(3,-48);g.stroke();}if(a.accessory===2){g.strokeStyle='#7f6a91';g.lineWidth=4;g.beginPath();g.arc(0,-48,24,Math.PI,0);g.stroke();for(const side of [-1,1]){g.beginPath();g.ellipse(side*24,-47,4,9,0,0,Math.PI*2);g.fillStyle='#9b84a9';g.fill();}}if(a.accessory===3){g.strokeStyle='#bc775c';g.lineWidth=6;g.beginPath();g.moveTo(-18,-29);g.quadraticCurveTo(0,-25,18,-29);g.lineTo(13,-13);g.stroke();}g.restore();
   if(p.name)plaque(p.name,x,y+17);if((p.speakingUntil||0)>Date.now()){g.fillStyle='#668759';for(let i=0;i<3;i++){const h=6+Math.abs(Math.sin(now/170+i))*9;g.fillRect(x-10+i*8,y-94-h,4,h);}}if(p.bubble&&p.bubbleUntil>now)plaque(p.bubble.slice(0,26)+(p.bubble.length>26?'…':''),x,y-105,{bubble:true});}};
 }
 return {get camera(){return {x:camera.x,y:camera.y,w:width/zoom,h:height/zoom};},preview(target,value){const original=g;g=target.getContext('2d');g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,target.width,target.height);g.save();g.translate(target.width/2,target.height*.82);g.scale(2.5,2.5);person({id:'preview',name:'',avatar:value,x:0,y:0},0,performance.now()).draw();g.restore();g=original;actors.delete('preview');},update({position,self,name,avatar:appearance,peers}){if(document.hidden)return;const now=performance.now(),dt=Math.min(.08,(now-last)/1000);last=now;
  // 카메라는 땅 안에서만 움직인다(가장자리에서도 화면이 땅으로 꽉 찬다). 화면이 땅보다 넓으면 가운데에 둔다.
  const vw=width/zoom,vh=height/zoom,clamp=(v,size,view)=>view>=size?(size-view)/2:Math.max(0,Math.min(size-view,v));const target={x:clamp(position.x-vw/2,WORLD.width,vw),y:clamp(position.y-vh*.62,WORLD.height,vh)};if(!initialized){camera={...target};initialized=true;}const k=1-Math.exp(-dt*7);camera.x+=(target.x-camera.x)*k;camera.y+=(target.y-camera.y)*k;
  g.clearRect(0,0,width,height);g.save();g.scale(zoom,zoom);g.translate(-camera.x,-camera.y);g.fillStyle=grassFill;g.fillRect(camera.x-4,camera.y-4,vw+8,vh+8);g.drawImage(terrain,0,0);
  // 화면 밖 소품은 건너뛰고, 사람이 나무 뒤로 가면 그 나무를 반투명하게 해 가려지지 않게 한다.
  const inView=p=>p.x+p.w/2>camera.x&&p.x-p.w/2<camera.x+vw&&p.y>camera.y&&p.y-p.h<camera.y+vh;
  const items=PROPS.filter(inView).map(p=>({y:p.y,draw(){const hides=p.fade&&position.y<p.y-6&&position.y>p.y-p.h*.95&&Math.abs(position.x-p.x)<p.w*.34;if(hides){g.save();g.globalAlpha=.5;}image(p.id,p.x,p.y,p.w,p.h,p);if(hides)g.restore();}}));for(const [i,b] of BUILDINGS.entries())items.push({y:b.y,draw(){g.save();if(position.y<b.y&&Math.abs(position.x-b.x)<100)g.globalAlpha=.55;image(i,b.x,b.y+6,240,240);g.restore();plaque(b.name,b.x,b.y+25,{active:Math.hypot(position.x-b.x,position.y-b.y)<70});}});
  const mine=peers.get(self)||{};items.push(person({id:self||'local',name,avatar:appearance,x:position.x,y:position.y,mine:true,bubble:mine.bubble,bubbleUntil:mine.bubbleUntil,speakingUntil:mine.speakingUntil},dt,now));const visible=new Set([self||'local']);for(const p of peers.values())if(p.id!==self){visible.add(p.id);items.push(person(p,dt,now));}for(const id of actors.keys())if(!visible.has(id))actors.delete(id);items.sort((a,b)=>a.y-b.y);items.forEach(p=>p.draw());g.restore();},dispose(){canvas.remove();}};
}
