// One-off probe: which advanced-stat sources answer from GitHub Actions.
import { writeFileSync, mkdirSync } from "node:fs";
const dir = new URL("../data-raw/probe/", import.meta.url);
mkdirSync(dir, { recursive: true });
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const log = [];
async function probe(name, url, headers = {}) {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json,text/html,*/*", ...headers } });
    const body = await res.text();
    const cors = res.headers.get("access-control-allow-origin");
    log.push({ name, url, status: res.status, bytes: body.length, cors });
    writeFileSync(new URL(`${name}.txt`, dir), body.slice(0, 300000));
  } catch (e) {
    log.push({ name, url, error: String(e) });
  }
}
const ngsH = { referer: "https://nextgenstats.nfl.com/stats/passing", origin: "https://nextgenstats.nfl.com" };
await probe("ngs-passing", "https://nextgenstats.nfl.com/api/statboard/passing?season=2026&seasonType=REG", ngsH);
await probe("ngs-rushing", "https://nextgenstats.nfl.com/api/statboard/rushing?season=2026&seasonType=REG", ngsH);
await probe("ngs-receiving", "https://nextgenstats.nfl.com/api/statboard/receiving?season=2026&seasonType=REG", ngsH);
await probe("ngs-passing-2025", "https://nextgenstats.nfl.com/api/statboard/passing?season=2025&seasonType=REG", ngsH);
await probe("nflverse-ngs", "https://github.com/nflverse/nflverse-data/releases/download/nextgen_stats/ngs_2026_passing.csv.gz");
await probe("nflverse-ngs-all", "https://github.com/nflverse/nflverse-data/releases/download/nextgen_stats/ngs_passing.csv.gz");
await probe("qbr-nfl", "https://site.web.api.espn.com/apis/fitt/v3/sports/football/nfl/qbr?region=us&lang=en&qbrType=seasons&seasontype=2&isqualified=true&sort=schedAdjQBR%3Adesc&season=2026");
await probe("qbr-cfb", "https://site.web.api.espn.com/apis/fitt/v3/sports/football/college-football/qbr?region=us&lang=en&qbrType=seasons&seasontype=2&isqualified=true&sort=schedAdjQBR%3Adesc&season=2026&conference=80");
await probe("teamstats-nfl", "https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/12/statistics");
await probe("teamstats-cfb", "https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/333/statistics");
await probe("scoreboard-cors", "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard", { origin: "https://fbwatch.elskatemm.com" });
await probe("cfbd", "https://api.collegefootballdata.com/ratings/sp?year=2026");
writeFileSync(new URL("log.json", dir), JSON.stringify(log, null, 1));
console.log(JSON.stringify(log, null, 1));
