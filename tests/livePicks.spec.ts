import { expect, test, type Page } from "./fixtures";
import { readFileSync } from "node:fs";
import { findBoardGame, lineText, pickStanding, standingText } from "../src/livePicks";
import { pickFor } from "../src/nfl/model";
import type { NflData } from "../src/nfl/types";
import { stubFinals } from "./helpers/finals";
import { openSppTab } from "./helpers/spp";

const nfl: NflData = JSON.parse(readFileSync("src/data/nfl.json", "utf8"));
const slate = JSON.parse(readFileSync("src/data/slate.json", "utf8"));

test("a pick is covering, missing or on the number from the score as it stands", () => {
  // Favorite laying 3.5: has to win by 4 or more.
  const at = (home: number, away: number, state: "in" | "post" = "in") => pickStanding({ state, detail: "x", away, home }, true, 3.5);
  expect(at(24, 20)).toMatchObject({ status: "covering", coverBy: 0.5 });
  expect(at(23, 20)).toMatchObject({ status: "missing", coverBy: -0.5 });
  expect(standingText(at(23, 20))).toBe("Not covering · needs 0.5 more");
  expect(standingText(at(24, 20, "post"))).toBe("Covered by 0.5");
  // Whole-number line: exactly on it is a push.
  const wholeNumber = pickStanding({ state: "in", detail: "x", away: 14, home: 21 }, true, 7);
  expect(wholeNumber).toMatchObject({ status: "push", coverBy: 0 });
  expect(standingText(wholeNumber)).toBe("Push right now");
  expect(standingText(pickStanding({ state: "post", detail: "Final", away: 14, home: 21 }, true, 7))).toBe("Push");
  // Road underdog getting 7: loses by 6 and covers, loses by 8 and does not.
  expect(pickStanding({ state: "in", detail: "x", away: 17, home: 23 }, false, -7)).toMatchObject({ status: "covering", coverBy: 1 });
  expect(pickStanding({ state: "in", detail: "x", away: 17, home: 25 }, false, -7)).toMatchObject({ status: "missing", coverBy: -1 });
  expect(pickStanding({ state: "pre", detail: "", away: 0, home: 0 }, true, 3).phase).toBe("pre");
  expect(pickStanding(undefined, true, 3).phase).toBe("pre");
  expect([3.5, -7, 0].map(lineText)).toEqual(["−3.5", "+7", "PK"]);
});

test("a sheet matchup finds its board game by ESPN id or by name, either way round", () => {
  const games = [{ espnId: "1", league: "CFB", date: "2026-10-17T16:00Z", teams: [{ name: "Kansas Jayhawks", espnId: "2305" }, { name: "Kansas State Wildcats", espnId: "2306" }] }];
  expect(findBoardGame(games, { "2305": "Kansas", "2306": "Kansas State" }, "Kansas", "Kansas State", "2026-10-17")).toMatchObject({ swapped: false });
  expect(findBoardGame(games, {}, "Kansas", "Kansas State", "2026-10-17")).toMatchObject({ swapped: false }); // by name alone
  expect(findBoardGame(games, {}, "Kansas State", "Kansas", "2026-10-17")).toMatchObject({ swapped: true }); // a neutral site listed the other way
  expect(findBoardGame(games, {}, "Kansas", "Kansas State", "2026-10-25")).toBeNull(); // a different week
  expect(findBoardGame(games, {}, "Kansas", "Iowa State", "2026-10-17")).toBeNull();
});

async function openAts(page: Page) {
  await page.goto("/?league=NFL");
  await page.getByRole("button", { name: "NFL+" }).click();
  await expect(page.locator(".spp .tbl tbody tr").first()).toBeVisible({ timeout: 15_000 });
  await openSppTab(page, "ATS tracker");
}

test("the NFL+ pick card names the pick and its line, and follows the score: covering, then not covering", async ({ page }) => {
  const g = nfl.games.find((x) => x.type === "REG" && x.aS == null && x.spread != null && x.espn && x.mm != null && pickFor(x))!;
  const p = pickFor(g)!;
  const need = p.pickIsHome ? (g.spread as number) : -(g.spread as number); // margin the pick has to win by
  const up = Math.max(0, Math.ceil(need) + 3), down = Math.min(0, Math.floor(need) - 3);
  // The pick ahead by three more than it needs to be; then the other side scores until the pick is three short (a score only goes up).
  let pickLeads = true;
  const pickPts = 15 + up;
  const score = () => {
    const otherPts = pickPts - (pickLeads ? up : down);
    return p.pickIsHome ? { home: pickPts, away: otherPts } : { away: pickPts, home: otherPts };
  };
  await stubFinals(page); // (first: a later route for the same address wins)
  await page.clock.install({ time: Math.min(...slate.games.map((x: { date: string }) => Date.parse(x.date))) + 90 * 60e3 }); // some board game is on, so the board is polling
  await page.route("**/api/scores**", (r) => r.fulfill({ json: [{ id: g.espn, state: "in", detail: "5:12 - 3rd", ball: null, ...score() }] }));
  await page.route("**/api/flow**", (r) => r.fulfill({ json: { wp: [] } }));
  await openAts(page);
  const card = page.locator(".spp .lp-pick", { hasText: nfl.teams[p.pick].name }).first();
  await expect(card.locator(".lp-line")).toHaveText(need === 0 ? "PK" : `${need > 0 ? "−" : "+"}${Math.abs(need)}`); // the pick's line, in big type
  await expect(card).toHaveAttribute("data-phase", "in");
  await expect(card).toHaveAttribute("data-status", "covering");
  await expect(card.locator(".lp-chip")).toContainText("Covering by");
  // The pick slips: the next poll turns the card.
  pickLeads = false;
  await page.clock.runFor(31_000);
  await expect(card).toHaveAttribute("data-status", "missing");
  await expect(card.locator(".lp-chip")).toContainText("Not covering · needs");
});
