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
  expect(rankLine(r)).toBe("NFC #3 · #7 overall (FPI)"); // full lines name their source
  expect(rankLine(r, true)).toBe("NFC #3 · FPI #7"); // the compact line names the source of the national rank
  expect(rankLine(r, true, "AP #5")).toBe("NFC #3 · AP #5"); // a poll rank comes first when the team has one
  expect(rankLine({ ...r, confName: "Big Ten" }, true)).toBe("B1G #3 · FPI #7"); // the longest conference names shrink to fit the grid
  expect(rankLine({ ...r, conf: null, confName: null }, true)).toBe("FPI #7");
  expect(rankLine(r)).toBe("NFC #3 · #7 overall (FPI)"); // the full line is unchanged
  expect(rankTitle(r, "AP #5")).toBe("#5 in the AP poll · 3rd of 16 in the NFC by ESPN FPI · 7th of 32 overall (ESPN FPI)");
  expect(rankTitle(r)).toBe("3rd of 16 in the NFC by ESPN FPI · 7th of 32 overall (ESPN FPI)");
  // Games archived before the change carry the old standings order and are still described as standings.
  expect(rankTitle({ ...r, confBasis: undefined })).toContain("in the NFC standings");
});

test("ranks are labeled where they appear: on the cards, in the TV grid key and in the how-to", async ({ page }) => {
  await page.goto("/?league=NFL");
  await page.getByRole("button", { name: "Show game details" }).first().click();
  await expect(page.locator(".rank-line").first()).toContainText(/#\d+ overall \(FPI\)/);
  await expect(page.locator(".how-to")).toContainText("Rank line");
  await page.getByRole("button", { name: "TV grid" }).click();
  await expect(page.locator(".tv-key .k-rank")).toContainText("national rank (AP if ranked, otherwise ESPN FPI)");
  const compact = await page.locator(".tv-rank").allInnerTexts(); // compact, no label of its own; independents show just the national rank, labeled AP or FPI
  expect(compact.length).toBeGreaterThan(0);
  for (const t of compact) expect(t).toMatch(/^([^#]+ #\d+ · )?(AP|FPI) #\d+$/);
});

test("TV grid: every team shows its record, and the national rank is the AP rank when it has one, otherwise FPI", async ({ page }) => {
  await page.goto("/?league=CFB");
  await page.getByRole("button", { name: "TV grid" }).click();
  await expect(page.locator(".tv-game").first()).toBeVisible();
  const sides = await page.locator(".tv-side").evaluateAll((els) =>
    els.map((e) => ({ tag: e.querySelector(".tv-tag")?.textContent ?? "", rank: e.querySelector(".tv-rank")?.textContent ?? "" })),
  );
  expect(sides.length).toBeGreaterThan(0);
  for (const s of sides) expect(s.tag).toMatch(/^\d+-\d+(-\d+)?$/); // the record, ranked or not
  expect(sides.some((s) => /AP #\d+$/.test(s.rank))).toBe(true); // ranked teams show the AP rank
  expect(sides.some((s) => /FPI #\d+$/.test(s.rank))).toBe(true); // everyone else shows the FPI rank, labeled
  for (const s of sides) if (s.rank) expect(s.rank).toMatch(/(AP|FPI) #\d+$/);
});

test("TV grid: logos never sit on top of the record or rank text", async ({ page }) => {
  for (const league of ["CFB", "NFL"]) {
    await page.goto(`/?league=${league}`);
    await page.getByRole("button", { name: "TV grid" }).click();
    await expect(page.locator(".tv-game").first()).toBeVisible();
    const overlaps = await page.locator(".tv-side").evaluateAll((sides) => {
      const hits: string[] = [];
      for (const side of sides) {
        const img = side.querySelector("img")?.getBoundingClientRect();
        if (!img) continue;
        for (const text of side.querySelectorAll(".tv-tag, .tv-rank")) {
          const r = text.getBoundingClientRect();
          const w = Math.min(r.right, img.right) - Math.max(r.left, img.left);
          const h = Math.min(r.bottom, img.bottom) - Math.max(r.top, img.top);
          if (w > 1 && h > 1) hits.push(`${text.textContent} (${Math.round(w)}x${Math.round(h)})`);
        }
      }
      return hits;
    });
    expect(overlaps, `${league}: text under a logo`).toEqual([]);
  }
});
