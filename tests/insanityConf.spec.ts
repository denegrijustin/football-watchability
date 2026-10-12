import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { confOfIn, inConferenceIn, type ConfTable } from "../src/teamConfLogic";

const season = JSON.parse(readFileSync("src/data/season.json", "utf8")).games as any[];
const slate = JSON.parse(readFileSync("src/data/slate.json", "utf8"));
const table = JSON.parse(readFileSync("src/data/team-conferences.json", "utf8")) as ConfTable;
const confOf = (l: "NFL" | "CFB", id: string) => confOfIn(table, l, id);
const inConference = (l: "NFL" | "CFB", c: string | undefined, ids: string[]) => inConferenceIn(table, l, c, ids);

test("a game is in a conference when either team is; AFC / NFC only mean something for the NFL and college ids only for college", () => {
  expect(confOf("NFL", "seattle-seahawks")).toBe("nfc");
  expect(confOf("NFL", "buffalo-bills")).toBe("afc");
  expect(confOf("CFB", "michigan")).toBe("big-ten");
  expect(confOf("CFB", "not-a-team")).toBeUndefined(); // an FCS opponent
  expect(inConference("NFL", "afc", ["seattle-seahawks", "buffalo-bills"])).toBe(true); // an inter-conference game counts for both
  expect(inConference("NFL", "nfc", ["seattle-seahawks", "buffalo-bills"])).toBe(true);
  expect(inConference("NFL", "nfc", ["buffalo-bills", "new-england-patriots"])).toBe(false);
  expect(inConference("CFB", "sec", ["michigan", "tennessee"])).toBe(true);
  expect(inConference("CFB", "sec", ["michigan", "ohio-state"])).toBe(false);
  expect(inConference("CFB", "sec", ["tennessee", "some-fcs-team"])).toBe(true); // a conference team's FCS opponent
  expect(inConference("CFB", "all-fbs", ["michigan"])).toBe(true);
  // A choice left over from the other league lets everything through rather than emptying the board.
  expect(inConference("NFL", "sec", ["buffalo-bills"])).toBe(true);
  expect(inConference("CFB", "afc", ["michigan"])).toBe(true);
});

async function insanity(page: Page, league: "NFL" | "CFB") {
  await page.goto(`/?league=${league}`);
  await page.getByRole("button", { name: "Insanity", exact: true }).click();
  await expect(page.locator(".ib-cards > li").first()).toBeVisible();
}

test("the Insanity tab filters by conference: SEC for college, AFC and NFC for the NFL", async ({ page }) => {
  await insanity(page, "CFB");
  const conf = page.getByLabel("Conference");
  await page.getByRole("group", { name: "Ranking" }).getByRole("button", { name: "Season" }).click();
  const all = await page.locator(".ib-heading, .board-heading").first().innerText();
  void all;
  await conf.selectOption("sec");
  const rows = await page.locator(".ib-cards > li").evaluateAll((els) => els.map((e) => (e.getAttribute("aria-label") ?? e.querySelector("button")?.getAttribute("aria-label") ?? "")));
  expect(rows.length).toBeGreaterThan(0);
  // Every game listed has an SEC team in it, by the season ledger.
  const secIds = new Set(season.filter((g) => g.league === "CFB" && [g.away, g.home].some((t) => confOf("CFB", t.logoId) === "sec")).map((g) => g.matchup));
  expect(rows.filter((label) => ![...secIds].some((m) => label.startsWith(m)))).toEqual([]);
  // Back to all conferences brings the rest back; switching league resets it.
  await conf.selectOption("all-fbs");
  expect(await page.locator(".ib-cards > li").count()).toBeGreaterThanOrEqual(rows.length);
  await conf.selectOption("sec");
  await page.getByRole("group", { name: "League" }).getByRole("button", { name: "NFL" }).click();
  await expect(conf).toHaveValue("all-fbs");
  await expect(conf.locator("option")).toHaveText(["Both conferences", "AFC", "NFC"]);
  await conf.selectOption("nfc");
  await expect(page.locator(".ib-cards > li").first()).toBeVisible();
  const ids = season.filter((g) => g.league === "NFL" && [g.away, g.home].some((t) => confOf("NFL", t.logoId) === "nfc")).map((g) => g.matchup.replace("Broncos", "Donkeys")); // the site says Donkeys
  const labels = await page.locator(".ib-cards > li button").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  expect(labels.length).toBeGreaterThan(0);
  expect(labels.filter((label) => !ids.some((m) => label.startsWith(m)))).toEqual([]);
});

test("the season's games can be seen all together, highest insanity to lowest, with the weeks ordered newest or most insane first", async ({ page }) => {
  await insanity(page, "CFB");
  const section = page.getByRole("region", { name: "Week by week" });
  await section.scrollIntoViewIfNeeded();
  // By week, newest first by default; or the most insane week first, numbered.
  const names = () => section.locator(".ibw-name").allInnerTexts();
  const recent = await names();
  await section.getByRole("button", { name: "Most insane", exact: true }).click();
  await expect(section.locator(".ibw-rank").first()).toHaveText("#1");
  const avgs = await section.locator(".ibw-avg").allInnerTexts();
  const nums = avgs.map((t) => Number(t.replace("avg ", "")));
  expect(nums).toEqual([...nums].sort((a, b) => b - a));
  await section.getByRole("button", { name: "Newest", exact: true }).click();
  expect(await names()).toEqual(recent);
  // All games: every game of the season in one list, #1 the wildest, each with its week.
  await section.getByRole("button", { name: "All games" }).click();
  await expect(section).toContainText("Every game this season");
  await expect(section).toContainText("highest to lowest");
  const rows = section.locator(".ibs");
  await expect(rows.first()).toBeVisible();
  const ins = await rows.evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-insanity"))));
  expect(ins.length).toBeGreaterThan(10);
  expect(ins).toEqual([...ins].sort((a, b) => b - a));
  await expect(rows.first().locator(".ibs-rank")).toHaveText("#1");
  const total = season.filter((g) => g.league === "CFB").length;
  await expect(section.getByRole("heading", { level: 3 })).toContainText(`${total} games`);
  // It follows the conference filter too.
  await page.getByLabel("Conference").selectOption("sec");
  const sec = season.filter((g) => g.league === "CFB" && [g.away, g.home].some((t) => confOf("CFB", t.logoId) === "sec")).length;
  await expect(section.getByRole("heading", { level: 3 })).toContainText(`${sec} games`);
});

test("the main board has a conference filter for the NFL (AFC, NFC) as well as college", async ({ page }) => {
  await page.goto("/?league=NFL");
  const conf = page.getByLabel("Conference");
  await expect(conf.locator("option")).toHaveText(["Both conferences", "AFC", "NFC"]);
  const cards = page.locator(".game-card");
  await expect(cards.first()).toBeVisible();
  const both = await cards.count();
  await conf.selectOption("afc");
  await expect(page.getByRole("status").or(page.locator(".game-card").first())).toBeVisible();
  const afc = await cards.count();
  await conf.selectOption("nfc");
  const nfc = await cards.count();
  expect(afc).toBeGreaterThan(0);
  expect(nfc).toBeGreaterThan(0);
  expect(afc).toBeLessThan(both);
  expect(nfc).toBeLessThan(both);
  expect(afc + nfc).toBeGreaterThanOrEqual(both); // a game between the two is in both lists
  // Back to both; and college keeps its own list.
  await conf.selectOption("all-fbs");
  expect(await cards.count()).toBe(both);
  await page.getByLabel("League").selectOption("CFB");
  await expect(conf).toHaveValue("all-fbs");
  await expect(conf.locator("option").first()).toHaveText("All conferences");
});
