// 포커 테이블 화면. 서버가 보낸 view(내 패·공개된 패만 담김)를 그리고, 누른 행동을 send()로 돌려보낸다.
// 상태는 서버만 정한다. 여기서는 그리기와 입력값(레이즈·바이인) 기억만 한다.
const SUIT = {s: '♠', h: '♥', d: '♦', c: '♣'};
const RANK = {T: '10'};
// 내 자리를 아래 가운데로 돌려 앉힌다. 위치 번호 → CSS 클래스 pos0~pos5
const place = (seat, you) => you == null ? seat : (seat - you + 6) % 6;
const LAST = {fold: '폴드', check: '체크', call: '콜', raise: '레이즈', allin: '올인', blind: '블라인드'};

export function card(c, size = '') {
  if (!c) return '<span class="pk-card back ' + size + '" aria-label="가려진 카드"></span>';
  const red = c[1] === 'h' || c[1] === 'd';
  return '<span class="pk-card ' + size + (red ? ' red' : '') + '" aria-label="' + (RANK[c[0]] || c[0]) + SUIT[c[1]] + '"><b>' + (RANK[c[0]] || c[0]) + '</b><i>' + SUIT[c[1]] + '</i></span>';
}

export function createPoker({money, h, send, toast, balance}) {
  let st = null, at = 0, raise = null, buyIn = null, box = null;
  const remain = ms => ms == null ? null : Math.max(0, ms - (performance.now() - at));

  function seatHtml(s, i) {
    const pos = 'pos' + place(i, st.you);
    if (!s) {
      const can = st.you == null;
      return '<div class="pk-seat empty ' + pos + '">' + (can ? '<button data-poker="sit" data-seat="' + i + '">빈자리<br><small>앉기</small></button>' : '<span class="muted">빈자리</span>') + '</div>';
    }
    const turn = st.toAct === i && st.phase !== 'showdown' && st.phase !== 'idle';
    const won = st.result?.winners?.find(w => w.seat === i);
    const cls = ['pk-seat', pos, s.me ? 'me' : '', s.folded ? 'folded' : '', turn ? 'turn' : '', won ? 'won' : ''].join(' ');
    const cards = s.cards ? s.cards.map(c => card(c, 'sm')).join('') : s.hidden ? card(null, 'sm') + card(null, 'sm') : '';
    const badge = st.button === i ? '<em class="pk-dealer" title="딜러 버튼">D</em>' : '';
    const last = s.last ? '<span class="pk-last ' + s.last.type + '">' + (LAST[s.last.type] || '') + (s.last.timeout ? ' (시간)' : '') + '</span>' : '';
    const handName = st.result?.hands?.[i] ? '<span class="pk-hand-name">' + h(st.result.hands[i]) + '</span>' : '';
    return '<div class="' + cls + '">' + badge + '<div class="pk-cards">' + cards + '</div><strong>' + h(s.name) + (s.away ? ' <small>(연결 끊김)</small>' : '') + '</strong><span class="pk-stack">' + money(s.stack) + '</span>' + (won ? '<span class="pk-won">+' + money(won.amount) + '</span>' : handName || last) + (s.bet ? '<span class="pk-bet">' + money(s.bet) + '</span>' : '') + (turn ? '<span class="pk-timer" data-poker-timer></span>' : '') + '</div>';
  }

  function statusText() {
    if (!st) return '테이블을 불러오는 중…';
    if (st.phase === 'idle') return st.seats.some(Boolean) ? '곧 첫 판을 시작해요.' : '빈 테이블이에요. 앉으면 봇이 함께 앉아 바로 시작해요.';
    if (st.phase === 'showdown') {
      const w = st.result?.winners || [];
      return w.map(x => h(x.name) + ' ' + money(x.amount) + '초코' + (x.hand ? ' · ' + h(x.hand) : '')).join(', ') + (st.result?.showdown ? '' : ' (모두 폴드)');
    }
    const who = st.seats[st.toAct];
    return who ? (who.me ? '<b>내 차례예요.</b>' : h(who.name) + ' 차례') : '';
  }

  function actionsHtml() {
    const o = st.options;
    if (!o) return '';
    const min = o.minTo, max = o.maxTo;
    if (raise == null || raise < min || raise > max) raise = min;
    const half = Math.max(min, Math.min(max, st.currentBet + Math.round(o.pot / 2))), pot = Math.max(min, Math.min(max, st.currentBet + o.pot + o.toCall));
    return '<div class="pk-actions" role="group" aria-label="내 행동">'
      + '<button data-poker="act" data-move="fold">폴드</button>'
      + '<button class="primary" data-poker="act" data-move="' + (o.canCheck ? 'check' : 'call') + '">' + (o.canCheck ? '체크' : '콜 ' + money(o.toCall)) + '</button>'
      + (o.canRaise ? '<div class="pk-raise"><div class="pk-quick"><button data-poker="size" data-to="' + min + '">최소</button><button data-poker="size" data-to="' + half + '">½팟</button><button data-poker="size" data-to="' + pot + '">팟</button><button data-poker="size" data-to="' + max + '">올인</button></div>'
        + '<label class="pk-range"><input type="range" id="pkRaise" min="' + min + '" max="' + max + '" step="10" value="' + raise + '" aria-label="레이즈 금액"><span id="pkRaiseText">' + money(raise) + '</span></label>'
        + '<button class="primary" data-poker="act" data-move="raise">' + (raise >= max ? '올인 ' : '레이즈 ') + '<span id="pkRaiseBtn">' + money(raise) + '</span></button></div>' : '')
      + '</div>';
  }

  function seatControls() {
    const L = st.limits;
    if (st.you != null) return '<div class="pk-controls"><button class="quiet" data-poker="leave">자리에서 일어나기</button><small class="muted">판 중이면 폴드되고 남은 칩만 지갑으로 돌아가요.</small></div>';
    const wallet = balance();
    if (buyIn == null) buyIn = Math.max(L.minBuyIn, Math.min(L.defaultBuyIn, L.maxBuyIn, Math.floor(wallet / 10) * 10));
    const poor = wallet < L.minBuyIn;
    return '<div class="pk-controls"><label>바이인<input id="pkBuyIn" type="number" inputmode="numeric" min="' + L.minBuyIn + '" max="' + L.maxBuyIn + '" step="10" value="' + buyIn + '"></label><small class="' + (poor ? 'warn' : 'muted') + '">' + (poor ? '바이인은 최소 ' + money(L.minBuyIn) + '초코예요. 출석·퀴즈로 모아 오세요.' : '빈자리를 눌러 앉아요. ' + money(L.minBuyIn) + '~' + money(L.maxBuyIn) + '초코') + '</small></div>';
  }

  function paint() {
    if (!box || !box.isConnected) return;
    if (!st) { box.innerHTML = '<p class="status-note">테이블을 불러오는 중…</p>'; return; }
    const me = st.you != null ? st.seats[st.you] : null;
    const board = Array.from({length: 5}, (_, k) => st.board[k] ? card(st.board[k]) : '<span class="pk-card slot"></span>').join('');
    box.innerHTML = '<div class="pk-summary"><span>팟 <b>' + money(st.pot || (st.result?.winners || []).reduce((a, w) => a + w.amount, 0)) + '</b></span><span>블라인드 ' + money(st.limits.smallBlind) + '/' + money(st.limits.bigBlind) + '</span><span>' + (st.hand ? '#' + st.hand : '대기') + '</span></div>'
      + '<div class="pk-table"><div class="pk-felt"><div class="pk-board">' + board + '</div><p class="pk-status" aria-live="polite">' + statusText() + ' <span data-poker-next></span></p></div>' + st.seats.map(seatHtml).join('') + '</div>'
      + (me && me.cards ? '<div class="pk-mine">' + me.cards.map(c => card(c, 'lg')).join('') + '<div><small class="muted">내 패</small><strong>' + h(st.myHand || (me.folded ? '폴드' : '프리플랍')) + '</strong>' + (st.options ? '<span class="pk-clock" data-poker-timer></span>' : '') + '</div></div>' : '')
      + actionsHtml() + seatControls();
    tickTimers();
  }

  function tickTimers() {
    if (!box || !st) return;
    const r = remain(st.remainMs), n = remain(st.nextMs);
    box.querySelectorAll('[data-poker-timer]').forEach(el => {
      if (r == null) { el.textContent = ''; return; }
      el.textContent = Math.ceil(r / 1000) + '초';
      el.classList.toggle('low', r < 6000);
    });
    const next = box.querySelector('[data-poker-next]');
    if (next) next.textContent = n != null && st.phase !== 'idle' ? '· 다음 판 ' + Math.ceil(n / 1000) + '초' : n != null && st.seats.some(Boolean) ? '(' + Math.ceil(n / 1000) + '초)' : '';
  }

  function onClick(event) {
    const b = event.target.closest('[data-poker]');
    if (!b || !st) return;
    const kind = b.dataset.poker;
    if (kind === 'sit') {
      const amount = Number(box.querySelector('#pkBuyIn')?.value || buyIn);
      if (amount > balance()) { toast('초코가 부족해요. 바이인을 줄여주세요.'); return; }
      send({op: 'sit', seat: Number(b.dataset.seat), buyIn: amount});
    } else if (kind === 'leave') send({op: 'leave'});
    else if (kind === 'size') { raise = Number(b.dataset.to); syncRaise(); }
    else if (kind === 'act') {
      const move = b.dataset.move;
      box.querySelectorAll('[data-poker="act"]').forEach(x => x.disabled = true);
      send({op: 'act', hand: st.hand, action: move, amount: move === 'raise' ? raise : undefined});
    }
  }
  function syncRaise() {
    const input = box.querySelector('#pkRaise');
    if (input) input.value = raise;
    const max = st.options?.maxTo;
    for (const id of ['pkRaiseText', 'pkRaiseBtn']) { const el = box.querySelector('#' + id); if (el) el.textContent = money(raise); }
    const btn = box.querySelector('[data-move="raise"]');
    if (btn) btn.firstChild.textContent = raise >= max ? '올인 ' : '레이즈 ';
  }
  function onInput(event) {
    if (event.target.id === 'pkRaise') { raise = Number(event.target.value); syncRaise(); }
    if (event.target.id === 'pkBuyIn') buyIn = Number(event.target.value);
  }

  return {
    mount(el) {
      box = el;
      el.addEventListener('click', onClick);
      el.addEventListener('input', onInput);
      paint();
    },
    update(state) {
      const handChanged = !st || st.hand !== state.hand || st.toAct !== state.toAct;
      st = state; at = performance.now();
      if (handChanged) raise = null;
      // 바이인 입력 중이면 숫자 칸을 다시 그리지 않도록 포커스를 지킨다
      const focused = document.activeElement?.id;
      paint();
      if (focused === 'pkBuyIn' || focused === 'pkRaise') box?.querySelector('#' + focused)?.focus();
    },
    tick: tickTimers,
    get state() { return st; },
  };
}
