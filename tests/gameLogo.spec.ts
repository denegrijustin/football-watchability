import { test, expect } from "@playwright/test";
import { gameBadge } from "../src/gameLogo";

const t = (a: string, b: string) => [{ logoId: a }, { logoId: b }];

test("Texas and Oklahoma get the Red River Rivalry logo, in either order", () => {
  for (const teams of [t("texas", "oklahoma"), t("oklahoma", "texas")]) {
    const b = gameBadge({ meta: "Sat · Dallas, TX (neutral site)", teams });
    expect(b).toMatchObject({ name: "Red River Rivalry", src: "/game-logos/red-river-rivalry.webp", neutral: true });
  }
});

test("an ordinary home game has no game logo; a named or neutral-site game gets its name", () => {
  expect(gameBadge({ meta: "Sat · Columbia, MO", teams: t("texas-a-m", "missouri") })).toBeNull();
  expect(gameBadge({ meta: "Sat · Atlanta, GA (neutral site)", event: "Aflac Kickoff", teams: t("a", "b") })).toMatchObject({ name: "Aflac Kickoff", src: null, neutral: true });
  expect(gameBadge({ meta: "Sat · Atlanta, GA (neutral site)", teams: t("a", "b") })).toMatchObject({ name: "Neutral site", src: null });
});

test("the card shows the Red River logo and no badge on a normal game", async ({ page }) => {
  await page.goto("/?league=CFB");
  const rr = page.locator(".game-card", { hasText: "Texas @ Oklahoma" }).first();
  await expect(rr.locator(".game-badge img")).toHaveAttribute("src", "/game-logos/red-river-rivalry.webp");
  await expect(rr.locator(".game-badge")).toContainText("Red River Rivalry");
  await expect(page.locator(".game-card", { hasText: "Missouri" }).first().locator(".game-badge")).toHaveCount(0);
});

test("a registry entry can match by ESPN's event headline, for future games", () => {
  const b = gameBadge({ meta: "Sat · Dallas, TX (neutral site)", event: "Allstate Red River Rivalry presented by X", teams: [{ logoId: "a" }, { logoId: "b" }] });
  expect(b).toMatchObject({ name: "Red River Rivalry", src: "/game-logos/red-river-rivalry.webp" });
});

test("at halftime the game's logo is painted at midfield and tops the card", async ({ page }) => {
  const slate = (await import("../src/data/slate.json", { with: { type: "json" } })).default as any;
  const g = slate.games.find((x: any) => x.matchup === "Texas @ Oklahoma");
  const T = new Date(g.date).getTime() + 90 * 60e3;
  await page.clock.install({ time: T });
  await page.route("**/api/scores**", (r) => r.fulfill({ json: slate.games.map((x: any) => ({ id: x.espnId, state: x === g ? "in" : "pre", detail: x === g ? "Halftime" : "", away: 14, home: 17 })) }));
  await page.route("**/api/flow**", (r) => r.fulfill({ json: { wp: [] } }));
  await page.route("**/api/game**", (r) => r.fulfill({ status: 503, json: {} }));
  await page.goto("/?league=CFB");
  await page.clock.resume();
  const card = page.locator(".game-card", { hasText: "Texas @ Oklahoma" }).first();
  await expect(card.locator("image[data-game-logo]")).toHaveAttribute("href", "/game-logos/red-river-rivalry.webp");
  await expect(card.locator(".game-badge img")).toHaveAttribute("src", "/game-logos/red-river-rivalry.webp");
});

test("if the Game Center's file is gone (site updated under an open page), the page survives and says so", async ({ page }) => {
  // Chunk names are plain hashes, so the Game Center's file is recognised by what is in it.
  await page.route(/\/assets\/c-.*\.js/, async (r) => {
    const res = await r.fetch();
    if ((await res.text()).includes("Time on the field (possession)")) return r.fulfill({ status: 404, body: "gone" });
    return r.fulfill({ response: res });
  });
  await page.goto("/?league=CFB");
  await page.evaluate(() => sessionStorage.setItem("fbwatch-gc-reload", "1")); // the one automatic reload was already used
  await page.locator(".cc-gc").first().click();
  await expect(page.locator(".gc-failed")).toContainText("could not load");
  await expect(page.locator(".game-card").first()).toBeVisible();
});
