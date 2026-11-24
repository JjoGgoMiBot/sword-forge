// 마을 공지(큰 당첨·입장·퇴장)와 초코 랭킹의 기준을 한곳에 모은다.
// 기준을 바꿀 때는 이 표만 고친다.
export const NOTICE = Object.freeze({
  // 큰 당첨: 순이익이 minNet 이상이거나, 배당이 minMultiple배 이상이면서 순이익이 minNetForMultiple 이상
  bigWin: Object.freeze({minNet: 2000, minMultiple: 10, minNetForMultiple: 300}),
  // 잠깐 끊겼다 다시 붙는 것을 퇴장으로 보지 않도록 이만큼 기다렸다가 퇴장 공지
  leaveDelayMs: 8000,
  // 같은 사람의 입장 공지는 이 간격 안에서 한 번만
  joinCooldownMs: 60000,
  // 당첨 공지를 받는 방(공개 광장 전체)
  winRooms: Object.freeze(['public:1', 'public:2', 'public:3', 'public:4', 'public:5']),
  rankingSize: 10,
  // 랭킹 조회는 이 시간만큼 같은 결과를 돌려준다(누를 때마다 D1을 읽지 않게)
  rankingCacheMs: 15000,
});

export const GAME_NAMES = Object.freeze({slots: '슬롯', blackjack: '블랙잭', horse: '경마', dice: '주사위', rps: '가위바위보', poker: '포커',
  roulette: '러시안 룰렛', hilo: '하이로우', mines: '마인즈', baccarat: '바카라', luckybox: '럭키박스', plinko: '플링코', rpsduel: '가위바위보 대결', wheel: '룰렛', crash: '크래시', party: '총쏘기 서바이벌', duel: '총잡이 결투'});

const cleanName = name => String(name || '주민').replace(/[\u0000-\u001f@<>]/g, '').slice(0, 24) || '주민';

// 한 판 결과 → 큰 당첨이면 공지, 아니면 null
export function winNotice(name, {game, bet, payout} = {}, rule = NOTICE.bigWin) {
  if (!Number.isSafeInteger(bet) || !Number.isSafeInteger(payout) || bet <= 0 || payout <= 0) return null;
  const net = payout - bet, multiple = payout / bet;
  const big = net >= rule.minNet || (multiple >= rule.minMultiple && net >= rule.minNetForMultiple);
  if (!big) return null;
  const who = cleanName(name), label = GAME_NAMES[game] || '오락관';
  const times = multiple >= 2 ? ` (${Math.floor(multiple * 10) / 10}배)` : '';
  return {kind: 'win', name: who, game: String(game || ''), net, text: `${who}님이 ${label}에서 ${net.toLocaleString('ko-KR')}초코를 땄어요!${times}`};
}

export const joinNotice = name => ({kind: 'join', name: cleanName(name), text: `${cleanName(name)}님이 마을에 들어왔어요`});
export const leaveNotice = name => ({kind: 'leave', name: cleanName(name), text: `${cleanName(name)}님이 마을을 떠났어요`});
