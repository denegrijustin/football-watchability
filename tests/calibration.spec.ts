import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { BREAK_EVEN, PRIOR_GAMES, calibratedCover, historyFor, nflHistory, cfbHistory, overall, wilson, type History } from "../src/calibration";
import { buildModel } from "../src/spplus/data/model";
import type { NflData } from "../src/nfl/types";

const h = (b: [number, number, number, number, number][]): History => ({ league: "NFL", source: "test", buckets: b.map(([lo, hi, w, l, p]) => ({ label: `${lo}-${hi}`, lo, hi, w, l, p })) });

test("a hit rate is pulled toward a coin flip by the prior, more the less history there is", () => {
  const few = h([[0, 3, 8, 2, 0], [3, Infinity, 0, 0, 0]]);
  expect(calibratedCover(few, 1)).toBeCloseTo((8 + 0.5 * PRIOR_GAMES) / (10 + PRIOR_GAMES), 6); // 80% over ten games barely moves it
  expect(calibratedCover(few, 1)).toBeLessThan(0.53);
  expect(calibratedCover(few, 5)).toBe(0.5); // no history at all: a coin flip
  const many = h([[0, 3, 800, 600, 0], [3, Infinity, 0, 0, 0]]);
  expect(calibratedCover(many, 1)).toBeGreaterThan(0.54);
});

test("a bucket is proven only when even the low end of its range beats break-even", () => {
  expect(historyFor(h([[0, 9, 600, 400, 0]]), 1).proof).toBe("proven");
  expect(historyFor(h([[0, 9, 56, 44, 0]]), 1).proof).toBe("promising"); // 56% over 100 games: above 52.4% but could be luck
  expect(historyFor(h([[0, 9, 40, 60, 0]]), 1).proof).toBe("unproven");
  const [lo, hi] = wilson(50, 100);
  expect(lo).toBeLessThan(0.5); expect(hi).toBeGreaterThan(0.5);
  expect(BREAK_EVEN).toBeCloseTo(0.5238, 3);
});

test("the real histories: NFL has hundreds of graded picks and has not beaten the line; college is the season so far", () => {
  const nfl: NflData = JSON.parse(readFileSync("src/data/nfl.json", "utf8"));
  const n = overall(nflHistory(nfl));
  expect(n.n).toBeGreaterThan(800);
  expect(n.pct!).toBeGreaterThan(0.44); expect(n.pct!).toBeLessThan(0.54);
  const c = overall(cfbHistory(buildModel(JSON.parse(readFileSync("src/data/spplus.json", "utf8")))));
  expect(c.n).toBeGreaterThan(100);
});

test("two picks with different edges in the same bucket do not get the same chance", () => {
  const hist = h([[0, 2, 40, 40, 0], [2, 4, 60, 40, 0], [4, 7, 30, 20, 0], [7, Infinity, 20, 10, 0]]);
  expect(calibratedCover(hist, 3)).toBeCloseTo((60 + 100) / (100 + 200), 6); // the middle of its bucket: exactly the bucket's rate
  expect(calibratedCover(hist, 2.4)).not.toBeCloseTo(calibratedCover(hist, 3.6), 4);
  expect(calibratedCover(hist, 3.6)).toBeGreaterThan(calibratedCover(hist, 2.4)); // between two anchors, so it slides between them
});
