import {simulate,statPlan} from './lifetime-simulation.mjs';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2);
const option=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const runs=Number(option('--runs','10')),baseSeed=Number(option('--seed','20261118')),out=option('--out','');
if(!Number.isInteger(runs)||runs<1||runs>1000)throw Error('runs must be 1..1000');
const rows=[];
for(let i=0;i<runs;i++){
  const r=simulate(baseSeed+i*7919);r.run=i+1;rows.push(r);
  if(r.finalWeaponLevel!==20)throw Error('Simulation did not reach +20');
  console.log(JSON.stringify({run:r.run,hours:r.hours,rolls:r.rolls,jobs:r.jobs,sales:r.sales,smithLevel:r.smithLevel}));
}
const times=rows.map(r=>r.seconds).sort((a,b)=>a-b);
const result={
  rulesSHA256:createHash('sha256').update(fs.readFileSync(new URL('../game-core.js',import.meta.url))).digest('hex'),
  probabilities:globalThis.Forge.P,
  assumptions:{start:'3000G, smith level 1, no stats/items',goal:'First weapon +20',strategy:'Farm +8 until 5000G, +10 until 20000G, +12 until 100000G; then push +20. Sell and rebuild if a push runs out of gold at +8 or above. Mine otherwise.',statPlan,protection:'Spend earned shards while pushing at +12 or above. Merchant purchases require >10x the price in spare gold and <3 scrolls.',events:'Take beneficial free events, decline curses, take noble sales only while farming near its target.',timing:'Virtual clock. Real cooldown/animation durations plus 150ms API latency, 1s per manual action/restart, work choices 1.1s after the 0.9s reveal. Correct answers; no breaks. Scroll acquisition, stat growth and all gold earned/spent are simulated. One strategy, not a claim of optimal play or measured human playtime.'},
  summary:{runs,meanSeconds:Math.round(rows.reduce((a,r)=>a+r.seconds,0)/runs),medianSeconds:Math.round((times[Math.floor((runs-1)/2)]+times[Math.floor(runs/2)])/2),minSeconds:times[0],maxSeconds:times.at(-1),meanRolls:Math.round(rows.reduce((a,r)=>a+r.rolls,0)/runs)},rows
};
if(out)fs.writeFileSync(out,JSON.stringify(result,null,2));
console.log(JSON.stringify({summary:result.summary,rulesSHA256:result.rulesSHA256}));
