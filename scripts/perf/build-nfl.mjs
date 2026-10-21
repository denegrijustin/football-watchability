// Builds src/data/perf-nfl.json: per team-game offense counts, drives and big plays for the NFL+ performance tabs, from nflverse play-by-play
// (https://github.com/nflverse/nflverse-data, CC-BY 4.0). It reads the play-by-play file fetch-nflverse.mjs already downloads, so a refresh
// adds no network calls. Any failure keeps the saved file and exits 0.
//   node scripts/perf/build-nfl.mjs            NFL_SEASON overrides the season; PERF_OUT overrides the output file name (perf-nfl-prev for last season)
import { existsSync, readFileSync, writeFileSync, renameSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { forEachRow } from "../nflverse/csv.mjs";
import { download, urls } from "../nflverse/util.mjs";
import { SCHEMA, EXPLOSIVE, GARBAGE_GAP, DEFINITIONS, V, emptyVec, addPlay, isGarbage, RESULT, HOW } from "./lib.mjs";

const root = new URL("../../", import.meta.url);
const nfl = JSON.parse(readFileSync(new URL("src/data/nfl.json", root), "utf8"));
const season = Number(process.env.NFL_SEASON) || nfl.season;
const outName = process.env.PERF_OUT || "perf-nfl";
const OUT = new URL(`src/data/${outName}.json`, root);
const cache = new URL(".cache/nflverse/", root).pathname;

const num = (s) => (s === "" || s == null ? null : Number(s));
const clockToSec = (t) => { const m = /^(\d+):(\d+)/.exec(t); return m ? Number(m[1]) * 60 + Number(m[2]) : 0; };
// "SEA 45" is the team's own 45: 55 yards from the opponent's goal line; "DEN 30" is the opponent's 30: 30 yards out.
const ydsToGoal = (txt, team) => { const m = /^([A-Z]+)\s+(\d+)$/.exec(txt ?? ""); if (!m) return null; return m[1] === team ? 100 - Number(m[2]) : Number(m[2]); };

const RESULT_OF = (fixed, endT) => {
  if (fixed === "Touchdown") return RESULT.TD;
  if (fixed === "Field goal") return RESULT.FG;
  if (fixed === "Punt") return RESULT.PUNT;
  if (fixed === "Missed field goal") return RESULT.MISSED_FG;
  if (fixed === "Turnover on downs") return RESULT.DOWNS;
  if (fixed === "End of half") return RESULT.END;
  if (fixed === "Safety") return RESULT.SAFETY;
  if (fixed === "Opp touchdown") return RESULT.DEF_SCORE;
  if (fixed === "Turnover") return /INTERCEPTION/.test(endT) ? RESULT.INT : RESULT.FUMBLE;
  return RESULT.OTHER;
};
const HOW_OF = (t) => (t === "KICKOFF" ? HOW.KICKOFF : t === "PUNT" || t === "MUFFED_PUNT" ? HOW.PUNT : t === "INTERCEPTION" ? HOW.INT : t === "FUMBLE" ? HOW.FUMBLE : /DOWNS/.test(t) ? HOW.DOWNS : t === "MISSED_FG" ? HOW.MISSED_FG : HOW.OTHER);

async function build() {
  const pbp = await download(urls.pbp(season), `${cache}pbp_${season}.csv.gz`, { maxAgeMs: 6 * 3600e3 });
  const lastModified = statSync(pbp).mtime.toISOString();
  const rows = new Map(); // `${game}|${team}` -> row
  const gameInfo = new Map(nfl.games.filter((g) => g.type === "REG").map((g) => [g.id, g]));
  const slot = (gid, team, opp) => {
    const k = `${gid}|${team}`;
    let r = rows.get(k);
    if (!r) { const g = gameInfo.get(gid); r = { t: team, o: opp, g: gid, w: g.week, h: g.neutral ? 2 : g.home === team ? 1 : 0, c: emptyVec(), x: emptyVec(), d: [], k: [], fu: [0, 0], _drive: new Map() }; rows.set(k, r); }
    return r;
  };
  let nPlays = 0;
  await forEachRow(pbp, (ix, f) => {
    const gid = f[ix.game_id];
    if (!gameInfo.has(gid)) return;
    const team = f[ix.posteam], opp = f[ix.defteam];
    if (!team || !opp) return;
    const pt = f[ix.play_type];
    const r = slot(gid, team, opp);
    const dno = Number(f[ix.drive]);
    // Drive bookkeeping: the first row of each drive carries its summary; plays add yards and the closest approach to the goal line.
    let dv = r._drive.get(dno);
    // Only a snap by the team creates its drive: the extra point after a defensive touchdown carries the other team's drive summary.
    if (!dv && ["pass", "run", "punt", "field_goal", "qb_kneel", "qb_spike"].includes(pt)) {
      const startYl = ydsToGoal(f[ix.drive_start_yard_line], team);
      const gsr = num(f[ix.game_seconds_remaining]) ?? 0;
      dv = r._drive.set(dno, { no: dno, period: Math.min(5, Number(f[ix.drive_quarter_start] || f[ix.qtr]) || 1), startSec: Math.max(0, 3600 - gsr), startYl: startYl ?? 75, plays: Number(f[ix.drive_play_count]) || 0, secs: clockToSec(f[ix.drive_time_of_possession]), fixed: f[ix.fixed_drive_result], endT: f[ix.drive_end_transition], startT: f[ix.drive_start_transition], yards: 0, minYl: startYl ?? 75, garbage: 0 }).get(dno);
    }
    // Points after a touchdown belong to the drive that scored it.
    if (dv && pt === "extra_point" && f[ix.extra_point_result] === "good") dv.xp = (dv.xp ?? 0) + 1;
    if (dv && f[ix.two_point_attempt] === "1" && f[ix.two_point_conv_result] === "success") dv.xp = (dv.xp ?? 0) + 2;
    const isScrim = pt === "pass" || pt === "run";
    if (!isScrim || f[ix.qb_kneel] === "1" || f[ix.qb_spike] === "1" || f[ix.two_point_attempt] === "1") return;
    const down = num(f[ix.down]), ytg = num(f[ix.ydstogo]), yl = num(f[ix.yardline_100]);
    if (down == null || ytg == null || yl == null) return;
    const yards = num(f[ix.yards_gained]) ?? 0;
    const period = Number(f[ix.qtr]);
    const margin = num(f[ix.score_differential]) ?? 0;
    const garbage = isGarbage(period, Math.abs(margin));
    const kind = pt === "pass" ? "pass" : "rush";
    const td = f[kind === "pass" ? ix.pass_touchdown : ix.rush_touchdown] === "1";
    const p = { kind, down, ytg, yl, yards, td, sack: f[ix.sack] === "1", int: f[ix.interception] === "1", fumLost: f[ix.fumble_lost] === "1", margin, epa: num(f[ix.epa]) };
    addPlay(garbage ? r.x : r.c, p);
    nPlays++;
    if (f[ix.fumble] === "1") { r.fu[0]++; if (p.fumLost) r.fu[1]++; }
    if (dv) { dv.yards += yards; dv.minYl = Math.min(dv.minYl, yl, Math.max(0, yl - yards)); if (garbage) dv.garbage = 1; }
    const thr = kind === "pass" ? EXPLOSIVE.pass : EXPLOSIVE.rush;
    if (yards >= thr) r.k.push([period, f[ix.time], yards, kind === "pass" ? 1 : 0, (f[ix.desc] || "").replace(/\s+/g, " ").slice(0, 120), dno, garbage ? 1 : 0]);
  });

  const out = [];
  for (const r of rows.values()) {
    for (const dv of [...r._drive.values()].sort((a, b) => a.no - b.no)) {
      const res = RESULT_OF(dv.fixed, dv.endT ?? "");
      r.d.push([dv.period, dv.startSec, dv.startYl, dv.plays, dv.yards, dv.secs, res, res === RESULT.TD ? 6 + (dv.xp ?? 0) : res === RESULT.FG ? 3 : 0, HOW_OF(dv.startT ?? ""), dv.minYl, dv.garbage]);
    }
    delete r._drive;
    r.k.sort((a, b) => b[2] - a[2]);
    r.k = r.k.slice(0, 6);
    const g = gameInfo.get(r.g);
    r.pf = r.t === g.home ? g.hS : g.aS;
    r.pa = r.t === g.home ? g.aS : g.hS;
    out.push(r);
  }
  out.sort((a, b) => a.w - b.w || a.g.localeCompare(b.g) || a.t.localeCompare(b.t));

  const games = nfl.games.filter((g) => g.type === "REG" && g.aS != null).map((g) => ({
    id: g.id, espn: g.espn, w: g.week, date: g.date, home: g.home, away: g.away, hs: g.hS, as: g.aS, ot: g.ot, neutral: g.neutral,
    plays: out.filter((r) => r.g === g.id).length === 2,
  }));
  const withPlays = games.filter((g) => g.plays).length;
  const teams = Object.fromEntries(Object.entries(nfl.teams).map(([a, t]) => [a, { name: t.name, abbr: a, conf: t.conf, div: t.div, color: t.color }]));
  const body = {
    schema: SCHEMA, league: "nfl", season,
    source: { name: "nflverse play-by-play", url: "https://github.com/nflverse/nflverse-data", license: "CC-BY 4.0", fileModified: lastModified },
    latestWeek: games.reduce((m, g) => Math.max(m, g.w), 0),
    config: { explosive: EXPLOSIVE, garbageGap: GARBAGE_GAP, hasEpa: true, hasFumbles: true, fcsExcluded: false },
    coverage: { games: games.length, gamesWithPlays: withPlays, missing: games.filter((g) => !g.plays).map((g) => g.id), plays: nPlays },
    definitions: DEFINITIONS,
    teams, games, rows: out,
  };
  const hash = createHash("sha1").update(JSON.stringify(body)).digest("hex").slice(0, 12);
  return { ...body, contentHash: hash };
}

try {
  const next = await build();
  const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : null;
  const unchanged = prev && prev.contentHash === next.contentHash;
  if (unchanged) console.log(`perf-nfl: unchanged (${next.coverage.gamesWithPlays} games)`);
  else {
    // dataUpdatedAt moves only when the content did; "last checked" lives in perf-status.json.
    next.dataUpdatedAt = new Date().toISOString();
    const tmp = new URL(`src/data/${outName}.json.tmp`, root);
    writeFileSync(tmp, JSON.stringify(next));
    renameSync(tmp, OUT);
    console.log(`perf-nfl: wrote ${next.season} (${next.coverage.gamesWithPlays}/${next.coverage.games} games with plays, ${next.coverage.plays} plays)`);
  }
  const statusFile = new URL("src/data/perf-status.json", root);
  const status = existsSync(statusFile) ? JSON.parse(readFileSync(statusFile, "utf8")) : {};
  status[outName] = { checkedAt: new Date().toISOString(), ok: true, dataUpdatedAt: unchanged ? prev.dataUpdatedAt : next.dataUpdatedAt };
  writeFileSync(statusFile, JSON.stringify(status));
} catch (e) {
  console.warn(`perf-nfl: keeping the saved file (${e instanceof Error ? e.message : e})`);
  const statusFile = new URL("src/data/perf-status.json", root);
  const status = existsSync(statusFile) ? JSON.parse(readFileSync(statusFile, "utf8")) : {};
  status[outName] = { ...(status[outName] ?? {}), checkedAt: new Date().toISOString(), ok: false, error: String(e instanceof Error ? e.message : e).slice(0, 200) };
  writeFileSync(statusFile, JSON.stringify(status));
}
