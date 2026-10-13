// NFL team ratings from nflverse play-by-play: opponent-adjusted EPA per play for offense and defense, plus special teams,
// carried from season to season with shrinkage, and turned into points so they read like SP+ (off, def, st, sp = off - def + st).
import { readRows } from "./csv.mjs";

const COLS = ["game_id", "week", "posteam", "defteam", "epa", "wp", "play_type", "qb_kneel", "qb_spike"];
const ST = new Set(["kickoff", "punt", "field_goal", "extra_point"]);

/** One season's play-by-play boiled down to what the ratings use: per game and team, pass+run plays, their EPA, and special-teams EPA. */
export async function aggregatePbp(path, { wpFilter = true } = {}) {
  const games = new Map(); // game_id -> { [team]: { opp, n, epa, stN, stEpa } }
  const slot = (g, t, opp) => {
    let m = games.get(g);
    if (!m) games.set(g, (m = {}));
    return (m[t] ??= { opp, n: 0, epa: 0, stN: 0, stEpa: 0 });
  };
  const rows = await readRows(path, COLS);
  for (const r of rows) {
    if (!r.posteam || !r.defteam || r.epa === "") continue;
    const epa = Number(r.epa);
    if (ST.has(r.play_type)) {
      const k = slot(r.game_id, r.posteam, r.defteam), o = slot(r.game_id, r.defteam, r.posteam);
      k.stEpa += epa; k.stN++;
      o.stEpa -= epa; o.stN++;
    } else if (r.play_type === "pass" || r.play_type === "run") {
      if (r.qb_kneel === "1" || r.qb_spike === "1") continue;
      if (wpFilter && r.wp !== "" && (Number(r.wp) < 0.05 || Number(r.wp) > 0.95)) continue;
      const k = slot(r.game_id, r.posteam, r.defteam);
      k.n++; k.epa += epa;
    }
  }
  return games;
}

/**
 * Ratings from the given team-games (each { team, opp, n, epa, stEpa }): alternating ridge solve of
 *   epa per play = mu + o[team] - d[opp]
 * with each team's o and d pulled toward a prior (last season's, regressed) worth `L` plays of evidence.
 * Special teams: shrunken mean of each team's special-teams EPA per game.
 */
export function solve(teamGames, prior, { L = 600, Lst = 12, iters = 40 } = {}) {
  const teams = new Set(teamGames.flatMap((g) => [g.team, g.opp]));
  for (const t of Object.keys(prior ?? {})) teams.add(t);
  const o = new Map(), d = new Map();
  for (const t of teams) { o.set(t, prior?.[t]?.o ?? 0); d.set(t, prior?.[t]?.d ?? 0); }
  let wsum = 0, ysum = 0;
  for (const g of teamGames) { wsum += g.n; ysum += g.epa; }
  const mu = wsum ? ysum / wsum : 0;
  for (let it = 0; it < iters; it++) {
    // Offense: epa = mu + o[team] - d[opp]  =>  o[team] = epa - mu + d[opp]
    const no = new Map(), nd = new Map();
    for (const t of teams) { no.set(t, [L * (prior?.[t]?.o ?? 0), L]); nd.set(t, [L * (prior?.[t]?.d ?? 0), L]); }
    for (const g of teamGames) {
      if (!g.n) continue;
      const y = g.epa / g.n;
      const a = no.get(g.team);
      a[0] += g.n * (y - mu + (d.get(g.opp) ?? 0)); a[1] += g.n;
      // Defense: d[opp] = mu + o[team] - epa
      const b = nd.get(g.opp);
      b[0] += g.n * (mu + (o.get(g.team) ?? 0) - y); b[1] += g.n;
    }
    for (const t of teams) { o.set(t, no.get(t)[0] / no.get(t)[1]); d.set(t, nd.get(t)[0] / nd.get(t)[1]); }
    // Keep the scale anchored: the league mean of o and of d is zero.
    const mo = [...o.values()].reduce((s, x) => s + x, 0) / o.size, md = [...d.values()].reduce((s, x) => s + x, 0) / d.size;
    for (const t of teams) { o.set(t, o.get(t) - mo); d.set(t, d.get(t) - md); }
  }
  const st = new Map();
  const acc = new Map();
  for (const g of teamGames) { const a = acc.get(g.team) ?? [0, 0]; a[0] += g.stEpa; a[1]++; acc.set(g.team, a); }
  const stMean = [...acc.values()].reduce((s, a) => s + a[0], 0) / Math.max(1, [...acc.values()].reduce((s, a) => s + a[1], 0));
  for (const t of teams) { const a = acc.get(t) ?? [0, 0]; st.set(t, ((a[0] - stMean * a[1]) + Lst * (prior?.[t]?.st ?? 0)) / (a[1] + Lst)); }
  return { mu, ratings: Object.fromEntries([...teams].map((t) => [t, { o: o.get(t), d: d.get(t), st: st.get(t) }])) };
}

/** Points-scale numbers for one team, like SP+: off and def are points per game against an average opponent (lower def is better). */
export function toPoints(r, { P, k, kSt }) {
  const off = P + k * r.o, def = P - k * r.d, st = kSt * r.st;
  return { sp: off - def + st, off, def, st };
}

/**
 * Pre-game ratings for every week of a season: week w uses regular-season games before week w and last season's final ratings as the prior.
 * `games` are the season's schedule rows (game_id, week, game_type, home_team, away_team, scored), `agg` from aggregatePbp.
 * Returns { byWeek: { [w]: { team: {o,d,st} } }, final }.
 */
export function seasonRatings(games, agg, priorFinal, hyper) {
  const { keep = 0.6 } = hyper;
  const prior = {};
  for (const [t, r] of Object.entries(priorFinal ?? {})) prior[t] = { o: keep * r.o, d: keep * r.d, st: keep * r.st };
  const reg = games.filter((g) => g.game_type === "REG");
  const weeks = [...new Set(reg.map((g) => Number(g.week)))].sort((a, b) => a - b);
  const maxWeek = Math.max(...weeks, 1);
  const byWeek = {};
  const tg = [];
  const pushWeek = (w) => {
    for (const g of reg) {
      if (Number(g.week) !== w) continue;
      const m = agg.get(g.game_id);
      if (!m) continue;
      for (const [team, v] of Object.entries(m)) if (v.n > 0 || v.stN > 0) tg.push({ team, opp: v.opp, n: v.n, epa: v.epa, stEpa: v.stEpa });
    }
  };
  for (let w = 1; w <= maxWeek + 1; w++) {
    byWeek[w] = solve(tg, prior, hyper).ratings;
    if (w <= maxWeek) pushWeek(w);
  }
  return { byWeek, final: byWeek[maxWeek + 1], maxWeek };
}
