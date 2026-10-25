import { expect, test } from "./fixtures";
import { shortTeamName } from "../src/teamShort";

test("NFL cities of more than one word are abbreviated, and nothing else changes", () => {
  expect(shortTeamName("NFL", "Green Bay Packers")).toBe("GB Packers");
  expect(shortTeamName("NFL", "Kansas City Chiefs")).toBe("KC Chiefs");
  expect(shortTeamName("NFL", "Las Vegas Raiders")).toBe("LV Raiders");
  expect(shortTeamName("NFL", "Los Angeles Rams")).toBe("LA Rams");
  expect(shortTeamName("NFL", "San Francisco 49ers")).toBe("SF 49ers");
  expect(shortTeamName("NFL", "New York Giants")).toBe("NY Giants");
  expect(shortTeamName("NFL", "Detroit Lions")).toBe("Detroit Lions");
  expect(shortTeamName("CFB", "Kansas City State")).toBe("Kansas City State");
});

test("a game card shows the short name and keeps the full one for screen readers", async ({ page }) => {
  await page.goto("/?league=NFL");
  const names = page.locator(".game-card .cc-team h4");
  await expect(names.first()).toBeVisible();
  const visible = await names.evaluateAll((els) => els.map((e) => [...e.querySelectorAll("button [aria-hidden='true']")].map((x) => x.textContent).join("")));
  expect(visible.some((v) => /^(GB|KC|LV|LA|SF|NY|TB|NE|NO) /.test(v))).toBe(true);
  await expect(page.locator(".game-card .cc-team h4 .sr-only").first()).toContainText(/\w+ \w+/);
});
