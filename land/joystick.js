// 터치 화면용 떠 있는 조이스틱.
// 왼쪽 절반에 엄지를 대면 그 자리에 생기고, 끌면 8방향 방향키(ArrowUp 등)로 바뀐다.
// 서버 프로토콜은 그대로: 조이스틱은 "눌린 방향키 집합"만 바꾼다.

export const STICK = Object.freeze({
  radius: 46,      // 손잡이가 움직일 수 있는 최대 거리(px)
  deadZone: 0.28,  // radius 대비. 이보다 작게 움직이면 멈춤으로 본다
  axis: 0.38,      // sin(22.5°)≈0.383. 축 성분이 이 비율을 넘어야 그 방향을 누른다 → 정확히 8방향
  zone: 0.5,       // 무대 왼쪽 이 비율 안에서만 시작
});

// 손가락 이동량(px) → 눌러야 할 방향키 목록. 순수 함수라 시험하기 쉽다.
export function stickKeys(dx, dy, {radius = STICK.radius, deadZone = STICK.deadZone, axis = STICK.axis} = {}) {
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < radius * deadZone) return [];
  const nx = dx / length, ny = dy / length, keys = [];
  if (ny < -axis) keys.push('ArrowUp'); else if (ny > axis) keys.push('ArrowDown');
  if (nx < -axis) keys.push('ArrowLeft'); else if (nx > axis) keys.push('ArrowRight');
  return keys;
}

// 손잡이를 radius 안으로 가둔 위치.
export function clampKnob(dx, dy, radius = STICK.radius) {
  const length = Math.hypot(dx, dy);
  if (!(length > radius)) return {x: dx || 0, y: dy || 0};
  return {x: dx / length * radius, y: dy / length * radius};
}

// zone: 조이스틱이 생길 수 있는 요소(마을 무대)
// onKeys(keys): 방향키 목록이 바뀔 때마다. 빈 배열이면 멈춤
// canStart(event): false면 시작하지 않음(대화창이 열렸을 때 등)
export function mountJoystick(zone, {onKeys, canStart = () => true, onStart = () => {}} = {}) {
  const base = document.createElement('div');
  base.className = 'stick';
  base.hidden = true;
  base.dataset.dir = '';
  base.setAttribute('aria-hidden', 'true');
  base.innerHTML = '<span class="stick-knob"></span>';
  zone.append(base);
  const knob = base.firstElementChild;
  let pointer = null, origin = null, shown = null, lastKey = '';

  const emit = keys => {
    const key = keys.join(',');
    if (key === lastKey) return;
    lastKey = key;
    base.dataset.dir = key;
    onKeys?.(keys);
  };
  const end = () => {
    if (pointer === null) return;
    pointer = null;
    base.hidden = true;
    base.classList.remove('active');
    emit([]);
  };
  const isTouch = event => event.pointerType === 'touch' || event.pointerType === 'pen';

  zone.addEventListener('pointerdown', event => {
    if (pointer !== null || !isTouch(event)) return;
    // 버튼·미니맵 위에서는 원래 동작을 둔다
    if (event.target.closest('button,a,input,select,textarea,#minimap')) return;
    const rect = zone.getBoundingClientRect();
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    if (x > rect.width * STICK.zone || !canStart(event)) return;
    event.preventDefault();
    pointer = event.pointerId;
    // 방향은 손가락이 처음 닿은 곳 기준. 링만 가장자리에서 잘리지 않게 안쪽에 그린다
    origin = {x, y};
    const pad = STICK.radius + 8;
    shown = {x: Math.min(Math.max(x, pad), rect.width - pad), y: Math.min(Math.max(y, pad), rect.height - pad)};
    base.style.left = shown.x + 'px';
    base.style.top = shown.y + 'px';
    knob.style.transform = 'translate(-50%,-50%)';
    base.hidden = false;
    base.classList.add('active');
    try { zone.setPointerCapture(event.pointerId); } catch {}
    onStart();
    move(event);
  }, {passive: false});

  function move(event) {
    if (event.pointerId !== pointer) return;
    const rect = zone.getBoundingClientRect();
    const dx = event.clientX - rect.left - origin.x, dy = event.clientY - rect.top - origin.y;
    const k = clampKnob(dx + origin.x - shown.x, dy + origin.y - shown.y);
    knob.style.transform = `translate(calc(-50% + ${k.x}px),calc(-50% + ${k.y}px))`;
    emit(stickKeys(dx, dy));
  }
  zone.addEventListener('pointermove', move);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
    zone.addEventListener(type, event => { if (event.pointerId === pointer) end(); });
  addEventListener('blur', end);
  document.addEventListener('visibilitychange', () => { if (document.hidden) end(); });
  return {end, get active() { return pointer !== null; }};
}
