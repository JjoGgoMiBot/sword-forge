// 마을 공지(당첨·입장·퇴장) 띠와 초코 랭킹 목록.
// 공지는 한 번에 하나씩 무대 위쪽에 보여 주고, 밀리면 줄 서서 기다린다.

export const NOTICE_UI = Object.freeze({win: 5000, join: 2600, leave: 2600, queue: 6});

// 오래 밀린 입장·퇴장은 버리고 당첨은 남긴다(사람들이 몰려도 당첨 공지는 꼭 보이게)
export function enqueue(queue, notice, max = NOTICE_UI.queue) {
  const next = [...queue, notice];
  while (next.length > max) {
    const i = next.findIndex(n => n.kind !== 'win');
    next.splice(i < 0 ? 0 : i, 1);
  }
  return next;
}

export function mountNotices(el, {onWin} = {}) {
  let queue = [], timer = null;
  const showNext = () => {
    const notice = queue.shift();
    if (!notice) { el.hidden = true; el.className = 'notice-banner'; timer = null; return; }
    el.textContent = notice.text;
    el.className = 'notice-banner ' + (notice.kind === 'win' ? 'win' : 'quiet');
    el.hidden = false;
    timer = setTimeout(showNext, NOTICE_UI[notice.kind] || NOTICE_UI.join);
  };
  return {
    push(notice) {
      if (!notice || typeof notice.text !== 'string') return;
      if (notice.kind === 'win') onWin?.(notice);
      queue = enqueue(queue, notice);
      if (!timer) showNext();
    },
    clear() { queue = []; clearTimeout(timer); timer = null; el.hidden = true; },
  };
}

// 순위 목록. 텍스트만 넣는다(이름은 사용자 입력이라 innerHTML 금지)
export function renderRanking(list, ranking, meName = '') {
  list.replaceChildren();
  if (!ranking.length) { const p = document.createElement('li'); p.className = 'rank-empty'; p.textContent = '아직 기록이 없어요. 한 판 하면 이름이 올라가요.'; list.append(p); return; }
  for (const r of ranking) {
    const li = document.createElement('li');
    if (meName && r.name === meName) li.className = 'mine';
    const rank = document.createElement('span'); rank.className = 'rank-no'; rank.textContent = r.rank;
    const name = document.createElement('span'); name.className = 'rank-name'; name.textContent = r.name;
    const bal = document.createElement('strong'); bal.textContent = Number(r.balance).toLocaleString('ko-KR');
    li.append(rank, name, bal); list.append(li);
  }
}
