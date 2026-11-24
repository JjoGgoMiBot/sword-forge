// 먼작귀 풍 작은 캐릭터 그림(직접 단순하게 그린 팬 스타일 도형이다. 공식 그림이 아니다).
// 주민과 같은 좌표계를 쓴다: 발바닥이 (0,0), 위쪽이 -y. 한 장 68×100 안에 들어간다.
export const MONG_NAMES = ['직접 꾸민 주민', '치이카와', '하치와레', '우사기', '모몽가', '쿠리만쥬', '랏코'];
export const MONG_COUNT = MONG_NAMES.length;   // 0번은 사람 모습, 1~6이 캐릭터
const INK = '#5d4a46', CHEEK = '#f6aeb8';
const ell = (g, x, y, rx, ry, fill, stroke = INK, lw = 1.5, rot = 0) => {
  g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
};
const tri = (g, a, b, c, fill) => { g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.lineTo(...c); g.closePath(); g.fillStyle = fill; g.fill(); g.strokeStyle = INK; g.lineWidth = 1.5; g.stroke(); };
const curve = (g, x1, y1, cx, cy, x2, y2, lw = 1.5) => { g.beginPath(); g.moveTo(x1, y1); g.quadraticCurveTo(cx, cy, x2, y2); g.strokeStyle = INK; g.lineWidth = lw; g.stroke(); };
// 캐릭터별 모습: 몸 색, 귀, 얼굴 장식
const LOOK = {
  1: {body: '#fffaf4', belly: null, ears: 'round', earIn: '#f9d4d8', cheek: CHEEK, mouth: 'dot', tail: 'tuft'},
  2: {body: '#fffaf4', belly: null, ears: 'point', earIn: '#bcd2e6', cheek: CHEEK, mouth: 'smile', tail: 'tuft', cap: '#a9c4dc'},
  3: {body: '#fbe69a', belly: '#fff6cf', ears: 'long', earIn: '#f7c9a8', cheek: '#f4b4a4', mouth: 'open', tail: 'puff'},
  4: {body: '#fffdfb', belly: null, ears: 'big', earIn: '#f3d2d8', cheek: CHEEK, mouth: 'w', tail: 'tuft', wing: '#c8d4e2'},
  5: {body: '#f7dfb8', belly: null, ears: 'tiny', earIn: '#f7dfb8', cheek: '#f0a898', mouth: 'dot', tail: 'tuft', cap: '#7a5035'},
  6: {body: '#e8c690', belly: null, ears: 'tiny', earIn: '#e8c690', cheek: '#f0a898', mouth: 'dot', tail: 'tuft', mane: '#d9aa62', scarf: '#fffaf0'},
};
// 실제 캐릭터 스프라이트(land/assets/mong/<번호>-body|arm|foot.png). 몸통은 가만히 두고 팔과 다리만 움직인다.
// 불러오기 전에는 아래 도형 그림을 대신 쓴다. 불러오면 onMongLoad 로 알려 캐시를 비운다.
const SPR = {}, listeners = [], SC = 0.32;
export const onMongLoad = f => listeners.push(f);
export const mongSpriteReady = id => !!(SPR[id] && SPR[id].ok);
if (typeof Image === 'function') for (const id of [1, 2, 3, 4, 5, 6]) {
  const e = SPR[id] = {ok: false}; let left = 3;
  for (const part of ['body', 'arm', 'foot']) {
    const im = new Image(); e[part] = im;
    im.onload = () => { if (!--left) { e.ok = true; listeners.forEach(f => f()); } };
    im.src = new URL('./assets/mong/' + id + '-' + part + '.png', import.meta.url).href;
  }
}
function drawSprite(g, e, phase, weight, look) {
  const s = Math.sin(phase) * weight, bob = -Math.abs(Math.cos(phase)) * 2.2 * weight, lx = look * 1.2;
  const bw = e.body.naturalWidth * SC, bh = e.body.naturalHeight * SC;
  const aw = e.arm.naturalWidth * SC, ah = e.arm.naturalHeight * SC, fw = e.foot.naturalWidth * SC, fh = e.foot.naturalHeight * SC;
  g.save(); g.translate(0, bob);
  // 다리: 번갈아 앞뒤로 내딛고 들어 올린다(몸통 뒤쪽에서 발만 보인다)
  const foot = (sx, ph) => g.drawImage(e.foot, sx * bw * .2 - fw / 2 + ph * 2.2, -fh - Math.max(0, ph) * 4.5, fw, fh);
  foot(-1, -s); foot(1, s);
  g.drawImage(e.body, -bw / 2 + lx, -fh * .55 - bh, bw, bh);
  // 팔: 어깨를 축으로 앞뒤로 흔든다(반대 팔은 좌우를 뒤집어 그린다)
  const arm = (sx, ph) => {
    g.save(); g.translate(sx * bw * .46 + lx, -fh * .55 - bh * .36); g.rotate(sx * .18 + ph * .85 * sx);
    if (sx < 0) g.scale(-1, 1);
    g.drawImage(e.arm, -aw / 2, -ah * .12, aw, ah); g.restore();
  };
  arm(-1, s); arm(1, -s);
  g.restore();
}
// phase: 걸음 위상, weight: 0(서 있음)~1(걷기), look: -1~1 가는 쪽
export function drawMong(g, id, phase = 0, weight = 0, look = 0) {
  const L = LOOK[id]; if (!L) return false;
  if (mongSpriteReady(id)) { drawSprite(g, SPR[id], phase, weight, look); return true; }
  const s = Math.sin(phase) * weight, bob = -Math.abs(Math.cos(phase)) * 2.4 * weight, lx = look * 2.5;
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.translate(0, bob);
  // 꼬리·갈기·날개 같은 뒤쪽 장식
  if (L.tail === 'long') curve(g, 13, -9, 26, -6, 24, -18, 4);
  else if (L.tail === 'puff') ell(g, 15, -10, 5, 5, '#fff6cf');
  else ell(g, 15, -10, 3.6, 3, L.body);
  if (L.mane) { for (let i = 0; i < 9; i++) { const a = Math.PI + i / 8 * Math.PI; ell(g, Math.cos(a) * 17, -31 + Math.sin(a) * 15, 5.5, 5.5, L.mane); } }
  if (L.wing) { ell(g, -19, -20, 7, 12, L.wing, INK, 1.5, .25); ell(g, 19, -20, 7, 12, L.wing, INK, 1.5, -.25); }
  // 귀(몸 뒤)
  const ear = (sx, k) => {
    const x = sx * 11, y = -41;
    if (k === 'round') { ell(g, x, y, 5.5, 5.5, L.body); ell(g, x, y + .5, 2.8, 2.8, L.earIn, null); }
    else if (k === 'point') { tri(g, [sx * 5, -42], [sx * 15, -42], [sx * 12, -54], L.body); tri(g, [sx * 8, -43], [sx * 13, -43], [sx * 11.6, -50], L.earIn); }
    else if (k === 'long') { ell(g, sx * 7, -56, 4.4, 13, L.body, INK, 1.5, sx * .12); ell(g, sx * 7, -56, 2, 9, L.earIn, null, 0, sx * .12); }
    else if (k === 'big') { ell(g, sx * 13, -42, 7.5, 8, L.body); ell(g, sx * 13, -42, 4, 4.8, L.earIn, null); }
    else ell(g, sx * 12.5, -40, 3.8, 3.8, L.body);   // tiny
  };
  ear(-1, L.ears); ear(1, L.ears);
  // 발
  const foot = (sx, ph) => ell(g, sx * 7, -2 - Math.max(0, ph) * 3, 5.6, 3.6, L.body);
  foot(-1, -s); foot(1, s);
  // 몸통: 위가 둥글고 아래가 조금 넓은 달걀꼴
  g.beginPath(); g.moveTo(0, -48);
  g.bezierCurveTo(14, -48, 20, -37, 18, -24); g.bezierCurveTo(17, -11, 11, -4, 0, -4);
  g.bezierCurveTo(-11, -4, -17, -11, -18, -24); g.bezierCurveTo(-20, -37, -14, -48, 0, -48); g.closePath();
  g.fillStyle = L.body; g.fill(); g.strokeStyle = INK; g.lineWidth = 1.7; g.stroke();
  if (L.belly) ell(g, 0, -13, 9.5, 7.5, L.belly, null);
  if (L.cap) { g.save(); g.beginPath(); g.moveTo(0, -48); g.bezierCurveTo(14, -48, 20, -37, 18, -31); g.quadraticCurveTo(6, -36, 0, -34); g.quadraticCurveTo(-8, -38, -18, -31); g.bezierCurveTo(-20, -37, -14, -48, 0, -48); g.fillStyle = L.cap; g.fill(); g.restore(); }
  if (L.scarf) { ell(g, 0, -14, 17.5, 5.2, L.scarf); curve(g, -12, -11, -17, -4, -9, -2, 1.5); }
  // 팔
  const arm = (sx, ph) => ell(g, sx * 17, -19 - ph * 2.2, 3.8, 5.4, L.body, INK, 1.5, sx * .35);
  arm(-1, s); arm(1, -s);
  // 얼굴
  const ex = 6.2;
  ell(g, -ex + lx, -28, 1.7, 2.3, INK, null); ell(g, ex + lx, -28, 1.7, 2.3, INK, null);
  g.fillStyle = '#fff'; g.beginPath(); g.arc(-ex + lx + .5, -28.8, .55, 0, 7); g.arc(ex + lx + .5, -28.8, .55, 0, 7); g.fill();
  ell(g, -11 + lx * .6, -23, 3.3, 2.1, L.cheek, null); ell(g, 11 + lx * .6, -23, 3.3, 2.1, L.cheek, null);
  const mx = lx * .9;
  if (L.mouth === 'open') { g.beginPath(); g.moveTo(mx - 3.4, -23.6); g.quadraticCurveTo(mx, -17.5, mx + 3.4, -23.6); g.closePath(); g.fillStyle = '#e8737f'; g.fill(); g.strokeStyle = INK; g.lineWidth = 1.3; g.stroke(); }
  else if (L.mouth === 'smile') curve(g, mx - 3, -23.5, mx, -20, mx + 3, -23.5, 1.4);
  else if (L.mouth === 'w') { curve(g, mx - 3.4, -23.4, mx - 1.7, -20.6, mx, -23.4, 1.3); curve(g, mx, -23.4, mx + 1.7, -20.6, mx + 3.4, -23.4, 1.3); }
  else ell(g, mx, -22.4, 1.2, 1.4, INK, null);
  if (L.whisk) { for (const sx of [-1, 1]) { curve(g, sx * 9 + mx, -24, sx * 15 + mx, -25.5, sx * 19 + mx, -25, 1); curve(g, sx * 9 + mx, -22.5, sx * 15 + mx, -21, sx * 19 + mx, -21.5, 1); } ell(g, mx, -24.6, 1.8, 1.3, '#4a3a33', null); }
  g.restore();
  return true;
}
