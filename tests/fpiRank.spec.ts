import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

type T = { name: string; ranks?: { overall: number | null; overallOf: number } | null };

const slate = JSON.parse(readFileSync("src/data/slate.json", "utf8"));
const results = JSON.parse(readFileSync("src/data/results.json", "utf8")).games as { espnId: string; league: string; week: string; teams: T[] }[];
const ordinal = (n: number) => `${n}${["th", "st", "nd", "rd"][(n % 100 >> 3) ^ 1 && n % 10] || "th"}`;

test("every game card shows the ESPN FPI rank to the left of each team name", async ({ page }) => {
  const game = slate.games.find((g: { teams: T[] }) => g.teams.every((t) => t.ranks?.overall))!;
  await page.goto(`/?league=${game.league}`);
  const card = page.locator(".game-card", { has: page.locator(`#${game.id}-title`) }).first();
  await expect(card).toBeVisible();
  // Compact card: the rank is the first thing in each team's heading, before the name.
  const heads = card.locator(".cc-team h4");
  await expect(heads).toHaveCount(2);
  for (let i = 0; i < 2; i++) {
    const t = game.teams[i] as T;
    const head = heads.nth(i);
    await expect(head.locator(".fpi-rank")).toHaveText(new RegExp(`${t.ranks!.overall}`));
    await expect(head.locator(".fpi-rank")).toHaveAttribute("title", `ESPN FPI: ${ordinal(t.ranks!.overall!)} of ${t.ranks!.overallOf} overall`);
    await expect(head).toContainText(t.name.replace("Broncos", "Donkeys"));
    // The badge is the first child of the heading, before the name.
    expect(await head.evaluate((h) => (h.firstElementChild as HTMLElement | null)?.className ?? "")).toContain("fpi-rank");
    expect(await head.evaluate((h, name) => h.textContent!.indexOf(name) > h.querySelector(".fpi-rank")!.textContent!.length - 1, t.name.replace("Broncos", "Donkeys"))).toBe(true);
    await expect(head.locator(".fpi-rank .sr-only")).toHaveText(`ESPN FPI rank ${t.ranks!.overall}, `);
  }
  // Expanded card: same.
  await card.getByRole("button", { name: "Show game details" }).click();
  const open = card.locator(".team-heading h4");
  await expect(open).toHaveCount(2);
  for (let i = 0; i < 2; i++) await expect(open.nth(i).locator(".fpi-rank")).toHaveText(new RegExp(`${(game.teams[i] as T).ranks!.overall}`));
});

test("a team without an FPI rank gets no badge, and nothing shows a zero or a dash for it", async ({ page }) => {
  const game = slate.games.find((g: { teams: T[] }) => g.teams.some((t) => !t.ranks?.overall));
  test.skip(!game, "every team on the board has an FPI rank this week");
  await page.goto(`/?league=${game.league}`);
  const card = page.locator(".game-card", { has: page.locator(`#${game.id}-title`) }).first();
  const heads = card.locator(".cc-team h4");
  for (let i = 0; i < 2; i++) {
    const t = game.teams[i] as T;
    await expect(heads.nth(i).locator(".fpi-rank")).toHaveCount(t.ranks?.overall ? 1 : 0);
  }
});

test("final results carry the FPI rank before the team name too, compact and expanded", async ({ page }) => {
  const r = results.find((x) => x.week === slate.period && x.teams.every((t) => t.ranks?.overall));
  test.skip(!r, "no final from this week with FPI ranks");
  await page.goto(`/?league=${r!.league}`);
  // On a phone the filters fold away behind a button.
  const filters = page.getByRole("button", { name: /^Filters/ });
  if ((await filters.count()) && (await filters.getAttribute("aria-expanded")) === "false") await filters.click();
  await page.getByLabel("League", { exact: true }).selectOption({ label: r!.league === "CFB" ? "College" : "NFL" });
  await page.getByLabel("Status", { exact: true }).selectOption({ label: "Completed" });
  const card = page.locator(`.result-card[aria-labelledby="r-${r!.espnId}"]`);
  await expect(card).toBeVisible();
  await expect(card.locator(".cc-team h4 .fpi-rank").first()).toBeVisible();
  await card.locator('.card-toggle[aria-expanded="false"]').first().click();
  await expect(card.locator(".ls-name .fpi-rank").first()).toBeVisible();
});
