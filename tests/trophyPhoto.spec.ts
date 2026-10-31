import { expect, test } from "./fixtures";
import { existsSync, readFileSync } from "node:fs";
import { RIVALRIES } from "../scripts/rivalry.mjs";

const photos = JSON.parse(readFileSync("src/data/trophy-images.json", "utf8")).images as Record<string, { src: string; license: string; author: string; page: string; title?: string }>;
const slate = JSON.parse(readFileSync("src/data/slate.json", "utf8"));

test("every trophy photograph is a real file, freely licensed, credited, and belongs to a trophy game on the list", () => {
  const pairs = new Map(RIVALRIES.filter((r: any) => r[3]).map((r: any) => [[r[0], r[1]].sort().join("|"), r[3].name]));
  for (const [key, p] of Object.entries(photos)) {
    expect(pairs.has(key), `${key} is a trophy game`).toBe(true);
    expect(existsSync(`public${p.src}`), `${p.src} exists`).toBe(true);
    expect(p.license, `${key} licence`).toMatch(/^(CC |CC0|Public domain)/);
    expect(p.author.length, `${key} photographer`).toBeGreaterThan(0);
    expect(p.page, `${key} source page`).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
  }
});

test("a trophy game with a photograph shows the photo on its card, and the credits list names it", async ({ page }) => {
  const key = Object.keys(photos)[0];
  test.skip(!key, "no trophy photographs yet");
  const [a, b] = key.split("|");
  const g = slate.games.find((x: any) => x.league === "CFB");
  const edited = { ...slate, games: slate.games.map((x: any) => (x === g ? { ...x, rivalry: { level: 1, name: "Test trophy game", trophy: { name: "Test Trophy", icon: "cup", key }, sameGroup: false, meetings: 0 } } : x)) };
  await page.route("**/data/slate.json", (r) => r.fulfill({ json: edited }));
  await page.clock.install({ time: Math.min(...slate.games.map((x: any) => new Date(x.date).getTime())) - 3600e3 });
  await page.goto("/?league=CFB");
  const photo = page.locator('.game-card [data-testid="rivalry-badge"] img.trophy-photo').first();
  await expect(photo).toBeAttached({ timeout: 15_000 });
  expect(await photo.getAttribute("src")).toBe(photos[key].src);
  await photo.scrollIntoViewIfNeeded();
  await expect.poll(() => photo.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0), { message: "the photo loads" }).toBe(true);
  // The photo does not make its card taller than the others, or crowd its content out.
  const card = page.locator(".game-card.compact", { has: page.locator("img.trophy-photo") }).first();
  expect(Math.round((await card.boundingBox())!.height)).toBe(Math.round((await page.locator(".game-card.compact").nth(1).boundingBox())!.height));
  expect(await card.evaluate((e) => (e.querySelector(".compact-overview") as HTMLElement).scrollHeight <= (e as HTMLElement).clientHeight + 1)).toBe(true);
  await page.locator("footer details", { hasText: "About this slate" }).first().evaluate((d) => ((d as HTMLDetailsElement).open = true));
  await expect(page.locator(".trophy-credits")).toContainText(photos[key].author);
  void a; void b;
});
