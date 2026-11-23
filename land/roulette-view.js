// Display only the server's public view. Never infer or reveal a live round's bullet.
export function rouletteDisplay(round) {
  const safe = Math.max(0, Math.min(5, Math.trunc(Number(round?.shots) || 0)));
  const done = round?.done === true;
  const bang = done && round.outcome === 'bang';
  const reveal = done && Number.isInteger(round.bullet) && round.bullet >= 0 && round.bullet < 6;
  const states = Array.from({length: 6}, (_, i) => reveal
    ? i === round.bullet ? bang ? 'fired' : 'bullet' : 'empty'
    : i < safe ? 'empty' : 'unknown');
  return {safe, bang, reveal, states, angle: -safe * 60,
    label: round ? `생존 ${safe} / 5` : '6칸 · 총알 1발',
    note: reveal ? '판 종료 · 총알 위치 공개' : '총알 1발 · 남은 약실은 비공개'};
}

export function rouletteScene(round) {
  const v = rouletteDisplay(round);
  const key = String(round?.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const chambers = v.states.map((state, i) => {
    const a = (-90 + i * 60) * Math.PI / 180;
    const x = (120 + Math.cos(a) * 66).toFixed(3), y = (120 + Math.sin(a) * 66).toFixed(3);
    let content = `<circle r="25" fill="url(#rr-hole)" stroke="${state === 'empty' ? '#83bb9f' : '#a7a99d'}" stroke-width="2"/>`;
    if (state === 'unknown') content += `<circle r="20" fill="url(#rr-cover)" stroke="#747d83"/><path d="M-10-9 Q0-15 10-9" fill="none" stroke="#a4adb1" opacity=".35"/><text text-anchor="middle" dominant-baseline="central" fill="#d1d7d6" font-family="system-ui,sans-serif" font-size="17" font-weight="600" transform="rotate(${-v.angle})">?</text>`;
    if (state === 'empty') content += '<circle r="17" fill="#0c1215" stroke="#1e302f"/><circle cy="-1" r="12" fill="#080c0e"/>';
    if (state === 'bullet' || state === 'fired') content += `<circle r="20" fill="url(#rr-brass)" stroke="${state === 'fired' ? '#ec9170' : '#d7bb76'}" stroke-width="2"/><circle r="9" fill="#9a763a" stroke="#eddb9d"/><circle r="6" fill="${state === 'fired' ? '#48332b' : '#d2b56e'}"/>`;
    if (state === 'fired') content += '<circle r="26" fill="none" stroke="#ff9f73" stroke-width="3"/>';
    return `<g transform="translate(${x} ${y})" data-chamber="${i}" data-state="${state}">${content}</g>`;
  }).join('');
  const notches = Array.from({length: 6}, (_, i) => `<path d="M111 12 Q120 22 129 12" transform="rotate(${i * 60 + 30} 120 120)" fill="#111a20" stroke="#9b9d91" opacity=".7"/>`).join('');
  const svg = `<svg class="ac-cyl-diagram" viewBox="0 0 240 240" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="rr-rim" x2=".8" y2="1"><stop stop-color="#b8c0bd"/><stop offset=".3" stop-color="#545e65"/><stop offset=".6" stop-color="#171f28"/><stop offset=".85" stop-color="#969f9f"/><stop offset="1" stop-color="#242d36"/></linearGradient>
      <radialGradient id="rr-steel" cx=".35" cy=".25" r=".85"><stop stop-color="#57646a"/><stop offset=".58" stop-color="#26333c"/><stop offset="1" stop-color="#111a23"/></radialGradient>
      <radialGradient id="rr-hole"><stop stop-color="#030608"/><stop offset=".7" stop-color="#080d10"/><stop offset="1" stop-color="#59636a"/></radialGradient>
      <radialGradient id="rr-cover" cx=".35" cy=".25"><stop stop-color="#607078"/><stop offset=".55" stop-color="#384851"/><stop offset="1" stop-color="#1e2a32"/></radialGradient>
      <radialGradient id="rr-brass" cx=".3" cy=".25"><stop stop-color="#f2dba2"/><stop offset=".45" stop-color="#c5a263"/><stop offset=".8" stop-color="#84612f"/><stop offset="1" stop-color="#b5914d"/></radialGradient>
    </defs>
    <circle cx="120" cy="123" r="112" fill="#05090d" opacity=".6"/>
    <circle cx="120" cy="120" r="110" fill="url(#rr-rim)" stroke="#131d26" stroke-width="2"/>
    <circle cx="120" cy="120" r="103" fill="url(#rr-steel)" stroke="#a0a99f" stroke-opacity=".4"/>
    <circle cx="120" cy="120" r="96" fill="none" stroke="#c7b77e" stroke-opacity=".22"/>
    ${notches}${chambers}
    <path d="M120 91 L130 104 L145 105 L139 120 L145 135 L130 137 L120 150 L110 137 L95 135 L101 120 L95 105 L110 104 Z" fill="url(#rr-rim)" stroke="#1a242b" stroke-width="2"/>
    <circle cx="120" cy="120" r="16" fill="url(#rr-cover)" stroke="#a6aca4"/>
    <circle cx="120" cy="120" r="9" fill="#1b2831" stroke="#5f6f77"/>
  </svg>`;
  return `<div class="ac-cylinder${v.bang ? ' boom' : ''}" role="img" aria-label="${v.label}. ${v.note}"><span class="ac-cyl-pointer" aria-hidden="true"></span><span class="ac-cylwrap" data-round="${key}" style="transform:rotate(${v.angle}deg)">${svg}</span><b>${v.label}</b></div><p class="ac-cyl-note">${v.note}</p>`;
}
