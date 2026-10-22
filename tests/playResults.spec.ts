import { test, expect } from "./fixtures";
import { readFileSync } from "node:fs";
import { stubFinals } from "./helpers/finals";
import { buildModel } from "../src/spplus/data/model";
import { parseRecord } from "../src/spplus/data/cells";
import type { NflData } from "../src/nfl/types";
import { teamRows } from "../src/nfl/model";

test.beforeEach(async ({ page }) => { await stubFinals(page); });

const model = buildModel(JSON.parse(readFileSync("src/data/spplus.json", "utf8")));
const nfl: NflData = JSON.parse(readFileSync("src/data/nfl.json", "utf8"));

const ROWS = ["Playing well", "Even", "Getting outplayed"], CELLS = ["The real deal", "Due for more", "Unlucky", "Finding a way", "Middle of the pack", "Coin flips going wrong", "Living dangerously", "Hanging on", "Trouble"];

test("CFB SP+ Play vs Results puts every team that has played in one of nine cells, and a click opens the team", async ({ page }) => {
  await page.goto("/?league=CFB");
  await page.getByRole("button", { name: "CFB SP+" }).click();
  await expect(page.locator(".spp .tbl tbody tr").first()).toBeVisible({ timeout: 15_000 });
  await page.locator(".spp").getByRole("tab", { name: "Play vs Results", exact: true }).click();
  const board = page.locator(".spp .prb");
  await expect(board).toBeVisible();
  for (const r of ROWS) await expect(board.locator(".prb-rowh b", { hasText: r })).toBeVisible();
  for (const c of CELLS) await expect(board.locator(".prb-cell h3", { hasText: c })).toBeVisible();
  const played = model.teams.filter((t) => t.division === "FBS" && (() => { const tw = t.weeks[model.latest]; const r = parseRecord(tw?.record?.text); return tw?.sp != null && r && r.w + r.l + r.t > 0; })()).length;
  await expect(board.locator(".prb-cell li")).toHaveCount(played);
  await board.locator(".prb-cell li button").first().click();
  await expect(page.locator(".spp").getByRole("tab", { name: "Team", exact: true })).toHaveAttribute("aria-selected", "true");
});

test("NFL+ Play vs Results sorts all 32 teams into the grid", async ({ page }) => {
  await page.goto("/?league=NFL");
  await page.getByRole("button", { name: "NFL+" }).click();
  await expect(page.locator(".spp .tbl tbody tr").first()).toBeVisible({ timeout: 15_000 });
  await page.locator(".spp").getByRole("tab", { name: "Play vs Results", exact: true }).click();
  const board = page.locator(".spp .prb");
  await expect(board).toBeVisible();
  const week = nfl.ratingsThroughWeek;
  const played = teamRows(nfl, week).filter((r) => r.rec.w + r.rec.l + r.rec.t > 0).length;
  await expect(board.locator(".prb-cell li")).toHaveCount(played);
  await expect(board.locator(".prb-cell")).toHaveCount(9);
});
