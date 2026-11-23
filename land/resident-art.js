// 주민 그림: 흰 둥근 만화 사람(굵은 검은 테두리, 큰 동그란 머리, 짧은 팔다리).
// 발이 (0,0), 머리 꼭대기가 약 -71. 셔츠 색은 몸통, 피부 색은 볼 홍조로 남겨 고른 값이 보이게 한다.
import {SHIRTS,SKINS} from './world.js?v=4';

const INK='#1d1a17',WHITE='#fbfaf6',SHADE='#d9d5cc';
const HEAD={y:-49,r:21};

function limb(g,x1,y1,x2,y2,x3,y3){
  for(const [w,c] of [[8.5,INK],[4.6,WHITE]]){g.strokeStyle=c;g.lineWidth=w;g.beginPath();g.moveTo(x1,y1);g.quadraticCurveTo(x2,y2,x3,y3);g.stroke();}
}

// a: avatar(...) 결과, phase: 걸음 위상(라디안), weight: 0(서 있음)~1(걷기)
export function drawResident(g,a,phase=0,weight=0){
  const s=Math.sin(phase)*weight,c=Math.cos(phase)*weight,bob=-Math.abs(Math.cos(phase))*2.2*weight;
  g.save();g.lineCap='round';g.lineJoin='round';
  g.translate(0,bob);
  // 뒤쪽 팔·다리
  limb(g,-4,-16,-6-s*5,-8,-5-s*9,-1+Math.max(0,s)*-3);
  limb(g,-8,-27,-15,-24+s*3,-17+s*7,-18+s*2);
  // 몸통(위가 넓고 아래로 좁아지는 셔츠)
  g.beginPath();g.moveTo(-9,-30);g.quadraticCurveTo(-11,-20,-6,-13);g.quadraticCurveTo(0,-10,6,-13);g.quadraticCurveTo(11,-20,9,-30);g.closePath();
  g.fillStyle=SHIRTS[a.shirt]||SHIRTS[0];g.fill();g.strokeStyle=INK;g.lineWidth=3;g.stroke();
  // 앞쪽 다리·팔
  limb(g,4,-16,6+s*5,-8,5+s*9,-1+Math.max(0,-s)*-3);
  limb(g,8,-27,15,-24-s*3,17-s*7,-18-s*2);
  // 머리
  g.beginPath();g.arc(0,HEAD.y,HEAD.r,0,Math.PI*2);g.fillStyle=WHITE;g.fill();
  g.save();g.clip();g.beginPath();g.arc(-5,HEAD.y-4,HEAD.r,0,Math.PI*2);g.rect(30,-95,-60,70);g.fillStyle=SHADE;g.fill('evenodd');g.restore();
  g.beginPath();g.arc(0,HEAD.y,HEAD.r,0,Math.PI*2);g.strokeStyle=INK;g.lineWidth=3.2;g.stroke();
  // 얼굴: 세로 눈, 볼, 활짝 웃는 입
  g.fillStyle=INK;for(const x of [-7.5,7.5]){g.beginPath();g.ellipse(x,HEAD.y-4,2.1,3.6,0,0,Math.PI*2);g.fill();}
  g.fillStyle=(SKINS[a.skin]||SKINS[0])+'cc';for(const x of [-12,12]){g.beginPath();g.ellipse(x,HEAD.y+3,3.4,1.6,0,0,Math.PI*2);g.fill();}
  g.beginPath();g.moveTo(-5.5,HEAD.y+2);g.quadraticCurveTo(0,HEAD.y+3.4,5.5,HEAD.y+2);g.quadraticCurveTo(4.6,HEAD.y+10,0,HEAD.y+10);g.quadraticCurveTo(-4.6,HEAD.y+10,-5.5,HEAD.y+2);g.closePath();
  g.fillStyle=INK;g.fill();g.beginPath();g.ellipse(0,HEAD.y+7.6,2.6,1.5,0,0,Math.PI*2);g.fillStyle='#e0766a';g.fill();
  wardrobe(g,a);
  g.restore();
}

// 모자·장신구(고를 수 있는 겹). 머리 중심 -49, 반지름 21 기준.
function wardrobe(g,a){
  g.strokeStyle=INK;g.lineWidth=2;g.fillStyle=SHIRTS[a.shirt]||SHIRTS[0];
  if(a.hat===1){g.beginPath();g.ellipse(0,-66,22,6.5,-.1,0,Math.PI*2);g.fill();g.stroke();g.beginPath();g.ellipse(1,-71,12,7,-.1,Math.PI,0);g.fill();g.stroke();}
  if(a.hat===2){for(const side of [-1,1]){g.beginPath();g.moveTo(side*18,-60);g.lineTo(side*22,-80);g.lineTo(side*6,-69);g.closePath();g.fill();g.stroke();}}
  if(a.hat===3){g.fillStyle='#e4bf67';g.beginPath();g.moveTo(-15,-64);g.lineTo(-18,-80);g.lineTo(-8,-72);g.lineTo(0,-84);g.lineTo(8,-72);g.lineTo(18,-80);g.lineTo(15,-64);g.closePath();g.fill();g.stroke();}
  if(a.accessory===1){g.lineWidth=1.8;for(const side of [-1,1]){g.beginPath();g.arc(side*7.5,-53,6,0,Math.PI*2);g.stroke();}g.beginPath();g.moveTo(-1.5,-53);g.lineTo(1.5,-53);g.stroke();}
  if(a.accessory===2){g.strokeStyle='#7f6a91';g.lineWidth=4;g.beginPath();g.arc(0,-49,23.5,Math.PI*1.05,-Math.PI*.05);g.stroke();for(const side of [-1,1]){g.beginPath();g.ellipse(side*22,-47,4.5,8,0,0,Math.PI*2);g.fillStyle='#9b84a9';g.fill();g.strokeStyle=INK;g.lineWidth=1.6;g.stroke();}}
  if(a.accessory===3){g.strokeStyle='#bc775c';g.lineWidth=5;g.beginPath();g.moveTo(-10,-29);g.quadraticCurveTo(0,-26,10,-29);g.stroke();g.lineWidth=4;g.beginPath();g.moveTo(6,-28);g.lineTo(9,-18);g.stroke();}
}
