// 사진 질감의 흰 비닐 피규어. 외형별 프레임은 캐시하여 매 프레임 사진을 다시 합성하지 않는다.
// 발이 (0,0), 머리 꼭대기가 약 -71. 셔츠는 흰 몸 위에 입힌 옷, 피부 색은 옅은 볼 빛으로만 남겨 고른 값이 보이게 한다.
// 마을에서는 drawResidentFast(미리 구운 프레임)를 쓴다. 걷기 24프레임 + 서 있기 1프레임을 주민 모양·배율마다 한 번만 굽는다.
import {SHIRTS,SKINS} from './world.js?v=5';
import {drawMong,onMongLoad} from './mong-art.js?v=2';

const INK='#1d1a17',WHITE='#fbfaf6',SHADE='#dcd8cf',TAU=Math.PI*2;
const HEAD={y:-49,r:21};
const photos={};
if(typeof Image==='function')for(const [key,file] of Object.entries({body:'resident-photo-atlas.png'})){
  const image=new Image();image.onload=()=>{photos[key]=image;sheets.clear();};image.src=new URL('./assets/photo/'+file,import.meta.url).href;
}
// 원본 PNG는 보존하고 실행 중 필요한 셀만 읽는다. 각 소품의 투명 여백은 별도 좌표로 제외한다.
const PROP_RECTS=[[30,209,363,324],[446,203,355,338],[855,224,362,275],[17,826,385,152],[435,685,369,367],[861,751,350,337]];
function photoResident(g,a,phase,weight,look){
  if(!photos.body)return false;
  const profile=Math.abs(look)>.4,step=weight>.35?Math.sin(phase):0;
  const frame=profile?(step>.05?7:6):step>.3?1:step<-.3?2:0;
  const cellW=photos.body.width/4,cellH=photos.body.height/2;
  g.save();if(look<-.4)g.scale(-1,1);g.translate(0,-Math.abs(Math.cos(phase))*weight*.8);
  // 사진의 발 높이를 기존 이동·이름표 기준(0,0)에 맞춘다.
  g.drawImage(photos.body,frame%4*cellW,Math.floor(frame/4)*cellH,cellW,cellH,-39.9,-75,79.8,79.8);
  // 셔츠의 명암/직조를 보존하는 곱하기 색상. 사진 안쪽만 칠해 피규어 바깥으로 번지지 않는다.
  g.save();g.globalCompositeOperation='multiply';g.fillStyle=SHIRTS[a.shirt]||SHIRTS[0];
  g.beginPath();g.moveTo(-5,-35);g.quadraticCurveTo(-8,-36,-12,-32);g.lineTo(-10,-27);g.lineTo(-9,-20);g.quadraticCurveTo(0,-17,10,-20);g.lineTo(11,-28);g.lineTo(13,-32);g.quadraticCurveTo(8,-36,5,-35);g.quadraticCurveTo(0,-31,-5,-35);g.fill();g.restore();
  if(!profile&&a.skin){g.save();g.globalAlpha=.18;g.fillStyle=SKINS[a.skin]||SKINS[0];for(const x of [-12,12]){g.beginPath();g.ellipse(x,-49,3,1.8,0,0,TAU);g.fill();}g.restore();}
  const prop=(n,x,y,w,h)=>g.drawImage(photos.props,...PROP_RECTS[n],x,y,w,h);
  if(a.hat===1)prop(0,-22,-88,44,32);
  if(a.hat===2)prop(1,-24,-91,48,45);
  if(a.hat===3)prop(2,-19,-90,38,29);
  if(a.accessory===1)prop(3,-17,-58,34,13);
  if(a.accessory===2)prop(4,-24,-77,48,48);
  if(a.accessory===3)prop(5,-13,-39,26,25);
  g.restore();return true;
}

function limb(g,x1,y1,x2,y2,x3,y3){
  for(const [w,c] of [[8.5,INK],[4.6,WHITE]]){g.strokeStyle=c;g.lineWidth=w;g.beginPath();g.moveTo(x1,y1);g.quadraticCurveTo(x2,y2,x3,y3);g.stroke();}
}
// 위가 조금 넓은 콩 모양 몸통(어깨 -33, 엉덩이 -12)
function bodyPath(g){g.beginPath();g.moveTo(-8.5,-33);g.bezierCurveTo(-12,-27,-10.5,-15,-6,-12.5);g.quadraticCurveTo(0,-10,6,-12.5);g.bezierCurveTo(10.5,-15,12,-27,8.5,-33);g.quadraticCurveTo(0,-36,-8.5,-33);g.closePath();}

// a: avatar(...) 결과, phase: 걸음 위상(라디안), weight: 0(서 있음)~1(걷기)
// look: -1(왼쪽)~1(오른쪽) 가는 쪽을 보는 눈·입 위치
export function drawResident(g,a,phase=0,weight=0,look=0){
  if(a.char&&drawMong(g,a.char,phase,weight,look))return;
  a={...a,hat:0,accessory:0}; // 악세사리는 잠시 비활성화. 저장된 선택은 보존한다.
  if(photoResident(g,a,phase,weight,look))return;
  const s=Math.sin(phase)*weight,bob=-Math.abs(Math.cos(phase))*2.2*weight,lift=v=>Math.max(0,v)*-3.2;
  g.save();g.lineCap='round';g.lineJoin='round';
  g.translate(0,bob);
  // 뒤쪽 팔·다리(엉덩이에서 앞뒤로 흔들고, 앞으로 나가는 발은 살짝 든다)
  limb(g,-4,-15,-5-s*4,-8,-4-s*8,-1+lift(s));
  limb(g,-8,-28,-14,-24+s*2,-16+s*6,-18+s*2);
  // 흰 몸 + 옷(몸 안쪽만 칠하고 허리선 아래는 흰 몸이 보이게)
  bodyPath(g);g.fillStyle=WHITE;g.fill();
  g.save();bodyPath(g);g.clip();g.fillStyle=SHIRTS[a.shirt]||SHIRTS[0];g.beginPath();g.moveTo(-14,-38);g.lineTo(14,-38);g.lineTo(14,-18.5);g.quadraticCurveTo(0,-15.5,-14,-18.5);g.closePath();g.fill();
  g.strokeStyle='#0000002a';g.lineWidth=1.4;g.beginPath();g.moveTo(-12,-18.4);g.quadraticCurveTo(0,-15.4,12,-18.4);g.stroke();g.restore();
  bodyPath(g);g.strokeStyle=INK;g.lineWidth=3;g.stroke();
  // 앞쪽 다리·팔
  limb(g,4,-15,5+s*4,-8,4+s*8,-1+lift(-s));
  limb(g,8,-28,14,-24-s*2,16-s*6,-18-s*2);
  // 머리(오른쪽 아래 그늘은 해가 왼쪽 위에서 비치는 마을 사진과 맞춘다)
  g.beginPath();g.arc(0,HEAD.y,HEAD.r,0,TAU);g.fillStyle=WHITE;g.fill();
  g.save();g.clip();g.beginPath();g.arc(-5,HEAD.y-4,HEAD.r,0,TAU);g.rect(30,-95,-60,70);g.fillStyle=SHADE;g.fill('evenodd');g.restore();
  g.beginPath();g.arc(0,HEAD.y,HEAD.r,0,TAU);g.strokeStyle=INK;g.lineWidth=3.2;g.stroke();
  // 얼굴: 세로로 긴 눈 둘(작은 눈빛), 옅은 볼, 작은 미소
  const fx=look*3.2;for(const x of [-7+fx,7+fx]){g.fillStyle=INK;g.beginPath();g.ellipse(x,HEAD.y-3,2.3,3.9,0,0,TAU);g.fill();g.fillStyle='#fff';g.beginPath();g.arc(x+.7,HEAD.y-4.6,.8,0,TAU);g.fill();}
  g.fillStyle=(SKINS[a.skin]||SKINS[0])+'8c';for(const x of [-12.5+fx*.7,12.5+fx*.7]){g.beginPath();g.ellipse(x,HEAD.y+3.5,2.8,1.4,0,0,TAU);g.fill();}
  g.strokeStyle=INK;g.lineWidth=1.8;g.beginPath();g.moveTo(fx-3.2,HEAD.y+4.2);g.quadraticCurveTo(fx,HEAD.y+6.8,fx+3.2,HEAD.y+4.2);g.stroke();
  wardrobe(g,a);
  g.restore();
}

// 모자·장신구(고를 수 있는 겹). 머리 중심 -49, 반지름 21 기준. 몸통 어깨 -33.
function wardrobe(g,a){
  g.strokeStyle=INK;g.lineWidth=2;g.fillStyle=SHIRTS[a.shirt]||SHIRTS[0];
  if(a.hat===1){g.beginPath();g.ellipse(0,-66,22,6.5,-.1,0,TAU);g.fill();g.stroke();g.beginPath();g.ellipse(1,-71,12,7,-.1,Math.PI,0);g.fill();g.stroke();}
  if(a.hat===2){for(const side of [-1,1]){g.beginPath();g.moveTo(side*18,-60);g.lineTo(side*22,-80);g.lineTo(side*6,-69);g.closePath();g.fill();g.stroke();}}
  if(a.hat===3){g.fillStyle='#e4bf67';g.beginPath();g.moveTo(-15,-64);g.lineTo(-18,-80);g.lineTo(-8,-72);g.lineTo(0,-84);g.lineTo(8,-72);g.lineTo(18,-80);g.lineTo(15,-64);g.closePath();g.fill();g.stroke();}
  if(a.accessory===1){g.lineWidth=1.8;for(const side of [-1,1]){g.beginPath();g.arc(side*7,-52,6,0,TAU);g.stroke();}g.beginPath();g.moveTo(-1,-52);g.lineTo(1,-52);g.stroke();}
  if(a.accessory===2){g.strokeStyle='#7f6a91';g.lineWidth=4;g.beginPath();g.arc(0,-49,23.5,Math.PI*1.05,-Math.PI*.05);g.stroke();for(const side of [-1,1]){g.beginPath();g.ellipse(side*22,-47,4.5,8,0,0,TAU);g.fillStyle='#9b84a9';g.fill();g.strokeStyle=INK;g.lineWidth=1.6;g.stroke();}}
  if(a.accessory===3){g.strokeStyle='#bc775c';g.lineWidth=5;g.beginPath();g.moveTo(-9,-31);g.quadraticCurveTo(0,-28,9,-31);g.stroke();g.lineWidth=4;g.beginPath();g.moveTo(5,-30);g.lineTo(8,-21);g.stroke();}
}

// ---- 미리 구운 프레임 ----
// 그림 범위(발 기준): x -34..34, y -92..8. 배율(scale)은 화면 확대×기기 픽셀비를 .25 단위로 올림해 흐려지지 않게 한다.
export const WALK_FRAMES=24;
// 한 장 약 68×100×k² 픽셀. 주민 모양×배율 64벌까지 두어 광장에 사람이 많아도 매 프레임 다시 굽지 않는다.
const BOX={x:-34,y:-92,w:68,h:100},MAX_AVATARS=64;
const sheets=new Map();onMongLoad(()=>sheets.clear());
const avatarKey=a=>a.shirt+'.'+a.skin+'.'+a.hat+'.'+a.accessory+'.'+(a.char||0);
function canvas(w,h){if(typeof OffscreenCanvas==='function')return new OffscreenCanvas(w,h);const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function bake(a,phase,weight,look,k){
  const c=canvas(Math.ceil(BOX.w*k),Math.ceil(BOX.h*k)),g=c.getContext('2d');
  g.scale(k,k);g.translate(-BOX.x,-BOX.y);drawResident(g,a,phase,weight,look);
  return c;
}
// 걷기 무게는 두 단계(서 있기/걷기)로 나눈다. 위상은 WALK_FRAMES 칸으로 맞춘다.
export function frameIndex(phase,weight){
  if(weight<.35)return -1;
  const p=((phase%TAU)+TAU)%TAU;
  return Math.round(p/TAU*WALK_FRAMES)%WALK_FRAMES;
}
// look은 세 방향(-1,0,1)으로만 굽는다.
export function residentFrame(a,phase,weight,scale=1,look=0){
  const k=Math.min(3,Math.max(1,Math.ceil(scale*4)/4)),key=avatarKey(a)+'@'+k;
  let sheet=sheets.get(key);
  if(!sheet){sheet=new Map();sheets.set(key,sheet);if(sheets.size>MAX_AVATARS)sheets.delete(sheets.keys().next().value);}
  else{sheets.delete(key);sheets.set(key,sheet);} // 최근 쓴 것을 뒤로(오래 안 보인 주민부터 비운다)
  const d=look<-.4?-1:look>.4?1:0,i=frameIndex(phase,weight)*3+d; // 서 있기(-1)도 방향별로 -4..-2
  let img=sheet.get(i);
  if(!img){
    const f=frameIndex(phase,weight);img=bake(a,f<0?0:f/WALK_FRAMES*TAU,f<0?0:1,d,k);sheet.set(i,img);
    if(typeof createImageBitmap==='function')createImageBitmap(img).then(b=>{if(sheet.get(i)===img)sheet.set(i,b);}).catch(()=>{});
  }
  return img;
}

// 발밑 그림자: 가운데가 진하고 가장자리로 번지는 접지 그림자(한 번 구워 재사용). 걸음의 들썩임에 맞춰 살짝 줄었다 커진다.
let shadowImg=null;
function shadowSprite(){
  if(shadowImg)return shadowImg;
  const c=canvas(96,32),g=c.getContext('2d'),r=g.createRadialGradient(48,16,0,48,16,48);
  r.addColorStop(0,'#241a0cd0');r.addColorStop(.5,'#2e22128a');r.addColorStop(1,'#3a2c1800');
  g.setTransform(1,0,0,1/3,0,16*(1-1/3));g.fillStyle=r;g.fillRect(0,0,96,96);
  return shadowImg=c;
}

// 마을용: 그림자 + 미리 구운 프레임. 서 있을 때는 아주 작게 숨을 쉰다(발을 기준으로 세로로만 늘었다 줄었다).
export function drawResidentFast(g,a,phase=0,weight=0,scale=1,now=0,look=0){
  const lift=Math.abs(Math.cos(phase))*weight,sw=21*(1-lift*.1);
  g.drawImage(shadowSprite(),-sw,-4,sw*2,8);
  const img=residentFrame(a,phase,weight,scale,look);
  if(weight<.35&&now){const b=Math.sin(now/620)*.014;g.save();g.scale(1-b*.5,1+b);g.drawImage(img,BOX.x,BOX.y,BOX.w,BOX.h);g.restore();return;}
  g.drawImage(img,BOX.x,BOX.y,BOX.w,BOX.h);
}
