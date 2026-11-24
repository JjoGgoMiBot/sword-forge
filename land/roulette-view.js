// Display only the server's public view. Never infer or reveal a live round's bullet.
export function rouletteDisplay(round) {
  const safe = Math.max(0, Math.min(5, Math.trunc(Number(round?.shots) || 0)));
  const done = round?.done === true;
  const bang = done && round.outcome === 'bang';
  const reveal = done && Number.isInteger(round.bullet) && round.bullet >= 0 && round.bullet < 6;
  const states = Array.from({length: 6}, (_, i) => reveal
    ? i === round.bullet ? bang ? 'fired' : 'bullet' : 'empty'
    : i < safe ? 'empty' : 'unknown');
  return {safe, bang, reveal, states, angle: -(bang ? safe : Math.max(0,safe-1)) * 60,
    label: round ? `생존 ${safe} / 5` : '6칸 · 총알 1발',
    note: reveal ? '판 종료 · 총알 위치 공개' : '총알 1발 · 남은 약실은 비공개'};
}

export function rouletteScene(round) {
  const v = rouletteDisplay(round);
  const key = String(round?.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const chambers = v.states.map((state, i) => {
    const a = (-90 + i * 60) * Math.PI / 180;
    const x = (50 + Math.cos(a) * 27.5).toFixed(3), y = (50 + Math.sin(a) * 27.5).toFixed(3);
    return `<span class="rr-chamber rr-${state}" data-chamber="${i}" data-state="${state}" style="left:${x}%;top:${y}%"></span>`;
  }).join('');
  return `<div class="ac-cylinder${v.bang ? ' boom' : ''}" role="img" aria-label="${v.label}. ${v.note}"><span class="ac-cyl-pointer" aria-hidden="true"></span><span class="ac-cylwrap rr-photo" data-round="${key}" style="transform:rotate(${v.angle}deg)" aria-hidden="true"><span class="rr-body"></span>${chambers}</span><b>${v.label}</b></div><p class="ac-cyl-note">${v.note}</p>`;
}
