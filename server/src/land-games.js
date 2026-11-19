// Ported from jjokkomi core/casino.py. Only the server supplies the RNG.
export const SYMBOLS=[['🍒',30,40],['🍋',24,60],['🍇',18,100],['🔔',13,200],['⭐',8,500],['💎',5,1200],['7️⃣',2,7770]];
export const random=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;
export const integer=(n,rng=random)=>Math.floor(rng()*n);
export function weighted(weights,rng=random){let n=rng()*weights.reduce((a,b)=>a+b,0);for(let i=0;i<weights.length;i++){n-=weights[i];if(n<0)return i;}return weights.length-1;}
export function slotRate(reels){if(reels.every(x=>x===reels[0]))return SYMBOLS[reels[0]][2];const pair=reels[0]===reels[1]||reels[0]===reels[2]?reels[0]:reels[1]===reels[2]?reels[1]:-1;return pair===0?15:pair>=0?12:0;}
export function slots(bet,rng=random){const reels=Array.from({length:3},()=>weighted(SYMBOLS.map(x=>x[1]),rng));return {game:'slots',reels:reels.map(i=>SYMBOLS[i][0]),payout:Math.floor(bet*slotRate(reels)/10)};}
export function value(cards){let total=0,aces=0;for(const c of cards){const n=c.slice(0,-1);if(n==='A'){total+=11;aces++;}else total+=['J','Q','K'].includes(n)?10:Number(n);}while(total>21&&aces){total-=10;aces--;}return total;}
export function shoe(rng=random){const cards=[];for(let d=0;d<4;d++)for(const suit of ['♠','♥','♦','♣'])for(const rank of ['A','2','3','4','5','6','7','8','9','10','J','Q','K'])cards.push(rank+suit);for(let i=cards.length-1;i>0;i--){const j=integer(i+1,rng);[cards[i],cards[j]]=[cards[j],cards[i]];}return cards;}
export function finish(b){b.done=true;const p=value(b.player),d=value(b.dealer),pn=b.player.length===2&&p===21,dn=b.dealer.length===2&&d===21;b.outcome=pn&&!dn?'blackjack':dn&&!pn?'lose':p>21?'bust':d>21?'dealer_bust':p>d?'win':p===d?'push':'lose';b.payout=b.outcome==='blackjack'?Math.floor(b.bet*5/2):['win','dealer_bust'].includes(b.outcome)?b.bet*2:b.outcome==='push'?b.bet:0;return b;}
export function stand(b){if(value(b.player)<=21)while(value(b.dealer)<17)b.dealer.push(b.deck.pop());return finish(b);}
export function deal(bet,now,rng=random){const deck=shoe(rng),b={id:crypto.randomUUID(),bet,deck,player:[deck.pop(),deck.pop()],dealer:[deck.pop(),deck.pop()],done:false,expires:now+300000,payout:0};if(value(b.player)===21||value(b.dealer)===21)finish(b);return b;}
export function bjView(b){if(!b)return null;return {id:b.id,bet:b.bet,player:b.player,dealer:b.done?b.dealer:[b.dealer[0],'?'],total:value(b.player),done:b.done,expires:b.expires,outcome:b.done?b.outcome:null,payout:b.done?b.payout:0,canDouble:!b.done&&b.player.length===2};}
export const HORSES=['번개쪼꼬','유니콘킹','당근러버','줄무늬대장','치타인척'];
export function horses(rng=random){const w=HORSES.map(()=>.5+rng()*2.5),sum=w.reduce((a,b)=>a+b,0);return HORSES.map((name,i)=>({name,chance:w[i]/sum,rate:Math.max(11,Math.floor(.92/(w[i]/sum)*10))}));}
export function oneShot(game,bet,choice,rng=random){
  if(game==='slots')return slots(bet,rng);
  if(game==='dice'){if(!['odd','even'].includes(choice))throw Error('홀 또는 짝을 골라주세요.');const dice=[integer(6,rng)+1,integer(6,rng)+1],win=(dice[0]+dice[1])%2===(choice==='odd'?1:0);return {game,dice,choice,payout:win?Math.floor(bet*19/10):0};}
  if(game==='rps'){const options=['rock','paper','scissors'];if(!options.includes(choice))throw Error('가위·바위·보를 골라주세요.');const opponent=options[integer(3,rng)],win=({rock:'scissors',paper:'rock',scissors:'paper'})[choice]===opponent;return {game,choice,opponent,payout:choice===opponent?bet:win?bet*2:0};}
  throw Error('지원하지 않는 게임이에요.');
}
