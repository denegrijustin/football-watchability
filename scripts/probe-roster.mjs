// One-off: which roster endpoints answer with positions.
import { mkdirSync, writeFileSync } from "node:fs";
const dir = new URL("../data-raw/probe/", import.meta.url);
mkdirSync(dir, { recursive: true });
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const log = [];
for (const [name, url] of [
  ["site-roster-nfl", "https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/2/roster"],
  ["web-roster-nfl", "https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/teams/2/roster"],
  ["site-roster-cfb", "https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/333/roster"],
  ["core-athlete", "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/athletes/3918298"],
  ["common-roster", "https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/teams/2/roster"],
]) {
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
    const t = await r.text();
    log.push({ name, status: r.status, bytes: t.length, cors: r.headers.get("access-control-allow-origin") });
    writeFileSync(new URL(`${name}.txt`, dir), t.slice(0, 200000));
  } catch (e) { log.push({ name, error: String(e) }); }
}
writeFileSync(new URL("roster-log.json", dir), JSON.stringify(log, null, 1));
console.log(log);
