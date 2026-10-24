"""Shared by make-injury-figures.py and make-college-figures.py: turns one cut-out uniform figure into the 260 x 460 injury picture."""
from PIL import Image, ImageDraw
import numpy as np

W, H, TOP, FEET = 260, 460, 8, 452
K = 0.70

def runs(v):
    r, s = [], None
    for i, x in enumerate(v):
        if x and s is None: s = i
        if not x and s is not None: r.append((s, i - 1)); s = None
    if s is not None: r.append((s, len(v) - 1))
    return r

def make(cell):
    a = np.array(cell)[:, :, 3] > 40
    top, bot = max(runs(a.any(1)), key=lambda r: r[1] - r[0])  # the tallest run is the figure; a sliver is the logo of the row above
    a[:top] = False; a[bot + 1:] = False
    hf = bot - top
    # the logo is the first thing to fill the gap between the legs below the crotch
    cx0 = int(np.mean(np.where(a[top:int(top + .5 * hf)].any(0))[0][[0, -1]]))
    cut = int(top + K * hf)
    gap = False
    for y in range(int(top + .55 * hf), bot):
        mid = a[y, cx0 - 2:cx0 + 3]
        if not mid.any(): gap = True
        elif gap and mid.all(): cut = y - 3; break
    cut = max(int(top + .66 * hf), min(cut, int(top + .80 * hf)))
    xs = np.where(a[top:cut].any(0))[0]; cx = (xs[0] + xs[-1]) / 2
    s = (FEET - TOP) / hf
    body = cell.crop((0, top, cell.width, cut)).resize((round(cell.width * s), round((cut - top) * s)), Image.LANCZOS)
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ox = round(W / 2 - cx * s)
    canvas.paste(body, (ox, TOP), body)
    ycut = TOP + body.height
    # the legs at the cut: two runs on the last rows
    row = np.array(body)[-3:, :, :]
    al = (row[:, :, 3] > 100).all(0)
    legs = [r for r in runs(al) if r[1] - r[0] > 8]
    legs = sorted(legs, key=lambda r: r[1] - r[0])[-2:]
    legs.sort()
    if len(legs) < 2: legs = [(round(body.width * .30), round(body.width * .47)), (round(body.width * .53), round(body.width * .70))]
    d = ImageDraw.Draw(canvas)
    for (l0, l1) in legs:
        px = np.array(body)[-14:-2, l0 + 3:l1 - 3, :3].reshape(-1, 3)
        col = tuple(int(v) for v in np.median(px, axis=0))
        x0, x1 = ox + l0, ox + l1
        w = x1 - x0; mid = (x0 + x1) / 2
        shoe_top = FEET - 34
        for y in range(ycut - 2, shoe_top):
            t = (y - ycut) / max(1, shoe_top - ycut)
            h2 = w / 2 * (1 - 0.36 * t + 0.10 * np.sin(np.pi * min(1, t * 1.3)))  # calf swell, then the ankle
            for x in range(int(mid - h2), int(mid + h2) + 1):
                u = (x - (mid - h2)) / max(1, 2 * h2)
                k = 1 - 0.30 * abs(2 * u - 1) ** 2
                d.point((x, y), fill=tuple(int(c * k) for c in col) + (255,))
        sw = w * 0.50
        d.rounded_rectangle((mid - sw, shoe_top - 2, mid + sw, FEET - 5), radius=10, fill=(232, 235, 239, 255), outline=(140, 146, 154, 255), width=2)
        d.rounded_rectangle((mid - sw - 1, FEET - 11, mid + sw + 1, FEET), radius=6, fill=(48, 52, 58, 255))
    # soften the seam
    return canvas

