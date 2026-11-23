import {horses,weighted,random} from './land-games.js';
import {raceScript,sampler,RACE} from '../../land/race-script.js';
export const SHARED_RACE=Object.freeze({lobbyMs:60000,runMs:RACE.settle,doneMs:15000,tickMs:350,minBet:10,maxBet:5000,maxPlayers:20});
const fail=msg=>{throw Object.assign(Error(msg),{arcade:true});};
const events=()=>({cashOuts:[],wins:[]});
export const newRace=()=>({id:crypto.randomUUID(),phase:'idle',round:0,horses:horses(),bets:[],history:[]});
export function checkRaceBet(s,who,bet,choice,now){
  if(!['idle','betting'].includes(s.phase)||s.phase==='betting'&&now>=s.closesAt)fail('이미 출발한 경주예요. 다음 경주에 참가해주세요.');
  if(!Number.isSafeInteger(bet)||bet<SHARED_RACE.minBet||bet>SHARED_RACE.maxBet)fail('베팅은 10~5,000초코의 정수로 입력해주세요.');
  if(!Number.isInteger(choice)||choice<0||choice>=s.horses.length)fail('응원할 말을 골라주세요.');
  if(s.bets.some(b=>b.id===who.id))fail('이번 경주에는 이미 참가했어요.');
  if(s.bets.length>=SHARED_RACE.maxPlayers)fail('이번 경주는 참가자가 가득 찼어요.');
}
export function raceBet(s,who,bet,choice,now){
  checkRaceBet(s,who,bet,choice,now);
  if(s.phase==='idle'){s.phase='betting';s.round++;s.closesAt=now+SHARED_RACE.lobbyMs;s.last=null;}
  s.bets.push({...who,bet,choice});
}
export function raceTick(s,now,rng=random){
  const ev=events();
  if(s.phase==='betting'&&now>=s.closesAt){
    s.phase='running';s.startAt=now;s.winner=weighted(s.horses.map(h=>h.chance),rng);
    // 연출의 씨앗·결승 순서·덱은 공개 view에 넣지 않는다.
    const script=raceScript({horses:s.horses,winner:s.winner,visualSeed:crypto.randomUUID()});
    s.tracks=script.lanes;s.order=script.order;s.margin=script.margin;
  }
  if(s.phase==='running')s.nextTick=now+SHARED_RACE.tickMs;
  if(s.phase==='running'&&now>=s.startAt+SHARED_RACE.runMs){
    s.phase='done';s.doneAt=now;
    s.last={round:s.round,winner:s.winner,order:s.order,margin:s.margin,horses:s.horses,positions:s.tracks.map(t=>sampler(t)(SHARED_RACE.runMs)),bets:s.bets.map(b=>({id:b.id,name:b.name,choice:b.choice,bet:b.bet,payout:b.choice===s.winner?Math.floor(b.bet*s.horses[b.choice].rate/10):0}))};
    for(const b of s.last.bets){const privateBet=s.bets.find(x=>x.id===b.id);if(b.payout)ev.cashOuts.push({...privateBet,amount:b.payout,game:'horse'});ev.wins.push({...b,game:'horse',noticeId:'horse:'+s.round+':'+b.id});}
    s.history=[{round:s.round,winner:s.winner,name:s.horses[s.winner].name},...s.history].slice(0,10);
    delete s.tracks;delete s.winner;delete s.order;delete s.margin;
  }
  if(s.phase==='done'&&now>=s.doneAt+SHARED_RACE.doneMs){s.phase='idle';s.bets=[];s.horses=horses(rng);s.id=crypto.randomUUID();delete s.startAt;}
  return ev;
}
export function raceDue(s,now){return s.phase==='betting'?s.closesAt:s.phase==='running'?Math.min(s.startAt+SHARED_RACE.runMs,s.nextTick||s.startAt+SHARED_RACE.tickMs):s.phase==='done'?s.doneAt+SHARED_RACE.doneMs:null;}
export function raceView(s,id,now){
  const mine=s.bets.find(b=>b.id===id);
  return {id:s.id,phase:s.phase,round:s.round,horses:s.horses,joined:!!mine,mine:mine?{choice:mine.choice,bet:mine.bet}:null,closesIn:s.phase==='betting'?Math.max(0,s.closesAt-now):null,
    elapsed:s.phase==='running'?Math.max(0,now-s.startAt):null,runMs:SHARED_RACE.runMs,
    positions:s.phase==='running'?s.tracks.map(t=>sampler(t)(now-s.startAt)):s.phase==='done'?(s.last.positions||s.horses.map((_,i)=>i===s.last.winner?1:.94)):s.horses.map(()=>0),
    participants:s.bets.map(b=>({name:b.name,choice:b.choice,bet:b.bet})),last:s.phase==='done'?s.last:null,history:s.history};
}
