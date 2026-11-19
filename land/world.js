export const WORLD={version:2,width:1600,height:1120,spawn:{x:800,y:770},speed:190};
export const BUILDINGS=[
  {id:'forge',name:'대장간',sub:'오늘도 한 번만 더',x:540,y:560,roof:'#bd7355',side:'#8c4e3b',icon:'⚒'},
  {id:'fortune',name:'타로관',sub:'오늘의 작은 이야기',x:800,y:350,roof:'#9280aa',side:'#685578',icon:'☾'},
  {id:'casino',name:'도박장',sub:'초코 걸고 한 판',x:1080,y:560,roof:'#70968b',side:'#49695f',icon:'♧'}
];
export const FLOOR=[{x:800,y:70},{x:1530,y:560},{x:800,y:1060},{x:70,y:560}];
export function polygon(p,points){let v=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)v=!v;}return v;}
export function footprint(b){return [{x:b.x-82,y:b.y-29},{x:b.x,y:b.y-79},{x:b.x+82,y:b.y-29},{x:b.x,y:b.y+2}];}
export function canStand(p){return Number.isFinite(p.x)&&Number.isFinite(p.y)&&polygon(p,FLOOR)&&!BUILDINGS.some(b=>polygon(p,footprint(b)))&&((p.x-500)/95)**2+((p.y-780)/55)**2>=1&&((p.x-800)/31)**2+((p.y-700)/21)**2>=1;}
export function move(p,dx,dy,dt){const l=Math.hypot(dx,dy);if(!l)return {...p};const d=WORLD.speed*Math.min(.2,Math.max(0,dt))/l;let n={...p};if(canStand({x:n.x+dx*d,y:n.y}))n.x+=dx*d;if(canStand({x:n.x,y:n.y+dy*d}))n.y+=dy*d;return n;}
export function near(p){return BUILDINGS.find(b=>Math.hypot(p.x-b.x,p.y-b.y-17)<49)||null;}
export const SHIRTS=['#b97054','#6d88aa','#8c9a64','#b6859d','#a28b61','#667e7c','#8c7aa6','#5e606d'];
export const SKINS=['#efd7b2','#deb08a','#be8d69','#8b5e47'];
export function avatar(a={}){const pick=(key,count)=>Number.isInteger(a[key])&&a[key]>=0&&a[key]<count?a[key]:0;return {shirt:pick('shirt',8),hat:pick('hat',4),skin:pick('skin',4),accessory:pick('accessory',4)};}
