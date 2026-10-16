import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { buildPlusRanks } from "../src/plusRanksBuild";
import { plusRankFor, plusRankTitle } from "../src/plusRanks";
import { buildModel } from "../src/spplus/data/model";
import { teamRows } from "../src/nfl/model";

const snapshot = JSON.parse(readFileSync("src/data/spplus.json", "utf8"));
const nfl = JSON.parse(readFileSync("src/data/nfl.json", "utf8"));
const teamIds = JSON.parse(readFileSync("src/data/team-ids.json", "utf8"));
const slate = JSON.parse(readFileSync("src/data/slate.json", "utf8"));
const results = JSON.parse(readFileSync("src/data/results.json", "utf8")).games;
const plus = buildPlusRanks(snapshot, nfl, teamIds);
type T = { name: string; abbr?: string; logoId: string; espnId?: string };

test.describe("the SP+ and NFL+ ranks, the same numbers as the two tabs", () => {
  test("NFL+: every team's rank is its place in the NFL+ ratings table, under the board's abbreviations", () => {
    const rows = teamRows(nfl, nfl.ratingsThroughWeek);
    expect(rows).toHaveLength(32);
    for (const r of rows) expect(plus.nfl.byAbbr[({ LA: "LAR", WAS: "WSH" } as Record<string, string>)[r.abbr] ?? r.abbr]).toBe(r.rank.sp);
    expect(new Set(Object.values(plus.nfl.byAbbr)).size).toBe(32);
    expect(plus.nfl.of).toBe(32);
    expect(plus.nfl.byAbbr.LAR).toBeTruthy();
    expect(plus.nfl.byAbbr.WSH).toBeTruthy();
  });

  test("SP+: every FBS team's rank is the sheet's national SP+ rank in the latest week", () => {
    const model = buildModel(snapshot);
    const names = new Map(model.teams.filter((t) => t.division === "FBS").map((t) => [t.name, t.weeks[t.latest]?.spRk]));
    expect(plus.cfb.of).toBe([...names.values()].filter(Boolean).length);
    const logos = Object.entries(plus.cfb.byLogo);
    expect(logos.length).toBeGreaterThan(100);
    // Ohio State, by logo id and by ESPN id, is the sheet's rank for Ohio State.
    expect(plus.cfb.byLogo["ohio-state"]).toBe(names.get("Ohio State"));
    expect(plus.cfb.byEspn["194"]).toBe(names.get("Ohio State"));
  });

  test("a team is looked up by abbreviation (NFL) or logo / ESPN id (college); no rank means none, never a zero", () => {
    expect(plusRankFor(plus, "NFL", { abbr: "SEA" })).toMatchObject({ n: plus.nfl.byAbbr.SEA, of: 32, kind: "NFL+" });
    // Offense and defense ranks ride along, each 1 to 32 (NFL) or 1 to 138 (college).
    const sea = plusRankFor(plus, "NFL", { abbr: "SEA" })!;
    expect(sea.o).toBeGreaterThanOrEqual(1);
    expect(sea.d).toBeLessThanOrEqual(32);
    const osu = plusRankFor(plus, "CFB", { logoId: "ohio-state" })!;
    expect([osu.o, osu.d].every((v) => v! >= 1 && v! <= plus.cfb.of)).toBe(true);
    expect(plusRankFor(plus, "CFB", { name: "Ohio State" })?.n).toBe(osu.n); // a school name finds it too
    expect(plusRankFor(plus, "NFL", { abbr: "LAR" })?.n).toBe(plus.nfl.byAbbr.LAR);
    expect(plusRankFor(plus, "NFL", { abbr: "XXX" })).toBeNull();
    expect(plusRankFor(plus, "CFB", { logoId: "ohio-state" })?.kind).toBe("SP+");
    expect(plusRankFor(plus, "CFB", { espnId: "194" })?.n).toBe(plus.cfb.byLogo["ohio-state"]);
    expect(plusRankFor(plus, "CFB", { logoId: "not-a-team" })).toBeNull();
    expect(plusRankFor(null, "CFB", { logoId: "ohio-state" })).toBeNull();
    expect(plusRankTitle({ n: 1, of: 138, kind: "SP+" })).toBe("SP+ rank: 1st of 138 FBS teams");
    expect(plusRankTitle({ n: 22, of: 32, kind: "NFL+" })).toBe("NFL+ rank: 22nd of 32 teams (EPA-based ratings)");
    expect(plusRankTitle({ n: 1, of: 138, kind: "SP+", o: 3, d: 12 })).toBe("SP+ rank: 1st of 138 FBS teams · offense 3rd · defense 12th");
  });
});

const rankOf = (league: string, t: T) => plusRankFor(plus, league, t)?.n;
const shown = (n: number | undefined) => new RegExp(`^\\s*${n}\\s*$|${n}`);

async function cardFor(page: Page, league: "CFB" | "NFL") {
  const game = slate.games.find((g: { league: string; teams: T[] }) => g.league === league && g.teams.every((t) => rankOf(league, t)))!;
  expect(game, `a ${league} game where both teams have a rank`).toBeTruthy();
  await page.goto(`/?league=${league}`);
  const card = page.locator(".game-card", { has: page.locator(`#${game.id}-title`) }).first();
  await expect(card).toBeVisible();
  return { game, card };
}

for (const league of ["CFB", "NFL"] as const) {
  test(`${league}: the ${league === "CFB" ? "SP+" : "NFL+"} rank sits to the left of each team's name, compact and expanded`, async ({ page }) => {
    const { game, card } = await cardFor(page, league);
    const kind = league === "CFB" ? "SP+" : "NFL+";
    const heads = card.locator(".cc-team h4");
    await expect(heads).toHaveCount(2);
    for (let i = 0; i < 2; i++) {
      const t = game.teams[i] as T;
      const n = rankOf(league, t)!;
      const head = heads.nth(i);
      await expect(head.locator(".plus-rank")).toHaveCount(1);
      await expect(head.locator(".plus-rank [aria-hidden]")).toHaveText(String(n));
      await expect(head.locator(".plus-rank .sr-only")).toHaveText(`${kind} rank ${n}, `);
      await expect(head.locator(".plus-rank")).toHaveAttribute("title", plusRankTitle(plusRankFor(plus, league, t)!));
      expect(await head.evaluate((h) => (h.firstElementChild as HTMLElement | null)?.className ?? "")).toContain("plus-rank");
      await expect(head).toContainText(t.name.replace("Broncos", "Donkeys"));
    }
    await card.getByRole("button", { name: "Show game details" }).click();
    const open = card.locator(".team-heading h4");
    await expect(open).toHaveCount(2);
    for (let i = 0; i < 2; i++) await expect(open.nth(i).locator(".plus-rank [aria-hidden]")).toHaveText(String(rankOf(league, game.teams[i])));
    // The conference line no longer carries a second, different national rank.
    await expect(card.locator(".rank-line").first()).not.toContainText("overall");
  });
}

test("a team with no SP+ rank (an FCS opponent) gets no badge, not a zero or a dash", async ({ page }) => {
  const game = slate.games.find((g: { league: string; teams: T[] }) => g.league === "CFB" && g.teams.some((t) => !rankOf("CFB", t)));
  test.skip(!game, "every college team on the board has an SP+ rank this week");
  await page.goto("/?league=CFB");
  const card = page.locator(".game-card", { has: page.locator(`#${game.id}-title`) }).first();
  const heads = card.locator(".cc-team h4");
  for (let i = 0; i < 2; i++) await expect(heads.nth(i).locator(".plus-rank")).toHaveCount(rankOf("CFB", game.teams[i]) ? 1 : 0);
});

test("finished games carry the rank too, compact and expanded", async ({ page }) => {
  const r = results.find((x: { week: string; league: string; teams: T[] }) => x.week === slate.period && x.teams.every((t) => rankOf(x.league, t)));
  test.skip(!r, "no final from this week with both ranks");
  await page.goto(`/?league=${r.league}`);
  const filters = page.getByRole("button", { name: /^Filters/ });
  if ((await filters.count()) && (await filters.getAttribute("aria-expanded")) === "false") await filters.click();
  await page.getByLabel("League", { exact: true }).selectOption({ label: r.league === "CFB" ? "College" : "NFL" });
  await page.getByLabel("Status", { exact: true }).selectOption({ label: "Completed" });
  const card = page.locator(`.result-card[aria-labelledby="r-${r.espnId}"]`);
  await expect(card.locator(".cc-team h4 .plus-rank [aria-hidden]").first()).toHaveText(String(rankOf(r.league, r.teams[0])));
  await card.locator('.card-toggle[aria-expanded="false"]').first().click();
  await expect(card.locator(".ls-name .plus-rank [aria-hidden]").first()).toHaveText(String(rankOf(r.league, r.teams[0])));
});

test("the score ticker shows the same ranks", async ({ page }) => {
  const g = slate.games.find((x: { league: string; espnId: string; teams: T[] }) => x.espnId && x.teams.every((t) => rankOf(x.league, t)));
  await page.goto(`/?league=${g.league}`);
  const item = page.locator(`.ticker-item[data-event-id="${g.espnId}"]`).first();
  await expect(item).toBeAttached();
  await expect(item.locator(".ticker-rank")).toHaveText(g.teams.map((t: T) => `#${rankOf(g.league, t)}`));
  await expect(item).toHaveAttribute("aria-label", /National ratings rank: /);
});
