// Attendance and stadium capacity for finished games.
//
//   node scripts/attendance.mjs
//
// 1. src/data/results.json: archived games that don't have `attendance` yet get it (and `venueId`)
//    from ESPN's game summary (`gameInfo.attendance`, `gameInfo.venue.id`). Raw summaries in
//    RAW_DIR/<id>.json are read first, so nothing is fetched twice. Attendance is a number or null
//    (null once a game is 3+ days old and ESPN still has none); a missing key means "try again".
// 2. public/venues.json: { [venueId]: { name, city, state, capacity, source, checked } }. ESPN's venue
//    endpoint gives each stadium's name, city and state but no capacity, so capacities come from
//    Wikipedia's NFL and FBS/FCS stadium lists (scripts/venue-capacity.mjs), matched by name and
//    state. The page reads the file at runtime to turn attendance into a share of capacity. A
//    stadium with no clear match keeps capacity null: it is never guessed.
//
// Safe to re-run, and a failed fetch never fails the run. RESULTS_FILE, VENUES_FILE, RAW_DIR,
// ESPN_BASE (site API), ESPN_CORE_BASE (core API) and WIKI_BASE override the defaults (the tests use them).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { WIKI_PAGES, buildIndex, lookupCapacity, stadiumRows } from "./venue-capacity.mjs";

const root = new URL("../", import.meta.url);
const RESULTS = process.env.RESULTS_FILE ?? new URL("src/data/results.json", root).pathname;
const VENUES = process.env.VENUES_FILE ?? new URL("public/venues.json", root).pathname;
const RAW = process.env.RAW_DIR ?? new URL("data-raw/summaries", root).pathname;
const SITE = process.env.ESPN_BASE ?? "https://site.api.espn.com";
const CORE = process.env.ESPN_CORE_BASE ?? "https://sports.core.api.espn.com";
const WIKI = process.env.WIKI_BASE ?? "https://en.wikipedia.org";
const UA = "fbwatch-attendance/1.0 (https://github.com/denegrijustin/football-watchability)";
const PATHS = { NFL: "nfl", CFB: "college-football" };
const DAY = 864e5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = new Date().toISOString().slice(0, 10);

async function getJson(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
      if (res.ok) return await res.json();
      if (res.status === 404) return null;
    } catch {
      /* try again, then give up quietly */
    }
    await sleep(400 * (attempt + 1));
  }
  return null;
}

const results = JSON.parse(readFileSync(RESULTS, "utf8"));
const venues = existsSync(VENUES) ? JSON.parse(readFileSync(VENUES, "utf8")) : {};

// ---------- 1. attendance ----------
let filled = 0;
let gaveUp = 0;
for (const g of results.games) {
  if (g.attendance !== undefined) continue;
  const rawFile = `${RAW}/${g.espnId}.json`;
  const summary = existsSync(rawFile)
    ? JSON.parse(readFileSync(rawFile, "utf8"))
    : await getJson(`${SITE}/apis/site/v2/sports/football/${PATHS[g.league]}/summary?event=${g.espnId}`);
  if (!existsSync(rawFile)) await sleep(120);
  const info = summary?.gameInfo;
  const count = Number(info?.attendance);
  if (info?.venue?.id) g.venueId = String(info.venue.id);
  if (Number.isFinite(count) && count > 0) {
    g.attendance = Math.round(count);
    filled++;
  } else if (summary && Date.now() - Date.parse(g.date) > 3 * DAY) {
    g.attendance = null; // ESPN never published one for this game; stop asking
    gaveUp++;
  }
}

// ---------- 2. stadiums: name, city and state from ESPN ----------
let looked = 0;
const wanted = new Map();
for (const g of results.games) if (g.venueId && g.attendance) wanted.set(g.venueId, g.league);
for (const [id, league] of wanted) {
  const known = venues[id];
  if (known && known.city !== undefined) continue; // looked up already (a missing capacity is handled below)
  const v = await getJson(`${CORE}/v2/sports/football/leagues/${PATHS[league]}/venues/${id}`);
  await sleep(120);
  if (!v) continue; // unreachable: look again next run
  const capacity = Number(v.capacity); // ESPN doesn't publish one today; use it if that changes
  venues[id] = {
    name: v.fullName ?? known?.name ?? "",
    city: v.address?.city ?? null,
    state: v.address?.state ?? null,
    capacity: Number.isFinite(capacity) && capacity > 0 ? Math.round(capacity) : (known?.capacity ?? null),
    source: Number.isFinite(capacity) && capacity > 0 ? "espn" : known?.source,
    checked: today,
  };
  looked++;
}

// ---------- 3. capacity from Wikipedia's stadium lists ----------
const needCapacity = [...wanted.keys()].filter((id) => venues[id] && venues[id].capacity == null);
let matched = 0;
const unmatched = [];
if (needCapacity.length) {
  const rows = [];
  for (const page of WIKI_PAGES) {
    const r = await getJson(`${WIKI}/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=text&format=json&formatversion=2&redirects=1`);
    if (r?.parse?.text) rows.push(...stadiumRows(r.parse.text));
    else console.log(`Wikipedia page unavailable: ${page}`);
  }
  const index = buildIndex(rows);
  console.log(`Wikipedia lists: ${rows.length} stadiums read.`);
  for (const id of needCapacity) {
    const v = venues[id];
    const cap = rows.length ? lookupCapacity(index, { name: v.name, state: v.state }) : null;
    if (cap) {
      v.capacity = cap;
      v.source = "wikipedia";
      v.checked = today;
      matched++;
    } else if (rows.length) unmatched.push(`${v.name}${v.state ? ` (${v.state})` : ""}`);
  }
}

writeFileSync(RESULTS, JSON.stringify(results, null, 1) + "\n");
const sorted = Object.fromEntries(Object.entries(venues).sort(([a], [b]) => Number(a) - Number(b)));
writeFileSync(VENUES, JSON.stringify(sorted, null, 1) + "\n");
const withAtt = results.games.filter((g) => g.attendance).length;
const withCap = results.games.filter((g) => g.attendance && venues[g.venueId]?.capacity).length;
console.log(
  `Attendance: ${filled} added${gaveUp ? `, ${gaveUp} unavailable` : ""}; ${withAtt} of ${results.games.length} games have it. ` +
    `Stadiums: ${looked} looked up on ESPN, ${matched} capacities from Wikipedia; ${withCap} of ${withAtt} games can show a share of capacity.`,
);
if (unmatched.length) console.log(`No capacity found for ${unmatched.length} stadiums: ${unmatched.slice(0, 40).join("; ")}`);
