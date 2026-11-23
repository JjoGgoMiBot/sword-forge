// 오락관·운세 화면의 "순간" → 소리 시간표. 순수 함수라 노드에서 시험한다.
// 시각(ms)은 casino-fx.js·style.css 애니메이션과 같은 기준(결과가 그려진 순간 = 0)이다.
import { settleMs, reelStopMs } from '../casino-fx.js?v=12';

// 결과 분류(casino-fx 의 outcome) → 결과음
const OUTCOME = { jackpot: ['jackpot', 'vfx.explosion'], blackjack: ['win', 'vfx.sparkle'], win: ['win'], draw: ['draw'], loss: ['lose'] };

// game: slots·dice·blackjack·horse·rps·quiz·daily·rescue / count: 이번에 움직이는 카드·릴 수
export function casinoCues(game, outcome, { count = 1, reduced = false } = {}) {
  const out = [];
  const settle = reduced ? 0 : settleMs(game, count);
  if (!reduced) {
    if (game === 'slots') {
      const last = reelStopMs(Math.max(0, count - 1));
      out.push({ at: 0, id: 'slot.spin', params: { dur: +(last / 1000).toFixed(2) } });
      for (let i = 0; i < count; i++) out.push({ at: reelStopMs(i), id: 'slot.stop', pan: count > 1 ? (i / (count - 1) - 0.5) * 0.6 : 0 });
    } else if (game === 'dice') { // style.css dice-cup-roll 1.9s: 흔들기 7~48% · 엎기 65% · 들기 70%
      out.push({ at: 130, id: 'dice.shake', params: { dur: 0.78 } }, { at: 1235, id: 'dice.slam' }, { at: 1330, id: 'dice.reveal' });
    } else if (game === 'blackjack') { // app.js bjTable: 카드 k 는 k*300ms 에 날아와 330ms 뒤 뒤집힌다
      for (let k = 0; k < count; k++) out.push({ at: k * 300, id: 'card.deal' }, { at: k * 300 + 330, id: 'card.flip' });
    } else if (game === 'horse') {
      out.push({ at: 0, id: 'race.start' }, { at: 300, id: 'race.gallop', params: { dur: +((settle - 300) / 1000).toFixed(1) } }, { at: Math.max(0, settle - 250), id: 'race.finish' });
    } else if (game === 'rps') { // rps-pump 박자 13.2% · 35.3% · 57.4% of 1.9s
      out.push({ at: 250, id: 'rps.beat' }, { at: 670, id: 'rps.beat' }, { at: 1090, id: 'rps.beat' }, { at: 1090, id: 'rps.reveal' });
    }
  }
  for (const id of OUTCOME[outcome] || []) out.push({ at: settle, id });
  return out.sort((a, b) => a.at - b.at);
}

// 운세: 열기·카드 뽑기·결과
export function fortuneCues(moment, { cards = 1 } = {}) {
  if (moment === 'open') return [{ at: 0, id: 'saju.open' }];
  if (moment === 'spread') return Array.from({ length: cards }, (_, i) => ({ at: i * 90, id: 'card.deal' }));
  if (moment === 'pick') return [{ at: 0, id: 'card.flip' }, { at: 160, id: 'vfx.sparkle' }];
  if (moment === 'result') return [{ at: 0, id: 'card.flip' }, { at: 200, id: 'saju.result' }];
  return [];
}

// 첫 입력 뒤 미리 그려 둘 소리
export const PREWARM = ['ui.tap', 'chip.place', 'card.deal', 'card.flip', 'slot.stop', 'dice.slam', 'win', 'lose', 'draw', 'rps.beat', 'dice.reveal'];
