import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { DIRECTV, directvChannel, directvTitle } from "../src/directv";

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
  expect(await lanes.count()).toBeGreaterThan(0);
  for (const t of await lanes.allInnerTexts()) expect(t).toMatch(/^\d{1,3}$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
});
