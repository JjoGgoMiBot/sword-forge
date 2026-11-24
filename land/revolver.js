// 러시안 룰렛 약실 배치. 그림 파일 대신 좌표를 계산해 SVG로 그린다 → 칸 수가 몇이든 중심 기준 정다각이다.
// 각도 0 = 위쪽, 시계 방향. 서버가 정한 총알 위치와는 무관하게 화면 배치만 맡는다.
export const STEP_MS = 160; // 한 칸 옆으로 건너가는 시간(style.css .ac-cur 전환과 같은 값)
const C = 100, R = 54; // viewBox 200×200, 중심, 약실 배치 반지름

export const slotAngle = (i, n) => (360 / n) * i;
export function slotPos(i, n, r = R, c = C) {
  const a = slotAngle(i, n) * Math.PI / 180;
  return { x: +(c + r * Math.sin(a)).toFixed(3), y: +(c - r * Math.cos(a)).toFixed(3) };
}

// 지금 방아쇠가 놓인 칸. 살아남은 횟수(shots)만큼 앞으로 와 있다. 서버 shots 는 0 ~ n-1.
export const cursorSlot = (shots, n) => ((shots % n) + n) % n;

// slots: 칸마다 spent(이미 버틴 칸) · cur(지금 칸) · boom(총알이 나온 칸)
export function slotStates(g, n) {
  const shots = g?.shots || 0, cur = cursorSlot(shots, n), boom = !!(g?.done && g.outcome === 'bang');
  return Array.from({ length: n }, (_, i) => ({ i, spent: !!g && i < shots, cur: !!g && i === cur, boom: boom && i === cur }));
}

// prev: 직전에 화면에 그린 {id, shots, done} 또는 null. 새 판이거나 처음 보는 판이면 연출 없음.
export function pullStep(prev, g) {
  if (!g || !prev || String(prev.id) !== String(g.id)) return null;
  if (prev.done || (prev.shots === g.shots && !g.done)) return null;
  if (g.done) return g.outcome === 'bang' ? 'bang' : g.outcome === 'max' ? 'max' : 'cash';
  return g.shots > prev.shots ? 'safe' : null;
}

export function rouletteSvg(g, n = 6, prevShots = null) {
  const st = slotStates(g, n), at = cursorSlot(prevShots ?? g?.shots ?? 0, n), p0 = slotPos(at, n), p1 = slotPos(cursorSlot(g?.shots || 0, n), n);
  const holes = st.map(s => {
    const p = slotPos(s.i, n);
    const live = !s.spent && !s.boom; // 아직 안 당긴 칸에는 황동 탄이 들어 있다
    return '<g class="ac-hole' + (s.spent ? ' spent' : '') + (s.boom ? ' boom' : '') + '" data-slot="' + s.i + '"><circle class="hl" cx="' + p.x + '" cy="' + p.y + '" r="21"/><circle class="bore" cx="' + p.x + '" cy="' + p.y + '" r="19"/>' + (live ? '<image class="brass" href="assets/photo/cartridge.webp" x="' + (p.x - 14.5) + '" y="' + (p.y - 14.5) + '" width="29" height="29"/>' : '') + (s.boom ? '<image href="assets/photo/ac-blast.webp" x="' + (p.x - 34) + '" y="' + (p.y - 34) + '" width="68" height="68"/>' : '') + '</g>';
  }).join('');
  const cur = g ? '<circle class="ac-cur" cx="' + p0.x + '" cy="' + p0.y + '" r="23" data-x="' + (p1.x - p0.x).toFixed(3) + '" data-y="' + (p1.y - p0.y).toFixed(3) + '" style="transform:translate(0px,0px)"/>' : '';
  return '<svg class="ac-cyl" viewBox="0 0 200 200" aria-hidden="true" focusable="false"><defs><radialGradient id="cy-steel" cx="35%" cy="28%" r="85%"><stop offset="0" stop-color="#d7dde1"/><stop offset=".35" stop-color="#8b979f"/><stop offset=".75" stop-color="#4a565e"/><stop offset="1" stop-color="#262e34"/></radialGradient><radialGradient id="cy-bore" cx="50%" cy="58%" r="60%"><stop offset="0" stop-color="#0b0d0f"/><stop offset=".8" stop-color="#1b2126"/><stop offset="1" stop-color="#3a444b"/></radialGradient><radialGradient id="cy-brass" cx="38%" cy="30%" r="80%"><stop offset="0" stop-color="#fff0b0"/><stop offset=".4" stop-color="#d5a741"/><stop offset="1" stop-color="#7a5314"/></radialGradient><radialGradient id="cy-hub" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#cfd6da"/><stop offset="1" stop-color="#2c353b"/></radialGradient></defs><image class="ac-body" href="assets/photo/cyl-plate.webp" x="10" y="10" width="180" height="180"/>' + holes + '' + cur + '</svg>';
}
