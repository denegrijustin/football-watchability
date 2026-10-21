// FCS and Division II schools and conferences carry their logos (ESPN's, or the school's or conference's own site, fetched by
// scripts/fetch-school-logos.mjs and fetch-conference-logos.mjs).
import { test, expect, type Page } from "./fixtures";
import { existsSync, readFileSync } from "node:fs";
import { stubFinals } from "./helpers/finals";

const snapshot = JSON.parse(readFileSync("src/data/spplus.json", "utf8"));
const confs = JSON.parse(readFileSync("src/data/conference-logos.json", "utf8")).conferences as Record<string, { division?: string; src?: string; remote?: string[] }>;

const DIVS = [
  { div: "FCS", file: "src/data/fcs-logos.json", noTeam: [] as string[], noConf: ["UAC"], radio: "FCS" },
  // ESPN has no logo for these two schools and their own sites did not give one; ESPN has none for the UAC either (FCS above).
  { div: "D2", file: "src/data/d2-logos.json", noTeam: ["Jamestown", "Monroe"], noConf: [] as string[], radio: "D2" },
];

const rowsOf = (div: string) => {
  const names = new Set<string>(), conf = new Set<string>();
  for (const sh of snapshot.sheets as { name: string; rows: unknown[][] }[]) {
    if (!new RegExp(`^${div} Week \\d+$`).test(sh.name)) continue;
    for (const r of sh.rows.slice(1)) if (typeof r[0] === "string" && r[0]) { names.add(r[0]); if (typeof r[1] === "string") conf.add(r[1]); }
  }
  return { names: [...names], conf: [...conf] };
};

for (const d of DIVS) {
  const logos = JSON.parse(readFileSync(d.file, "utf8")).teams as Record<string, { src: string }>;

  test(`${d.div}: every team in the SP+ sheet has a logo file (except ${d.noTeam.join(", ") || "none"})`, () => {
    const { names } = rowsOf(d.div);
    expect(names.length).toBeGreaterThan(100);
    const missing = names.filter((n) => !logos[n] || !existsSync(`public${logos[n].src}`));
    expect(missing.sort()).toEqual([...d.noTeam].sort());
    expect(new Set(Object.values(logos).map((l) => l.src)).size).toBe(Object.keys(logos).length);
  });

  test(`${d.div}: every conference has an entry and a downloaded logo (except ${d.noConf.join(", ") || "none"})`, () => {
    const real = rowsOf(d.div).conf.filter((c) => c !== "Indies");
    for (const c of real) expect(confs[c], c).toBeTruthy();
    const bare = real.filter((c) => !confs[c]?.src || !existsSync(`public${confs[c].src}`));
    expect(bare).toEqual(d.noConf);
  });

  test(`${d.div}: the ranking shows team logos and conference logos, not lettered badges`, async ({ page }: { page: Page }) => {
    await stubFinals(page);
    await page.goto("/?league=CFB");
    await page.getByRole("button", { name: "CFB SP+" }).click();
    await expect(page.locator(".spp .tbl tbody tr").first()).toBeVisible({ timeout: 15_000 });
    await page.locator(".spp").getByRole("radio", { name: d.radio, exact: true }).click();
    const rows = page.locator(".spp .tbl tbody tr:not(.detail)");
    await expect(rows.first().locator(`img[src^="/logos/${d.div.toLowerCase()}/"]`)).toHaveCount(1);
    const n = Math.min(await rows.count(), 25);
    for (let i = 0; i < n; i++) await expect(rows.nth(i).locator(".mono")).toHaveCount(0);
    await expect(page.locator(".spp [data-conf-logo]").first()).toBeAttached();
  });
}
