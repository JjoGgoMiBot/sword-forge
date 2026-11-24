// 플링코 판 그림. 공이 지나갈 길(path)은 서버가 정해서 보내 준다. 여기서는 그 길을 따라 굴려 보여줄 뿐이다.
export const PLINKO_MS = 300;                 // 한 줄을 내려오는 시간
const ROWS = 12, W = 320, CX = 160, DX = 22, TOP = 26, DY = 19, SLOT_Y = TOP + ROWS * DY + 8;
const mult = m => (m >= 10 ? Math.round(m) : m) + '×';
const pegX = (k, r) => CX + (k - r / 2) * DX;
export const plinkoPoints = path => {         // 공이 각 줄에서 있는 자리(마지막은 칸 위)
  const pts = [{x: CX, y: TOP - 14}]; let k = 0;
  path.forEach((b, r) => { pts.push({x: pegX(k, r), y: TOP + r * DY - 3}); k += b; });
  pts.push({x: pegX(k, ROWS), y: SLOT_Y - 8});
  return pts;
};
export function plinkoSvg(table, hit = -1, ball = false) {
  let pegs = '';
  for (let r = 0; r < ROWS; r++) for (let j = 0; j <= r; j++) pegs += '<circle cx="' + pegX(j, r).toFixed(1) + '" cy="' + (TOP + r * DY) + '" r="2.4" fill="currentColor" opacity=".55"/>';
  const slots = table.map((m, k) => {
    const x = pegX(k, ROWS) - DX / 2 + 1, tone = m >= 10 ? 'hsl(8 75% 55%)' : m >= 2 ? 'hsl(28 85% 55%)' : m >= 1 ? 'hsl(48 85% 55%)' : 'hsl(210 25% 55%)';
    return '<g class="pl-slot' + (k === hit ? ' hit' : '') + '" data-k="' + k + '"><rect x="' + x.toFixed(1) + '" y="' + SLOT_Y + '" width="' + (DX - 2) + '" height="24" rx="4" fill="' + tone + '" opacity="' + (k === hit ? 1 : .72) + '"' + (k === hit ? ' stroke="#fff" stroke-width="2"' : '') + '/><text x="' + (x + (DX - 2) / 2).toFixed(1) + '" y="' + (SLOT_Y + 16) + '" font-size="' + (m >= 10 ? 8 : 8.5) + '" text-anchor="middle" fill="#1b1410" font-weight="700">' + mult(m) + '</text></g>';
  }).join('');
  return '<svg class="pl-board" viewBox="0 0 ' + W + ' ' + (SLOT_Y + 32) + '" role="img" aria-label="플링코 판" style="width:100%;max-width:360px;display:block;margin:0 auto;color:inherit">' + pegs + slots +
    '<circle class="pl-ball" cx="0" cy="0" r="6" fill="#ffe08a" stroke="#c0842a" stroke-width="1.5"' + (ball ? '' : ' style="display:none"') + '/></svg>';
}
// 공을 굴린다. 끝나면 promise가 풀린다(움직임 줄이기이거나 지원하지 않으면 곧바로 끝).
export function dropBall(svg, path, {reduced = false, onRow = () => {}} = {}) {
  const ball = svg.querySelector('.pl-ball');
  if (!ball) return Promise.resolve();
  const pts = plinkoPoints(path);
  const show = () => { const p = pts[pts.length - 1]; ball.style.display = ''; ball.setAttribute('transform', 'translate(' + p.x + ',' + p.y + ')'); };
  if (reduced || !ball.animate) { show(); return Promise.resolve(); }
  ball.style.display = '';
  const frames = pts.map((p, i) => ({transform: 'translate(' + p.x + 'px,' + p.y + 'px)', offset: i / (pts.length - 1), easing: i % 2 ? 'ease-in' : 'ease-out'}));
  const total = PLINKO_MS * (pts.length - 1);
  for (let i = 1; i < pts.length - 1; i++) setTimeout(() => onRow(i), PLINKO_MS * i);
  const a = ball.animate(frames, {duration: total, fill: 'forwards'});
  return a.finished.then(show, show);
}
// 화면에 처음 보여 줄 때만 쓰는 표시용 복사본. 실제 배당은 서버가 결과에 실어 보내고, 시험이 두 표가 같은지 확인한다.
export const PLINKO_TABLES = Object.freeze({
  low: [11, 4, 1.7, 1.2, 1.2, 0.8, 0.6, 0.8, 1.2, 1.2, 1.7, 4, 11],
  mid: [45, 10, 3, 1.8, 1, 0.7, 0.3, 0.7, 1, 1.8, 3, 10, 45],
  high: [100, 20, 6, 2.4, 0.8, 0.3, 0.1, 0.3, 0.8, 2.4, 6, 20, 100],
});
export const PLINKO_RISKS = Object.freeze({low: '낮음 (잔잔)', mid: '보통', high: '높음 (한 방)'});

// 이 화면 전용 작은 스타일(공유 style.css를 건드리지 않으려고 한 번만 끼워 넣는다).
if (typeof document !== 'undefined' && !document.getElementById('plinko-style')) {
  const st = document.createElement('style');
  st.id = 'plinko-style';
  st.textContent = '.ac-allin{align-self:end;min-height:44px;padding:0 12px;border:1px solid currentColor;border-radius:10px;background:transparent;color:inherit;font:inherit;cursor:pointer}.ac-allin:disabled{opacity:.4;cursor:default}.pl-board{width:100%;max-width:420px;display:block;margin:0 auto}.pl-late:empty{display:none}';
  document.head.appendChild(st);
}
