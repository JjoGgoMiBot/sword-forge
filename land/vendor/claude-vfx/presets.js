/* 속성 프리셋 — 엔진(vfx-engine.js)은 그대로 두고 이 데이터만 바꿔 끼운다.
   새 속성: VFX.presets.이름 = {...} 를 추가하거나 VFX.fromColor('#hex', 'kind') 로 자동 생성. */
(function () {
  const V = (window.VFX = window.VFX || {});
  const P = (V.presets = V.presets || {});

  const base = (o) => Object.assign({ name: '', bloom: .8, blade: { heat: '#ffffff', tip: '#ffffff' } }, o);
  const trail = (o) => Object.assign({
    life: .30, radius: [46, 312],
    dissolve: { scale: 5, soft: .25, amount: 1.2, across: 2.2 },
    scroll: 1.4, streak: .5, highlight: 1, intensity: 1, backAlpha: 0
  }, o);

  // trail.shape: 원소마다 실루엣이 다른 띠 모양(vfx-engine.js SHAPES). 입자·타격도 원소 고유 모양을 쓴다
  P.fire = base({
    name: '불꽃', bloom: .95, blade: { heat: '#ff7a1a', tip: '#fff1c8' },
    trail: trail({
      shape: 'fire', life: .42, echo: 0, streaks: 4, intensity: 1.25,
      colors: [[0, '#2a0500'], [.18, '#8a1a00'], [.4, '#ff4a00'], [.62, '#ffa22a'], [.84, '#ffe9a0'], [1, '#ffffff']],
      back: '#1a0600', backAlpha: 0, dissolve: { scale: 5, soft: .3, amount: 1.1, across: 2.2 }, scroll: 1.6, streak: .55
    }),
    particles: [
      { type: 'flame', rate: 16, colors: ['#ff5a00', '#ffae2a', '#ffe9a0'], gravity: -420, drag: 2.5, out: [80, 200], speed: [20, 80], life: [.25, .5], size: [8, 16], from: [.7, 1] },
      { type: 'ember', rate: 14, colors: ['#ff7a1a', '#ffb347'], gravity: -260, life: [.6, 1.3], speed: [40, 160], out: [60, 180], size: [1.5, 3.2] },
      { type: 'smoke', rate: 4, colors: ['#4a2614', '#3a2014'], gravity: -60, life: [.6, 1.2], speed: [20, 80], size: [18, 40], alpha: .25 }
    ],
    impact: {
      flash: { color: '#ffb347', size: 150, alpha: .9 }, ring: { color: '#ff7a1a', size: 130, width: 3 },
      star: { color: '#ffd27a', count: 4, len: 120, width: 8, needles: 4 }, flare: false,
      burst: [{ type: 'flame', count: 14, colors: ['#ff5a00', '#ffae2a'], gravity: -500, speed: [150, 380], size: [10, 20], life: [.3, .55] },
              { type: 'ember', count: 26, colors: ['#ff7a1a', '#ffd27a'], gravity: -200, speed: [200, 520], life: [.5, 1] }],
      shake: 7, life: .5
    }
  });

  P.ice = base({
    name: '얼음', bloom: .7, blade: { heat: '#6fd8ff', tip: '#eafcff' },
    trail: trail({
      shape: 'ice', echo: 0, streaks: 1, life: .36,   // 결 따라 나란한 줄이 많으면 부채 주름으로 읽힌다
      colors: [[0, '#000a33'], [.25, '#0a2aa8'], [.5, '#1f6aff'], [.72, '#5ac8ff'], [.88, '#c8f2ff'], [1, '#ffffff']],
      back: '#020c1c', backAlpha: 0, dissolve: { scale: 7, soft: .06, amount: 1.15, across: 1.6 }, scroll: .3, streak: .7
    }),
    particles: [
      { type: 'crystal', rate: 1.2, aim: true, colors: ['#8fe0ff', '#dff8ff', '#ffffff'], speed: [40, 110], out: [0, 30], drag: 8, size: [13, 18], len: 1.3, life: [.45, .7] },
      { type: 'shard', rate: 6, colors: ['#8fe0ff', '#bff3ff', '#ffffff'], speed: [90, 240], size: [8, 13], spin: 4, gravity: 420, life: [.5, .8], len: 1.3 },
      { type: 'shard', rate: 10, colors: ['#bff3ff', '#6fd8ff', '#ffffff'], speed: [150, 420], size: [2, 5], spin: 9, gravity: 520, life: [.4, .8], len: 1.6 },
      { type: 'mote', rate: 2, colors: ['#8fe6ff', '#ffffff'], speed: [30, 120], size: [2, 3], life: [.4, .8] }
    ],
    impact: {
      flash: { color: '#9fe8ff', size: 130, alpha: .85 }, ring: { color: '#4fc8ff', size: 140, width: 2.5 },
      star: { color: '#bff3ff', count: 4, len: 200, width: 10, needles: 4 }, flare: false,
      burst: [{ type: 'crystal', count: 2, aim: true, colors: ['#5ac8ff', '#bff3ff', '#ffffff'], speed: [120, 260], drag: 9, size: [14, 19], len: 1.4, life: [.45, .6] },
              { type: 'shard', count: 10, colors: ['#6fd8ff', '#bff3ff', '#ffffff'], speed: [180, 380], spin: 5, gravity: 520, size: [11, 17], len: 1.2, life: [.5, .75] },
              { type: 'shard', count: 28, colors: ['#bff3ff', '#ffffff'], speed: [250, 700], spin: 11, gravity: 620, size: [2, 6], len: 1.6 },
              { type: 'smoke', count: 5, colors: ['#5a7a9a'], speed: [30, 90], size: [24, 50], alpha: .3 }],
      shake: 6, life: .55
    }
  });

  P.snow = base({
    name: '눈보라', bloom: .5, blade: { heat: '#dfefff', tip: '#ffffff' },
    trail: trail({
      shape: 'snow', echo: 0, streaks: 0, life: .5,
      colors: [[0, '#1a2a3a'], [.3, '#6f8fb0'], [.6, '#cfe4ff'], [1, '#ffffff']],
      back: '#0c1420', backAlpha: 0, dissolve: { scale: 9, soft: .4, amount: 1.2, across: 2.6 }, scroll: 1.2, streak: .35, intensity: 1
    }),
    particles: [
      { type: 'flake', rate: 3, colors: ['#ffffff', '#dfefff'], speed: [40, 120], out: [20, 70], size: [6, 9], gravity: 30, drag: 3, life: [.8, 1.4] },
      { type: 'flake', rate: 22, colors: ['#ffffff', '#dfefff'], speed: [60, 200], out: [20, 90], size: [2.5, 4], gravity: 50, drag: 3, life: [.8, 1.6] },
      { type: 'mote', rate: 14, colors: ['#ffffff', '#cfe4ff'], speed: [60, 220], out: [10, 90], size: [1, 2], gravity: 40, life: [.5, 1] },
      { type: 'mist', rate: 6, colors: ['#9fb8d6', '#dfefff'], speed: [20, 80], out: [10, 60], size: [16, 30], drag: 2, life: [.6, 1.2], alpha: .7 }
    ],
    impact: {
      flash: { color: '#eaf4ff', size: 110, alpha: .55 }, ring: { color: '#cfe4ff', size: 120, width: 2 }, flare: false, lines: false,
      burst: [{ type: 'flake', count: 5, colors: ['#ffffff'], speed: [80, 200], size: [10, 14], drag: 3, life: [.7, 1] },
              { type: 'flake', count: 40, colors: ['#ffffff', '#dfefff'], speed: [150, 520], size: [2, 4], gravity: 70 },
              { type: 'mist', count: 8, colors: ['#9fb8d6', '#dfefff'], speed: [60, 200], size: [26, 46], life: [.6, 1.1], alpha: .7 }],
      shake: 3, life: .6
    }
  });

  P.lightning = base({
    name: '번개', bloom: 1, blade: { heat: '#6fa8ff', tip: '#ffffff' },
    trail: trail({
      shape: 'lightning', life: .3, echo: 1, streaks: 6, backAlpha: 0, intensity: 1.35,
      colors: [[0, '#020a2a'], [.25, '#1a3aa8'], [.5, '#3f7cff'], [.75, '#8fb4ff'], [.92, '#d8e6ff'], [1, '#ffffff']],
      back: '#01041a', dissolve: { scale: 6, soft: .14, amount: 1.4, across: 1.4 }, scroll: 2.6, streak: .8
    }),
    particles: [
      { type: 'bolt', rate: 6, colors: ['#4f8cff', '#8fb8ff', '#cfe0ff'], speed: [0, 40], out: [40, 120], size: [2.4, 3.6], len: 110, life: [.12, .25] },
      { type: 'spark', rate: 10, colors: ['#bcd6ff', '#ffffff'], speed: [300, 700], size: [1, 2] }
    ],
    impact: {
      flash: { color: '#6f9cff', size: 170, alpha: .8 }, ring: { color: '#4f8cff', size: 150, width: 3 },
      star: { color: '#cfe0ff', count: 4, len: 200, width: 8 },
      burst: [{ type: 'bolt', count: 4, colors: ['#8fb8ff', '#ffffff'], len: 130, life: [.15, .3] },
              { type: 'spark', count: 20, colors: ['#bcd6ff'], speed: [400, 900] }],
      shake: 11, life: .4
    }
  });

  P.arcane = base({
    name: '비전', bloom: .95, blade: { heat: '#c86bff', tip: '#ffd6f4' },
    trail: trail({
      shape: 'arcane', life: .45, echo: 2, streaks: 0, intensity: 1.3,
      colors: [[0, '#0a0030'], [.22, '#3a10a8'], [.45, '#b03cff'], [.68, '#ff5ac8'], [.88, '#ffd0f0'], [1, '#ffffff']],
      back: '#0a0016', backAlpha: 0, dissolve: { scale: 5, soft: .12, amount: 1.15, across: 2.2 }, scroll: 1.2, streak: .6
    }),
    particles: [
      { type: 'rune', rate: 1.2, colors: ['#b03cff', '#ff9ae0'], speed: [0, 20], out: [20, 60], size: [16, 24], drag: 4, life: [.5, .8], alpha: .8 },
      { type: 'glyph', rate: 7, colors: ['#d68aff', '#ff9ae0', '#ffffff'], speed: [10, 40], out: [10, 50], size: [7, 12], drag: 3, life: [.5, .9] },
      { type: 'mote', rate: 7, colors: ['#d68aff', '#ff9ae0', '#ffffff'], speed: [0, 20], size: [2, 3.5], life: [.6, 1.1], orbit: 6, orbitR: [18, 50], orbitFlat: .45, drag: 4 }
    ],
    impact: {
      flash: { color: '#e08aff', size: 140, alpha: .85 }, ring: { color: '#a43cff', size: 140, width: 3 },
      star: { color: '#ffb8ec', count: 4, len: 150, width: 7, needles: 0 }, flare: false,
      burst: [{ type: 'mote', count: 26, colors: ['#d68aff', '#ffffff'], speed: [60, 220], drag: 3, orbit: 5, orbitR: [40, 110], orbitFlat: .5, orbitShrink: 1.5, life: [.6, 1] },
              { type: 'glyph', count: 10, colors: ['#d68aff', '#ff9ae0'], speed: [80, 220], size: [9, 15], drag: 3, life: [.5, .9] }],
      shake: 6, life: .6
    }
  });

  P.holy = base({
    name: '신성', bloom: 1, blade: { heat: '#ffd76a', tip: '#ffffff' },
    trail: trail({
      shape: 'holy', echo: 0, streaks: 0, life: .36,   // 잔상 호(echo)는 매끈한 원호 선이라 도형으로 읽힌다. 깨진 띠 가장자리가 중간 층을 맡는다
      colors: [[0, '#2a1a00'], [.3, '#a87a10'], [.55, '#ffd04a'], [.8, '#fff2c0'], [1, '#ffffff']],
      back: '#140c00', backAlpha: 0, scroll: .6, streak: .7, intensity: 1.1
    }),
    particles: [
      { type: 'feather', rate: 4, colors: ['#ffe9a0', '#fff6d8', '#ffffff'], speed: [20, 80], out: [20, 80], gravity: 30, drag: 3, size: [6, 10], life: [.9, 1.5] },
      { type: 'mote', rate: 6, colors: ['#ffe9a0', '#ffffff'], speed: [30, 120], gravity: -40, size: [2, 4.5], life: [.6, 1.2] }
    ],
    impact: {
      flash: { color: '#fff0b0', size: 170, alpha: 1 }, ring: { color: '#ffd04a', size: 170, width: 3 },
      star: { color: '#fff2c0', count: 4, len: 210, width: 7, needles: 6, angle: -Math.PI / 2 },
      burst: [{ type: 'feather', count: 10, colors: ['#ffe9a0', '#ffffff'], speed: [120, 320], gravity: 40, drag: 3, size: [7, 12], life: [.9, 1.5] },
              { type: 'mote', count: 24, colors: ['#ffe9a0', '#ffffff'], speed: [150, 450], gravity: -60 }],
      shake: 5, life: .6
    }
  });

  P.poison = base({
    name: '독', bloom: .6, blade: { heat: '#7aff4a', tip: '#e2ffc8' },
    trail: trail({
      shape: 'poison', echo: 0, streaks: 0, life: .5,
      colors: [[0, '#061a00'], [.3, '#1f6a0a'], [.55, '#5ae02a'], [.8, '#c8ff8a'], [1, '#f4ffe6']],
      back: '#081400', backAlpha: 0, dissolve: { scale: 4, soft: .3, amount: 1.05, across: 2.6 }, scroll: .4, streak: .35
    }),
    particles: [
      { type: 'drop', rate: 9, colors: ['#3aa81a', '#7aff4a', '#c8ff8a'], gravity: 900, drag: .5, speed: [10, 60], out: [-60, 0], size: [3.5, 6.5], from: [.1, .5], life: [.5, .9] },
      { type: 'bubble', rate: 2, colors: ['#5ae02a', '#c8ff8a'], gravity: -50, speed: [10, 40], size: [10, 15], life: [.6, 1] },
      { type: 'bubble', rate: 8, colors: ['#5ae02a', '#c8ff8a'], gravity: -60, speed: [10, 50], size: [3, 6], life: [.5, 1] },
      { type: 'smoke', rate: 4, colors: ['#2a5a14', '#2a4a14'], gravity: -30, speed: [20, 80], size: [20, 44], alpha: .25, life: [.7, 1.4] }
    ],
    impact: {
      flash: { color: '#9aff6a', size: 90, alpha: .35 }, ring: { color: '#5ae02a', size: 120, width: 2.5 }, flare: false, lines: false,
      burst: [{ type: 'drop', count: 22, colors: ['#3aa81a', '#7aff4a'], speed: [200, 520], gravity: 1100, size: [4, 8], life: [.5, .9] },
              { type: 'bubble', count: 14, colors: ['#5ae02a', '#c8ff8a'], speed: [40, 200], gravity: -80, size: [5, 12], life: [.5, 1] },
              { type: 'smoke', count: 8, colors: ['#2a5a14'], speed: [40, 140], size: [26, 56], alpha: .25 }],
      shake: 4, life: .6
    }
  });

  P.dark = base({
    name: '어둠', bloom: .6, blade: { heat: '#8a4dff', tip: '#e8d8ff' },
    trail: trail({
      shape: 'dark', echo: 1, streaks: 0, life: .45,
      colors: [[0, '#000000'], [.35, '#2a0a3a'], [.7, '#8a4dff'], [1, '#e8d8ff']],
      back: '#000000', backAlpha: 0, dissolve: { scale: 5, soft: .3, amount: 1.15, across: 2.4 }, scroll: 1.1, streak: .45
    }),
    particles: [
      { type: 'smoke', rate: 6, colors: ['#2a1048', '#3a1a6a'], gravity: -30, speed: [20, 90], out: [20, 80], size: [24, 52], alpha: .3, life: [.6, 1.2] },
      { type: 'tendril', rate: 7, aim: true, colors: ['#5a2aa8', '#8a4dff', '#b88aff'], speed: [60, 160], out: [0, 40], drag: 5, size: [12, 20], len: 2, life: [.45, .8] },
      { type: 'mist', rate: 5, colors: ['#3a1a6a', '#8a4dff'], speed: [20, 70], size: [14, 26], drag: 2, life: [.5, 1], alpha: .5 },
      { type: 'mote', rate: 6, colors: ['#8a4dff', '#e8d8ff'], speed: [30, 140], size: [2, 3.5] }
    ],
    impact: {
      flash: { color: '#6a2dff', size: 120, alpha: .55 }, ring: { color: '#5a2aa8', size: 140, width: 3 }, flare: false,
      burst: [{ type: 'smoke', count: 10, colors: ['#2a1048'], speed: [40, 160], size: [30, 64], alpha: .35 },
              { type: 'tendril', count: 9, aim: true, colors: ['#3a1a6a', '#6a35d0', '#a070ff'], speed: [160, 320], drag: 6, size: [14, 22], len: 2.2, life: [.4, .6] },
              { type: 'mote', count: 20, colors: ['#8a4dff', '#e8d8ff'], speed: [150, 420] }],
      shake: 7, life: .55
    }
  });

  /* 색 하나 + 종류(kind)로 프리셋 자동 생성 */
  const toRgb = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const toHex = (c) => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mul = (c, k) => c.map(v => v * k);
  const mix = (c, k) => c.map(v => v + (255 - v) * k);

  const KIND = {
    fire: 'fire', ice: 'ice', snow: 'snow', lightning: 'lightning', magic: 'arcane', arcane: 'arcane', holy: 'holy', poison: 'poison', dark: 'dark'
  };

  V.fromColor = function (hex, kind) {
    const tpl = P[KIND[kind] || 'arcane'];
    const c = toRgb(hex);
    const dark = kind === 'dark';
    const stops = dark
      ? [[0, '#000000'], [.35, toHex(mul(c, .3))], [.7, toHex(c)], [1, toHex(mix(c, .85))]]
      : [[0, toHex(mul(c, .12))], [.22, toHex(mul(c, .55))], [.45, toHex(c)], [.68, toHex(mix(c, .55))], [.86, toHex(mix(c, .85))], [1, '#ffffff']];
    const pal = [toHex(mix(c, .4)), toHex(c), toHex(mix(c, .8))];
    const recolor = (p) => {
      if (!p) return p;
      const q = Object.assign({}, p);
      if (q.colors) q.colors = q.type === 'smoke' ? [toHex(mul(c, .15)), toHex(mul(c, .22))] : pal;
      return q;
    };
    const imp = tpl.impact;
    return {
      name: '직접 만들기', bloom: tpl.bloom,
      blade: { heat: hex, tip: toHex(mix(c, .85)) },
      trail: Object.assign({}, tpl.trail, { colors: stops, back: toHex(mul(c, .06)) }),
      particles: tpl.particles.map(recolor),
      impact: Object.assign({}, imp, {
        flash: imp.flash && Object.assign({}, imp.flash, { color: toHex(mix(c, .4)) }),
        ring: imp.ring && Object.assign({}, imp.ring, { color: hex }),
        star: imp.star && Object.assign({}, imp.star, { color: toHex(mix(c, .6)) }),
        burst: (imp.burst || []).map(recolor)
      })
    };
  };
})();
