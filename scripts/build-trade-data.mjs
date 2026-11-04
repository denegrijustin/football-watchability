// Builds src/data/trade-players.json for the trade finder: every player on a 2026 NFL roster with a value rating, an age, and a contract (known,
// rookie-scale or estimated), plus each team's estimated cap use. Open data only (nflverse, CC-BY 4.0): see scripts/trade/lib.mjs for what that means.
// Any failure keeps the saved file and exits 0.
//   node scripts/build-trade-data.mjs
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { forEachRow } from "./nflverse/csv.mjs";
import { download, RELEASES, urls } from "./nflverse/util.mjs";
import { CAP_2026, GROUPS, STARTERS, groupOf, marketApy, priorRating, ratingFromZ, rookieApy, yearsLeft } from "./trade/lib.mjs";

const root = new URL("../", import.meta.url);
const OUT = new URL("src/data/trade-players.json", root);
const OVERRIDES = new URL("src/data/contract-overrides.json", root);
const cache = new URL(".cache/nflverse/", root).pathname;
const SEASON = Number(process.env.NFL_SEASON) || 2026;
const TYPICAL_SPACE = 14e6; // assumed cap room per club when no real figure is supplied
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z]/g, "").replace(/(jr|sr|ii|iii|iv)$/, "");
const num = (x) => (x === "" || x == null ? 0 : Number(x) || 0);
const r1 = (x) => Math.round(x * 10) / 10;

async function get(rel, file, maxAgeMs = 12 * 3600e3) {
  try { return await download(`${RELEASES}/${rel}`, `${cache}${file}`, { maxAgeMs }); } catch (e) { if (existsSync(`${cache}${file}`)) return `${cache}${file}`; throw e; }
}

/** z-scores of `value(p)` among the players with `ok(p)`, by group; the rest get null. */
function zByGroup(players, value, ok) {
  const out = new Map();
  for (const g of GROUPS) {
    const pool = players.filter((p) => p.group === g && ok(p));
    const vals = pool.map(value);
    const mean = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length || 1)) || 1;
    pool.forEach((p, i) => out.set(p, (vals[i] - mean) / sd));
  }
  return out;
}

export function compositeFor(group, s) {
  const g = Math.max(1, s.games);
  if (group === "QB") return 0.55 * (s.pEpa / Math.max(1, s.att + s.sacks)) * 10 + 0.2 * (s.pYds / Math.max(1, s.att)) + 0.15 * ((s.pTd - 2 * s.int) / Math.max(1, s.att)) * 10 + 0.1 * (s.cpoe / g);
  if (group === "RB") return 0.3 * (s.rEpa / Math.max(1, s.car)) * 10 + 0.2 * (s.rYds / Math.max(1, s.car)) + 0.35 * ((s.rYds + s.recYds) / g) / 20 + 0.15 * (s.rec / g);
  if (group === "WR" || group === "TE") return 0.4 * (s.recYds / g) / 10 + 0.25 * (s.recEpa / Math.max(1, s.tgt)) * 10 + 0.2 * (s.tgt / g) + 0.15 * (s.rec / g);
  if (group === "OT" || group === "OG" || group === "C") return s.snapPct;
  const pts = 3 * s.sack + s.hits + 2 * s.tfl + 0.5 * (s.solo + 0.5 * s.ast) + 4 * s.defInt + 1.5 * s.pd + 2 * s.ff;
  return pts / g + 0.3 * s.snapPct * 10;
}

async function build() {
  const rosterFile = await get("rosters/roster_2026.csv", "roster_2026.csv");
  const contractFile = await get("contracts/historical_contracts.csv.gz", "historical_contracts.csv.gz", 7 * 864e5);

  // ---- roster: the latest listing of every player on a club's roster (active, injured reserve or inactive) ----
  const byId = new Map();
  await forEachRow(rosterFile, (ix, f) => {
    const status = f[ix.status];
    if (!["ACT", "RES", "INA"].includes(status)) return;
    const group = groupOf(f[ix.depth_chart_position] || f[ix.position]);
    if (!group) return;
    const week = num(f[ix.week]);
    const id = f[ix.gsis_id] || `${f[ix.team]}:${f[ix.full_name]}`;
    const prev = byId.get(id);
    if (prev && prev.week > week) return;
    byId.set(id, {
      id, week, name: f[ix.full_name], team: f[ix.team], group, pos: f[ix.depth_chart_position] || f[ix.position], status, pfr: f[ix.pfr_id],
      birth: f[ix.birth_date], draft: num(f[ix.draft_number]), exp: num(f[ix.years_exp]), entry: num(f[ix.entry_year]),
    });
  });
  const players = [...byId.values()];
  if (players.length < 1200) throw new Error(`only ${players.length} players on rosters`);

  // ---- production: this season's games count in full, last season's at 60% ----
  const stat = new Map(); // gsis -> sums
  const seasons = [SEASON - 1, SEASON];
  for (const y of seasons) {
    const file = await get(`stats_player/stats_player_week_${y}.csv`, `stats_${y}.csv`).catch(() => null);
    if (!file) continue;
    const w = y === SEASON ? 1 : 0.6;
    await forEachRow(file, (ix, f) => {
      if (f[ix.season_type] && f[ix.season_type] !== "REG") return;
      const id = f[ix.player_id];
      const s = stat.get(id) ?? stat.set(id, { games: 0, att: 0, sacks: 0, pEpa: 0, pYds: 0, pTd: 0, int: 0, cpoe: 0, car: 0, rEpa: 0, rYds: 0, rec: 0, tgt: 0, recYds: 0, recEpa: 0, sack: 0, hits: 0, tfl: 0, solo: 0, ast: 0, defInt: 0, pd: 0, ff: 0, snapPct: 0, snapGames: 0 }).get(id);
      const add = (k, col) => { s[k] += w * num(f[ix[col]]); };
      s.games += w;
      add("att", "attempts"); add("sacks", "sacks_suffered"); add("pEpa", "passing_epa"); add("pYds", "passing_yards"); add("pTd", "passing_tds"); add("int", "passing_interceptions"); add("cpoe", "passing_cpoe");
      add("car", "carries"); add("rEpa", "rushing_epa"); add("rYds", "rushing_yards"); add("rec", "receptions"); add("tgt", "targets"); add("recYds", "receiving_yards"); add("recEpa", "receiving_epa");
      add("sack", "def_sacks"); add("hits", "def_qb_hits"); add("tfl", "def_tackles_for_loss"); add("solo", "def_tackles_solo"); add("ast", "def_tackle_assists"); add("defInt", "def_interceptions"); add("pd", "def_pass_defended"); add("ff", "def_fumbles_forced");
    });
  }
  const snaps = new Map(); // pfr id -> [pct, games], newest season weighted
  for (const y of seasons) {
    const file = await get(urls.snaps(y).slice(RELEASES.length + 1), `snaps_${y}.csv`).catch(() => null);
    if (!file) continue;
    const w = y === SEASON ? 1 : 0.6;
    await forEachRow(file, (ix, f) => {
      if (f[ix.game_type] && f[ix.game_type] !== "REG") return;
      const pct = Math.max(num(f[ix.offense_pct]), num(f[ix.defense_pct]));
      const s = snaps.get(f[ix.pfr_player_id]) ?? snaps.set(f[ix.pfr_player_id], [0, 0]).get(f[ix.pfr_player_id]);
      s[0] += w * pct; s[1] += w;
    });
  }
  for (const p of players) {
    const s = stat.get(p.id);
    p.s = s ?? null;
    const sn = snaps.get(p.pfr);
    p.snapPct = sn && sn[1] ? sn[0] / sn[1] : 0;
    if (p.s) { p.s.snapPct = p.snapPct; p.s.games = Math.max(p.s.games, sn?.[1] ?? 0); }
    p.age = p.birth ? Math.max(20, Math.floor((Date.UTC(SEASON, 10, 1) - Date.parse(p.birth)) / 31557600000)) : 26;
    p.drafted = p.entry && p.draft ? p.entry : 0;
  }

  // ---- ratings: production z-score within the position group, among players with real playing time ----
  const qualified = (p) => p.s && p.snapPct >= 0.3 && p.s.games >= 3;
  const comp = new Map(players.filter(qualified).map((p) => [p, compositeFor(p.group, p.s)]));
  const z = zByGroup(players, (p) => comp.get(p), (p) => comp.has(p));
  const line = (p) => (p.group === "OT" || p.group === "OG" || p.group === "C");
  for (const p of players) {
    let zz = z.get(p);
    // A short season is a noisy one: the score is pulled toward average until a player has most of a season's games.
    if (zz != null && !line(p)) zz *= Math.min(1, 0.45 + p.s.games / 12);
    if (line(p)) {
      // No free grades exist for blockers. Starters (by snaps) are told apart by where they were drafted and how long they have lasted: a depth-level estimate, flagged unmeasured.
      const starter = p.snapPct >= 0.6 ? 1 : p.snapPct >= 0.3 ? 0.5 : 0;
      const pedigree = p.draft ? Math.max(0, 1 - Math.min(p.draft, 200) / 200) : 0.05;
      p.rating = Math.round(Math.min(84, 52 + 11 * starter + 14 * pedigree + Math.min(4, p.exp * 0.5)));
      p.measured = false;
      continue;
    }
    p.rating = zz == null ? Math.min(priorRating(p.draft), 66) : ratingFromZ(zz);
    p.measured = zz != null;
  }

  // ---- contracts: nflverse's (to 2022 signings) where one is still running, the rookie scale for 2023+ draftees, else the market for his rating ----
  const known = new Map();
  await forEachRow(contractFile, (ix, f) => {
    if (!["TRUE", "True"].includes(f[ix.is_active])) return;
    const key = norm(f[ix.player]);
    const signed = num(f[ix.year_signed]), years = num(f[ix.years]);
    if (yearsLeft(signed, years, SEASON) <= 0) return;
    const prev = known.get(key);
    if (prev && prev.signed > signed) return;
    known.set(key, { signed, years, share: num(f[ix.apy_cap_pct]), gtd: num(f[ix.guaranteed]), apy: num(f[ix.apy]) });
  });
  const overrides = existsSync(OVERRIDES) ? JSON.parse(readFileSync(OVERRIDES, "utf8")).players ?? {} : {};
  for (const p of players) {
    const k = known.get(norm(p.name)), o = overrides[p.id] ?? overrides[norm(p.name)];
    if (o) { p.apy = o.apy; p.gtd = o.gtd ?? 0; p.years = o.years ?? 1; p.src = "o"; continue; }
    if (k) { p.apy = k.apy; p.gtd = k.gtd; p.years = yearsLeft(k.signed, k.years, SEASON); p.src = "k"; continue; }
    const rookieYear = p.drafted && p.drafted >= SEASON - 3;
    if (rookieYear) { p.apy = rookieApy(p.draft); p.gtd = p.apy * 2.2; p.years = Math.max(1, p.drafted + 4 - SEASON); p.src = "r"; continue; }
    p.apy = Math.max(0.82e6, marketApy(p.group, p.rating) * (p.measured || (line(p) && p.snapPct >= 0.6) ? 1 : 0.35)); p.gtd = p.apy * 0.3; p.years = 2; p.src = "e";
  }

  // ---- starters on each team, and each team's cap room. Free data cannot say what a club's cap room is, so every club gets the same typical in-season room
  // (an assumption, flagged in the file) unless src/data/team-cap-overrides.json gives the real figure.
  const teams = {};
  for (const p of players) (teams[p.team] ??= { players: [] }).players.push(p);
  for (const t of Object.values(teams)) {
    for (const g of GROUPS) t.players.filter((p) => p.group === g).sort((a, b) => b.rating - a.rating).forEach((p, i) => { p.rank = i + 1; });
    t.used = t.players.reduce((a, p) => a + p.apy, 0);
  }
  const capFile = new URL("src/data/team-cap-overrides.json", root);
  const capOverrides = existsSync(capFile) ? JSON.parse(readFileSync(capFile, "utf8")).teams ?? {} : {};
  const scale = 1;
  for (const [k, t] of Object.entries(teams)) { t.space = capOverrides[k] != null ? capOverrides[k] * 1e6 : TYPICAL_SPACE; t.src = capOverrides[k] != null ? "o" : "a"; }
  const rows = players.map((p) => [p.id, p.name, p.team, p.group, p.age, p.rating, r1((p.apy * scale) / 1e6), r1((p.gtd * scale) / 1e6), p.years, p.src, p.status[0], p.rank, p.measured ? 1 : 0, p.draft || 0]);
  rows.sort((a, b) => a[2].localeCompare(b[2]) || b[5] - a[5]);
  const outTeams = Object.fromEntries(Object.entries(teams).map(([k, t]) => [k, { space: r1(t.space / 1e6), spaceSrc: t.src, n: t.players.length }]));
  const out = {
    version: 1, season: SEASON, builtAt: new Date().toISOString(),
    cap: { limit: r1(CAP_2026 / 1e6), assumed: true, typicalSpaceM: r1(TYPICAL_SPACE / 1e6) },
    fields: ["id", "name", "team", "group", "age", "rating", "apyM", "guaranteedM", "yearsLeft", "contractSrc(k known, r rookie scale, e estimated, o override)", "status(A active, R injured reserve, I inactive)", "teamRankInGroup", "measured(1: rated from playing time)", "draftOverall"],
    teams: outTeams, players: rows,
  };
  writeFileSync(OUT, JSON.stringify(out) + "\n");
  console.log(`Trade data: ${rows.length} players on ${Object.keys(outTeams).length} teams; ${rows.filter((r) => r[12]).length} rated from playing time; contracts known ${rows.filter((r) => r[9] === "k").length}, rookie ${rows.filter((r) => r[9] === "r").length}, estimated ${rows.filter((r) => r[9] === "e").length}.`);
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file://").href) {
  build().catch((e) => console.log(`Trade data kept: ${e.message}`));
}
export { build, STARTERS };
