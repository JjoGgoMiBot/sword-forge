import test from 'node:test';
import assert from 'node:assert/strict';
import {WORLD,BUILDINGS,move,canStand,near} from '../land/world.js';
import {SYMBOLS,slotRate,value,stand,deal,oneShot} from '../server/src/land-games.js';
test('walking has equal diagonal speed, bounded ground and reachable entrances',()=>{
 const p={x:480,y:400},right=move(p,1,0,.1),diag=move(p,1,1,.1);assert.ok(Math.abs(Math.hypot(diag.x-p.x,diag.y-p.y)-(right.x-p.x))<1e-8);
 let edge={...WORLD.spawn};for(let i=0;i<300;i++)edge=move(edge,1,0,.1);assert.ok(canStand(edge));assert.ok(edge.x<WORLD.width);assert.equal(canStand({x:500,y:780}),false);assert.equal(canStand({x:800,y:700}),false);
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
