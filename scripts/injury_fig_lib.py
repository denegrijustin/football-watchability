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
    # neighbours' arms reach into the cell: keep only the columns of the figure's own torso (the run that holds the middle of the cell)
    mid_x = cell.width // 2
    span = [r for r in runs(a[int(top + .22 * hf):int(top + .42 * hf)].any(0)) if r[0] <= mid_x <= r[1]]
    if span:
        x0s, x1s = span[0]
        a[:, :x0s] = False; a[:, x1s + 1:] = False
        arr = np.array(cell); arr[:, :x0s, 3] = 0; arr[:, x1s + 1:, 3] = 0; cell = Image.fromarray(arr)
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
    # the legs at the cut: two runs on the last rows; when they are not two sensible legs, stand them where legs go
    row = np.array(body)[-3:, :, :]
    al = (row[:, :, 3] > 100).all(0)
    legs = [r for r in runs(al) if r[1] - r[0] > 8]
    legs = sorted(legs, key=lambda r: r[1] - r[0])[-2:]
    legs.sort()
    lw, lc = 0.100 * hf * s, 0.078 * hf * s
    bc = W / 2 - ox  # the figure's middle, in body pixels
    if len(legs) < 2 or any(not (0.6 * lw < r[1] - r[0] < 1.5 * lw) for r in legs) or not (1.2 * lc < (legs[1][0] + legs[1][1] - legs[0][0] - legs[0][1]) / 2 < 3.2 * lc):
        legs = [(round(bc - lc - lw / 2), round(bc - lc + lw / 2)), (round(bc + lc - lw / 2), round(bc + lc + lw / 2))]
    d = ImageDraw.Draw(canvas)
    arr = np.array(body)
    for (l0, l1) in legs:
        l0 = max(0, l0); l1 = min(body.width - 1, l1)
        px = arr[-14:-2, l0 + 3:max(l0 + 4, l1 - 3), :3].reshape(-1, 3)
        col = tuple(int(v) for v in np.median(px, axis=0)) if len(px) else (200, 200, 200)
        x0, x1 = ox + l0, ox + l1
        w = x1 - x0; mid = (x0 + x1) / 2
        shoe_top = FEET - 34
        for y in range(ycut - 2, shoe_top):
            t = (y - ycut) / max(1, shoe_top - ycut)
            h2 = w / 2 * (1 - 0.36 * t + 0.10 * np.sin(np.pi * min(1, t * 1.3)))  # calf swell, then the ankle
            for k, (u0, u1) in enumerate(((-1, -.6), (-.6, -.2), (-.2, .2), (.2, .6), (.6, 1))):
                f = (1.0, 0.92, 0.88, 0.92, 0.80)[k] if k < 4 else 0.78
                d.line([(mid + u0 * h2, y), (mid + u1 * h2, y)], fill=tuple(int(c * f) for c in col) + (255,))
        sw = w * 0.50
        d.rounded_rectangle((mid - sw, shoe_top - 2, mid + sw, FEET - 5), radius=10, fill=(232, 235, 239, 255), outline=(140, 146, 154, 255), width=2)
        d.rounded_rectangle((mid - sw - 1, FEET - 11, mid + sw + 1, FEET), radius=6, fill=(48, 52, 58, 255))
    return canvas
