import { test, expect } from "./fixtures";
import { hasCfbGame, NO_CFB } from "./helpers/slate";
import { readFileSync } from "node:fs";
import { RIVALRIES, RIVALRY_MAX, namedRivalry, rivalryFor, rivalryLine, rivalryPoints, seriesOf } from "../scripts/rivalry.mjs";
import { forecastScore } from "../scripts/score.mjs";
import { stubFinals } from "./helpers/finals";

const base = { league: "CFB", sA: 0.6, sH: 0.6, pHome: 0.5, swingA: 10, swingH: 10, winA: 0.6, winH: 0.6, net: "FOX", national: true };

test("a named rivalry is a full rivalry, with its trophy; the same pair is found whichever way round", () => {
  const r = rivalryFor({ league: "CFB", ids: ["mississippi-state", "ole-miss"], sameGroup: true, series: { total: 120, share: 0.52 } })!;
  expect([r.level, r.name, r.trophy?.name, r.trophy?.icon]).toEqual([1, "Egg Bowl", "Golden Egg", "egg"]);
  expect(namedRivalry("ole-miss", "mississippi-state")?.name).toBe("Egg Bowl");
  expect(namedRivalry("alabama", "auburn")?.trophy).toBeNull(); // a rivalry, but no trophy is listed
});

test("a game nobody named counts only when the series is long, in one conference, and not lopsided", () => {
  const go = (total: number, share: number, sameGroup = true) => rivalryFor({ league: "CFB", ids: ["a-team", "b-team"], sameGroup, series: { total, share } })?.level ?? 0;
  expect(go(30, 0.5)).toBe(0);                 // a short series is not a rivalry
  expect(go(80, 0.5)).toBeGreaterThan(go(50, 0.5));
  expect(go(80, 0.5, false)).toBe(0);          // a long series across conferences needs a century of games
  expect(go(110, 0.5, false)).toBeGreaterThan(0);
  expect(go(80, 0.86)).toBeLessThan(go(80, 0.55)); // 62–11 is not an even fight
});

test("a rivalry adds up to four points on top of the forecast and shows in the breakdown; a game without one is unchanged", () => {
  const plain = forecastScore(base as never), riv = forecastScore({ ...base, rivalry: { level: 1, name: "Iron Bowl", trophy: null, sameGroup: true }, series: { total: 90 } } as never);
  expect(plain.parts.some((p) => p.id === "rivalry")).toBe(false);
  const part = riv.parts.find((p) => p.id === "rivalry")!;
  expect([part.max, part.pts]).toEqual([RIVALRY_MAX, 4]);
  expect(part.note).toContain("Iron Bowl");
  expect(riv.score).toBeGreaterThanOrEqual(plain.score);
  expect(riv.score - plain.score).toBeLessThanOrEqual(4);
  expect(rivalryPoints({ level: 0.5 } as never)).toBe(2);
});

test("the why-watch line gives the name, how the series stands, since when, and the trophy", () => {
  const history = { boxes: [{ value: "Minnesota leads 63–62–3", items: ["128 meetings", "First meeting: 1891 IOWA 20–0"] }, { items: ["2025 MINN 25–20"] }] };
  const s = seriesOf(history, ["Iowa", "Minnesota"]);
  expect([s.total, s.first, s.lead, s.allTime]).toEqual([128, 1891, "Minnesota", true]);
  const line = rivalryLine(rivalryFor({ league: "CFB", ids: ["iowa", "minnesota"], sameGroup: true, series: s })!, s);
  expect(line).toContain("Floyd of Rosedale");
  expect(line).toContain("128 meetings");
  expect(line).toContain("first played in 1891");
});

test("every named rivalry points at teams the site has a logo for", () => {
  const logos = JSON.parse(readFileSync("src/data/logos.json", "utf8"));
  for (const [a, b] of RIVALRIES) { expect(logos[a], a).toBeTruthy(); expect(logos[b], b).toBeTruthy(); }
});

test("this week's board carries its rivalries: a part in the breakdown, a rivalry line first in why-watch, and a trophy where there is one", () => {

  test.skip(!hasCfbGame(), NO_CFB);
  const slate = JSON.parse(readFileSync("src/data/slate.json", "utf8"));
  const riv = slate.games.filter((g: any) => g.rivalry);
  expect(riv.length).toBeGreaterThan(0);
  for (const g of riv) {
    expect(g.breakdown.parts.some((p: any) => p.id === "rivalry")).toBe(true);
    expect(g.watch[0]).toMatch(/meetings|first played|series|rival/i);
  }
});

test.describe("on the cards", () => {
  test.beforeEach(async ({ page }) => { await stubFinals(page); });

  test("a rivalry game has a small badge, and one with a trophy shows the trophy's drawing", async ({ page }) => {

    test.skip(!hasCfbGame(), NO_CFB);
    await page.goto("/?league=CFB");
    const badge = page.getByTestId("rivalry-badge").first();
    await expect(badge).toBeVisible({ timeout: 15_000 });
    const trophy = page.locator(".rv-badge.trophy").first();
    await expect(trophy.locator("svg.trophy-ico")).toBeVisible();
    await expect(trophy).toHaveAttribute("title", /play for the/);
  });

  test("the Game Center shows the same badge with the trophy's name written out", async ({ page }) => {

    test.skip(!hasCfbGame(), NO_CFB);
    await page.goto("/?league=CFB");
    const id = await page.locator(".game-card:has(.rv-badge.trophy)").first().getAttribute("data-game-id");
    await page.locator(`.game-card[data-game-id="${id}"]`).getByRole("button", { name: /Game Center/ }).first().click();
    const gc = page.getByRole("dialog");
    await expect(gc.locator(".rv-badge.trophy .rv-trophy")).toBeVisible();
    await expect(gc.locator(".rv-badge svg.trophy-ico")).toBeVisible();
  });
});
