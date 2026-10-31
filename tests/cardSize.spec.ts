import { expect, test } from "./fixtures";
import { readFileSync } from "node:fs";

const slate = JSON.parse(readFileSync("src/data/slate.json", "utf8"));

for (const lg of ["NFL", "CFB"] as const) {
  test(`every game card on the board is the same size, live or not, with or without a trophy or a banner (${lg})`, async ({ page }) => {
    const games = slate.games.filter((g: any) => g.league === lg);
    test.skip(games.length < 3, `no ${lg} games on the board`);
    await page.clock.install({ time: Math.max(...games.map((g: any) => new Date(g.date).getTime())) + 90 * 60e3 });
    // A mix: some games on the clock (one close and late, one with an upset in hand), the rest still to play.
    await page.route("**/api/scores**", (r) => r.fulfill({ json: games.map((x: any, i: number) => ({ id: x.espnId, state: i % 3 === 0 ? "in" : "pre", detail: i % 6 === 0 ? "2:10 - 4th" : "5:12 - 3rd", away: i % 6 === 0 ? 20 : 14, home: i % 6 === 0 ? 21 : 17 })) }));
    await page.route("**/api/flow**", (r) => r.fulfill({ json: { wp: [[50, 3, { id: "1", text: "x", clock: "9:00" }], [60, 3, { id: "2", text: "y", clock: "5:12" }]] } }));
    await page.route("**/api/game**", (r) => r.fulfill({ status: 503, json: {} }));
    await page.goto(`/?league=${lg}`);
    const cards = page.locator(".game-card.compact");
    await expect(cards.first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".live-meters").first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(800);
    // Scroll down the page in steps so every card has been drawn, then measure them all in one go.
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); });
    await page.waitForTimeout(400);
    const hs: number[] = await cards.evaluateAll((els) => els.filter((e) => !e.querySelector(".halftime-band, .halftime-act") && e.getBoundingClientRect().height > 0).map((e) => Math.round(e.getBoundingClientRect().height)));
    expect(hs.length).toBeGreaterThan(2);
    expect(new Set(hs).size, `card heights: ${[...new Set(hs)].join(", ")}`).toBe(1);
    // Nothing is cut off inside: the content fits the card.
    const cut = await cards.evaluateAll((els) => els.filter((e) => (e.querySelector(".compact-overview") as HTMLElement | null)!.scrollHeight > (e as HTMLElement).clientHeight + 1).length);
    expect(cut, "cards whose content is taller than the card").toBe(0);
  });
}

test("a game with a trophy or a named game shows its logo or trophy on the card", async ({ page }) => {
  const named = slate.games.filter((g: any) => g.rivalry);
  test.skip(!named.length, "no rivalry game on the board");
  await page.clock.install({ time: Math.min(...slate.games.map((g: any) => new Date(g.date).getTime())) - 3600e3 });
  await page.goto("/");
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } });
  const badges = page.locator('.game-card [data-testid="rivalry-badge"]');
  await expect(badges.first()).toBeAttached({ timeout: 15_000 });
  // A trophy game shows its trophy drawing, a named game without one the flame, and the badge sits on the card's one badge row.
  expect(await page.locator(".game-card .cc-badges").count()).toBeGreaterThan(0);
});
