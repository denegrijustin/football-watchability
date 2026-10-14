// Offline calibration of the NFL model (run by hand when you want to refresh it, e.g. at the start of a season):
//   node scripts/nflverse/calibrate-nfl.mjs [lastCompletedSeason=2025]
// Downloads four seasons of play-by-play plus the schedule, walks ratings forward week by week, fits the margin and total models,
// tests them leave-one-season-out against actual results and the closing line, and writes src/data/nfl-calibration.json.
import { writeFileSync } from "node:fs";
import { aggregatePbp } from "./ratings.mjs";
import { loadGames } from "./games.mjs";
import { download, urls } from "./util.mjs";
import { K, K_ST, evaluate, features, fitModels, leaguePoints, looEvaluate, walkForward } from "./calibrate.mjs";

const last = Number(process.argv[2] ?? 2025);
const seasons = [last - 3, last - 2, last - 1, last];
const cache = new URL("../../.cache/nflverse/", import.meta.url).pathname;
const HYPER = { keep: 0.5, L: 700, Lst: 12 };

const gamesFile = await download(urls.games, `${cache}games.csv`, { maxAgeMs: 6 * 3600e3 });
const games = await loadGames(gamesFile);
const aggs = {};
for (const y of seasons) aggs[y] = await aggregatePbp(await download(urls.pbp(y), `${cache}pbp_${y}.csv.gz`, { maxAgeMs: 30 * 864e5 }));

const { rows, finalPrior, finalP } = walkForward(games, aggs, seasons, HYPER);
const fit = fitModels(rows);
const loo = looEvaluate(rows);
const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(a.length, 1);

// Market-anchored error spread: how far results land from the closing line.
const L = rows.filter((r) => r.g.scored && r.g.spread != null && r.g.totalLine != null).map(features);
const mRes = L.map((x) => x.actM - x.spread), tRes = L.map((x) => x.actT - x.line);
const market = {
  sigmaMargin: Math.sqrt(mean(mRes.map((x) => x * x))), biasMargin: mean(mRes),
  sigmaTotal: Math.sqrt(mean(tRes.map((x) => x * x))), biasTotal: mean(tRes),
};

// Against the spread: the ratings' side against the closing spread, by gap between them (each season scored with the others' fit).
const buckets = [[0, 1.5], [1.5, 3], [3, 5], [5, 99]];
const picks = [];
for (const s of seasons.slice(1)) {
  const m = fitModels(rows.filter((r) => r.season !== s));
  for (const r of rows.filter((r) => r.season === s && r.g.scored && r.g.spread != null)) {
    const x = features(r);
    const mu = m.margin.c0 + m.margin.c1 * x.D;
    const edge = mu - x.spread; // positive: ratings like the home side more than the line does
    const cover = x.actM - x.spread; // positive: home covered
    if (edge === 0) continue;
    picks.push({ s, edge: Math.abs(edge), res: cover === 0 ? "push" : (edge > 0) === (cover > 0) ? "win" : "loss" });
  }
}
const rec = (a) => { const w = a.filter((p) => p.res === "win").length, l = a.filter((p) => p.res === "loss").length, p = a.length - w - l; return { w, l, p, pct: w / Math.max(w + l, 1) }; };
const ats = { all: rec(picks), bySeason: Object.fromEntries(seasons.slice(1).map((s) => [s, rec(picks.filter((p) => p.s === s))])), byGap: buckets.map(([lo, hi]) => ({ lo, hi, ...rec(picks.filter((p) => p.edge >= lo && p.edge < hi)) })) };

const out = {
  version: 1,
  generatedAt: new Date().toISOString(),
  trainedOn: seasons.slice(1),
  hyper: HYPER, scale: { k: K, kSt: K_ST },
  leaguePoints: finalP,
  // End-of-season ratings, carried (regressed) into the next season's week-1 ratings.
  prior: Object.fromEntries(Object.entries(finalPrior).map(([t, r]) => [t, { o: +r.o.toFixed(5), d: +r.d.toFixed(5), st: +r.st.toFixed(5) }])),
  model: fit.margin, total: fit.total, rho: fit.rho, market,
  backtest: { games: fit.games, leaveOneSeasonOut: { margin: loo.margin, total: loo.total, bySeason: loo.parts.map((p) => ({ season: p.s, ...p.ev })) }, ats },
};
writeFileSync(new URL("../../src/data/nfl-calibration.json", import.meta.url), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ model: out.model, total: out.total, rho: out.rho, market, loo: out.backtest.leaveOneSeasonOut.margin, tot: out.backtest.leaveOneSeasonOut.total, ats: ats.all, byGap: ats.byGap.map((b) => `${b.lo}-${b.hi}: ${b.w}-${b.l}-${b.p} ${(b.pct * 100).toFixed(1)}%`) }, null, 1));
