// Advanced stats for the week's teams, saved to data-raw/advanced.json:
// - NFL Next Gen Stats (nextgenstats.nfl.com statboards): passing, rushing,
//   receiving for the season.
// - ESPN QBR, season, NFL and FBS.
// (FPI efficiencies, EPA and strength-of-schedule ranks come with the FPI
// files that fetch-slate.mjs already saves.) Run in GitHub Actions.
import { readFileSync, writeFileSync } from "node:fs";

const raw = new URL(`../${process.env.RAW_DIR ?? "data-raw"}/`, import.meta.url);
const { season } = JSON.parse(readFileSync(new URL("index.json", raw), "utf8"));
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
async function get(url, headers = {}) {
  for (let a = 0; a < 3; a++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json", ...headers } });
      if (res.ok) return await res.json();
    } catch {}
    await sleep(800 * (a + 1));
  }
  errors.push(url);
  return null;
}

const ngsH = { referer: "https://nextgenstats.nfl.com/stats/passing", origin: "https://nextgenstats.nfl.com" };
const ngs = {};
for (const kind of ["passing", "rushing", "receiving"]) {
  const d = await get(`https://nextgenstats.nfl.com/api/statboard/${kind}?season=${season}&seasonType=REG`, ngsH);
  ngs[kind] = (d?.stats ?? []).map(({ player, ...s }) => ({ ...s, name: player?.displayName ?? s.playerName, short: player?.shortName }));
  await sleep(400);
}

const qbr = {};
for (const [key, path, extra] of [["nfl", "nfl", ""], ["cfb", "college-football", "&conference=80"]]) {
  const rows = [];
  for (let page = 1; page <= 6; page++) {
    const d = await get(
      `https://site.web.api.espn.com/apis/fitt/v3/sports/football/${path}/qbr?region=us&lang=en&qbrType=seasons&seasontype=2&isqualified=false&sort=schedAdjQBR%3Adesc&season=${season}${extra}&limit=50&page=${page}`,
    );
    if (!d) break;
    const names = d.categories?.[0]?.names ?? [];
    for (const a of d.athletes ?? []) {
      const c = a.categories?.[0] ?? {};
      const v = Object.fromEntries(names.map((n, i) => [n, Number(c.totals?.[i])]));
      rows.push({ id: a.athlete.id, name: a.athlete.displayName, short: a.athlete.shortName, teamId: a.athlete.teamId, ...v });
    }
    if (page >= (d.pagination?.pages ?? 1)) break;
    await sleep(300);
  }
  qbr[key] = rows;
}

writeFileSync(new URL("advanced.json", raw), JSON.stringify({ season, fetchedAt: new Date().toISOString(), ngs, qbr, errors }, null, 1));
console.log(`NGS ${Object.values(ngs).map((x) => x.length).join("/")}; QBR NFL ${qbr.nfl.length}, CFB ${qbr.cfb.length}; ${errors.length} errors`);
