import { expect, test } from "./fixtures";
import lore from "../src/data/rivalry-lore.json" with { type: "json" };
import { RIVALRIES } from "../scripts/rivalry.mjs";
import { loreFor, pairKey, stakes } from "../src/components/RivalryDeepCut";

const game = (a: string, b: string, extra: Record<string, unknown> = {}) =>
  ({ league: "CFB", teams: [{ name: a, logoId: a.toLowerCase(), rankings: [] }, { name: b, logoId: b.toLowerCase(), rankings: [] }], ...extra }) as never;

test("every rivalry story is complete, sourced, and about a rivalry the app already knows", () => {
  const known = new Set(RIVALRIES.map(([a, b]: string[]) => [a, b].sort().join("|")));
  const entries = Object.entries(lore.rivalries);
  expect(entries.length).toBeGreaterThanOrEqual(4);
  for (const [key, e] of entries as [string, { title: string; summary: string; origin: string[]; sources: { url: string }[]; trophy: { name: string; text: string } | null; moments: { year: number; text: string }[] }][]) {
    expect(known.has(key), `${key} is a rivalry in scripts/rivalry.mjs`).toBe(true);
    expect(key).toBe(key.split("|").sort().join("|"));
    expect(e.title.length).toBeGreaterThan(3);
    expect(e.summary.length).toBeGreaterThan(20);
    expect(e.origin.length).toBeGreaterThan(0);
    expect(e.sources.length, `${key} sources`).toBeGreaterThanOrEqual(2);
    for (const s of e.sources) expect(s.url).toMatch(/^https:\/\//);
    for (const m of e.moments) expect(m.year).toBeGreaterThan(1880);
    // an all-time record changes every season, so it belongs to the live data, not to the story
    expect(JSON.stringify(e)).not.toMatch(/\b\d{2,3}\s?[–-]\s?\d{2,3}\s?[–-]\s?\d\b/);
  }
});

test("a rivalry game finds its story whichever team is listed first, and other games find none", () => {
  expect(pairKey(["texas", "oklahoma"])).toBe("oklahoma|texas");
  expect(loreFor(game("Texas", "Oklahoma"))?.title).toBe("Red River Rivalry");
  expect(loreFor(game("Oklahoma", "Texas"))?.title).toBe("Red River Rivalry");
  expect(loreFor(game("Alabama", "Auburn"))?.title).toBe("The Iron Bowl");
  expect(loreFor(game("Kansas", "Duke"))).toBeNull();
});

test("what is at stake this year comes from the game's rankings, group and trophy", () => {
  const g = game("Texas", "Oklahoma", { rivalry: { sameGroup: true, trophy: { name: "Golden Hat" } } });
  (g as { teams: { rankings: string[] }[] }).teams[0].rankings = ["AP #3"];
  (g as { teams: { rankings: string[] }[] }).teams[1].rankings = ["AP #12"];
  const s = stakes(g).join(" ");
  expect(s).toMatch(/Texas is No\. 3 and Oklahoma is No\. 12/);
  expect(s).toMatch(/conference game/);
  expect(s).toMatch(/Golden Hat/);
  expect(stakes(game("Texas", "Oklahoma"))).toEqual([]);
});
