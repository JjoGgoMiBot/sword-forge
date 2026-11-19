export const WORLD={width:960,height:620,spawn:{x:480,y:445},speed:170};
export const BUILDINGS=[
  {id:'forge',name:'대장간',sub:'오늘도 한 번만 더',x:270,y:335,roof:'#bd7355',side:'#8c4e3b',icon:'⚒'},
  {id:'fortune',name:'타로관',sub:'오늘의 작은 이야기',x:480,y:192,roof:'#9280aa',side:'#685578',icon:'☾'},
  {id:'casino',name:'도박장',sub:'초코 걸고 한 판',x:700,y:335,roof:'#70968b',side:'#49695f',icon:'♧'}
];
export const FLOOR=[{x:480,y:70},{x:914,y:300},{x:480,y:562},{x:46,y:300}];
export function polygon(p,points){let v=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)v=!v;}return v;}
export function footprint(b){return [{x:b.x-82,y:b.y-29},{x:b.x,y:b.y-79},{x:b.x+82,y:b.y-29},{x:b.x,y:b.y+2}];}
export function canStand(p){return Number.isFinite(p.x)&&Number.isFinite(p.y)&&polygon(p,FLOOR)&&!BUILDINGS.some(b=>polygon(p,footprint(b)));}
export function move(p,dx,dy,dt){const l=Math.hypot(dx,dy);if(!l)return {...p};const d=WORLD.speed*Math.min(.1,Math.max(0,dt))/l;let n={...p};if(canStand({x:n.x+dx*d,y:n.y}))n.x+=dx*d;if(canStand({x:n.x,y:n.y+dy*d}))n.y+=dy*d;return n;}
export function near(p){return BUILDINGS.find(b=>Math.hypot(p.x-b.x,p.y-b.y-17)<49)||null;}
export const SHIRTS=['#b97054','#6d88aa','#8c9a64','#b6859d','#a28b61','#667e7c','#8c7aa6','#5e606d'];
export function avatar(a={}){return {shirt:Number.isInteger(a.shirt)&&a.shirt>=0&&a.shirt<8?a.shirt:0,hat:Number.isInteger(a.hat)&&a.hat>=0&&a.hat<4?a.hat:0};}
