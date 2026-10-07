import { test, expect } from "@playwright/test";
import { fpiConfRanks } from "../scripts/ranks.mjs";
import { rankLine, rankTitle } from "../src/rankLine";

const standings = (names: Record<string, string[]>) => ({
  children: Object.entries(names).map(([abbreviation, ids]) => ({ abbreviation, standings: { entries: ids.map((id) => ({ team: { id } })) } })),
});

test("conference rank is the team's place among its conference by the same FPI rank as the overall rank", () => {
  // Standings order (a 2-2 team near the bottom) must not decide it: Dallas is 7th overall, so it is 5th of these six.
  const fpi = new Map([["a", 1], ["dal", 7], ["b", 2], ["c", 3], ["tb", 30], ["d", 4]]);
  const out = fpiConfRanks("NFL", standings({ NFC: ["tb", "dal", "a", "b", "c", "d"] }), fpi);
  expect(out.get("NFL:dal")).toEqual({ conf: 5, confSize: 6, confName: "NFC" });
  expect(out.get("NFL:a")!.conf).toBe(1);
  expect(out.get("NFL:tb")!.conf).toBe(6);
  // A better overall rank is never a worse conference rank.
  const rows = [...out.entries()].map(([k, v]) => ({ id: k.split(":")[1], conf: v.conf! }));
  const byOverall = [...rows].sort((x, y) => fpi.get(x.id)! - fpi.get(y.id)!);
  expect(byOverall.map((r) => r.conf)).toEqual([1, 2, 3, 4, 5, 6]);
  // Teams with no FPI rank get no conference rank rather than a made-up one.
  expect(fpiConfRanks("NFL", standings({ AFC: ["x", "y"] }), new Map([["x", 5]])).get("NFL:y")!.conf).toBeNull();
  // Leagues keep their own keys (ids overlap between NFL and college).
  expect(fpiConfRanks("CFB", standings({ SEC: ["a"] }), fpi).has("CFB:a")).toBe(true);
});

test("the rank line and tooltip say what each number is", () => {
  const r = { conf: 3, confSize: 16, confName: "NFC", overall: 7, overallOf: 32, confBasis: "fpi" as const };
  expect(rankLine(r)).toBe("NFC #3 · #7 overall");
  expect(rankTitle(r)).toBe("3rd of 16 in the NFC by ESPN FPI · 7th of 32 overall (ESPN FPI)");
  // Games archived before the change carry the old standings order and are still described as standings.
  expect(rankTitle({ ...r, confBasis: undefined })).toContain("in the NFC standings");
});
