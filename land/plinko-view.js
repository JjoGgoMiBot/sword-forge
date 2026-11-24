// 플링코 판 그림. 공이 지나갈 길(path)은 서버가 정해서 보내 준다. 여기서는 그 길을 따라 핀에 튕기며 내려가는 모습만 그린다.
// 튕기는 높이·회전 같은 연출 값은 화면에서만 무작위이고, 공이 닿는 핀과 마지막 칸은 항상 서버 길과 같다.
export const PLINKO_MS = 300;                 // 한 줄을 내려오는 시간
const ROWS = 12, W = 320, CX = 160, DX = 22, TOP = 34, DY = 19, SLOT_Y = TOP + ROWS * DY + 8;
const BALL_R = 6.4, PEG_R = 2.7, REST = BALL_R + PEG_R;   // 공이 핀 위에 얹힐 때 중심이 핀 중심보다 위로 뜨는 거리
const mult = m => (m >= 10 ? Math.round(m) : m) + '×';
const pegX = (k, r) => CX + (k - r / 2) * DX;
export const plinkoPoints = path => {         // 공이 각 핀 위에 얹히는 자리(처음은 위쪽 공중, 마지막은 칸 안)
  const pts = [{x: CX, y: TOP - 30}]; let k = 0;
  path.forEach((b, r) => { pts.push({x: pegX(k, r), y: TOP + r * DY - REST, peg: r + '-' + k}); k += b; });
  pts.push({x: pegX(k, ROWS), y: SLOT_Y + 11});
  return pts;
};
// 한 핀에서 다음 핀(또는 칸)까지 날아가는 동안의 위치. 위로 살짝 튀었다가 중력으로 떨어진다(포물선).
export function hopAt(a, b, T, hop, u) {
  const dy = b.y - a.y, dx = b.x - a.x;
  let v0 = 0, g = 2 * dy / (T * T);
  if (hop > 0) { const q = Math.sqrt(2 * hop), s = (q * T + Math.sqrt(2 * hop * T * T + 2 * T * T * dy)) / (T * T); g = s * s; v0 = -q * s; }
  const t = Math.min(Math.max(u, 0), T);
  return {x: a.x + dx * (t / T), y: a.y + v0 * t + 0.5 * g * t * t, vy: v0 + g * t};
}
export function plinkoSvg(table, hit = -1, ball = false) {
  let pegs = '';
  for (let r = 0; r < ROWS; r++) for (let j = 0; j <= r; j++) {
    const x = pegX(j, r).toFixed(1), y = TOP + r * DY;
    pegs += '<g class="pl-peg" data-p="' + r + '-' + j + '"><ellipse cx="' + (+x + 1.6) + '" cy="' + (y + 2.6) + '" rx="2.9" ry="1.5" fill="#000" opacity=".5"/>' +
      '<circle cx="' + x + '" cy="' + y + '" r="' + PEG_R + '" fill="url(#plPeg)"/><circle class="pl-glint" cx="' + x + '" cy="' + y + '" r="' + (PEG_R + 1.2) + '" fill="none" stroke="#fff3c4" stroke-width="1.6" opacity="0"/></g>';
  }
  let walls = '';
  const slots = table.map((m, k) => {
    const x = pegX(k, ROWS) - DX / 2 + 1, w = DX - 2, on = k === hit;
    const hue = m >= 10 ? 8 : m >= 2 ? 28 : m >= 1 ? 48 : 210, sat = m >= 1 ? 82 : 22, lit = m >= 1 ? 52 : 46;
    if (k === 0) walls += '<rect x="' + (x - 2.4).toFixed(1) + '" y="' + (SLOT_Y - 4) + '" width="2.6" height="32" rx="1.2" fill="url(#plWall)"/>';
    walls += '<rect x="' + (x + w - 0.2).toFixed(1) + '" y="' + (SLOT_Y - 4) + '" width="2.6" height="32" rx="1.2" fill="url(#plWall)"/>';
    return '<g class="pl-slot' + (on ? ' hit' : '') + '" data-k="' + k + '"><rect x="' + x.toFixed(1) + '" y="' + SLOT_Y + '" width="' + w + '" height="24" rx="3" fill="hsl(' + hue + ' ' + sat + '% ' + lit + '%)" opacity="' + (on ? 1 : 0.78) + '"' + (on ? ' stroke="#fff3c4" stroke-width="2"' : '') + '/>' +
      '<rect x="' + x.toFixed(1) + '" y="' + SLOT_Y + '" width="' + w + '" height="24" rx="3" fill="url(#plGloss)"/>' +
      '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (SLOT_Y + 19) + '" font-size="' + (m >= 10 ? 8 : 8.5) + '" text-anchor="middle" fill="#1b1410" font-weight="800">' + mult(m) + '</text></g>';
  }).join('');
  const bp = ball && hit >= 0 ? {x: pegX(hit, ROWS), y: SLOT_Y + 11} : null;
  const defs = '<defs>' +
    '<linearGradient id="plWood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a281b"/><stop offset=".55" stop-color="#241810"/><stop offset="1" stop-color="#150d08"/></linearGradient>' +
    '<radialGradient id="plLight" cx=".5" cy=".25" r=".75"><stop offset="0" stop-color="#fff2d0" stop-opacity=".16"/><stop offset="1" stop-color="#fff2d0" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="plPeg" cx=".34" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#c3cad2"/><stop offset="1" stop-color="#4a5159"/></radialGradient>' +
    '<radialGradient id="plBall" cx=".34" cy=".3" r=".85"><stop offset="0" stop-color="#fff6cf"/><stop offset=".3" stop-color="#f2b640"/><stop offset=".75" stop-color="#b86f14"/><stop offset="1" stop-color="#5e3406"/></radialGradient>' +
    '<linearGradient id="plWall" x1="0" x2="1"><stop offset="0" stop-color="#8d949c"/><stop offset=".5" stop-color="#e8ecef"/><stop offset="1" stop-color="#5a6169"/></linearGradient>' +
    '<linearGradient id="plGloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></linearGradient>' +
    '<filter id="plBlur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.3"/></filter></defs>';
  const board = '<rect x="2" y="2" width="' + (W - 4) + '" height="' + (SLOT_Y + 28) + '" rx="12" fill="url(#plWood)" stroke="#6b4a2c" stroke-width="2"/>' +
    '<rect x="2" y="2" width="' + (W - 4) + '" height="' + (SLOT_Y + 28) + '" rx="12" fill="url(#plLight)"/>';
  const ballSvg = '<g class="pl-ball"' + (bp ? ' transform="translate(' + bp.x + ',' + bp.y + ')"' : ' style="display:none"') + '>' +
    '<ellipse class="pl-shadow" cx="2.6" cy="3.8" rx="' + BALL_R + '" ry="' + (BALL_R * 0.8) + '" fill="#000" opacity=".5" filter="url(#plBlur)"/>' +
    '<circle r="' + BALL_R + '" fill="url(#plBall)"/>' +
    '<g class="pl-spin"><path d="M-3.4 -3 Q0 -5.6 3.4 -3 Q0 -1.6 -3.4 -3Z" fill="#7a4309" opacity=".55"/><circle cx="2.6" cy="3.2" r="1.1" fill="#7a4309" opacity=".5"/></g>' +
    '<ellipse cx="-2.1" cy="-2.5" rx="2.1" ry="1.3" fill="#fff" opacity=".85" transform="rotate(-35 -2.1 -2.5)"/></g>';
  return '<svg class="pl-board" viewBox="0 0 ' + W + ' ' + (SLOT_Y + 32) + '" role="img" aria-label="플링코 판" style="width:100%;max-width:380px;display:block;margin:0 auto;color:inherit">' + defs + board + pegs + walls + slots + ballSvg + '</svg>';
}
// 공을 굴린다. 끝나면 promise가 풀린다(움직임 줄이기이거나 지원하지 않으면 곧바로 끝).
export function dropBall(svg, path, {reduced = false, onRow = () => {}, rng = Math.random} = {}) {
  const ball = svg.querySelector('.pl-ball');
  if (!ball) return Promise.resolve();
  const pts = plinkoPoints(path), spin = ball.querySelector('.pl-spin'), last = pts[pts.length - 1];
  const place = (x, y, sx = 1, sy = 1, rot = 0) => { ball.setAttribute('transform', 'translate(' + x.toFixed(2) + ',' + y.toFixed(2) + ') scale(' + sx.toFixed(3) + ',' + sy.toFixed(3) + ')'); if (spin) spin.setAttribute('transform', 'rotate(' + rot.toFixed(1) + ')'); };
  const show = () => { ball.style.display = ''; place(last.x, last.y); };
  if (reduced || typeof requestAnimationFrame !== 'function') { show(); return Promise.resolve(); }
  const segs = pts.slice(1).map((b, i) => ({a: pts[i], b, hop: i === 0 ? 0 : i === pts.length - 2 ? 3 : 3.2 + rng() * 3.4, dir: pts[i].x <= b.x ? 1 : -1}));
  const T = PLINKO_MS, total = T * segs.length;
  ball.style.display = '';
  const glint = peg => { const el = peg && svg.querySelector('.pl-peg[data-p="' + peg + '"] .pl-glint'); if (el && el.animate) el.animate([{opacity: 1, transform: 'scale(1)'}, {opacity: 0, transform: 'scale(1.9)'}], {duration: 380, easing: 'ease-out'}); };
  return new Promise(resolve => {
    let t0 = 0, spinA = 0, hitN = 0, done = false;
    const finish = () => { if (done) return; done = true; show(); resolve(); };
    const step = now => {
      if (done) return;
      if (!t0) t0 = now;
      const el = now - t0;
      if (el >= total) return finish();
      const i = Math.min(segs.length - 1, Math.floor(el / T)), s = segs[i], u = el - i * T;
      while (hitN < i) { hitN++; glint(segs[hitN - 1].b.peg); onRow(hitN); }   // 핀에 닿은 순간 불빛·소리
      const p = hopAt(s.a, s.b, T, s.hop, u);
      const k = Math.exp(-u / 45), stretch = Math.min(0.1, Math.abs(p.vy) / 900);   // 닿은 직후 납작, 빠르게 떨어질 땐 약간 길쭉
      spinA += s.dir * 0.55 * (1 + Math.abs(p.vy) / 3);
      place(p.x, p.y, 1 + 0.16 * k - stretch * 0.5, 1 - 0.2 * k + stretch, spinA);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    setTimeout(finish, total + 400);   // 화면이 가려져 프레임이 멈춰도 끝은 난다
  });
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
  st.textContent = '.ac-allin{align-self:end;min-height:44px;padding:0 12px;border:1px solid currentColor;border-radius:10px;background:transparent;color:inherit;font:inherit;cursor:pointer}.ac-allin:disabled{opacity:.4;cursor:default}.pl-board{width:100%;max-width:420px;display:block;margin:0 auto}.pl-late:empty{display:none}.pl-glint{transform-box:fill-box;transform-origin:center}';
  document.head.appendChild(st);
}
