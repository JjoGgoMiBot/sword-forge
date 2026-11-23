import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
p = 'arcade-ui.js'
s = open(p, encoding='utf8').read()


def rep(a, b):
    global s
    assert s.count(a) >= 1, a[:70]
    s = s.replace(a, b, 1)


rep("const card = (c, h)", "const ph = n => 'assets/photo/ac-' + n + '.webp';\nconst pic = (n, c = '') => '<img class=\"ac-pic ' + c + '\" src=\"' + ph(n) + '\" alt=\"\" draggable=\"false\">';\nconst rocket = new Image(); rocket.src = ph('rocket');\nconst card = (c, h)")
i = s.index("  function rouletteScene(g) {")
j = s.index("  function hiloScene")
s = s[:i] + """  function rouletteScene(g) {
    const shots = g?.shots || 0, boom = g?.done && g.outcome === 'bang';
    return '<div class="ac-cylinder' + (boom ? ' boom' : '') + '" role="img" aria-label="6칸 중 ' + shots + '칸 당김">' + pic('cylinder', 'ac-cyl') + (boom ? pic('blast', 'ac-boom') : '') + '<b>' + (g ? shots + ' / 5' : '6칸') + '</b></div>';
  }
""" + s[j:]
rep("(cls === 'safe' ? '💎' : cls ? '💣' : '')", "(cls === 'safe' ? pic('mines-gem') : cls ? pic('mines-bomb') : '')")
rep("'<div class=\"ac-ball ' + r.color + '\">' + r.number + '</div>' + banner(", "'<div class=\"ac-wheelbox\">' + pic('wheel', 'ac-wheel-img spin') + '<div class=\"ac-ball ' + r.color + '\">' + r.number + '</div></div>' + banner(")
rep("'<p class=\"ac-empty\">0~36 중 공이 멈출 곳에 걸어요.</p>'", "'<div class=\"ac-wheelbox\">' + pic('wheel', 'ac-wheel-img') + '</div><p class=\"ac-empty\">0~36 중 공이 멈출 곳에 걸어요.</p>'")
rep("'<div class=\"ac-prize tier' + r.tier + '\"><b>'", "'<div class=\"ac-prize tier' + r.tier + '\">' + pic('prize-' + r.tier) + '<b>'")
rep("'<p class=\"ac-empty\">상자를 골라 열어요. 가격이 곧 베팅이에요.</p>'", "'<div class=\"ac-boxrow\">' + Object.keys(BOXES).map(k => pic('box-' + k)).join('') + '</div><p class=\"ac-empty\">상자를 골라 열어요. 가격이 곧 베팅이에요.</p>'")
rep("'<button class=\"' + (k === 'small' ? 'primary' : '') + '\" data-ac=\"play\" data-choice=\"' + k + '\" ' + (balance() < price ? 'disabled' : '') + '>' + name", "'<button class=\"ac-boxb ' + (k === 'small' ? 'primary' : '') + '\" data-ac=\"play\" data-choice=\"' + k + '\" ' + (balance() < price ? 'disabled' : '') + '>' + pic('box-' + k) + name")
rep("'<div class=\"ac-stage ac-beg\">' + (r ?", "'<div class=\"ac-stage ac-beg\">' + pic('bowl', 'ac-hero') + (r ?")
rep("return summary([['오늘 더 보낼 수 있는 초코'", "return '<div class=\"ac-stage ac-giftbox\">' + pic('gift', 'ac-hero') + '</div>' + summary([['오늘 더 보낼 수 있는 초코'")
rep("'<div class=\"ac-stage\"><p class=\"ac-empty\">지금 이 광장에", "'<div class=\"ac-stage\">' + pic('gift', 'ac-hero') + '<p class=\"ac-empty\">지금 이 광장에")
rep("'<div class=\"ac-stage ac-party\"><ul", "'<div class=\"ac-stage ac-party\">' + pic('pistol', 'ac-hero wide') + '<ul")
rep("<b>' + (p.dead ? '💀' : p.winner ? '🏆' : '🙂') + '</b>'", "<b role=\"img\" aria-label=\"' + (p.dead ? '탈락' : p.winner ? '우승' : '생존') + '\">' + (p.dead ? pic('blast', 'ac-seat') : p.winner ? pic('prize-6', 'ac-seat') : '<img class=\"ac-pic ac-seat\" src=\"assets/photo/choco-coin.webp\" alt=\"\" draggable=\"false\">') + '</b>'")
rep("html += '<div class=\"ac-stage ac-duel ' + v.phase + '\">';", "html += '<div class=\"ac-stage ac-duel ' + v.phase + '\"><div class=\"ac-faceoff\">' + pic('pistol', 'ac-hero flip') + pic('pistol', 'ac-hero') + '</div>';")
rep("    g.strokeStyle = '#ad6951'; g.lineWidth = 3; g.stroke();", """    g.strokeStyle = '#e9b872'; g.lineWidth = 3; g.stroke();
    if (rocket.complete && rocket.naturalWidth) {
      const f = t => [8 + (w - 16) * t / span, hh - 8 - (hh - 16) * (Math.pow(2, t / v.doubleMs) - 1) / (top - 1)];
      const [x1, y1] = f(e), [x0, y0] = f(e * 59 / 60), rw = 46, rh = rw * rocket.naturalHeight / rocket.naturalWidth;
      g.save(); g.translate(Math.min(w - rw / 2, Math.max(rw / 2, x1)), Math.min(hh - rh / 2, Math.max(rh / 2, y1))); g.rotate(Math.atan2(y1 - y0, x1 - x0) + Math.PI / 4);
      g.drawImage(rocket, -rw / 2, -rh / 2, rw, rh); g.restore();
    }""")
rep("if (v.last && !running) html += '<p class=\"ac-crash-last\">", "if (v.last && !running) html += pic('blast', 'ac-crash-blast') + '<p class=\"ac-crash-last\">")
open(p, 'w', encoding='utf8').write(s)

c = open('style.css', encoding='utf8').read().split('\n')
k = [i for i, l in enumerate(c) if l.startswith('.ac-cylinder{')][0]
c[k] = ".ac-cylinder{position:relative;width:170px;display:grid;justify-items:center;padding-bottom:8px}.ac-cyl{width:150px;filter:drop-shadow(0 8px 8px #0008)}.ac-boom{position:absolute;left:50%;top:50%;width:200px;max-width:none;transform:translate(-50%,-50%);animation:ac-pop .5s ease-out}.ac-cylinder b{position:absolute;bottom:-6px;padding:1px 12px;border-radius:999px;background:#000b;color:#f4efe0;font-size:13px}"
c.append(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'apply.css'), encoding='utf8').read())
open('style.css', 'w', encoding='utf8').write('\n'.join(c))
print('done')
