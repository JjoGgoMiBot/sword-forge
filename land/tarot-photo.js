// 22장의 메이저 소품과 네 가지 마이너 문양. 카드 번호/이름/방향은 별도 텍스트로 유지한다.
export function tarotPhotoIndex(card){
  if(card.suit)return {wands:22,cups:23,swords:24,pentacles:25}[card.suit]??0;
  return Number.isInteger(card.number)&&card.number>=0&&card.number<22?card.number:0;
}
export function tarotPhoto(card){
  const i=tarotPhotoIndex(card);
  return `<span class="tarot-photo" aria-hidden="true" style="background-position:${i%6*20}% ${Math.floor(i/6)*25}%"></span>`;
}
