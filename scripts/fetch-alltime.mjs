// All-time head-to-head history from Winsipedia (college) and The Football
// Database (NFL). Run in GitHub Actions (network required).
//
//   PHASE=probe node scripts/fetch-alltime.mjs   -> saves index + sample pages
//   node scripts/fetch-alltime.mjs               -> saves one page per game
//
// Raw HTML goes to data-raw/alltime/; build-slate.mjs parses it.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

const raw = new URL("../data-raw/", import.meta.url);
const dir = new URL("alltime/", raw);
mkdirSync(dir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const log = [];
async function getText(url) {
  for (let a = 0; a < 3; a++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" } });
      const body = await res.text();
      log.push({ url, status: res.status, bytes: body.length });
      if (res.ok) return body;
      if (res.status === 404) return null;
    } catch (e) {
      log.push({ url, error: String(e) });
    }
    await sleep(1500 * (a + 1));
  }
  return null;
}
const save = (name, text) => text != null && writeFileSync(new URL(name, dir), text);

if (process.env.PHASE === "probe") {
  save("winsipedia-schools.html", await getText("https://www.winsipedia.com/schools"));
  await sleep(1500);
  save("winsipedia-sample.html", await getText("https://www.winsipedia.com/games/alabama/vs/mississippi-state"));
  await sleep(1500);
  save("fdb-sample.html", await getText("https://www.footballdb.com/teams/nfl/philadelphia-eagles/teamvsteam?opp=29"));
  await sleep(1500);
  save("fdb-teams.html", await getText("https://www.footballdb.com/teams/nfl/philadelphia-eagles/teamvsteam"));
} else {
  // Resolved by build step: data-raw/alltime/requests.json = [{key, url}]
  const reqs = JSON.parse(readFileSync(new URL("requests.json", dir), "utf8"));
  for (const r of reqs) {
    if (existsSync(new URL(`${r.key}.html`, dir))) continue;
    save(`${r.key}.html`, await getText(r.url));
    await sleep(2500); // be polite
  }
}
writeFileSync(new URL("fetch-log.json", dir), JSON.stringify(log, null, 1));
console.log(log.map((l) => `${l.status ?? l.error} ${l.bytes ?? ""} ${l.url}`).join("\n"));
