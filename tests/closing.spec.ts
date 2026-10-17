import { expect, test } from "./fixtures";
import { readFileSync } from "node:fs";
import { closestToFinal, inFinalStretch, secondsLeft } from "../src/closing";

const slate = JSON.parse(readFileSync("src/data/slate.json", "utf8"));

test("time left in a game, from the status text", () => {
  expect(secondsLeft("5:12 - 4th")).toBe(312);
  expect(secondsLeft("5:12 - 3rd")).toBe(900 + 312);
  expect(secondsLeft("End of 3rd")).toBe(900);
  expect(secondsLeft("2:10 - OT")).toBe(130);
  expect(secondsLeft("Halftime")).toBe(1800);
  expect(secondsLeft("Delayed")).toBeNull();
  expect(inFinalStretch("14:50 - 4th")).toBe(true);
  expect(inFinalStretch("End of 3rd")).toBe(true);
  expect(inFinalStretch("1:00 - 3rd")).toBe(false);
});

test("a brewing upset in the final stretch goes first, and the game closest to final is first of all", () => {
  const rows = [
    { id: "q3", brewing: true, detail: "9:00 - 3rd" },
    { id: "q4-late", brewing: true, detail: "9:00 - 4th" },
    { id: "q4-calm", brewing: false, detail: "0:30 - 4th" },
    { id: "q4-early", brewing: true, detail: "1:10 - 4th" },
    { id: "ot", brewing: true, detail: "3:00 - OT" },
    { id: "q1", brewing: false, detail: "3:00 - 1st" },
  ];
  expect(closestToFinal(rows, (r) => r).map((r) => r.id)).toEqual(["q4-early", "ot", "q4-late", "q4-calm", "q3", "q1"]);
});

test("the Games board lists the games with an upset brewing in the 4th quarter in a section of their own, above everything else", async ({ page }) => {
  const nfl = slate.games.filter((g: any) => g.league === "NFL");
  const start = Math.max(...slate.games.map((g: any) => new Date(g.date).getTime()));
  await page.clock.install({ time: start + 90 * 60e3 });
  // Half the games have the road team ahead and half the home team, all in the 4th, so some favorite is always the one trailing.
  await page.route("**/api/scores**", (r) => r.fulfill({ json: slate.games.map((x: any, i: number) => ({ id: x.espnId, state: "in", detail: `${(i % 12) + 1}:00 - 4th`, away: i % 2 ? 3 : 30, home: i % 2 ? 30 : 3 })) }));
  await page.route("**/api/flow**", (r) => r.fulfill({ json: { wp: [] } }));
  await page.goto("/?league=NFL");
  const closing = page.locator(".board-section.closing");
  await expect(closing).toHaveCount(1);
  expect(await closing.locator(".game-card").count()).toBeGreaterThan(0);
  expect(nfl.length).toBeGreaterThan(1);
  const first = await page.locator("main .board-section").first().getAttribute("aria-label");
  expect(first).toBe("Upset brewing");
});
