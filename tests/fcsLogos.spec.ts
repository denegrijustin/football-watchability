// FCS schools and conferences carry their logos (ESPN's, fetched by scripts/fetch-fcs-logos.mjs and fetch-conference-logos.mjs).
import { test, expect, type Page } from "./fixtures";
import { existsSync, readFileSync } from "node:fs";
import { stubFinals } from "./helpers/finals";

const snapshot = JSON.parse(readFileSync("src/data/spplus.json", "utf8"));
const logos = JSON.parse(readFileSync("src/data/fcs-logos.json", "utf8")).teams as Record<string, { src: string; espnId: string }>;
const confs = JSON.parse(readFileSync("src/data/conference-logos.json", "utf8")).conferences as Record<string, { division?: string; src?: string; remote?: string[] }>;

const fcsRows = () => {
  const names: string[] = [], conf = new Set<string>();
  for (const sh of snapshot.sheets as { name: string; rows: unknown[][] }[]) {
    if (!/^FCS Week \d+$/.test(sh.name)) continue;
    for (const r of sh.rows.slice(1)) if (typeof r[0] === "string" && r[0]) { names.push(r[0]); if (typeof r[1] === "string") conf.add(r[1]); }
  }
  return { names: [...new Set(names)], conf: [...conf] };
};

test("every FCS team in the SP+ sheet has a logo file", () => {
  const { names } = fcsRows();
  expect(names.length).toBeGreaterThan(100);
  const missing = names.filter((n) => !logos[n] || !existsSync(`public${logos[n].src}`));
  expect(missing).toEqual([]);
  expect(new Set(Object.values(logos).map((l) => l.src)).size).toBe(Object.keys(logos).length);
});

test("every FCS conference has an entry; all but the UAC (which ESPN has no logo for) have a downloaded logo", () => {
  const { conf } = fcsRows();
  const real = conf.filter((c) => c !== "Indies");
  for (const c of real) expect(confs[c], c).toBeTruthy();
  const bare = real.filter((c) => !confs[c]?.src || !existsSync(`public${confs[c].src}`));
  expect(bare).toEqual(["UAC"]);
});

const openFcs = async (page: Page) => {
  await stubFinals(page);
  await page.goto("/?league=CFB");
  await page.getByRole("button", { name: "CFB SP+" }).click();
  await expect(page.locator(".spp .tbl tbody tr").first()).toBeVisible({ timeout: 15_000 });
  await page.locator(".spp").getByRole("radio", { name: "FCS" }).click();
  await expect(page.locator(".spp .tbl tbody tr").first()).toBeVisible();
};

test("the FCS ranking shows team logos and conference logos, not lettered badges", async ({ page }) => {
  await openFcs(page);
  const rows = page.locator(".spp .tbl tbody tr:not(.detail)");
  await expect(rows.first().locator('img[src^="/logos/fcs/"]')).toHaveCount(1);
  const n = Math.min(await rows.count(), 25);
  for (let i = 0; i < n; i++) await expect(rows.nth(i).locator(".mono")).toHaveCount(0);
  await expect(page.locator('.spp [data-conf-logo]').first()).toBeAttached();
});
