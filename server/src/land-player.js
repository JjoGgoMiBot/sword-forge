import {avatar} from '../../land/world.js';
import {random,integer,weighted,deal,stand,finish,value,bjView,oneShot,horses} from './land-games.js';
import cards from './land-deck.js';
import {playerAdmin} from './land-admin.js';
const day=now=>new Date(now+32400000).toISOString().slice(0,10);
const digest=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const fail=(msg,status=400)=>{const e=Error(msg);e.status=status;throw e;};
import {QUIZ,initials} from './land-quiz.js';
import {ARCADE,rouletteStart,roulettePull,hiloStart,hiloGuess,minesStart,minesPick,cashOut,expire,roundView,arcadeOneShot,begAlms,begLine} from './land-arcade.js';
// 방(LandRoom)이 돌리는 같이 하는 게임의 지갑 기록 이름
const ROOM_GAMES={poker:'포커',crash:'크래시',party:'총쏘기 서바이벌',duel:'총잡이 결투',gift:'초코 선물'};
const ROUND_NAMES={roulette:'러시안 룰렛',hilo:'하이로우',mines:'마인즈'};
export const GIFT=Object.freeze({min:10,max:1000,dailyLimit:3000,feePercent:5});
function cardView(c){return {...cards[c.id],reversed:c.reversed,day:c.day};}
export class LandPlayer{
  constructor(ctx,env){this.ctx=ctx;this.env=env;this.sql=ctx.storage.sql;this.sql.exec('CREATE TABLE IF NOT EXISTS player (id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL)');this.sql.exec('CREATE TABLE IF NOT EXISTS actions (id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,response TEXT NOT NULL)');this.sql.exec('CREATE TABLE IF NOT EXISTS ledger (id INTEGER PRIMARY KEY AUTOINCREMENT,delta INTEGER NOT NULL,balance INTEGER NOT NULL,reason TEXT NOT NULL,created INTEGER NOT NULL)');}
  async fetch(request){
    if(new URL(request.url).pathname==='/admin'){try{return playerAdmin(this,await request.json(),{fail,Response});}catch(e){return Response.json({error:'land_action',msg:e.message},{status:e.status||400});}}
    const b=await request.json(),now=Date.now(),today=day(now);
    const seed=BigInt('0x'+(await digest('jjokkomi-tarot-v1:'+String(b.discordId||b.key)+':'+today)).slice(0,16));
    try{return this.ctx.storage.transactionSync(()=>{
      if(b.op!=='get'&&(!/^[0-9a-f-]{36}$/i.test(b.id||'')||!Number.isSafeInteger(b.issued)||Math.abs(now-b.issued)>300000))fail('요청 시간이 지났어요. 기록을 새로 확인해 주세요.',409);
      const fingerprint=JSON.stringify({op:b.op,payload:b.payload||{}});
      if(b.op!=='get'){const previous=this.sql.exec('SELECT * FROM actions WHERE id=?',b.id).toArray()[0];if(previous){if(previous.fingerprint!==fingerprint)fail('같은 요청 번호의 내용이 달라요.',409);return Response.json({...JSON.parse(previous.response),replayed:true});}}
      let s;const row=this.sql.exec('SELECT data FROM player WHERE id=1').toArray()[0];
      if(row)s=JSON.parse(row.data);else{s={id:crypto.randomUUID(),name:b.name,avatar:{shirt:0,hat:0},balance:1000,rev:0,dailyClaim:null,rescueClaim:null,nextPlay:0,bj:null,race:null,quiz:null,quizDay:today,quizWins:0,quizNext:0,spread:null,dailyCard:null,history:[]};this.entry(s,1000,'첫 주민 선물',now);}
      if(s.name!==b.name)s.name=b.name;s.avatar=avatar(s.avatar);
      if(s.bj&&!s.bj.done&&s.bj.expires<=now){stand(s.bj);if(s.bj.payout)this.entry(s,s.bj.payout,'블랙잭 시간 만료 · '+s.bj.outcome,now);s.rev++;}
      // 오래 둔 러시안 룰렛·하이로우·마인즈는 멈출 수 있으면 멈추고, 아니면 원금을 돌려준다
      if(s.arcade&&!s.arcade.done&&s.arcade.created+ARCADE.roundTtlMs<=now){expire(s.arcade);if(s.arcade.payout)this.entry(s,s.arcade.payout,ROUND_NAMES[s.arcade.game]+' 시간 만료 정산',now);s.rev++;}
      if(s.quizDay!==today){s.quizDay=today;s.quizWins=0;}
      let result=null,settled=null;const p=b.payload||{};
      if(b.op==='avatar'){s.avatar=avatar(p);result={message:'주민의 모습을 저장했어요.'};}
      else if(b.op==='daily'){if(s.dailyClaim===today)fail('오늘의 출석 초코는 이미 받았어요.');s.dailyClaim=today;this.entry(s,300,'매일 출석',now);result={message:'출석 선물 300초코를 받았어요.'};}
      else if(b.op==='rescue'){if(s.balance>=100)fail('초코가 100 미만일 때 받을 수 있어요.');if(s.rescueClaim===today)fail('오늘의 응원 초코는 이미 받았어요.');s.rescueClaim=today;this.entry(s,300,'다시 시작 응원',now);result={message:'응원 초코 300을 받았어요.'};}
      else if(b.op==='play'){
        if(s.bj&&!s.bj.done)fail('진행 중인 블랙잭을 먼저 마쳐주세요.');
        if(p.game==='luckybox'){if(!ARCADE.boxes[p.choice])fail('상자를 골라주세요.');p.bet=ARCADE.boxes[p.choice];}
        this.bet(s,p.bet,now);s.nextPlay=now+1200;
        if(p.game==='blackjack'){s.bj=deal(p.bet,now);this.entry(s,-p.bet,'블랙잭 베팅',now);if(s.bj.done&&s.bj.payout)this.entry(s,s.bj.payout,'블랙잭 '+s.bj.outcome,now);result={game:'blackjack',round:bjView(s.bj)};if(s.bj.done)settled={game:'blackjack',bet:s.bj.bet,payout:s.bj.payout||0};}
        else if(p.game==='horse'){
          if(!s.race||s.race.id!==p.raceId||s.race.expires<now)fail('경주표를 새로 받아주세요.');if(!Number.isInteger(p.choice)||p.choice<0||p.choice>4)fail('응원할 말을 골라주세요.');
          const race=s.race,winner=weighted(race.horses.map(h=>h.chance)),payout=winner===p.choice?Math.floor(p.bet*race.horses[p.choice].rate/10):0;this.entry(s,-p.bet,'개인 경마 베팅',now);if(payout)this.entry(s,payout,'개인 경마 당첨',now);result={game:'horse',winner,choice:p.choice,horses:race.horses,payout,bet:p.bet};settled={game:'horse',bet:p.bet,payout};s.race=null;
        }else{try{result=arcadeOneShot(p.game,p.bet,p.choice)||oneShot(p.game,p.bet,p.choice);}catch(e){fail(e.message);}this.entry(s,-p.bet,'베팅 · '+p.game,now);if(result.payout)this.entry(s,result.payout,'당첨 · '+p.game,now);result.bet=p.bet;settled={game:p.game,bet:p.bet,payout:result.payout||0};}
      }
      else if(b.op==='blackjack'){
        const bj=s.bj;if(!bj||bj.done||p.roundId!==bj.id)fail('이미 끝났거나 다른 블랙잭이에요.',409);
        if(!['hit','stand','double'].includes(p.choice))fail('잘못된 선택이에요.');
        if(p.choice==='double'){if(bj.player.length!==2)fail('첫 선택에서만 더블할 수 있어요.');if(s.balance<bj.bet)fail('더블에 필요한 초코가 부족해요.');this.entry(s,-bj.bet,'블랙잭 더블',now);bj.bet*=2;bj.player.push(bj.deck.pop());stand(bj);}
        else if(p.choice==='stand')stand(bj);else{bj.player.push(bj.deck.pop());if(value(bj.player)>21)finish(bj);else if(value(bj.player)===21)stand(bj);}
        if(bj.done&&bj.payout)this.entry(s,bj.payout,'블랙잭 '+bj.outcome,now);result={game:'blackjack',round:bjView(bj)};if(bj.done)settled={game:'blackjack',bet:bj.bet,payout:bj.payout||0};
      }
      // 단계형 게임(러시안 룰렛·하이로우·마인즈): 시작 때 베팅을 빼고, 끝날 때(터짐·멈춤·최대) 한 번 정산한다
      else if(b.op==='arcadeStart'){
        if(s.arcade&&!s.arcade.done)fail('진행 중인 '+ROUND_NAMES[s.arcade.game]+'을(를) 먼저 마쳐주세요.');if(s.bj&&!s.bj.done)fail('진행 중인 블랙잭을 먼저 마쳐주세요.');
        if(!ROUND_NAMES[p.game])fail('없는 게임이에요.');if(p.game==='mines'&&!ARCADE.mines.counts.includes(p.mines))fail('지뢰 수는 '+ARCADE.mines.counts.join('·')+'개 중에서 골라주세요.');
        this.bet(s,p.bet,now);s.nextPlay=now+600;
        s.arcade=p.game==='roulette'?rouletteStart(p.bet):p.game==='hilo'?hiloStart(p.bet):minesStart(p.bet,p.mines);s.arcade.created=now;
        this.entry(s,-p.bet,ROUND_NAMES[p.game]+' 베팅',now);result={game:p.game,round:roundView(s.arcade)};
      }
      else if(b.op==='arcadeMove'){
        const g=s.arcade;if(!g||g.done||p.roundId!==g.id)fail('이미 끝났거나 다른 판이에요.',409);
        try{if(p.move==='cash')cashOut(g);else if(g.game==='roulette'&&p.move==='pull')roulettePull(g);else if(g.game==='hilo'&&['high','low'].includes(p.move))hiloGuess(g,p.move);else if(g.game==='mines'&&p.move==='pick')minesPick(g,p.cell);else fail('잘못된 선택이에요.');}catch(e){if(e.arcade)fail(e.message);throw e;}
        if(g.done&&g.payout)this.entry(s,g.payout,ROUND_NAMES[g.game]+' '+({cash:'멈춤',max:'최대 배율'})[g.outcome]+' 정산',now);
        result={game:g.game,round:roundView(g)};if(g.done)settled={game:g.game,bet:g.bet,payout:g.payout};
      }
      else if(b.op==='beg'){
        if(s.balance>=ARCADE.beg.maxBalance)fail('초코가 '+ARCADE.beg.maxBalance+' 미만일 때만 구걸할 수 있어요.');if(now<(s.begNext||0))fail('쪼꼬미들이 아직 지나가는 중이에요. '+Math.ceil((s.begNext-now)/60000)+'분 뒤에 다시 해보세요.',429);
        const amount=begAlms();s.begNext=now+ARCADE.beg.cooldownMs;if(amount)this.entry(s,amount,'구걸',now);result={game:'beg',amount,message:begLine(amount)+(amount?' +'+amount+'초코':'')};
      }
      else if(b.op==='race'){if(!s.race||s.race.expires<now)s.race={id:crypto.randomUUID(),horses:horses(),expires:now+900000};result={message:'이번 개인 경주표예요.'};}
      else if(b.op==='quiz'){
        if(s.quizWins>=25)fail('오늘의 퀴즈 보상을 모두 받았어요.');if(now<s.quizNext)fail('잠시 쉬었다가 다음 문제를 받아주세요.');
        if(!s.quiz||s.quiz.expires<now){const [answer,clue,field]=QUIZ[integer(QUIZ.length)],hint=`${field} · ${clue}`;s.quiz={id:crypto.randomUUID(),answer,hint,initials:initials(answer),created:now,expires:now+30000,tries:0};}result={message:'초성을 보고 단어를 맞혀보세요.'};
      }
      else if(b.op==='quizAnswer'){
        const q=s.quiz;if(!q||q.id!==p.quizId||q.expires<now)fail('문제 시간이 지났어요.');if(now-q.created<1000)fail('문제를 조금 더 읽어주세요.');if(typeof p.answer!=='string'||p.answer.length>30)fail('답을 짧게 입력해주세요.');
        const answer=p.answer.normalize('NFC').replace(/\s/g,'');q.tries++;
        if(answer===q.answer){if(s.quizWins>=25)fail('오늘의 퀴즈 보상을 모두 받았어요.');this.entry(s,40,'초성퀴즈 정답',now);s.quizWins++;s.quiz=null;s.quizNext=now+10000;result={message:'정답! 40초코를 받았어요.',correct:true};}
        else if(q.tries>=3){result={message:'정답은 '+q.answer+'였어요. 다음 문제에서 만나요.',correct:false};s.quiz=null;s.quizNext=now+10000;}else result={message:'다시 생각해봐요. '+(3-q.tries)+'번 더 도전할 수 있어요.',correct:false};
      }
      else if(b.op==='tarotDaily'){
        if(s.dailyCard?.day!==today){s.dailyCard={day:today,id:Number(seed%78n),reversed:(seed>>16n)%2n===0n};s.history=[s.dailyCard,...s.history].slice(0,30);}result={card:cardView(s.dailyCard)};
      }
      else if(b.op==='spreadStart'){
        if(s.spread&&now-s.spread.created<30000)fail('지금 펼친 카드를 먼저 살펴봐요.');const ids=Array.from({length:78},(_,i)=>i);for(let i=77;i>0;i--){const j=integer(i+1);[ids[i],ids[j]]=[ids[j],ids[i]];}s.spread={id:crypto.randomUUID(),created:now,cards:ids.slice(0,8).map(id=>({id,reversed:random()<.5})),picked:[]};
      }
      else if(b.op==='spreadPick'){
        const spread=s.spread;if(!spread||p.spreadId!==spread.id)fail('카드를 다시 펼쳐주세요.');if(!Number.isInteger(p.index)||p.index<0||p.index>7||spread.picked.includes(p.index)||spread.picked.length>=3)fail('다른 카드 세 장을 골라주세요.');spread.picked.push(p.index);
      }
      // 포커 바이인·정산은 마을 방(LandRoom)만 부른다. 손님 요청 경로(/land/player)는 internal을 넘기지 않는다.
      // 크래시·서바이벌·초코 선물도 같은 길(roomBuyIn·roomCashOut)을 쓴다. game으로 기록 이름만 바뀐다
      else if(['pokerBuyIn','pokerCashOut','roomBuyIn','roomCashOut','giftSend'].includes(b.op)){
        if(b.internal!==true)fail('없는 기능이에요.',404);
        const game=b.op.startsWith('poker')?'poker':b.op==='giftSend'?'gift':p.game,label=ROOM_GAMES[game];if(!label)fail('없는 게임이에요.');
        if(!Number.isSafeInteger(p.amount)||p.amount<=0||p.amount>1e9)fail(label+' 금액을 확인해주세요.');
        if(b.op==='giftSend'){
          if(p.amount<GIFT.min||p.amount>GIFT.max)fail('선물은 '+GIFT.min+'~'+GIFT.max.toLocaleString('ko-KR')+'초코로 보낼 수 있어요.');
          if(s.giftDay!==today){s.giftDay=today;s.giftSent=0;}if(s.giftSent+p.amount>GIFT.dailyLimit)fail('오늘 보낼 수 있는 선물은 '+(GIFT.dailyLimit-s.giftSent).toLocaleString('ko-KR')+'초코 남았어요.');
          if(s.balance<p.amount)fail('초코가 부족해요.');s.giftSent+=p.amount;this.entry(s,-p.amount,'초코 선물 보냄 · '+String(p.to||'주민').slice(0,24),now);
        }
        else if(b.op.endsWith('BuyIn')){if(s.balance<p.amount)fail('초코가 부족해요. 금액을 줄이거나 출석·퀴즈를 이용해보세요.');this.entry(s,-p.amount,label+(game==='poker'?' 바이인':' 베팅'),now);}
        else this.entry(s,p.amount,game==='gift'?'초코 선물 받음 · '+String(p.from||'주민').slice(0,24):label+(p.reason==='refund'?' 환불':' 정산'),now);
        result={game,amount:p.amount};
      }
      else if(b.op!=='get')fail('없는 기능이에요.',404);
      if(b.op!=='get')s.rev++;
      if(s.balance<0||!Number.isSafeInteger(s.balance)||s.balance>1e12)fail('잔액을 확인할 수 없어요. 지원을 요청해주세요.',409);
      this.sql.exec('INSERT INTO player(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',JSON.stringify(s));
      const output={...this.view(s,today),result,settled};
      if(b.op!=='get')this.sql.exec('INSERT INTO actions VALUES(?,?,?)',b.id,fingerprint,JSON.stringify(output));
      return Response.json(output);
    });}catch(e){return Response.json({error:'land_action',msg:e.message},{status:e.status||400});}
  }
  bet(s,amount,now){if(!Number.isSafeInteger(amount)||amount<10||amount>5000)fail('베팅은 10~5,000초코의 정수로 입력해주세요.');if(s.balance<amount)fail('초코가 부족해요. 출석이나 퀴즈를 이용해보세요.');if(now<s.nextPlay)fail('잠깐만요. 앞선 결과를 먼저 확인해주세요.',429);}
  entry(s,delta,reason,now){if(!Number.isSafeInteger(s.balance+delta)||s.balance+delta<0)fail('초코가 부족해요.');if(reason!=='첫 주민 선물')s.balance+=delta;this.sql.exec('INSERT INTO ledger(delta,balance,reason,created) VALUES(?,?,?,?)',delta,s.balance,reason,now);}
  view(s,today){return {rev:s.rev,resident:{id:s.id,name:s.name,avatar:s.avatar},wallet:{balance:s.balance,daily:s.dailyClaim===today,rescue:s.rescueClaim===today,quizWins:s.quizWins,begNext:s.begNext||0,giftLeft:GIFT.dailyLimit-(s.giftDay===today?s.giftSent:0)},blackjack:bjView(s.bj),arcade:roundView(s.arcade),race:s.race,quiz:s.quiz?{id:s.quiz.id,initials:s.quiz.initials,hint:s.quiz.hint,expires:s.quiz.expires,tries:s.quiz.tries}:null,spread:s.spread?{id:s.spread.id,picked:s.spread.picked,results:s.spread.picked.map(i=>({...cardView(s.spread.cards[i]),index:i}))}:null,dailyCard:s.dailyCard?cardView(s.dailyCard):null,history:s.history.map(cardView),ledger:this.sql.exec('SELECT delta,balance,reason,created FROM ledger ORDER BY id DESC LIMIT 15').toArray(),now:Date.now()};}
}
