// FCS, Division II, Division III and NAIA schools and conferences carry their logos (ESPN's, or the school's or conference's own site, fetched by
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
  // Division III: ESPN and the schools' own sites had nothing for these five; the MASCAC and SCAC sites refuse automated requests.
  { div: "D3", file: "src/data/d3-logos.json", noTeam: ["Centenary (La.)", "Maine Maritime", "New England College", "Saint Francis-PA", "Schreiner"], noConf: ["MASCAC", "SCAC"], radio: "D3" },
  // NAIA: ESPN has few NAIA schools, so most logos come from the schools' own athletics sites; those that refuse automated requests have none.
  { div: "NAIA", file: "src/data/naia-logos.json", noTeam: ["Arkansas Baptist", "Avila (Mo.)", "Baker (Kan.)", "Bethany (Kan.)", "Briar Cliff (Iowa)", "Central Methodist (Mo.)", "Clarke (Iowa)", "Concordia (Neb.)", "Culver-Stockton (Mo.)", "Dakota Wesleyan (S.D.)", "Doane (Neb.)", "Evangel (Mo.)", "Fort Lauderdale", "Graceland (Iowa)", "Hastings (Neb.)", "Judson (Ill.)", "Kentucky Christian", "Midland (Neb.)", "Missouri Valley", "Morningside (Iowa)", "Mount Mercy", "Oklahoma Panhandle State", "Olivet Nazarene (Ill.)", "Point (Ga.)", "Reinhardt (Ga.)", "Rio Grande", "Rocky Mountain (Mont.)", "St. Ambrose (Iowa)", "St. Francis (Ind.)", "Sterling (Kan.)", "Taylor (Ind.)", "Texas College", "Union (Ky.)", "Virginia-Lynchburg", "Waldorf (Iowa)", "Westgate Christian", "William Penn (Iowa)"], noConf: ["Appalachian", "Great Plains", "Heart of America", "Mid-States Mideast", "Mid-States Midwest"], radio: "NAIA" },
];
// Division III abbreviations clash with FBS ones (MWC, MAC, PAC), so its conferences are registered as "D3:<name>".
const confKey = (div: string, c: string) => (div === "D3" || div === "NAIA" ? `${div}:${c}` : c);

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
    expect(names.length).toBeGreaterThanOrEqual(100);
    const missing = names.filter((n) => !logos[n] || !existsSync(`public${logos[n].src}`));
    expect(missing.sort()).toEqual([...d.noTeam].sort());
    expect(new Set(Object.values(logos).map((l) => l.src)).size).toBe(Object.keys(logos).length);
  });

  test(`${d.div}: every conference has an entry and a downloaded logo (except ${d.noConf.join(", ") || "none"})`, () => {
    const real = rowsOf(d.div).conf.filter((c) => c !== "Indies" && c !== "Unaffiliated");
    const have = real.filter((c) => !d.noConf.includes(c));
    for (const c of have) expect(confs[confKey(d.div, c)], c).toBeTruthy();
    const bare = real.filter((c) => !confs[confKey(d.div, c)]?.src || !existsSync(`public${confs[confKey(d.div, c)].src}`));
    expect(bare.sort()).toEqual([...d.noConf].sort());
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
    for (let i = 0; i < n; i++) {
      // a school with no logo yet (listed above) shows its lettered badge; every other school shows its logo
      const text = (await rows.nth(i).innerText()).replace(/\s+/g, " ");
      const known = d.noTeam.some((name) => text.includes(name));
      if (!known) await expect(rows.nth(i).locator(".mono")).toHaveCount(0);
    }
    await expect(page.locator(".spp [data-conf-logo]").first()).toBeAttached();
    // A Division III conference never borrows an FBS conference's logo that shares its abbreviation.
    if (d.div === "D3") {
      await expect(page.locator('.spp [data-conf-logo="Mountain West"], .spp [data-conf-logo="Mid-American"], .spp [data-conf-logo="Pac-12"]')).toHaveCount(0);
    }
  });
}
