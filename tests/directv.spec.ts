import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { DIRECTV, directvChannel, directvTitle } from "../src/directv";
import { espnGameUrl, watchLink, directvLink, DIRECTV_GUIDE } from "../src/watchLinks";

test("DIRECTV channels: national networks, Kansas City locals, and nothing for streaming services", () => {
  expect(directvChannel("espn")).toBe(206);
  expect(directvChannel("espn2")).toBe(209);
  expect(directvChannel("sec-network")).toBe(611);
  expect(directvChannel("btn")).toBe(610);
  // Overland Park is in the Kansas City market: the broadcast networks are the local affiliates.
  expect([directvChannel("fox"), directvChannel("cbs"), directvChannel("abc"), directvChannel("cw"), directvChannel("nbc")]).toEqual([4, 5, 9, 29, 41]);
  for (const streaming of ["espn-plus", "prime-video", "mw-plus", "", null, undefined]) expect(directvChannel(streaming)).toBeNull();
  expect(directvTitle("espn")).toBe("DIRECTV channel 206 · ESPN (Overland Park, KS)");
  expect(directvTitle("prime-video")).toBeUndefined();
  // Every number is unique per network and is a real channel.
  const nums = Object.values(DIRECTV).map((d) => d.ch);
  expect(new Set(nums).size).toBe(nums.length);
  // Every network the board uses either has a number or is a streaming service.
  const slate = JSON.parse(readFileSync("src/data/slate.json", "utf8"));
  const streaming = new Set(["espn-plus", "prime-video", "mw-plus", null]);
  for (const g of slate.games) expect(!!directvChannel(g.network) || streaming.has(g.network ?? null), `no DIRECTV channel for ${g.network}`).toBe(true);
});

test("the channel number shows beside the network logo on cards and in the TV grid lanes", async ({ page }) => {
  await page.goto("/?league=CFB");
  // Card: expand the first upcoming game that is on a numbered channel.
  const withNumber = page.locator(".game-card:not(.final) .net-chip.has-ch").first();
  await expect(withNumber).toBeAttached();
  const n = await withNumber.locator(".ch-num").innerText();
  expect(n).toMatch(/^\d{1,3}$/);
  await expect(withNumber).toHaveAttribute("title", /DIRECTV channel \d+ · .* \(Overland Park, KS\)/);
  // TV grid lanes.
  await page.getByRole("button", { name: "TV grid" }).click();
  const lanes = page.locator(".tv-net .net-chip.has-ch .ch-num");
  await expect(lanes.first()).toBeAttached(); // the grid loads on first use
  expect(await lanes.count()).toBeGreaterThan(0);
  for (const t of await lanes.allInnerTexts()) expect(t).toMatch(/^\d{1,3}$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
});


test("watch links: ESPN games open in the ESPN app, cable networks open the DIRECTV guide, streaming outlets their home page", () => {
  expect(espnGameUrl("CFB", "401871090")).toBe("https://www.espn.com/college-football/game/_/gameId/401871090");
  expect(espnGameUrl("NFL", "401772000")).toBe("https://www.espn.com/nfl/game/_/gameId/401772000");
  for (const network of ["espn", "espn2", "espnu", "espn-plus", "sec-network", "acc-network", "abc"])
    expect(watchLink({ network, league: "CFB", espnId: "1" })).toMatchObject({ kind: "espn", url: "https://www.espn.com/college-football/game/_/gameId/1" });
  // Any game the broadcast line says is in the ESPN App, whatever its network.
  expect(watchLink({ network: "fox", broadcast: "FOX / ESPN App", league: "NFL", espnId: "9" })?.kind).toBe("espn");
  expect(watchLink({ network: "nbc", league: "NFL", espnId: "9" })).toMatchObject({ kind: "outlet", title: "Open Peacock" });
  expect(watchLink({ network: "prime-video", league: "NFL", espnId: "9" })?.title).toBe("Open Prime Video");
  expect(watchLink({ network: "tnt", league: "NFL", espnId: "9" })).toBeNull(); // cable only: the channel number links instead
  expect(watchLink({ network: "espn", league: "CFB", espnId: null })).toBeNull(); // nothing to link to without a game id
  expect(directvLink("espn")).toEqual({ url: DIRECTV_GUIDE, title: "Open the DIRECTV guide · channel 206 (Overland Park, KS)" });
  expect(directvLink("espn-plus")).toBeNull();
});

test("the logo and channel number are links that open elsewhere and leave the card alone", async ({ page }) => {
  await page.goto("/?league=CFB");
  const card = page.locator(".game-card:not(.final)").filter({ has: page.locator("a.net-link[data-kind='espn']") }).first();
  const espnChip = card.locator("a.net-link[data-kind='espn']").first();
  await expect(espnChip).toBeAttached();
  await expect(espnChip).toHaveAttribute("href", /^https:\/\/www\.espn\.com\/college-football\/game\/_\/gameId\/\d+$/);
  await expect(espnChip).toHaveAttribute("target", "_blank");
  await expect(espnChip).toHaveAttribute("rel", /noopener/);
  const num = page.locator(".game-card:not(.final) .net-chip a.ch-num").first();
  await expect(num).toHaveAttribute("href", "https://www.directv.com/guide");
  await expect(num).toHaveAttribute("title", /Open the DIRECTV guide · channel \d+/);
  // Clicking a link must not expand the compact card (the new tab is stubbed so nothing navigates).
  await page.evaluate(() => { window.open = () => null; document.addEventListener("click", (e) => { if ((e.target as Element).closest("a.net-link, a.ch-num")) e.preventDefault(); }, true); });
  await expect(card).toHaveClass(/compact/);
  await espnChip.click();
  await expect(card).toHaveClass(/compact/);
  // TV grid lanes: the number links; the logo does not (a lane is a network, not a game).
  await page.getByRole("button", { name: "TV grid" }).click();
  await expect(page.locator(".tv-net a.ch-num").first()).toBeAttached(); // the grid loads on first use
  expect(await page.locator(".tv-net a.ch-num").count()).toBeGreaterThan(0);
  expect(await page.locator(".tv-net a.net-link").count()).toBe(0);
});
