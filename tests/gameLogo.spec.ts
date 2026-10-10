import { test, expect } from "@playwright/test";
import { gameBadge } from "../src/gameLogo";

const t = (a: string, b: string) => [{ logoId: a }, { logoId: b }];

test("Texas and Oklahoma get the Red River Rivalry logo, in either order", () => {
  for (const teams of [t("texas", "oklahoma"), t("oklahoma", "texas")]) {
    const b = gameBadge({ meta: "Sat · Dallas, TX (neutral site)", teams });
    expect(b).toMatchObject({ name: "Red River Rivalry", src: "/game-logos/red-river-rivalry.svg", neutral: true });
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
  await expect(rr.locator(".game-badge img")).toHaveAttribute("src", "/game-logos/red-river-rivalry.svg");
  await expect(rr.locator(".game-badge")).toContainText("Red River Rivalry");
  await expect(page.locator(".game-card", { hasText: "Missouri" }).first().locator(".game-badge")).toHaveCount(0);
  await rr.screenshot({ path: process.env.OUT ?? "/dev/null" });
});
