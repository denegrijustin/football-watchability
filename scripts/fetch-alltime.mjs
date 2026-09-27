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

if (process.env.PHASE === "nflprobe") {
  for (const [name, url] of [
    ["gh-538-list.json", "https://api.github.com/repos/fivethirtyeight/data/contents/nfl-elo"],
    ["538-projects.csv", "https://projects.fivethirtyeight.com/nfl-api/nfl_elo.csv"],
    ["datahub.html", "https://datahub.io/fivethirtyeight/nfl-elo"],
    ["gh-538-raw.csv", "https://raw.githubusercontent.com/fivethirtyeight/data/master/nfl-elo/nfl_elo.csv"],
    ["datahub-r.csv", "https://datahub.io/fivethirtyeight/nfl-elo/_r/-/data/nfl_elo.csv"],
  ]) {
    const t = await getText(url);
    save(name, t ? t.slice(0, 400000) : null);
    await sleep(800);
  }
} else if (process.env.PHASE === "probe") {
  save("winsipedia-schools.html", await getText("https://www.winsipedia.com/schools"));
  await sleep(1500);
  save("winsipedia-sample.html", await getText("https://www.winsipedia.com/games/alabama/vs/mississippi-state"));
  await sleep(1500);
  save("fdb-sample.html", await getText("https://www.footballdb.com/teams/nfl/philadelphia-eagles/teamvsteam?opp=29"));
  await sleep(1500);
  save("fdb-teams.html", await getText("https://www.footballdb.com/teams/nfl/philadelphia-eagles/teamvsteam"));
} else {
  // NFL: FiveThirtyEight's game file (every game since 1920, incl. AFL).
  if (!existsSync(new URL("nfl_elo.csv", dir)))
    save("nfl_elo.csv", await getText("https://datahub.io/fivethirtyeight/nfl-elo/_r/-/data/nfl_elo.csv"));

  // College: one Winsipedia matchup page per game, trying likely slugs.
  const SLUGS = {
    "Miami (FL)": ["miami", "miami-fl"],
    "Miami (OH)": ["miami-oh", "miami-ohio"],
    "Hawai'i": ["hawaii"],
    "San José State": ["san-jose-state"],
    "UL Monroe": ["louisiana-monroe", "ul-monroe"],
    Louisiana: ["louisiana", "louisiana-lafayette"],
    "Texas A&M": ["texas-am", "texas-a-m"],
    "NC State": ["nc-state", "north-carolina-state"],
    UConn: ["uconn", "connecticut"],
    Massachusetts: ["massachusetts", "umass"],
    UCF: ["ucf", "central-florida"],
    USC: ["usc", "southern-california"],
    McNeese: ["mcneese", "mcneese-state"],
    "Middle Tennessee": ["middle-tennessee", "middle-tennessee-state"],
    "Ole Miss": ["ole-miss", "mississippi"],
  };
  const slugify = (n) =>
    n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const cands = (n) => SLUGS[n] ?? [slugify(n)];
  const slate = JSON.parse(readFileSync(new URL("../src/data/slate.json", import.meta.url), "utf8"));
  const found = {};
  for (const g of slate.games.filter((x) => x.league === "CFB")) {
    const key = `cfb-${g.espnId}`;
    if (existsSync(new URL(`${key}.html`, dir))) continue;
    const [a, b] = g.teams.map((t) => t.name);
    let ok = null;
    outer: for (const x of cands(a))
      for (const y of cands(b))
        for (const url of [`https://www.winsipedia.com/games/${x}/vs/${y}`, `https://www.winsipedia.com/games/${y}/vs/${x}`]) {
          const t = await getText(url);
          await sleep(2000); // be polite
          if (t && t.includes('\\"team1Score\\"')) {
            save(`${key}.html`, t);
            ok = url;
            break outer;
          }
        }
    found[g.espnId] = { matchup: g.matchup, url: ok };
  }
  writeFileSync(new URL("found.json", dir), JSON.stringify(found, null, 1));
}
writeFileSync(new URL("fetch-log.json", dir), JSON.stringify(log, null, 1));
console.log(log.map((l) => `${l.status ?? l.error} ${l.bytes ?? ""} ${l.url}`).join("\n"));
