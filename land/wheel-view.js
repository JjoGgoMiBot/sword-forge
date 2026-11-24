// 룰렛 휠(유럽식 0~36). 공이 판 위를 돌다 서버가 정한 숫자 칸에 멈춘다. 결과(숫자)는 서버가 정하고 여기서는 그리기만 한다.
export const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const SPIN_MS = 3400; // 공이 돌기 시작해 칸에 멈추기까지(sound 'roulette.spin' 길이·casino-fx SETTLE.wheel 과 같은 기준)
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const pocketColor = n => n === 0 ? 'green' : RED.has(n) ? 'red' : 'black';
export const pocketAngle = n => (360 / WHEEL_ORDER.length) * WHEEL_ORDER.indexOf(n); // 위쪽 0, 시계 방향. 칸의 가운데 각도
const pt = (deg, r) => { const a = deg * Math.PI / 180; return [+(100 + r * Math.sin(a)).toFixed(2), +(100 - r * Math.cos(a)).toFixed(2)]; };

// 칸 하나는 가운데 각도 ±(180/37)도 부채꼴. result 가 있으면 그 칸을 밝게 표시한다(공이 멈춘 뒤).
export function wheelSvg(result) {
  const N = WHEEL_ORDER.length, half = 180 / N;
  const cells = WHEEL_ORDER.map((n, i) => {
    const c = i * 360 / N, [x1, y1] = pt(c - half, 88), [x2, y2] = pt(c + half, 88), [x3, y3] = pt(c + half, 54), [x4, y4] = pt(c - half, 54), [tx, ty] = pt(c, 64);
    return '<g class="wh-cell ' + pocketColor(n) + (result && result.number === n ? ' hit' : '') + '" data-n="' + n + '"><path d="M' + x1 + ' ' + y1 + 'A88 88 0 0 1 ' + x2 + ' ' + y2 + 'L' + x3 + ' ' + y3 + 'A54 54 0 0 0 ' + x4 + ' ' + y4 + 'Z"/><text x="' + tx + '" y="' + ty + '" transform="rotate(' + c.toFixed(2) + ' ' + tx + ' ' + ty + ')">' + n + '</text></g>';
  }).join('');
  const ball = result ? '<g class="wh-orbit" data-deg="' + pocketAngle(result.number).toFixed(3) + '" style="transform:rotate(' + pocketAngle(result.number).toFixed(3) + 'deg)"><image class="wh-ball" href="assets/photo/wheel-ball.webp" x="94.5" y="' + (100 - 87.5) + '" width="11" height="11"/></g>' : '';
  return '<svg class="wh-svg" viewBox="0 0 200 200" role="img" aria-label="' + (result ? '룰렛 휠, 공이 ' + result.number + '에 멈춤' : '룰렛 휠') + '"><defs><radialGradient id="wh-wood" cx="50%" cy="50%" r="50%"><stop offset=".9" stop-color="#8a5a2b"/><stop offset=".96" stop-color="#4d2f12"/><stop offset="1" stop-color="#2a1808"/></radialGradient><radialGradient id="wh-hub" cx="38%" cy="30%" r="80%"><stop offset="0" stop-color="#fff0b0"/><stop offset=".45" stop-color="#c8993a"/><stop offset="1" stop-color="#5f400e"/></radialGradient><radialGradient id="wh-ball" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#e3e6e8"/><stop offset="1" stop-color="#8d949a"/></radialGradient><radialGradient id="wh-shade" cx="50%" cy="50%" r="50%"><stop offset=".62" stop-color="#000" stop-opacity=".35"/><stop offset=".7" stop-color="#000" stop-opacity="0"/><stop offset=".93" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".4"/></radialGradient></defs><image class="wh-bowl" href="assets/photo/wheel-bowl.webp" x="0" y="0" width="200" height="200"/>' + cells + '' + ball + '</svg>';
}

// 공 궤도 애니메이션 키프레임(순수). 반시계로 turns 바퀴를 감속하며 돌다 멈춘 각도(deg)에서 끝난다. 바깥 레일에서 칸으로 떨어진다.
export function orbitFrames(deg, turns = 5) {
  return {
    spin: [{ transform: 'rotate(' + (deg + 360 * turns) + 'deg)' }, { transform: 'rotate(' + deg + 'deg)' }],
    drop: [{ transform: 'translateY(-14px)', offset: 0 }, { transform: 'translateY(-14px)', offset: 0.7 }, { transform: 'translateY(0)', offset: 1 }],
  };
}
