#!/usr/bin/env python3
"""One-off: cuts the college uniform figures out of the labelled uniform sheets into public/injury/<logoId>.webp, the same way make-injury-figures.py does for the NFL.
A team on two sheets keeps the picture from the earlier (larger) one. usage: make-college-figures.py <images-dir> [out-dir]"""
import sys, os
import numpy as np
from PIL import Image
from injury_fig_lib import make, runs

imgs, out = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else "public/injury")
ALIAS = {"cal": "california", "pitt": "pittsburgh", "app-state": "appalachian-state", "umass": "umass", "texas-a-m": "texas-a-m", "texas-a-m": "texas-a-m", "texas-a--m": "texas-a-m", "ole-miss": "ole-miss", "miami": "miami-fl-", "ohio": "ohio", "uconn": "uconn", "unlv": "unlv", "utsa": "utsa", "uab": "uab", "ucf": "ucf", "ucla": "ucla", "usc": "usc", "tcu": "tcu", "smu": "smu", "byu": "byu", "fiu": "fiu", "lsu": "lsu", "nc-state": "nc-state", "texas-a": "texas-a-m", "texas-a-": "texas-a-m", "charlotte": "charlotte", "texas-state": "texas-state"}
def ids(names): return [ALIAS.get(n, n) for n in names.lower().replace("&", "").replace(" ", "-").split(",")]
def L(s): return [ids(x.strip().replace(" ", "-")) [0] for x in s.split(",")]

# sheet file -> rows of team names, in picture order
SHEETS = {
  "11.webp": [
    "Alabama,Auburn,Florida,Georgia,Kentucky,LSU,Ole Miss,Mississippi State,Missouri,South Carolina,Tennessee,Vanderbilt",
    "Arkansas,Oklahoma,Texas,Texas A M,Texas Tech,Baylor,BYU,Cincinnati,Houston,Iowa State,Kansas,Kansas State",
    "UCF,Colorado,Arizona,Arizona State,Utah,TCU,Boise State,Fresno State,Oregon State,Stanford,Cal,SMU",
    "USC,Boston College,Clemson,Florida State,Miami,Georgia Tech,Louisville,NC State,Wake Forest,Virginia,Virginia Tech,Duke",
    "Pitt,Syracuse,North Carolina,App State,Coastal Carolina,James Madison,Old Dominion,Marshall,Western Kentucky,Middle Tennessee,FIU,UAB",
  ],
  "12.webp": [
    "Boston College,Cal,Clemson,Duke,Florida State,Georgia Tech,Louisville,Miami,NC State,North Carolina,Pitt,SMU,Stanford,Syracuse",
    "Virginia,Virginia Tech,Wake Forest,Army,Charlotte,East Carolina,Florida Atlantic,Memphis,Navy,North Texas,Rice,South Florida,Temple,Tulane",
    "TCU,Tulsa,UAB,UTSA,Utah,Arizona State,Baylor,BYU,Iowa,Maryland,Michigan,Michigan State,Minnesota,Nebraska,Oklahoma State",
    "Ohio State,Oregon,Penn State,Purdue,Rutgers,USC,UCLA,Washington,Wisconsin,Delaware,Delaware,FIU,Jacksonville State,Kennesaw State,Liberty",
  ],
  "10.webp": [
    "Alabama,App State,Arizona,Arizona State,Arkansas,Auburn,Baylor,Boise State,Boston College,BYU,Cal,Central Michigan,Charlotte,Clemson,Coastal Carolina,Colorado",
    "Duke,East Carolina,Florida,Florida Atlantic,Florida State,Fresno State,Georgia,Georgia Southern,Georgia Tech,Hawaii,Houston,Illinois,Indiana,Iowa,Iowa State,James Madison",
    "Kansas,Kansas State,Kentucky,Liberty,Louisiana,Louisiana Tech,LSU,Marshall,Maryland,Memphis,Miami,Michigan,Michigan State,Middle Tennessee,Minnesota,Mississippi State",
    "Missouri,Navy,Nebraska,Nevada,New Mexico,New Mexico State,North Carolina,North Texas,Northern Illinois,Northwestern,Notre Dame,Ohio,Ohio State,Oklahoma,Oklahoma State,Old Dominion",
    "Ole Miss,Oregon,Oregon State,Penn State,Pitt,Purdue,Rice,Rutgers,San Diego State,San Jose State,SMU,South Alabama,South Carolina,South Florida,Stanford,Syracuse",
    "TCU,Temple,Tennessee,Texas,Texas A M,Texas State,Texas Tech,Toledo,Troy,Tulane,Tulsa,UCF,UCLA,UNLV,USC,Utah",
    "UTEP,UTSA,Vanderbilt,Virginia,Virginia Tech,Wake Forest,Washington State,West Virginia,Western Kentucky,Western Michigan,Wisconsin,Wyoming",
  ],
}

# cuts that came out badly (a neighbour in the frame, a merged helmet): the team is taken from the next sheet instead
BAD = {("12.webp", "charlotte"), ("12.webp", "michigan-state"), ("12.webp", "liberty"), ("12.webp", "minnesota"), ("11.webp", "james-madison")}

def rowbands(a, n):
    b = [r for r in runs(a.any(1)) if r[1] - r[0] > 40]
    while len(b) < n:  # two rows run together: split the tallest where the fewest pixels are
        i = max(range(len(b)), key=lambda k: b[k][1] - b[k][0]); y0, y1 = b[i]
        prof = a[y0:y1 + 1].sum(1); lo = int((y1 - y0) * .35); hi = int((y1 - y0) * .65)
        cut = y0 + lo + int(np.argmin(prof[lo:hi]))
        b[i:i + 1] = [(y0, cut - 1), (cut, y1)]
    return b

def heads(a, y0, y1):
    """Centres of the heads in a row (the top of each figure), found on the top rows so logos and labels above or below do not matter."""
    top = a[y0:y0 + max(10, int((y1 - y0) * .13))].any(0)
    return [r for r in runs(top) if r[1] - r[0] >= 5]

def figures(sheet, rows):
    im = Image.open(f"{imgs}/{sheet}").convert("RGBA")
    a = np.array(im)[:, :, 3] > 40
    bands = rowbands(a, len(rows))
    out = []
    for names, (y0, y1) in zip(rows, bands):
        n = len(names.split(","))
        hc = heads(a, y0, y1)
        out.append((names.split(","), hc, (y0, y1)))
    return im, a, out

def centres(hr, n):
    hr = [list(r) for r in hr]
    while len(hr) < n:  # two helmets that touch read as one run: split the widest
        i = max(range(len(hr)), key=lambda k: hr[k][1] - hr[k][0]); a0, a1 = hr[i]; m = (a0 + a1) // 2
        hr[i:i + 1] = [[a0, m], [m + 1, a1]]
    while len(hr) > n:  # a helmet broken in two: join the closest pair
        i = min(range(len(hr) - 1), key=lambda k: hr[k + 1][0] - hr[k][1])
        hr[i:i + 2] = [[hr[i][0], hr[i + 1][1]]]
    return [(r[0] + r[1]) / 2 for r in hr]

def main():
    import json
    known = set(json.load(open("src/data/logos.json")))
    done, report = set(), []
    os.makedirs(out, exist_ok=True)
    sheet_rows = {k: v for k, v in SHEETS.items() if k != "10.webp-last"}
    for sheet, rows in sheet_rows.items():
        im, a, rr = figures(sheet, rows)
        for ri, (names, hc, (y0, y1)) in enumerate(rr):
            if sheet == "10.webp" and ri == len(rr) - 1: continue  # the short last row is cut unreliably
            cs = centres(hc, len(names)); pitch = float(np.median(np.diff(cs)))
            for name, cx in zip(names, cs):
                slug = name.lower().replace("&", "").replace(" ", "-"); key = ALIAS.get(slug, slug)
                if key not in known or key in done or (sheet, key) in BAD:
                    if key not in known: report.append(f"{sheet}: no logo id {key}")
                    continue
                cell = im.crop((int(cx - pitch / 2), y0, int(cx + pitch / 2), y1 + 1))
                try: fig = make(cell)
                except Exception as e: report.append(f"{sheet}: {key} failed {e}"); continue
                fig.save(f"{out}/{key}.webp", quality=88, method=6); done.add(key)
    print(len(done), "teams"); print("\n".join(report))

if __name__ == "__main__":
    main()
