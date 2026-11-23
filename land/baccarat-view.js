const NAMES={player:'플레이어',banker:'뱅커',tie:'타이'};
const SUITS=['♠','♥','♦','♣'],RANKS={1:'A',11:'J',12:'Q',13:'K'};
const point=n=>Number.isInteger(n)&&n>=0&&n<=9?n:'—';
function card(c){
  if(!Number.isInteger(c?.rank)||c.rank<1||c.rank>13||!Number.isInteger(c?.suit)||c.suit<0||c.suit>3)return '';
  return `<span class="ac-card${c.suit===1||c.suit===2?' red':''}" aria-label="${RANKS[c.rank]||c.rank}${SUITS[c.suit]}">${RANKS[c.rank]||c.rank}<i>${SUITS[c.suit]}</i></span>`;
}
export function baccaratScene(result){
  const hands=['player','banker'].map(side=>{
    const winner=result?.winner===side,draw=result?.winner==='tie';
    const cards=result?result[side].map(card).join(''):'<span class="ac-card ac-card-back" aria-hidden="true"></span>'.repeat(2);
    return `<section class="ac-bacc-hand${winner?' winner':''}" aria-label="${NAMES[side]} 패"><header><span>${NAMES[side]}</span><strong>${result?point(result[side+'Total']):'—'}<small>점</small></strong></header><div class="ac-cards">${cards}</div><span class="ac-bacc-verdict">${result?winner?'승리':draw?'무승부':'패배':'카드 대기'}</span></section>`;
  }).join('');
  const choice=NAMES[result?.choice];
  return `<div class="ac-bacc">${hands}</div>${result&&choice?`<p class="ac-bacc-bet">이번 판 베팅 · <b>${choice}</b></p>`:''}${!result?'<p class="ac-empty">9에 가까운 쪽이 이겨요. 아래에서 걸 곳을 골라 시작하세요.</p>':''}`;
}
export function baccaratOutcome(result){
  const winner=result.winner==='tie'?'무승부':`${NAMES[result.winner]} 승리`;
  const settlement=result.payout>result.bet?'당첨!':result.payout===result.bet?'베팅금 반환':'미당첨';
  return {text:`${winner} · ${settlement}`,kind:result.payout>result.bet?'win':result.payout<result.bet?'loss':''};
}
