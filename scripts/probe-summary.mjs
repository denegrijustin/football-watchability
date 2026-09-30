// One-off: save full ESPN game summaries to design the live game center.
import { mkdirSync, writeFileSync } from "node:fs";
const dir = new URL("../data-raw/probe/", import.meta.url);
mkdirSync(dir, { recursive: true });
for (const [lg, id] of [["nfl", "401872953"], ["college-football", "401869941"]]) {
  const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/${lg}/summary?event=${id}`, { headers: { "user-agent": "Mozilla/5.0" } });
  writeFileSync(new URL(`summary-${lg}.json`, dir), await r.text());
  console.log(lg, r.status, r.headers.get("access-control-allow-origin"));
}
