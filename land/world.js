// 마을 좌표계. v3: 땅을 2400×1720으로 넓히고(옛 v2 좌표는 OFFSET만큼 밀었다), 걷는 곳은 보이지 않는 경계(BOUNDARY)로 막는다.
// 클라이언트와 Worker(server/src/land.js)가 이 파일을 함께 쓰므로 판정을 바꾸면 version을 올린다(409·4001로 옛 화면을 돌려보낸다).
export const WORLD={version:3,width:2400,height:1720,spawn:{x:1200,y:1070},speed:190};
export const OFFSET={x:400,y:300};
export const BUILDINGS=[
  {id:'forge',name:'대장간',sub:'오늘도 한 번만 더',x:940,y:860,roof:'#bd7355',side:'#8c4e3b',icon:'⚒'},
  {id:'fortune',name:'타로관',sub:'오늘의 작은 이야기',x:1200,y:650,roof:'#9280aa',side:'#685578',icon:'☾'},
  {id:'casino',name:'쪼꼬미 오락관',sub:'초코로 가볍게 한 판',x:1480,y:860,roof:'#70968b',side:'#49695f',icon:'♧'}
];
export const POND={x:900,y:1080,rx:95,ry:55};
export const FOUNTAIN={x:1200,y:1000,rx:31,ry:21};
// 보이지 않는 경계: 모서리가 둥근 사각(초타원, n=5)에 낮은 물결을 얹어 숲 가장자리처럼 들쭉날쭉하게. 정수로 반올림해 클라·서버가 같은 값을 쓴다.
export const BOUNDARY=Array.from({length:72},(_,i)=>{const a=i/72*Math.PI*2,c=Math.cos(a),s=Math.sin(a),k=1+.022*Math.sin(a*5+.7)+.014*Math.sin(a*11+2.1);return {x:Math.round(1200+960*k*Math.sign(c)*Math.abs(c)**.4),y:Math.round(905+690*k*Math.sign(s)*Math.abs(s)**.4)};});
export function polygon(p,points){let v=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)v=!v;}return v;}
export function footprint(b){return [{x:b.x-82,y:b.y-29},{x:b.x,y:b.y-79},{x:b.x+82,y:b.y-29},{x:b.x,y:b.y+2}];}
export function canStand(p){return Number.isFinite(p.x)&&Number.isFinite(p.y)&&polygon(p,BOUNDARY)&&!BUILDINGS.some(b=>polygon(p,footprint(b)))&&((p.x-POND.x)/POND.rx)**2+((p.y-POND.y)/POND.ry)**2>=1&&((p.x-FOUNTAIN.x)/FOUNTAIN.rx)**2+((p.y-FOUNTAIN.y)/FOUNTAIN.ry)**2>=1;}
export function move(p,dx,dy,dt){const l=Math.hypot(dx,dy);if(!l)return {...p};const d=WORLD.speed*Math.min(.2,Math.max(0,dt))/l;let n={...p};if(canStand({x:n.x+dx*d,y:n.y}))n.x+=dx*d;if(canStand({x:n.x,y:n.y+dy*d}))n.y+=dy*d;return n;}
export function near(p){return BUILDINGS.find(b=>Math.hypot(p.x-b.x,p.y-b.y-17)<49)||null;}
export const SHIRTS=['#b97054','#6d88aa','#8c9a64','#b6859d','#a28b61','#667e7c','#8c7aa6','#5e606d'];
export const SKINS=['#efd7b2','#deb08a','#be8d69','#8b5e47'];
export function avatar(a={}){const pick=(key,count)=>Number.isInteger(a[key])&&a[key]>=0&&a[key]<count?a[key]:0;return {shirt:pick('shirt',8),hat:pick('hat',4),skin:pick('skin',4),accessory:pick('accessory',4),char:pick('char',7)};}
