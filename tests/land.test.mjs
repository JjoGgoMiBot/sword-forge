import test from 'node:test';
import assert from 'node:assert/strict';
import {WORLD,BUILDINGS,BOUNDARY,POND,FOUNTAIN,move,canStand,near} from '../land/world.js';
import {SYMBOLS,slotRate,value,stand,deal,oneShot} from '../server/src/land-games.js';
test('walking has equal diagonal speed, bounded ground and reachable entrances',()=>{
 const p={x:880,y:700},right=move(p,1,0,.1),diag=move(p,1,1,.1);assert.ok(Math.abs(Math.hypot(diag.x-p.x,diag.y-p.y)-(right.x-p.x))<1e-8);
 let edge={...WORLD.spawn};for(let i=0;i<300;i++)edge=move(edge,1,0,.1);assert.ok(canStand(edge));assert.ok(edge.x<WORLD.width);assert.equal(canStand(POND),false);assert.equal(canStand(FOUNTAIN),false);
 for(const b of BUILDINGS){const door={x:b.x,y:b.y+19};assert.ok(canStand(door));assert.equal(near(door).id,b.id);}
});
test('ported slots RTP and all dice outcomes use gross payouts',()=>{
 let rtp=0;for(let a=0;a<7;a++)for(let b=0;b<7;b++)for(let c=0;c<7;c++)rtp+=SYMBOLS[a][1]*SYMBOLS[b][1]*SYMBOLS[c][1]/1e6*slotRate([a,b,c])/10;assert.ok(rtp>.95&&rtp<.97);
 assert.equal(slotRate([6,6,6]),7770);assert.equal(slotRate([0,0,1]),15);assert.equal(slotRate([1,1,2]),12);assert.equal(slotRate([0,1,2]),0);
 let wins=0;for(let a=0;a<6;a++)for(let b=0;b<6;b++){const ns=[(a+.01)/6,(b+.01)/6];const r=oneShot('dice',101,'odd',()=>ns.shift());if(r.payout){wins++;assert.equal(r.payout,191);}}assert.equal(wins,18);
});
test('blackjack aces, natural and dealer soft 17 match the bot rules',()=>{
 assert.equal(value(['A♠','A♥','9♦']),21);assert.equal(value(['A♠','K♥','8♦']),19);
 const b={player:['10♠','8♥'],dealer:['A♦','6♣'],deck:['10♥'],bet:100};stand(b);assert.deepEqual(b.dealer,['A♦','6♣']);assert.equal(b.payout,200);
 const n={player:['A♠','K♥'],dealer:['10♦','8♣'],deck:[],bet:101};stand(n);assert.equal(n.payout,252);
 const fresh=deal(100,1000,()=>.5);assert.equal(fresh.deck.length+fresh.player.length+fresh.dealer.length,208);
});


test('a failed illustrated frame recovers the visible town and schedules later frames', async()=>{
 const fs=await import('node:fs'),vm=await import('node:vm');
 const source=fs.readFileSync(new URL('../land/app.js',import.meta.url),'utf8');
 const loop=source.slice(source.indexOf('let lastFrameErrorAt='),source.indexOf('requestAnimationFrame(frame);renderHeader();boot();'));
 const elements={world:{style:{opacity:'0'}},stage:{dataset:{renderer:'painted-2d'}}};
 const queued=[],notices=[],errors=[];let failures=2,disposed=0,draws=0;
 const context={townView:{dispose(){disposed++;}},$:(id)=>elements[id],toast:text=>notices.push(text),
   console:{error:(...args)=>errors.push(args)},requestAnimationFrame:callback=>queued.push(callback),
   drawFrame:()=>{draws++;if(failures-->0)throw Error('transient canvas failure');}};
 vm.createContext(context);vm.runInContext(loop,context);
 context.frame(100);assert.equal(disposed,1);assert.equal(context.townView,null);
 assert.equal(elements.world.style.opacity,'1');assert.equal(elements.stage.dataset.renderer,undefined);
 assert.equal(notices.length,1);assert.equal(queued.length,1);
 // The basic renderer can also fail once without terminating the scheduler.
 queued.shift()(116);assert.equal(queued.length,1);assert.equal(notices.length,1);
 queued.shift()(132);assert.equal(draws,3);assert.equal(queued.length,1);assert.equal(errors.length,1);
});

test('v3 마을: 넓힌 땅 안쪽의 보이지 않는 경계에서 걸음이 막힌다',()=>{
 assert.equal(WORLD.version,3);
 // 경계는 땅 안에 있고, 사방에 숲을 둘 여백(최소 100)이 남는다.
 for(const p of BOUNDARY){assert.ok(p.x>=100&&p.x<=WORLD.width-100&&p.y>=100&&p.y<=WORLD.height-100,JSON.stringify(p));assert.ok(Number.isInteger(p.x)&&Number.isInteger(p.y));}
 // 옛 v2 마름모(1460×990)보다 걷는 곳이 넓다: 옛 끝점보다 더 바깥까지 서 있을 수 있다.
 assert.ok(canStand({x:300,y:900})&&canStand({x:2100,y:900})&&canStand({x:1200,y:260})&&canStand({x:1200,y:1560}));
 // 경계 바깥(숲)·땅 밖·숫자가 아닌 좌표는 설 수 없다.
 for(const p of [{x:150,y:900},{x:2260,y:900},{x:1200,y:150},{x:1200,y:1680},{x:120,y:120},{x:-5,y:900},{x:1200,y:9999},{x:NaN,y:900}])assert.equal(canStand(p),false,JSON.stringify(p));
 // 네 방향으로 오래 걸어도 경계 안에서 멈추고, 경계 근처(30 이내)까지는 간다.
 for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1]]){let q={...WORLD.spawn};for(let i=0;i<400;i++)q=move(q,dx,dy,.1);assert.ok(canStand(q));const step={x:q.x+dx*30,y:q.y+dy*30};assert.equal(canStand(step),false,dx+','+dy+' '+JSON.stringify(q));}
 // 시작 위치·세 건물 입구는 걸을 수 있다.
 assert.ok(canStand(WORLD.spawn));
});
