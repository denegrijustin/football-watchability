import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { backtestSlips, explain, gradeSlip, nflPicks, slipBreakEven, slipRecord, type GradedPick } from "../src/pickRecord";
import type { NflData } from "../src/nfl/types";

const pick = (o: Partial<GradedPick>): GradedPick => ({ id: "x", league: "NFL", week: 1, date: "2025-09-07", game: "A at B", away: "A", home: "B", pick: "Bears", need: 3, label: "Bears −3", edge: 4, projected: 7, margin: 10, coverBy: 7, result: "win", final: "A 10, B 20", ...o });

test("a pick's story says what it needed, what happened and how the ratings did", () => {
  expect(explain(pick({})).headline).toBe("Covered by 7");
  expect(explain(pick({})).why).toContain("laid 3 points and won by 10 points, clearing the number by 7 points");
  const near = explain(pick({ margin: 2, coverBy: -1, result: "loss" }));
  expect(near.headline).toBe("Missed by 1");
  expect(near.why).toContain("the game was won but the number was missed by 1 point");
  const dog = explain(pick({ need: -6.5, label: "Bears +6.5", margin: -3, coverBy: 3.5, projected: 1 }));
  expect(dog.why).toContain("took 6.5 points and lost by 3 points, inside the number by 3.5 points");
  expect(explain(pick({ need: 3, margin: 3, coverBy: 0, result: "push" })).headline).toContain("Push");
});

test("a slip hits only if every leg covers, and a push drops out of it", () => {
  const w = pick({}), l = pick({ result: "loss", coverBy: -2, margin: 1 }), ps = pick({ result: "push", coverBy: 0 });
  expect(gradeSlip([w, w]).result).toBe("win");
  expect(gradeSlip([w, w]).profit).toBeCloseTo((1 + 100 / 110) ** 2 - 1, 6);
  expect(gradeSlip([w, l]).result).toBe("loss");
  expect(gradeSlip([w, ps]).profit).toBeCloseTo(100 / 110, 6);
  expect(gradeSlip([ps, ps]).result).toBe("void");
  expect(slipBreakEven(2)).toBeCloseTo(0.2744, 3);
});

test("the NFL back-test builds each week's slips from its strongest picks and the record adds up", () => {
  const nfl: NflData = JSON.parse(readFileSync("src/data/nfl.json", "utf8"));
  const picks = nflPicks(nfl);
  expect(picks.length).toBeGreaterThan(20);
  for (const p of picks) expect(p.projected).toBeCloseTo(p.edge + p.need, 0);
  const slips = backtestSlips(picks, 3);
  expect(slips.length).toBeGreaterThan(5);
  for (const s of slips) { expect(s.legs).toHaveLength(3); expect(new Set(s.legs.map((l) => l.id)).size).toBe(3); }
  const r = slipRecord(slips);
  expect(r.w + r.l + r.v).toBe(slips.length);
});
