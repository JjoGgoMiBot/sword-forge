import {chips,chipStacks} from './chips.js?v=2';
import {dealCards,playLandVfx} from './vfx.js?v=1';
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

export function createPoker({money, h, send, toast, balance, sound}) {
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
    const hue = [...String(s.name || '?')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7), avatar = '<span class="pk-avatar' + (turn ? ' ticking' : '') + '" style="--hue:' + hue + '"><i>' + h([...String(s.name || '?')][0] || '?') + '</i></span>';
    return '<div class="' + cls + '">' + badge + '<div class="pk-cards">' + cards + '</div>' + avatar + '<strong>' + h(s.name) + (s.away ? ' <small>(연결 끊김)</small>' : '') + '</strong><span class="pk-stack">' + money(s.stack) + '</span>' + (won ? '<span class="pk-won">+' + money(won.amount) + '</span>' : handName || last) + (turn ? '<span class="pk-timer" data-poker-timer></span>' : '') + '</div>';
  }

  function statusText() {
    if (!st) return '테이블을 불러오는 중…';
    if (st.phase === 'idle') return st.seats.some(Boolean) ? '<span class="pk-wait">다른 사람을 기다리는 중<i class="pk-dots"><u>.</u><u>.</u><u>.</u></i></span> 카운트다운이 끝나면 첫 판을 시작해요.' : '빈 테이블이에요. 앉으면 봇이 함께 앉아 바로 시작해요.';
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
    const clamp = v => Math.max(min, Math.min(max, Math.round(v / 10) * 10));
    const potTo = st.currentBet + o.pot + o.toCall;
    const sizes = [['½팟', clamp(st.currentBet + o.pot / 2)], ['¾팟', clamp(st.currentBet + (o.pot + o.toCall) * 0.75)], ['팟', clamp(potTo)], ['올인', max]];
    return '<div class="pk-actions" role="group" aria-label="내 행동">'
      + '<button class="pk-fold" data-poker="act" data-move="fold">폴드</button>'
      + '<button class="pk-call" data-poker="act" data-move="' + (o.canCheck ? 'check' : 'call') + '">' + (o.canCheck ? '체크' : '콜<small>' + money(o.toCall) + '</small>') + '</button>'
      + (o.canRaise ? '<button class="pk-raise-btn" data-poker="act" data-move="raise">' + (raise >= max ? '올인' : '레이즈') + '<small id="pkRaiseBtn">' + money(raise) + '</small></button>'
        + '<div class="pk-raise"><div class="pk-raise-head"><span id="pkRaiseText">' + money(raise) + '</span><span id="pkRaisePreview">' + chipStacks(raise, 4) + '</span></div>'
        + '<label class="pk-range"><span class="muted">' + money(min) + '</span><input type="range" id="pkRaise" min="' + min + '" max="' + max + '" step="10" value="' + raise + '" aria-label="레이즈 금액"><span class="muted">' + money(max) + '</span></label>'
        + '<div class="pk-quick">' + sizes.map(([t, v]) => '<button data-poker="size" data-to="' + v + '">' + t + '</button>').join('') + '</div></div>' : '')
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
      + '<details class="pk-quick-rules"><summary>포커 간단 규칙</summary><div><p><b>내 패 2장 + 공용 카드 5장</b> 중 가장 좋은 5장으로 승부해요.</p><p>프리플랍(내 패) → 플랍(공용 3장) → 턴(+1장) → 리버(+1장) 순서로 베팅해요.</p><ul><li><b>폴드</b>: 이번 판 포기</li><li><b>체크</b>: 맞출 돈이 없을 때 넘기기</li><li><b>콜</b>: 상대 베팅액에 맞추기</li><li><b>레이즈 / 올인</b>: 베팅 올리기 / 남은 칩 모두 걸기</li></ul><p>높은 족보 순: 스트레이트 플러시(로열 포함) → 포카드 → 풀하우스 → 플러시 → 스트레이트 → 트리플 → 투페어 → 원페어 → 하이카드.</p><p>끝까지 남은 사람들이 패를 공개해 승자가 팟을 가져가요. 모두 폴드하면 마지막 한 명이 이겨요.</p></div></details><div class="pk-table"><div class="pk-felt">'+(st.pot?'<div class="pk-pot">'+chipStacks(st.pot,8)+'<b>팟 '+money(st.pot)+'</b></div>':'')+'<div class="pk-board">' + board + '</div><p class="pk-status" aria-live="polite">' + statusText() + ' <span data-poker-next></span></p>' + (st.you != null ? '<button class="pk-exit" data-poker="leave">나가기</button>' : '') + '</div>' + st.seats.map(seatHtml).join('') + st.seats.map((s, i) => s && s.bet ? '<div class="pk-bets pkb' + place(i, st.you) + '">' + chipStacks(s.bet) + '<b>' + money(s.bet) + '</b></div>' : '').join('') + '</div>'
      + (me && me.cards ? '<div class="pk-mine">' + me.cards.map(c => card(c, 'lg')).join('') + '<div><small class="muted">내 패</small><strong>' + h(st.myHand || (me.folded ? '폴드' : '프리플랍')) + '</strong>' + (st.options ? '<span class="pk-clock" data-poker-timer></span>' : '') + (st.options && st.options.toCall > 0 ? '<b class="pk-tocall">콜 ' + money(st.options.toCall) + '</b>' : '') + '</div></div>' : '')
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
    const total = st.limits?.actionMs || 20000;
    box.querySelectorAll('.pk-avatar.ticking').forEach(el => el.style.setProperty('--t', r == null ? 1 : Math.max(0, Math.min(1, r / total))));
    const next = box.querySelector('[data-poker-next]');
    if (next) next.innerHTML = n != null && st.phase !== 'idle' ? '· 다음 판 ' + Math.ceil(n / 1000) + '초' : n != null && st.seats.some(Boolean) ? '<b class="pk-count">' + Math.ceil(n / 1000) + '초 후 시작</b>' : '';
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
    const pv = box.querySelector('#pkRaisePreview'); if (pv) pv.innerHTML = chipStacks(raise, 4);
    const btn = box.querySelector('[data-move="raise"]');
    if (btn) btn.firstChild.textContent = raise >= max ? '올인' : '레이즈';
  }
  function onInput(event) {
    if (event.target.id === 'pkRaise') { raise = Number(event.target.value); syncRaise(); }
    if (event.target.id === 'pkBuyIn') buyIn = Number(event.target.value);
  }

  // 칩 이동 효과: 베팅이 늘면 그 자리에서 가운데 팟으로, 판이 끝나면 팟에서 이긴 사람 자리로 칩이 날아간다.
  function flyChips(from, to, count, big) {
    const table = box?.querySelector('.pk-table');
    if (!table || !from || !to || !table.animate) return;
    const t = table.getBoundingClientRect(), a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    const ax = a.left + a.width / 2 - t.left, ay = a.top + a.height / 2 - t.top;
    const dx = b.left + b.width / 2 - t.left - ax, dy = b.top + b.height / 2 - t.top - ay;
    for (let i = 0; i < count; i++) {
      const chip = document.createElement('span');
      chip.className = 'pk-fly chip-photo' + (big ? ' big' : '');chip.style.backgroundPosition = ['0% 0%','50% 0%','100% 0%','0% 100%','50% 100%','100% 100%'][i % 6];
      chip.style.left = ax + 'px'; chip.style.top = ay + 'px';
      table.appendChild(chip);
      const jx = (Math.random() - 0.5) * 18, jy = (Math.random() - 0.5) * 18;
      const anim = chip.animate([
        {transform: 'translate(-50%,-50%) scale(.6)', opacity: 0},
        {transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.15},
        {transform: 'translate(calc(-50% + ' + (dx + jx) + 'px),calc(-50% + ' + (dy + jy) + 'px)) scale(.9)', opacity: 1},
      ], {duration: 520 + i * 70, delay: i * 60, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both'});
      anim.onfinish = () => chip.remove();
    }
  }
  function chipMotion(prev, now) {
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    try {
      const felt = box.querySelector('.pk-felt'), seatEl = i => box.querySelector('.pk-seat.pos' + place(i, now.you));
      if (now.hand === prev.hand) now.seats.forEach((s, i) => {
        const before = prev.seats[i]?.bet || 0;
        if (s && s.bet > before) sound?.cue?.(Array.from({length: Math.min(4, 1 + Math.floor((s.bet - before) / 100))}, (_, k) => ({at: k * 70, id: 'chip.place'}))), flyChips(seatEl(i), felt, Math.min(5, 1 + Math.floor((s.bet - before) / 100)), s.me);
      });
      if (now.phase === 'showdown' && prev.phase !== 'showdown') (now.result?.winners || []).forEach(w => {
        const mine = now.you === w.seat;
        flyChips(felt, seatEl(w.seat), mine ? 9 : 5, mine);
        sound?.cue?.(Array.from({length: mine ? 6 : 3}, (_, k) => ({at: 400 + k * 80, id: 'chip.place'})));
      });
    } catch { /* 효과 실패는 게임을 막지 않는다 */ }
  }

  return {
    mount(el) {
      box = el;
      el.addEventListener('click', onClick);
      el.addEventListener('input', onInput);
      paint();
    },
    update(state) {
      const previous=st,oldBoard=st?.board?.length||0,newHand=st&&st.hand!==state.hand;
      const handChanged = !st || st.hand !== state.hand || st.toAct !== state.toAct;
      st = state; at = performance.now();
      if (handChanged) raise = null;
      // 바이인 입력 중이면 숫자 칸을 다시 그리지 않도록 포커스를 지킨다
      const focused = document.activeElement?.id;
      paint();
      if(previous&&box?.isConnected){const cards=newHand?box.querySelectorAll('.pk-seat .pk-card'):state.board.length>oldBoard?[...box.querySelectorAll('.pk-board .pk-card')].slice(oldBoard,state.board.length):[];dealCards(cards,sound,{spacing:100});if(state.phase==='showdown'&&previous.phase!=='showdown')playLandVfx(box.querySelector('.pk-table'),'win');}
      if (previous && box?.isConnected) chipMotion(previous, state);
      if (focused === 'pkBuyIn' || focused === 'pkRaise') box?.querySelector('#' + focused)?.focus();
    },
    tick: tickTimers,
    get state() { return st; },
  };
}
