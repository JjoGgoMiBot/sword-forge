# 생성 원본(PNG, 검정 배경) → 투명 WebP. 가장자리에서 이어진 검정만 지우고(안쪽 어두운 부분은 보존) 경계를 부드럽게 한다.
import sys, numpy as np
from PIL import Image, ImageFilter
from PIL import ImageDraw
OUT = '../../assets/photo/'
def cut(im, thr=5):
    a = np.asarray(im.convert('RGB')).astype(np.int16)
    m = Image.fromarray(((a.max(axis=2) < thr) * 255).astype('uint8')).convert('RGB')
    H, W = m.size[1], m.size[0]
    for x in range(0, W, 3):
        for y in (0, H - 1):
            if m.getpixel((x, y))[0] == 255: ImageDraw.floodfill(m, (x, y), (128, 128, 128))
    for y in range(0, H, 3):
        for x in (0, W - 1):
            if m.getpixel((x, y))[0] == 255: ImageDraw.floodfill(m, (x, y), (128, 128, 128))
    bg = np.asarray(m)[..., 0] == 128
    alpha = Image.fromarray(((~bg) * 255).astype('uint8')).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    r = im.convert('RGBA'); r.putalpha(alpha); return r
def glow(im):  # 불·연기: 밝기 = 투명도
    a = np.asarray(im.convert('RGB')).astype(np.float32)
    m = a.max(axis=2, keepdims=True).clip(1, 255)
    al = (np.clip((m[..., 0] - 6) / 60, 0, 1) * 255).astype('uint8')
    rgb = np.clip(a * 255 / m, 0, 255).astype('uint8')
    return Image.fromarray(np.dstack([rgb, al]), 'RGBA')
def trim(im, pad=6):
    b = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    im = im.crop(b); w, h = im.size
    c = Image.new('RGBA', (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0)); c.paste(im, (pad, pad)); return c
def fit(im, m):
    s = m / max(im.size)
    return im.resize((round(im.size[0] * s), round(im.size[1] * s)), Image.LANCZOS) if s < 1 else im
def save(im, name, q=88): im.save(OUT + name + '.webp', quality=q, method=6, exact=True); print(name, im.size)
def cells(path, cols, rows):
    im = Image.open(path).convert('RGB'); w, h = im.size
    return [im.crop((c * w // cols, r * h // rows, (c + 1) * w // cols, (r + 1) * h // rows)) for r in range(rows) for c in range(cols)]
def keep(path, name, m, fn=cut):
    save(fit(trim(fn(Image.open(path).convert('RGB'))), m), name)
for i, nm in enumerate(['tile', 'gem', 'bomb']): save(fit(trim(cut(cells('mines.png', 3, 1)[i])), 300), 'ac-mines-' + nm)
for i, nm in enumerate(['small', 'big', 'gold']): save(fit(trim(cut(cells('boxes.png', 3, 1)[i])), 360), 'ac-box-' + nm)
for i in range(7): save(fit(trim(cut(cells('prizes.png', 4, 2)[i])), 300), 'ac-prize-%d' % i)
c = cells('gift.png', 2, 1); save(fit(trim(cut(c[0])), 360), 'ac-gift'); save(fit(trim(cut(c[1])), 360), 'ac-bowl')
keep('wheel.png', 'ac-wheel', 640); keep('rocket.png', 'ac-rocket', 420); keep('blast.png', 'ac-blast', 640, glow)
keep('cardface.png', 'ac-card-face', 420)
for n in ('cylinder', 'pistol'):
    try: keep(n + '.png', 'ac-' + n, 520, (lambda im: cut(im, 40)))
    except FileNotFoundError: print('missing', n)
Image.open('baccarat.png').convert('RGB').resize((1000, 667), Image.LANCZOS).save(OUT + 'ac-bacc-felt.webp', quality=84, method=6)
Image.open('felt.png').convert('RGB').resize((512, 512), Image.LANCZOS).save(OUT + 'ac-felt.webp', quality=82, method=6)

def cyl(im):
    r = cut(im, 5); b = r.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    x0, y0 = b[0], b[1]; bw, bh = b[2] - b[0], b[3] - b[1]
    m = Image.new('L', r.size, 0); ImageDraw.Draw(m).ellipse((x0 - 8, y0 - 8, x0 + int(bw * .82), y0 + bh + 8), fill=255)
    a = np.minimum(np.asarray(r.getchannel('A')), np.asarray(m.filter(ImageFilter.GaussianBlur(3))))
    r.putalpha(Image.fromarray(a)); return r
keep('revolver.png','ac-cylinder',460,cyl)
