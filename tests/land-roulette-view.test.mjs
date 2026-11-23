import test from 'node:test';
import assert from 'node:assert/strict';
import {rouletteDisplay, rouletteScene} from '../land/roulette-view.js';
import {rouletteStart, roulettePull, rouletteView, cashOut} from '../server/src/land-arcade.js';

test('live rounds hide all untested chambers, even if a private bullet field is supplied',()=>{
  for(let shots=0;shots<5;shots++){
    const v=rouletteDisplay({id:'round',shots,done:false,bullet:4});
    assert.equal(v.states.filter(s=>s==='empty').length,shots);
    assert.equal(v.states.filter(s=>s==='unknown').length,6-shots);
    assert.equal(v.states.includes('bullet'),false);
    assert.equal(v.angle+shots*60,0,'next untested chamber stays under the stationary pointer');
    assert.equal(v.label,`생존 ${shots} / 5`);
  }
});

test('every server bullet position reveals exactly one bullet and the actual safe count',()=>{
  for(let bullet=0;bullet<6;bullet++){
    const round=rouletteStart(100,()=> (bullet+.1)/6);
    while(!round.done)roulettePull(round);
    const v=rouletteDisplay(rouletteView(round));
    assert.equal(v.safe,bullet);
    assert.equal(v.states[bullet],bullet===5?'bullet':'fired');
    assert.equal(v.states.filter(s=>s==='empty').length,5);
    assert.equal(v.states.filter(s=>s==='unknown').length,0);
    if(bullet===0)assert.equal(v.label,'생존 0 / 5','a first-pull loss is not counted as surviving');
  }
});

test('cash out reveals server position and keeps the surviving count',()=>{
  const round=rouletteStart(100,()=>.9);
  roulettePull(round);roulettePull(round);cashOut(round);
  const v=rouletteDisplay(rouletteView(round));
  assert.equal(v.safe,2);assert.equal(v.states[5],'bullet');
  assert.equal(v.states.filter(s=>s==='empty').length,5);
});

test('renderer has six independent states and no baked-in five-bullet photograph',()=>{
  const html=rouletteScene({id:'round',shots:1,done:false});
  assert.equal((html.match(/data-chamber=/g)||[]).length,6);
  assert.equal((html.match(/data-state="unknown"/g)||[]).length,5);
  assert.equal((html.match(/data-state="empty"/g)||[]).length,1);
  assert.ok(html.includes('생존 1 / 5'));
  assert.ok(html.includes('rr-photo'));
  assert.equal(html.includes('ac-cylinder.webp'),false);
  assert.equal(html.includes('${'),false,'all state transforms must be resolved');
  assert.ok(html.includes('transform:rotate(-60deg)'),'state-driven rotor remains under the stationary pointer');
});
