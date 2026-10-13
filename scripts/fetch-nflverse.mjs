// Refreshes src/data/nfl.json from nflverse (https://github.com/nflverse/nflverse-data, CC-BY 4.0): this season's schedule, results and closing lines,
// opponent-adjusted EPA team ratings for every week (from play-by-play, with last season's ratings as the prior), depth charts and snap counts.
// The model's constants come from src/data/nfl-calibration.json (see scripts/nflverse/calibrate-nfl.mjs). Any failure keeps the saved file and exits 0.
//   node scripts/fetch-nflverse.mjs
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { aggregatePbp, seasonRatings, toPoints } from "./nflverse/ratings.mjs";
import { loadGames } from "./nflverse/games.mjs";
import { forEachRow, readRows } from "./nflverse/csv.mjs";
import { download, urls } from "./nflverse/util.mjs";

const OUT = new URL("../src/data/nfl.json", import.meta.url);
const CAL = JSON.parse(readFileSync(new URL("../src/data/nfl-calibration.json", import.meta.url), "utf8"));
const cache = new URL("../.cache/nflverse/", import.meta.url).pathname;
const r3 = (x) => Math.round(x * 1000) / 1000;
const r1 = (x) => Math.round(x * 10) / 10;

async function build() {
  const gamesAll = await loadGames(await download(urls.games, `${cache}games.csv`));
  const today = Date.now();
  const seasons = [...new Set(gamesAll.map((g) => g.season))].sort((a, b) => b - a);
  const season = Number(process.env.NFL_SEASON) || seasons.find((s) => gamesAll.some((g) => g.season === s && Date.parse(g.gameday) <= today + 45 * 864e5));
  const games = gamesAll.filter((g) => g.season === season);
  const played = games.filter((g) => g.scored && g.game_type === "REG");
  const lastPlayed = played.reduce((m, g) => Math.max(m, g.week), 0);

  const agg = await aggregatePbp(await download(urls.pbp(season), `${cache}pbp_${season}.csv.gz`));
  const res = seasonRatings(games, agg, CAL.prior, CAL.hyper);
  const P = CAL.leaguePoints, scale = { P, k: CAL.scale.k, kSt: CAL.scale.kSt };
  const lastW = Math.min(lastPlayed + 1, res.maxWeek + 1);
  const rating = (w, t) => { const r = res.byWeek[Math.min(w, lastW)]?.[t]; return r ? toPoints(r, scale) : null; };

  // Teams: the 32 clubs in this season's schedule, with conference, division and colors.
  const teamRows = await readRows(await download(urls.teams, `${cache}teams.csv`), ["team_abbr", "team_name", "team_conf", "team_division", "team_color"]);
  const meta = new Map(teamRows.map((t) => [t.team_abbr, t]));
  const abbrs = [...new Set(games.flatMap((g) => [g.home_team, g.away_team]))].filter((t) => meta.has(t));
  const teams = {};
  for (const t of abbrs) {
    const m = meta.get(t);
    const r = {};
    for (let w = 1; w <= lastW; w++) { const p = rating(w, t); if (p) r[w] = [r1(p.sp), r1(p.off), r1(p.def), r1(p.st)].map((x) => x); }
    teams[t] = { name: m.team_name, conf: m.team_conf, div: m.team_division, color: m.team_color, r };
  }

  const gameRows = games.filter((g) => abbrs.includes(g.home_team) && abbrs.includes(g.away_team)).map((g) => {
    const w = g.week;
    const H = rating(w, g.home_team), A = rating(w, g.away_team);
    const neutral = g.location === "Neutral";
    let mm = null, mt = null;
    if (H && A) {
      mm = (neutral ? 0 : CAL.model.c0) + CAL.model.c1 * (H.sp - A.sp);
      mt = CAL.total.a0 + CAL.total.a1 * (H.off + A.def + A.off + H.def - 2 * P);
    }
    const n = (x) => (x === "" || x == null ? null : Number.isNaN(Number(x)) ? x : Number(x));
    return {
      id: g.game_id, espn: g.espn || null, week: w, type: g.game_type, date: g.gameday, time: g.gametime || null, away: g.away_team, home: g.home_team,
      aS: g.awayScore, hS: g.homeScore, ot: g.overtime === "1" ? 1 : 0, neutral: neutral ? 1 : 0,
      spread: g.spread, total: g.totalLine, aML: n(g.away_moneyline), hML: n(g.home_moneyline),
      mm: mm == null ? null : r1(mm), mt: mt == null ? null : r1(mt),
      aRest: n(g.away_rest), hRest: n(g.home_rest), roof: g.roof || null, surface: g.surface || null, temp: n(g.temp), wind: n(g.wind),
      aQB: g.away_qb_name || null, hQB: g.home_qb_name || null, aCoach: g.away_coach || null, hCoach: g.home_coach || null, ref: g.referee || null, stadium: g.stadium || null, div: g.div_game === "1" ? 1 : 0,
    };
  });

  // Depth charts: the newest snapshot in the file only (it holds a snapshot per day).
  let depth = {};
  try {
    let latest = "", rows = [];
    await forEachRow(await download(urls.depth(season), `${cache}depth_${season}.csv`), (ix, f) => {
      const dt = f[ix.dt];
      if (dt > latest) { latest = dt; rows = []; }
      if (dt === latest && ["QB", "RB", "WR", "TE"].includes(f[ix.pos_abb]) && f[ix.pos_rank] === "1") rows.push({ team: f[ix.team], pos: f[ix.pos_abb], slot: Number(f[ix.pos_slot]), name: f[ix.player_name] });
    });
    for (const r of rows) { if (!teams[r.team]) continue; ((depth[r.team] ??= {})[r.pos] ??= []).push([r.slot, r.name]); }
    for (const t of Object.values(depth)) for (const k of Object.keys(t)) t[k] = t[k].sort((a, b) => a[0] - b[0]).slice(0, k === "WR" ? 3 : 1).map((x) => x[1]);
  } catch (e) { console.warn(`nflverse: depth charts skipped (${e.message})`); depth = {}; }

  // Snap counts for played games: the five most-used players on each side of the ball.
  const snaps = {};
  try {
    const rows = await readRows(await download(urls.snaps(season), `${cache}snaps_${season}.csv`), ["game_id", "player", "position", "team", "offense_snaps", "offense_pct", "defense_snaps", "defense_pct"]);
    const by = {};
    for (const r of rows) ((by[r.game_id] ??= {})[r.team] ??= []).push(r);
    for (const [gid, tm] of Object.entries(by)) for (const [team, list] of Object.entries(tm)) {
      const top = (key, pct) => list.filter((p) => Number(p[key]) > 0).sort((a, b) => Number(b[key]) - Number(a[key])).slice(0, 5).map((p) => [p.player, p.position, Number(p[key]), Math.round(Number(p[pct]) * 100)]);
      ((snaps[gid] ??= {})[team] = { off: top("offense_snaps", "offense_pct"), def: top("defense_snaps", "defense_pct") });
    }
  } catch (e) { console.warn(`nflverse: snap counts skipped (${e.message})`); }

  return {
    version: 1, season, updatedAt: new Date().toISOString(), lastPlayedWeek: lastPlayed, ratingsThroughWeek: lastW,
    source: { name: "nflverse", url: "https://github.com/nflverse/nflverse-data", license: "CC-BY 4.0" },
    params: { model: CAL.model, total: CAL.total, rho: CAL.rho, market: CAL.market, scale: { ...CAL.scale, P }, trainedOn: CAL.trainedOn, hyper: CAL.hyper },
    backtest: { calibration: CAL.backtest },
    teams, games: gameRows, depth, snaps,
  };
}

try {
  const next = await build();
  const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : null;
  const same = prev && JSON.stringify({ ...prev, updatedAt: 0 }) === JSON.stringify({ ...next, updatedAt: 0 });
  if (same) console.log("nflverse: unchanged");
  else {
    writeFileSync(new URL("../src/data/nfl.json.tmp", import.meta.url), JSON.stringify(next));
    renameSync(new URL("../src/data/nfl.json.tmp", import.meta.url), OUT);
    console.log(`nflverse: wrote ${next.season} (${next.games.length} games, ratings through week ${next.ratingsThroughWeek}, ${next.games.filter((g) => g.aS != null).length} played)`);
  }
} catch (e) {
  console.warn(`nflverse: keeping the saved NFL data (${e instanceof Error ? e.message : e})`);
}
