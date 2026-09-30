// Fills src/data/season.json with insanity scores for earlier weeks of the
// season (the archive only keeps the last two weeks, so the season ranking
// needs the rest from ESPN).
//
//   START=20260908 END=20260923 node scripts/backfill-insanity.mjs
//
// START should be the Tuesday that opens the first week (weeks run Tuesday to
// Monday, like the board). Every finished NFL and FBS game in the range is
// scored from ESPN's win-probability line and merged into the ledger by game
// id, so re-running a range is safe. ESPN_BASE and SEASON_FILE override the
// ESPN host and the output file (used by the tests).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { ledgerEntry, mergeLedger, periodLabel, thinForArchive } from "./season-ledger.mjs";

const ESPN = process.env.ESPN_BASE ?? "https://site.api.espn.com";
const OUT = process.env.SEASON_FILE ?? new URL("../src/data/season.json", import.meta.url).pathname;
const START = process.env.START;
const END = process.env.END;
if (!/^\d{8}$/.test(START ?? "") || !/^\d{8}$/.test(END ?? "")) {
  console.error("Set START and END as YYYYMMDD (START = the Tuesday that opens the first week).");
  process.exit(1);
}
const UA = "Mozilla/5.0 fbwatch-season-backfill";
const PATHS = { NFL: "nfl", CFB: "college-football" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  let last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
      if (res.ok) return await res.json();
      last = `HTTP ${res.status}`;
      if (res.status === 404) break;
    } catch (e) {
      last = String(e);
    }
    await sleep(500 * (attempt + 1));
  }
  console.warn(`  skipped ${url}: ${last}`);
  return null;
}

const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
const parse = (s) => new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T12:00:00Z`);

// ESPN team id -> the site's logo id, so rows can show logos where the site has them.
const logoSources = existsSync(new URL("../src/data/logo-sources.json", import.meta.url))
  ? JSON.parse(readFileSync(new URL("../src/data/logo-sources.json", import.meta.url), "utf8")).logos
  : [];
const logoOf = new Map(logoSources.map((l) => [`${/\/nfl\//.test(l.source ?? "") ? "NFL" : "CFB"}:${l.espnId}`, l.logoId]));
const slug = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** [home %, period] from a summary, like the archive: ints, thinned. */
function flowOf(sum) {
  const periodByPlay = new Map();
  const drives = [...(sum.drives?.previous ?? []), ...(sum.drives?.current ? [sum.drives.current] : [])];
  for (const d of drives) for (const p of d.plays ?? []) periodByPlay.set(p.id, p.period?.number ?? null);
  return thinForArchive((sum.winprobability ?? []).map((w) => [w.homeWinPercentage ?? 0, periodByPlay.get(w.playId) ?? null]));
}

const found = [];
for (let a = parse(START); a <= parse(END); a = new Date(a.getTime() + 7 * 864e5)) {
  const b = new Date(Math.min(a.getTime() + 6 * 864e5, parse(END).getTime()));
  console.log(`Week ${ymd(a)}–${ymd(b)}`);
  const week = [];
  for (const [league, path] of Object.entries(PATHS)) {
    const qs = `dates=${ymd(a)}-${ymd(b)}&limit=400${league === "CFB" ? "&groups=80" : ""}`;
    const board = await get(`${ESPN}/apis/site/v2/sports/football/${path}/scoreboard?${qs}`);
    for (const ev of board?.events ?? []) {
      const c = ev.competitions?.[0];
      if (c?.status?.type?.state !== "post") continue;
      const [away, home] = ["away", "home"].map((s) => c.competitors?.find((x) => x.homeAway === s));
      if (!away || !home) continue;
      const sum = await get(`${ESPN}/apis/site/v2/sports/football/${path}/summary?event=${ev.id}`);
      if (!sum) continue;
      const side = (t) => ({
        abbr: t.team?.abbreviation ?? t.team?.shortDisplayName ?? "?",
        logoId: logoOf.get(`${league}:${t.team?.id}`) ?? slug(t.team?.displayName ?? t.team?.abbreviation ?? "team"),
        score: Number(t.score ?? 0),
      });
      week.push({
        id: String(ev.id),
        league,
        date: ev.date,
        matchup: `${away.team?.displayName} @ ${home.team?.displayName}`,
        away: side(away),
        home: side(home),
        wp: flowOf(sum),
        overtime: (c.status?.period ?? 4) > 4,
      });
      await sleep(120);
    }
  }
  const label = periodLabel(week.map((g) => g.date));
  for (const g of week) found.push(ledgerEntry({ ...g, week: label }));
  console.log(`  ${week.length} finished games (${label || "none"})`);
}

const entries = found.filter(Boolean);
const dropped = found.length - entries.length;
const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { games: [] };
const merged = mergeLedger(existing, entries, new Date().toISOString().slice(0, 10));
writeFileSync(OUT, JSON.stringify(merged, null, 1) + "\n");
console.log(`Scored ${entries.length} games${dropped ? ` (${dropped} had no win-probability line)` : ""}; ledger now has ${merged.games.length}.`);
