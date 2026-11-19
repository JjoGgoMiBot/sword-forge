import test from 'node:test';
import assert from 'node:assert/strict';
const API='http://127.0.0.1:8907';
async function post(path,b){const r=await fetch(API+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b),signal:AbortSignal.timeout(10000)});return {status:r.status,...await r.json()};}
const request=(token,op,payload={})=>({token,op,payload,id:crypto.randomUUID(),issued:Date.now()});
test('real DO economy is persistent, serialized, idempotent and hides secrets',async()=>{
 const a=await post('/register',{name:'LA'+Date.now().toString(36).slice(-8),pin:'12345678'});assert.equal(a.status,200);const token=a.token;
 let s=await post('/land/player',{token});assert.equal(s.wallet.balance,1000);const resident=s.resident.id;
 const daily=request(token,'daily');const pair=await Promise.all([post('/land/player',daily),post('/land/player',daily)]);assert(pair.every(x=>x.status===200));assert.equal(pair[0].wallet.balance,1300);
 assert.equal((await post('/land/player',request(token,'daily'))).status,400);
 assert.equal((await post('/land/player',{...daily,payload:{extra:true}})).status,409);
 assert.equal((await post('/land/player',request(token,'play',{game:'dice',bet:-100,choice:'odd'}))).status,400);
 assert.equal((await post('/land/player',request(token,'play',{game:'dice',bet:11.1,choice:'odd'}))).status,400);
 const bet=request(token,'play',{game:'dice',bet:100,choice:'odd'});const bets=await Promise.all([post('/land/player',bet),post('/land/player',bet)]);assert(bets.every(x=>x.status===200));assert.deepEqual(bets[0].result,bets[1].result);
 s=await post('/land/player',{token});assert.equal(s.wallet.balance,1200+bets[0].result.payout);assert.equal(s.ledger.filter(x=>x.reason==='베팅 · dice').length,1);
 const tarot=await post('/land/player',request(token,'tarotDaily'));const again=await post('/land/player',request(token,'tarotDaily'));assert.equal(tarot.dailyCard.id,again.dailyCard.id);assert.equal(tarot.dailyCard.reversed,again.dailyCard.reversed);
 await post('/land/player',request(token,'spreadStart'));s=await post('/land/player',{token});const spread=s.spread;assert.equal(spread.results.length,0);assert.equal(JSON.stringify(spread).includes('cards'),false);
 for(const i of [0,2,6])assert.equal((await post('/land/player',request(token,'spreadPick',{spreadId:spread.id,index:i}))).status,200);
 assert.equal((await post('/land/player',request(token,'spreadPick',{spreadId:spread.id,index:7}))).status,400);
 const quiz=await post('/land/player',request(token,'quiz'));assert(quiz.quiz.initials);assert.equal('answer' in quiz.quiz,false);
 await post('/land/player',request(token,'avatar',{shirt:4,hat:2}));s=await post('/land/player',{token});assert.equal(s.resident.id,resident);assert.deepEqual(s.resident.avatar,{shirt:4,hat:2});
 await new Promise(r=>setTimeout(r,1300));const blackjack=await post('/land/player',request(token,'play',{game:'blackjack',bet:100}));assert.equal(blackjack.status,200);assert.equal('deck' in blackjack.blackjack,false);if(!blackjack.blackjack.done){assert.equal(blackjack.blackjack.dealer[1],'?');const round=blackjack.blackjack.id;const finish=request(token,'blackjack',{roundId:round,choice:'stand'});const results=await Promise.all([post('/land/player',finish),post('/land/player',finish)]);assert(results.every(x=>x.status===200));assert.equal(results[0].wallet.balance,results[1].wallet.balance);assert.equal((await post('/land/player',request(token,'blackjack',{roundId:round,choice:'stand'}))).status,409);}
 const login=await post('/login',{name:a.name,pin:'12345678'});assert.equal((await post('/land/player',{token:login.token})).resident.id,resident);
 assert.equal((await post('/land/player',{token:'a'.repeat(64)})).status,401);
 assert.equal((await post('/land/session',{token,room:'d:12345678901234567:12345678901234568'})).status,403);
});
