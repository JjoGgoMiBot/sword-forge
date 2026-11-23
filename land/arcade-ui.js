// 새 오락관 게임 화면. 혼자 하는 게임은 act()로 지갑 서버에, 함께 하는 게임(크래시·총쏘기·결투·선물)은 마을 소켓으로 보낸다.
// 결과·시드·터지는 배율·발사 시각은 서버만 안다. 여기서는 서버가 보낸 view를 그리고 누른 것을 돌려보낼 뿐이다.
export const ARCADE_TABS = {roulette: '러시안 룰렛', hilo: '하이로우', mines: '마인즈', baccarat: '바카라', wheel: '룰렛 휠', luckybox: '럭키박스',
  crash: '크래시', party: '총쏘기 서바이벌', duel: '총잡이 결투', gift: '초코 선물', beg: '구걸하기'};
export const ROOM_GAMES = ['crash', 'party', 'duel'];
const STEP = ['roulette', 'hilo', 'mines'], ONE = ['baccarat', 'wheel', 'luckybox'];
const SUITS = ['♠', '♥', '♦', '♣'], RANKS = {1: 'A', 11: 'J', 12: 'Q', 13: 'K'};
const BOXES = {small: ['작은 상자', 100], big: ['큰 상자', 1000], gold: ['황금 상자', 5000]};
const WHEEL = {red: '빨강 (2배)', black: '검정 (2배)', odd: '홀수 (2배)', even: '짝수 (2배)', low: '1~18 (2배)', high: '19~36 (2배)', d1: '1~12 (3배)', d2: '13~24 (3배)', d3: '25~36 (3배)'};
const BACC = {player: '플레이어 (1.9배)', banker: '뱅커 (1.88배)', tie: '타이 (10배)'};

export const ARCADE_RULES = {
  roulette: '여섯 칸 중 한 칸에 총알이 들어 있어요. 방아쇠를 당길 때마다 배율이 올라가고, 한 번 이상 버틴 뒤에는 언제든 멈춰 받을 수 있어요. 어느 시점에 멈춰도 기대 환수율은 96%예요. 다섯 번을 모두 버티면 자동 정산돼요. 총알 위치는 서버만 알고, 판이 끝난 뒤에 보여 드려요.',
  hilo: '다음 카드가 지금 카드보다 높을지 낮을지 맞혀요(A가 가장 낮고 K가 가장 높아요). 같은 숫자가 나오면 져요. 배율은 맞힐 확률로 정해지고 기대 환수율은 96%예요. 한 번 이상 맞힌 뒤 언제든 멈출 수 있고, 10번 맞히거나 100배에 닿으면 자동 정산돼요.',
  mines: '25칸 중 지뢰 수(1·3·5·10개)를 골라 시작해요. 안전한 칸을 열 때마다 배율이 올라가고, 지뢰를 열면 베팅을 잃어요. 기대 환수율 96%, 최대 100배. 지뢰 위치는 판이 끝난 뒤에만 보여 드려요.',
  baccarat: '8덱 표준 바카라 세 번째 카드 규칙. 플레이어 1.9배, 뱅커 1.88배, 타이 10배. 타이가 나오면 플레이어·뱅커에 건 돈은 돌려 드려요.',
  wheel: '유럽식 룰렛(0~36, 0 하나). 빨강·검정·홀짝·1~18·19~36은 2배, 12칸 묶음은 3배, 숫자 하나는 36배. 0이 나오면 숫자 0에 건 경우만 당첨이에요. 기대 환수율 약 97.3%.',
  luckybox: '상자 가격이 곧 베팅이에요(100·1,000·5,000초코). 상품 배율과 확률: 먼지 0.2배 36.2%, 사탕 0.5배 30%, 초코 한 줌 1배 18%, 선물 꾸러미 2배 10%, 금화 주머니 4배 4.5%, 보석 10배 1.2%, 황금 쪼꼬미 50배 0.1%. 기대 환수율 약 95.2%.',
  crash: '모두가 같은 판을 봐요. 출발하면 배율이 6초마다 두 배씩 올라가고(최대 100배), 서버가 정한 지점에서 터져요. 터지기 전에 멈추면 베팅×배율을 받아요. 어느 배율에서 멈춰도 기대 환수율은 96%예요. 터지는 배율은 출발 전에도, 진행 중에도 누구에게도 보내지 않아요. 멈춤은 서버에 도착한 순간의 배율로 정산하고, 자동 멈춤은 서버가 정확히 그 배율에서 처리해요.',
  party: '2~6명이 같은 판돈을 걸고 여섯 칸 리볼버를 차례로 당겨요. 총알이 나간 사람은 탈락하고, 마지막까지 남은 한 명이 판돈의 96%를 가져요. 순서와 총알 위치는 출발할 때 서버가 정하고, 화면에는 당긴 결과만 차례로 보내요. 두 번째 사람이 들어온 뒤 20초(가득 차면 3초) 뒤 출발, 혼자 2분을 기다리면 판돈을 돌려 드려요.',
  duel: '두 사람이 같은 판돈을 걸면 서버가 2.5~7초 사이 무작위 시각에 \'발사!\' 신호를 보내요. 신호 뒤에 서버에 먼저 도착한 사격이 이겨요(네트워크가 빠른 쪽이 유리할 수 있어요). 신호 전에 쏘면 반칙패예요. 상대가 안 쏘면 쏜 사람이 이기고, 신호 뒤 5초 동안 둘 다 안 쏘면 모두 돌려 드려요. 이긴 사람은 판돈 합계의 97%를 받아요. 신호 시각은 미리 누구에게도 보내지 않아요.',
  gift: '지금 같은 광장에 있는 주민에게 10~1,000초코를 보낼 수 있어요. 수수료 5%를 뗀 만큼 받는 사람 지갑에 들어가요. 하루에 보낼 수 있는 합계는 3,000초코예요. 보낸 선물은 되돌릴 수 없어요.',
  beg: '초코가 300 미만일 때 10분마다 한 번, 지나가는 쪼꼬미에게 손을 내밀 수 있어요. 아무것도 못 받을 때가 45%, 10~50초코 40%, 60~150초코 13%, 300초코 2%예요.',
};

const ph = n => 'assets/photo/ac-' + n + '.webp';
const pic = (n, c = '') => '<img class="ac-pic ' + c + '" src="' + ph(n) + '" alt="" draggable="false">';
const rocket = new Image(); rocket.src = ph('rocket');
const card = (c, h) => c ? '<span class="ac-card' + (c.suit === 1 || c.suit === 2 ? ' red' : '') + '">' + (RANKS[c.rank] || c.rank) + '<i>' + SUITS[c.suit] + '</i></span>' : '';
const x2 = m => '×' + (Math.floor(m * 100) / 100).toFixed(2);
const secs = ms => Math.max(0, Math.ceil(ms / 1000));

export function createArcade({money, h, toast, act, send, balance, wallet, round, peers, refresh, fx = () => {}}) {
  let fxSeq = 0, fxKey = null; // 마지막으로 연출한 결과 문구. 탭을 막 연 때의 지난 결과는 다시 터뜨리지 않는다

  let box = null, game = null, watching = null, last = {}, at = 0, raf = 0, resetT = 0, doneId = {}, cylAt = {id: 0, deg: 0};
  const views = {}, input = {bet: 100, auto: '', stake: 100, mines: 3, choice: {}, gift: 100, to: ''};

  // ── 소켓 구독: 한 번에 한 게임만 본다 ──
  function watch(next) {
    if (watching === next) return;
    if (watching) send({game: watching, op: 'watch', on: false});
    watching = next;
    if (next) send({game: next, op: 'watch', on: true});
  }
  const field = (id, label, value, attrs = '') => '<label>' + label + '<input id="' + id + '" type="number" inputmode="numeric" value="' + h(String(value)) + '" ' + attrs + '></label>';
  const select = (id, label, opts, value) => '<label>' + label + '<select id="' + id + '">' + Object.entries(opts).map(([k, v]) => '<option value="' + k + '"' + (k === value ? ' selected' : '') + '>' + v + '</option>').join('') + '</select></label>';
  const summary = cells => '<div class="ac-summary">' + cells.map(([k, v, cls]) => '<div' + (cls ? ' class="' + cls + '"' : '') + '><small>' + k + '</small><strong>' + v + '</strong></div>').join('') + '</div>';
  const banner = (text, kind = '') => '<p class="ac-result ' + kind + '" role="status">' + text + '</p>';

  // ── 단계형: 러시안 룰렛·하이로우·마인즈 ──
  function stepHtml() {
    const r = round(), mine = r && r.game === game && doneId[game] !== r.id ? r : null, other = r && !r.done && r.game !== game;
    if (other) return banner('진행 중인 ' + ARCADE_TABS[r.game] + ' 판이 있어요. 먼저 마쳐주세요.') + '<div class="inline-actions"><button class="primary" data-ac="goto" data-game="' + r.game + '">' + ARCADE_TABS[r.game] + ' 판으로 가기</button></div>';
    const live = mine && !mine.done;
    let html = '<div class="ac-stage ac-' + game + '">';
    if (mine) html += summary([['베팅', money(mine.bet) + ' C'], ['지금 배율', x2(mine.mult || 1)], [live ? '멈추면 받는 돈' : '받은 돈', money(live ? Math.floor(mine.bet * Math.floor((mine.mult || 1) * 100) / 100) : mine.payout) + ' C', live ? '' : mine.payout > mine.bet ? 'win' : '']]);
    if (game === 'roulette') html += rouletteScene(mine);
    if (game === 'hilo') html += hiloScene(mine);
    if (game === 'mines') html += minesScene(mine);
    if (mine?.done) html += banner(stepEnd(mine), mine.payout > mine.bet ? 'win' : mine.payout ? '' : 'loss');
    html += '</div>';
    if (live) {
      const canCash = game === 'roulette' ? mine.shots > 0 : game === 'hilo' ? mine.steps > 0 : mine.opened.length > 0;
      if (game === 'roulette') html += '<div class="inline-actions"><button class="primary" data-ac="move" data-move="pull">방아쇠 당기기 · 다음 ' + x2(mine.next) + '</button>';
      else if (game === 'hilo') html += '<div class="inline-actions"><button class="primary" data-ac="move" data-move="high" ' + (mine.high ? '' : 'disabled') + '>높다 ' + (mine.high ? x2(mine.high) : '') + '</button><button class="primary" data-ac="move" data-move="low" ' + (mine.low ? '' : 'disabled') + '>낮다 ' + (mine.low ? x2(mine.low) : '') + '</button>';
      else html += '<div class="inline-actions">';
      html += '<button data-ac="move" data-move="cash" ' + (canCash ? '' : 'disabled') + '>멈추고 받기</button></div>';
      html += '<p class="status-note">' + (game === 'roulette' ? '다음에 버틸 확률 ' + Math.round(mine.survive * 100) + '%' : game === 'hilo' ? '높을 확률 ' + Math.round(mine.pHigh * 100) + '% · 낮을 확률 ' + Math.round(mine.pLow * 100) + '%' : '다음 칸이 안전할 확률 ' + Math.round(mine.safeChance * 100) + '% · 다음 ' + (mine.next ? x2(mine.next) : '없음')) + ' · 10분 넘게 두면 자동 정산돼요.</p>';
    } else {
      html += '<div class="casino-controls">' + field('acBet', '베팅 초코', input.bet, 'min="10" max="5000" step="1"') + (game === 'mines' ? select('acMines', '지뢰 수', {1: '1개', 3: '3개', 5: '5개', 10: '10개'}, String(input.mines)) : '') + '<button class="primary" data-ac="start">' + (mine ? '한 판 더' : '시작하기') + '</button></div><p class="status-note">10~5,000초코 · 시작하면 베팅금이 차감돼요.</p>';
    }
    return html;
  }
  const stepEnd = g => ({bang: '탕! 총알이 나왔어요.', miss: '아쉽게 틀렸어요.', boom: '지뢰를 밟았어요.', cash: '멈추고 ' + money(g.payout) + '초코를 받았어요.', max: '끝까지 버텨 ' + money(g.payout) + '초코를 받았어요!'})[g.outcome] || '';
  function rouletteScene(g) {
    const shots = g?.shots || 0, boom = g?.done && g.outcome === 'bang';
    return '<div class="ac-cylinder' + (boom ? ' boom' : '') + '" role="img" aria-label="6칸 중 ' + shots + '칸 당김">' + '<span class="ac-cylwrap" data-deg="' + shots * 60 + '" data-id="' + (g?.id || 0) + '" style="transform:rotate(' + (g && cylAt.id === String(g.id) ? cylAt.deg : shots * 60) + 'deg)">' + pic('cylinder', 'ac-cyl') + '</span>' + (boom ? pic('blast', 'ac-boom') : '') + '<b>' + (g ? shots + ' / 5' : '6칸') + '</b></div>';
  }
  function hiloScene(g) {
    if (!g) return '<p class="ac-empty">카드 한 장을 받고, 다음 카드가 높을지 낮을지 골라요.</p>';
    return '<div class="ac-cards">' + g.cards.map(c => card(c, h)).join('') + '</div><p class="ac-empty">맞힌 횟수 ' + g.steps + ' / 10</p>';
  }
  function minesScene(g) {
    const open = new Set(g?.opened || []), bombs = new Set(g?.bombs || []), live = g && !g.done;
    return '<div class="ac-grid" role="grid" aria-label="마인즈 5×5">' + Array.from({length: 25}, (_, i) => {
      const cls = open.has(i) ? 'safe' : g?.hit === i ? 'hit' : bombs.has(i) ? 'bomb' : '';
      return '<button class="' + cls + '" data-ac="pick" data-cell="' + i + '" aria-label="' + (i + 1) + '번 칸' + (cls === 'safe' ? ' 안전' : cls ? ' 지뢰' : '') + '" ' + (live && !open.has(i) ? '' : 'disabled') + '>' + (cls === 'safe' ? pic('mines-gem') : cls ? pic('mines-bomb') : '') + '</button>';
    }).join('') + '</div>';
  }

  // ── 한 번에 끝나는 게임: 바카라·룰렛 휠·럭키박스 ──
  function oneHtml() {
    const r = last[game];
    let html = '<div class="ac-stage ac-' + game + '">';
    if (r) html += summary([['베팅', money(r.bet) + ' C'], ['받은 돈', money(r.payout) + ' C', r.payout > r.bet ? 'win' : '']]);
    if (game === 'baccarat') html += r ? '<div class="ac-bacc"><div><small>플레이어 ' + r.playerTotal + '</small><div class="ac-cards">' + r.player.map(c => card(c, h)).join('') + '</div></div><div><small>뱅커 ' + r.bankerTotal + '</small><div class="ac-cards">' + r.banker.map(c => card(c, h)).join('') + '</div></div></div>' + banner(({player: '플레이어', banker: '뱅커', tie: '타이'})[r.winner] + ' 승 · ' + (r.payout > r.bet ? '당첨!' : r.payout === r.bet ? '원금 반환' : '아쉬워요'), r.payout > r.bet ? 'win' : '') : '<div class="ac-bacc idle"><div><small>플레이어 1.9배</small><div class="ac-cards"><span class="ac-slot"></span><span class="ac-slot"></span></div></div><div><small>뱅커 1.88배</small><div class="ac-cards"><span class="ac-slot"></span><span class="ac-slot"></span></div></div></div><p class="ac-empty ac-pill">타이 10배 · 9에 가까운 쪽을 맞혀요.</p>';
    if (game === 'wheel') html += r ? '<div class="ac-wheelbox">' + pic('wheel', 'ac-wheel-img spin') + '<div class="ac-ball ' + r.color + '">' + r.number + '</div></div>' + banner(r.payout ? money(r.payout) + '초코 당첨!' : '이번엔 빗나갔어요.', r.payout ? 'win' : '') : '<div class="ac-wheelbox">' + pic('wheel', 'ac-wheel-img') + '</div><p class="ac-empty">0~36 중 공이 멈출 곳에 걸어요.</p>';
    if (game === 'luckybox') html += r ? '<div class="ac-prize tier' + r.tier + '">' + pic('prize-' + r.tier) + '<b>' + h(r.prize) + '</b><span>' + x2(r.mult) + '</span></div>' + banner(money(r.payout) + '초코를 받았어요.', r.payout > r.bet ? 'win' : '') : '<div class="ac-boxrow">' + Object.keys(BOXES).map(k => pic('box-' + k)).join('') + '</div><p class="ac-empty">상자를 골라 열어요. 가격이 곧 베팅이에요.</p>';
    html += '</div><div class="casino-controls">';
    if (game === 'luckybox') html += Object.entries(BOXES).map(([k, [name, price]]) => '<button class="ac-boxb ' + (k === 'small' ? 'primary' : '') + '" data-ac="play" data-choice="' + k + '" ' + (balance() < price ? 'disabled' : '') + '>' + pic('box-' + k) + name + ' · ' + money(price) + '</button>').join('');
    else {
      html += field('acBet', '베팅 초코', input.bet, 'min="10" max="5000" step="1"');
      html += game === 'baccarat' ? select('acChoice', '걸 곳', BACC, input.choice.baccarat || 'player') : select('acChoice', '걸 곳', {...WHEEL, num: '숫자 하나 (36배)'}, input.choice.wheel || 'red') + (input.choice.wheel === 'num' ? field('acNum', '숫자 0~36', input.choice.num ?? 7, 'min="0" max="36" step="1"') : '');
      html += '<button class="primary" data-ac="play">한 판 시작</button>';
    }
    return html + '</div><p class="status-note">' + (game === 'luckybox' ? '상자는 열면 바로 정산돼요.' : '10~5,000초코 · 확정하면 베팅금이 차감돼요.') + '</p>';
  }

  // ── 구걸 ──
  function begHtml() {
    const w = wallet(), wait = Math.max(0, (w.begNext || 0) - Date.now()), r = last.beg;
    const can = w.balance < 300 && !wait;
    return '<div class="ac-stage ac-beg">' + pic('bowl', 'ac-hero') + (r ? banner(h(r.message), r.amount ? 'win' : '') : '<p class="ac-empty">초코가 바닥났다면 지나가는 쪼꼬미에게 손을 내밀어 봐요.</p>') + '</div><div class="inline-actions"><button class="primary" data-ac="beg" ' + (can ? '' : 'disabled') + '>손 내밀기</button></div><p class="status-note">' + (w.balance >= 300 ? '초코가 300 미만일 때만 할 수 있어요.' : wait ? Math.ceil(wait / 60000) + '분 뒤에 다시 할 수 있어요.' : '10분에 한 번 할 수 있어요.') + '</p>';
  }

  // ── 선물 ──
  function giftHtml() {
    const list = peers(), left = wallet().giftLeft ?? 3000;
    if (!list.length) return '<div class="ac-stage">' + pic('gift', 'ac-hero') + '<p class="ac-empty">지금 이 광장에 다른 주민이 없어요. 누가 들어오면 여기서 고를 수 있어요.</p></div>' + giftNote(left);
    if (!list.some(p => p.id === input.to)) input.to = list[0].id;
    return '<div class="ac-stage ac-giftbox">' + pic('gift', 'ac-hero') + '</div>' + summary([['오늘 더 보낼 수 있는 초코', money(left) + ' C'], ['받는 사람이 받는 돈', money(Math.floor(input.gift * 0.95)) + ' C']]) + '<div class="casino-controls">' + select('acTo', '받는 주민', Object.fromEntries(list.map(p => [p.id, h(p.name)])), input.to) + field('acGift', '보낼 초코', input.gift, 'min="10" max="1000" step="1"') + '<button class="primary" data-ac="gift">선물 보내기</button></div>' + giftNote(left);
  }
  const giftNote = left => '<p class="status-note">10~1,000초코 · 수수료 5% · 오늘 남은 한도 ' + money(left) + '초코 · 보낸 선물은 되돌릴 수 없어요.</p>';

  // ── 🚀 크래시 ──
  function crashMult(v) { if (v.phase !== 'running') return 1; const e = v.elapsed + (performance.now() - at); return Math.min(v.maxMult, Math.pow(2, e / v.doubleMs)); }
  function crashHtml() {
    const v = views.crash;
    if (!v) return '<p class="ac-empty">크래시 판을 불러오는 중…</p>';
    const mine = v.mine, running = v.phase === 'running';
    const head = running ? '' : v.phase === 'betting' ? '출발까지 <b data-ac-time>' + secs(v.remaining - (performance.now() - at)) + '</b>초' : '첫 베팅이 들어오면 8초 뒤 출발해요';
    let html = summary([['이번 판', '#' + v.round], ['참가', v.bets.length + '명'], ['내 베팅', mine ? money(mine.bet) + ' C' + (mine.auto ? ' · 자동 ' + x2(mine.auto) : '') : '없음'], ['내 결과', mine?.cashed ? x2(mine.cashed) + ' · ' + money(mine.payout) + ' C' : '—', mine?.cashed ? 'win' : '']]);
    html += '<div class="ac-crash"><canvas id="acCrash" aria-hidden="true"></canvas><div class="ac-crash-mult" aria-live="off"><b data-ac-mult>' + (running ? x2(crashMult(v)) : '×1.00') + '</b><span>' + head + '</span></div>';
    if (v.last && !running) html += pic('blast', 'ac-crash-blast') + '<p class="ac-crash-last">지난 판 <b>' + x2(v.last.point) + '</b>에서 터짐</p>';
    html += '</div><div class="ac-history" aria-label="최근 터진 배율">' + v.history.map(p => '<span class="' + (p >= 2 ? 'hi' : '') + '">' + x2(p) + '</span>').join('') + '</div>';
    if (running && mine && !mine.cashed) html += '<div class="inline-actions"><button class="primary ac-big" data-ac="cash">지금 멈추기 · <span data-ac-cashout>' + money(Math.floor(mine.bet * Math.floor(crashMult(v) * 100) / 100)) + '</span> C</button></div>';
    else if (!running && !mine) html += '<div class="casino-controls">' + field('acBet', '베팅 초코', input.bet, 'min="10" max="5000" step="1"') + field('acAuto', '자동 멈춤 배율(비우면 직접)', input.auto, 'min="1.01" max="100" step="0.01" placeholder="예: 2"') + '<button class="primary" data-ac="crashBet">이번 판에 걸기</button></div>';
    else html += '<p class="status-note">' + (running ? (mine?.cashed ? '멈춤 완료. 다음 판은 이번 판이 끝나면 걸 수 있어요.' : '이번 판은 이미 출발했어요. 끝나면 다음 판에 걸 수 있어요.') : '출발을 기다려요. 걸어 둔 판은 창을 닫아도 그대로 진행돼요.') + '</p>';
    html += v.bets.length ? '<ul class="ac-players">' + v.bets.map(b => '<li class="' + (b.me ? 'me' : '') + '"><span>' + h(b.name) + '</span><span>' + money(b.bet) + ' C</span><span class="' + (b.cashed ? 'win' : '') + '">' + (b.cashed ? x2(b.cashed) + ' · ' + money(b.payout) : running ? '타는 중' : '대기') + '</span></li>').join('') + '</ul>' : '';
    return html;
  }
  function drawCrash() {
    const v = views.crash, cv = box?.querySelector('#acCrash');
    if (!v || !cv) return;
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    if (cv.width !== Math.round(r.width * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
    const g = cv.getContext('2d'), w = r.width, hh = r.height;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, hh);
    if (v.phase !== 'running') return;
    const e = v.elapsed + (performance.now() - at), span = Math.max(12000, e * 1.15), top = Math.max(2, Math.pow(2, span / v.doubleMs));
    g.beginPath();
    for (let i = 0; i <= 60; i++) { const t = e * i / 60, m = Math.pow(2, t / v.doubleMs); const px = 8 + (w - 16) * t / span, py = hh - 8 - (hh - 16) * (m - 1) / (top - 1); i ? g.lineTo(px, py) : g.moveTo(px, py); }
    g.strokeStyle = '#e9b872'; g.lineWidth = 3; g.stroke();
    if (rocket.complete && rocket.naturalWidth) {
      const f = t => [8 + (w - 16) * t / span, hh - 8 - (hh - 16) * (Math.pow(2, t / v.doubleMs) - 1) / (top - 1)];
      const [x1, y1] = f(e), [x0, y0] = f(e * 59 / 60), rw = 46, rh = rw * rocket.naturalHeight / rocket.naturalWidth;
      g.save(); g.translate(Math.min(w - rw / 2, Math.max(rw / 2, x1)), Math.min(hh - rh / 2, Math.max(rh / 2, y1))); g.rotate(Math.atan2(y1 - y0, x1 - x0) + Math.PI / 4);
      g.drawImage(rocket, -rw / 2, -rh / 2, rw, rh); g.restore();
    }
  }
  function crashLoop() {
    cancelAnimationFrame(raf);
    const v = views.crash;
    if (game !== 'crash' || !box) return;
    if (v?.phase === 'running') {
      const m = crashMult(v), el = box.querySelector('[data-ac-mult]'), out = box.querySelector('[data-ac-cashout]');
      if (el) el.textContent = x2(m);
      if (out && v.mine) out.textContent = money(Math.floor(v.mine.bet * Math.floor(m * 100) / 100));
      drawCrash();
    } else { const t = box.querySelector('[data-ac-time]'); if (t && v?.remaining != null) t.textContent = secs(v.remaining - (performance.now() - at)); }
    raf = requestAnimationFrame(crashLoop);
  }

  // ── 🔫 총쏘기 서바이벌 ──
  function partyHtml() {
    const v = views.party;
    if (!v) return '<p class="ac-empty">판을 불러오는 중…</p>';
    let html = summary([['판돈', v.stake ? money(v.stake) + ' C' : '첫 참가자가 정해요'], ['참가', v.players.length + ' / ' + v.maxPlayers + '명'], ['우승 상금', v.players.length > 1 ? money(v.prize) + ' C' : '—', 'win']]);
    const lastEv = v.events.at(-1);
    html += '<div class="ac-stage ac-party">' + pic('pistol', 'ac-hero wide') + '<ul class="ac-seats">' + (v.players.length ? v.players.map((p, i) => '<li class="' + [p.me ? 'me' : '', p.dead ? 'dead' : '', p.winner ? 'won' : '', v.phase === 'playing' && lastEv?.seat === i ? 'turn' : ''].join(' ') + '"><b role="img" aria-label="' + (p.dead ? '탈락' : p.winner ? '우승' : '생존') + '">' + (p.dead ? pic('blast', 'ac-seat') : p.winner ? pic('prize-6', 'ac-seat') : '<img class="ac-pic ac-seat" src="assets/photo/choco-coin.webp" alt="" draggable="false">') + '</b>' + h(p.name) + '</li>').join('') : '<li class="ac-empty">아직 아무도 없어요</li>') + '</ul>';
    if (v.phase === 'playing' && lastEv) html += banner(h(v.players[lastEv.seat]?.name || '') + (lastEv.bang ? ' — 탕!' : ' — 찰칵, 살았어요'), lastEv.bang ? 'loss' : '');
    if (v.phase === 'done' && v.last) html += banner(h(v.last.winner) + '님 최후의 1인! ' + money(v.last.prize) + '초코', 'win');
    html += '</div>';
    if (v.phase === 'idle' || (v.phase === 'lobby' && !v.joined)) html += '<div class="casino-controls">' + (v.phase === 'idle' ? field('acStake', '판돈 초코', input.stake, 'min="10" max="5000" step="1"') : '') + '<button class="primary" data-ac="partyJoin">' + (v.phase === 'idle' ? '판 열기' : money(v.stake) + '초코 내고 참가') + '</button></div>';
    else if (v.phase === 'lobby') html += '<div class="inline-actions"><button data-ac="partyLeave">참가 취소(돌려받기)</button></div>';
    html += '<p class="status-note">' + (v.phase === 'lobby' ? (v.startIn != null ? '<b data-ac-left="startIn">' + secs(v.startIn) + '</b>초 뒤 출발' : '두 번째 참가자를 기다려요 · <b data-ac-left="closesIn">' + secs(v.closesIn) + '</b>초 뒤 자동 환불') : v.phase === 'playing' ? '방아쇠 ' + v.shots + '번째' : '2~6명 · 판돈은 같은 금액 · 우승자가 판돈 합계의 96%') + '</p>';
    return html;
  }

  // ── 🤠 총잡이 결투 ──
  function duelHtml() {
    const v = views.duel;
    if (!v) return '<p class="ac-empty">결투장을 불러오는 중…</p>';
    const me = v.players.find(p => p.me), foe = v.players.find(p => !p.me);
    let html = summary([['판돈', v.stake ? money(v.stake) + ' C' : '신청자가 정해요'], ['이기면 받는 돈', v.stake ? money(v.prize) + ' C' : '—', 'win'], ['상대', foe ? h(foe.name) : me ? '기다리는 중' : '—']]);
    html += '<div class="ac-stage ac-duel ' + v.phase + '"><div class="ac-faceoff">' + pic('pistol', 'ac-hero flip') + pic('pistol', 'ac-hero') + '</div>';
    if (v.phase === 'ready' || v.phase === 'fire') {
      html += '<p class="ac-duel-sign" aria-live="assertive">' + (v.fire ? '발사!' : '기다려…') + '</p>';
      if (me) html += '<button class="ac-shoot' + (v.fire ? ' go' : '') + '" data-ac="shoot">' + (v.fire ? '쏘기!' : '아직 쏘지 마세요') + '</button>';
      else html += '<p class="ac-empty">' + v.players.map(p => h(p.name)).join(' vs ') + ' 결투 중</p>';
    } else if (v.phase === 'done' && v.last) html += duelEnd(v.last);
    else if (v.phase === 'lobby') html += '<p class="ac-empty">' + h(v.players[0]?.name || '') + '님이 ' + money(v.stake) + '초코 결투 상대를 찾고 있어요.</p>';
    else html += '<p class="ac-empty">판돈을 걸고 결투를 신청해요. \'발사!\' 신호 뒤 서버에 먼저 도착한 사격이 이겨요.</p>';
    html += '</div>';
    if (v.phase === 'idle' || (v.phase === 'lobby' && !v.joined)) html += '<div class="casino-controls">' + (v.phase === 'idle' ? field('acStake', '판돈 초코', input.stake, 'min="10" max="5000" step="1"') : '') + '<button class="primary" data-ac="duelJoin">' + (v.phase === 'idle' ? '결투 신청' : money(v.stake) + '초코 걸고 받아들이기') + '</button></div>';
    else if (v.phase === 'lobby') html += '<div class="inline-actions"><button data-ac="duelLeave">신청 취소(돌려받기)</button></div><p class="status-note"><b data-ac-left="closesIn">' + secs(v.closesIn) + '</b>초 안에 상대가 없으면 돌려 드려요.</p>';
    return html;
  }
  const duelEnd = l => l.how === 'timeout' ? banner('둘 다 쏘지 않아 판돈을 돌려 드렸어요.') : banner(h(l.winner) + '님 승리! ' + (l.how === 'foul' ? h(l.loser) + '님이 신호 전에 쏴서 반칙패' : '반응 ' + l.reaction + 'ms') + ' · ' + money(l.prize) + '초코', 'win');

  function paint() {
    if (!box) return;
    const focused = document.activeElement?.id;
    const html = STEP.includes(game) ? stepHtml() : ONE.includes(game) ? oneHtml() : game === 'beg' ? begHtml() : game === 'gift' ? giftHtml() : game === 'crash' ? crashHtml() : game === 'party' ? partyHtml() : duelHtml();
    box.innerHTML = html;
    const res = box.querySelector('.ac-result'), key = res ? game + '|' + fxSeq + '|' + res.textContent : game;
    if (fxKey !== null && key !== fxKey && res && (res.classList.contains('win') || res.classList.contains('loss'))) fx(box.querySelector('.ac-stage') || box, res.classList.contains('win') ? 'win' : 'loss', game);
    fxKey = key;
    const cw = box.querySelector('.ac-cylwrap'); // 새로 그려도 직전 각도에서 돌아가게 한다
    if (cw) { const deg = Number(cw.dataset.deg), id = cw.dataset.id; cylAt = {id, deg}; if (String(cw.style.transform) !== 'rotate(' + deg + 'deg)') { void cw.offsetWidth; cw.style.transform = 'rotate(' + deg + 'deg)'; } }
    clearTimeout(resetT);
    if (res && game !== 'crash' && game !== 'party' && game !== 'duel' && game !== 'gift') { // 결과를 잠깐 보여 준 뒤 첫 화면으로
      const g = game, r = round();
      resetT = setTimeout(() => { if (game !== g || !box) return; if (STEP.includes(g)) { if (r?.done) doneId[g] = r.id; } else delete last[g]; paint(); }, 4800);
    }
    if (focused && box.querySelector('#' + focused)) box.querySelector('#' + focused).focus();
    if (game === 'crash') { drawCrash(); crashLoop(); }
  }
  async function run(op, payload, keep) {
    try { const data = await act(op, payload); if (keep) { last[game] = {...data.result}; fxSeq++; } refresh(); return data; } catch (e) { toast(e.message); refresh(); }
  }
  function onInput(e) {
    const id = e.target.id, n = Number(e.target.value);
    if (id === 'acBet') input.bet = n; else if (id === 'acAuto') input.auto = e.target.value; else if (id === 'acStake') input.stake = n;
    else if (id === 'acMines') input.mines = n; else if (id === 'acGift') { input.gift = n; const s = box.querySelectorAll('.ac-summary strong')[1]; if (s) s.textContent = money(Math.floor(n * 0.95)) + ' C'; }
    else if (id === 'acTo') input.to = e.target.value; else if (id === 'acNum') input.choice.num = n;
    else if (id === 'acChoice') { input.choice[game] = e.target.value; if (game === 'wheel') paint(); }
  }
  async function onClick(e) {
    const b = e.target.closest('[data-ac]');
    if (!b || b.disabled) return;
    const kind = b.dataset.ac, r = round();
    if (kind === 'goto') { refresh(b.dataset.game); return; }
    if (kind === 'start') await run('arcadeStart', game === 'mines' ? {game, bet: input.bet, mines: input.mines} : {game, bet: input.bet});
    else if (kind === 'move') { b.disabled = true; await run('arcadeMove', {roundId: r.id, move: b.dataset.move}); }
    else if (kind === 'pick') { b.disabled = true; await run('arcadeMove', {roundId: r.id, move: 'pick', cell: Number(b.dataset.cell)}); }
    else if (kind === 'play') {
      if (game === 'luckybox') await run('play', {game, bet: BOXES[b.dataset.choice][1], choice: b.dataset.choice}, true);
      else { const c = input.choice[game] || (game === 'baccarat' ? 'player' : 'red'); await run('play', {game, bet: input.bet, choice: c === 'num' ? 'n' + (input.choice.num ?? 7) : c}, true); }
    } else if (kind === 'beg') await run('beg', {}, true);
    else if (kind === 'gift') { b.disabled = true; send({game: 'gift', op: 'send', to: input.to, amount: input.gift}); }
    else if (kind === 'crashBet') { b.disabled = true; send({game: 'crash', op: 'bet', bet: input.bet, auto: input.auto === '' ? null : Number(input.auto)}); }
    else if (kind === 'cash') { b.disabled = true; send({game: 'crash', op: 'cash'}); }
    else if (kind === 'partyJoin') { b.disabled = true; send({game: 'party', op: 'join', stake: views.party?.phase === 'lobby' ? views.party.stake : input.stake}); }
    else if (kind === 'partyLeave') send({game: 'party', op: 'leave'});
    else if (kind === 'duelJoin') { b.disabled = true; send({game: 'duel', op: 'join', stake: views.duel?.phase === 'lobby' ? views.duel.stake : input.stake}); }
    else if (kind === 'duelLeave') send({game: 'duel', op: 'leave'});
    else if (kind === 'shoot') { b.disabled = true; send({game: 'duel', op: 'shoot'}); }
  }
  // 로비 남은 시간은 받은 시각부터 줄여서 보여 준다(판정은 서버 시각)
  setInterval(() => {
    if (!box || !['party', 'duel'].includes(game)) return;
    const v = views[game];
    box.querySelectorAll('[data-ac-left]').forEach(el => { const ms = v?.[el.dataset.acLeft]; if (ms != null) el.textContent = secs(ms - (performance.now() - at)); });
  }, 500);

  return {
    mount(el, next) {
      if (next !== game) fxKey = null;
      box = el; game = next;
      el.addEventListener('click', onClick);
      el.addEventListener('input', onInput);
      el.addEventListener('change', onInput);
      watch(ROOM_GAMES.includes(next) ? next : null);
      paint();
    },
    unmount() { box = null; game = null; cancelAnimationFrame(raf); watch(null); },
    update(g, view) { views[g] = view; if (g === game) { at = performance.now(); paint(); } },
    error(g, msg) { toast(msg); if (g === game) paint(); },
    gift(m) {
      toast(m.dir === 'sent' ? m.to + '님에게 ' + money(m.amount) + '초코를 보냈어요(받는 몫 ' + money(m.net) + ').' : m.from + '님이 초코 ' + money(m.amount) + '을 선물했어요!');
      if (game === 'gift') refresh();
    },
    rewatch() { if (watching) send({game: watching, op: 'watch', on: true}); },
    get watching() { return watching; },
  };
}
