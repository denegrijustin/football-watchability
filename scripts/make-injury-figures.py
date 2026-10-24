#!/usr/bin/env python3
"""One-off: cuts the 32 NFL uniform figures out of the team-uniform sheet into public/injury/<logoId>.webp, all on the same 260 x 460 canvas
(head at the top, feet at the bottom) so the injury glows line up. The sheet's team logos sit across the shins, so each figure is cut above them
(at 70% of its height) and the lower legs and shoes are redrawn in the colour of the sock the sprite ends in.
usage: make-injury-figures.py <uniform-sheet.webp> [out-dir]"""
import sys
import os
from PIL import Image
from injury_fig_lib import make

src, out = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else "public/injury")
im = Image.open(src).convert("RGBA")
COLS = [(33, 127), (157, 249), (272, 362), (384, 474), (500, 599), (631, 727), (753, 844), (868, 958), (983, 1077)]
ROWS = [(0, 195), (195, 383), (383, 570), (570, 750)]
# sheet position -> team (the sheet holds four extra alternates, which are left out)
ORDER = ["arizona-cardinals", "atlanta-falcons", "baltimore-ravens", "buffalo-bills", "carolina-panthers", "chicago-bears", "cincinnati-bengals", "cleveland-browns", None,
         "dallas-cowboys", "denver-broncos", "detroit-lions", "green-bay-packers", "houston-texans", "indianapolis-colts", None, "jacksonville-jaguars", "kansas-city-chiefs",
         "las-vegas-raiders", "los-angeles-chargers", "los-angeles-rams", "miami-dolphins", "minnesota-vikings", "new-england-patriots", None, "new-orleans-saints", "new-york-giants",
         "new-york-jets", "philadelphia-eagles", "pittsburgh-steelers", "san-francisco-49ers", "seattle-seahawks", None, "tampa-bay-buccaneers", "tennessee-titans", "washington-commanders"]
import os
os.makedirs(out, exist_ok=True)
for i, key in enumerate(ORDER):
    if not key: continue
    r, c = divmod(i, 9)
    x0, x1 = COLS[c]; y0, y1 = ROWS[r]
    fig = make(im.crop((x0 - 6, y0, x1 + 6, y1)))
    fig.save(f"{out}/{key}.webp", quality=88, method=6)
print("done")
