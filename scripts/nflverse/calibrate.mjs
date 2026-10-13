// Fits and tests the NFL model on past seasons: pre-game ratings for every game, then margin and total models against actual results
// and the closing market line. Used by scripts/fetch-nflverse.mjs (to calibrate) and by tests.
import { seasonRatings, toPoints } from "./ratings.mjs";

export const K = 58; // pass+run plays per team-game: turns EPA per play into points per game
export const K_ST = 1;

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };

/** Least squares y = X b by the normal equations (X rows include a leading 1). */
export function ols(X, y) {
  const n = X[0].length;
  const A = Array.from({ length: n }, () => new Array(n).fill(0)), b = new Array(n).fill(0);
  for (let i = 0; i < X.length; i++) for (let r = 0; r < n; r++) { b[r] += X[i][r] * y[i]; for (let c = 0; c < n; c++) A[r][c] += X[i][r] * X[i][c]; }
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
    for (let r = i + 1; r < n; r++) { const f = A[r][i] / A[i][i]; for (let c = i; c < n; c++) A[r][c] -= f * A[i][c]; b[r] -= f * b[i]; }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c]; x[i] = s / A[i][i]; }
  return x;
}

export const leaguePoints = (games) => mean(games.filter((g) => g.scored && g.game_type === "REG").flatMap((g) => [g.homeScore, g.awayScore]));

/**
 * Pre-game points-scale ratings for every game of each season, walking forward (each season starts from the previous season's final
 * ratings, regressed). `seasons` is ascending; the first season only seeds the prior.
 */
export function walkForward(games, aggs, seasons, hyper) {
  const out = [];
  let prior = null, P = null;
  for (const s of seasons) {
    const sg = games.filter((g) => g.season === s);
    const res = seasonRatings(sg, aggs[s], prior, hyper);
    const Pcur = P ?? leaguePoints(sg);
    if (prior) {
      for (const g of sg) {
        if (g.game_type !== "REG" && g.game_type !== "WC" && g.game_type !== "DIV" && g.game_type !== "CON" && g.game_type !== "SB") continue;
        const rw = res.byWeek[Math.min(g.week, res.maxWeek + 1)] ?? res.byWeek[res.maxWeek + 1];
        const h = rw[g.home_team], a = rw[g.away_team];
        if (!h || !a) continue;
        const H = toPoints(h, { P: Pcur, k: K, kSt: K_ST }), A = toPoints(a, { P: Pcur, k: K, kSt: K_ST });
        out.push({ g, season: s, week: g.week, H, A, P: Pcur });
      }
    }
    prior = res.final;
    P = leaguePoints(sg);
  }
  return { rows: out, finalPrior: prior, finalP: P };
}

export const features = (r) => ({
  D: r.H.sp - r.A.sp,
  raw: r.H.off + r.A.def + r.A.off + r.H.def - 2 * r.P,
  spread: r.g.spread,
  line: r.g.totalLine,
  actM: r.g.homeScore - r.g.awayScore,
  actT: r.g.homeScore + r.g.awayScore,
  neutral: r.g.location === "Neutral",
});

export function fitModels(rows) {
  const f = rows.filter((r) => r.g.scored).map(features);
  const marginOnly = ols(f.map((x) => [1, x.D]), f.map((x) => x.actM));
  const withLine = f.filter((x) => x.spread != null && x.line != null);
  const blend = ols(withLine.map((x) => [1, x.D, x.spread]), withLine.map((x) => x.actM));
  const totalOnly = ols(f.map((x) => [1, x.raw]), f.map((x) => x.actT));
  const totalBlend = ols(withLine.map((x) => [1, x.raw, x.line]), withLine.map((x) => x.actT));
  const res = (X, y, b) => y.map((v, i) => v - X[i].reduce((s, xx, j) => s + xx * b[j], 0));
  const rM = res(f.map((x) => [1, x.D]), f.map((x) => x.actM), marginOnly);
  const rMb = res(withLine.map((x) => [1, x.D, x.spread]), withLine.map((x) => x.actM), blend);
  const rT = res(f.map((x) => [1, x.raw]), f.map((x) => x.actT), totalOnly);
  const rTb = res(withLine.map((x) => [1, x.raw, x.line]), withLine.map((x) => x.actT), totalBlend);
  const rho = (() => { const m = mean(rM), t = mean(rT); return mean(rM.map((x, i) => (x - m) * (rT[i] - t))) / (sd(rM) * sd(rT)); })();
  return {
    margin: { c0: marginOnly[0], c1: marginOnly[1], sigma: Math.sqrt(mean(rM.map((x) => x * x))) },
    marginBlend: { c0: blend[0], c1: blend[1], c2: blend[2], sigma: Math.sqrt(mean(rMb.map((x) => x * x))) },
    total: { a0: totalOnly[0], a1: totalOnly[1], sigma: sd(rT) },
    totalBlend: { a0: totalBlend[0], a1: totalBlend[1], a2: totalBlend[2], sigma: sd(rTb) },
    rho: Math.max(-0.5, Math.min(0.5, rho)),
    games: f.length, gamesWithLine: withLine.length,
  };
}

const phi = (z) => { const x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.3275911 * x); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y); };

/** Scores a set of rows with the given fitted models. */
export function evaluate(rows, m) {
  const f = rows.filter((r) => r.g.scored).map(features);
  const L = f.filter((x) => x.spread != null);
  const pred = (x) => ({ model: m.margin.c0 + m.margin.c1 * x.D, blend: x.spread == null ? null : m.marginBlend.c0 + m.marginBlend.c1 * x.D + m.marginBlend.c2 * x.spread });
  const mae = (a) => mean(a.map(Math.abs));
  const brier = (get, sigma, set) => mean(set.map((x) => { const p = phi(get(x) / sigma); const y = x.actM > 0 ? 1 : x.actM < 0 ? 0 : 0.5; return (p - y) ** 2; }));
  const acc = (get, set) => { const d = set.filter((x) => x.actM !== 0 && get(x) !== 0); return mean(d.map((x) => ((get(x) > 0) === (x.actM > 0) ? 1 : 0))); };
  return {
    games: f.length, withLine: L.length,
    margin: {
      model: mae(f.map((x) => x.actM - pred(x).model)),
      market: mae(L.map((x) => x.actM - x.spread)),
      blend: mae(L.map((x) => x.actM - pred(x).blend)),
      brierModel: brier((x) => pred(x).model, m.margin.sigma, f),
      brierMarket: brier((x) => x.spread, m.marginBlend.sigma + 0.3, L),
      brierBlend: brier((x) => pred(x).blend, m.marginBlend.sigma, L),
      accModel: acc((x) => pred(x).model, f), accMarket: acc((x) => x.spread, L), accBlend: acc((x) => pred(x).blend, L),
    },
    total: {
      model: mae(f.map((x) => x.actT - (m.total.a0 + m.total.a1 * x.raw))),
      market: mae(L.filter((x) => x.line != null).map((x) => x.actT - x.line)),
      blend: mae(L.filter((x) => x.line != null).map((x) => x.actT - (m.totalBlend.a0 + m.totalBlend.a1 * x.raw + m.totalBlend.a2 * x.line))),
    },
  };
}

/** Leave-one-season-out: each season is scored with models fitted on the others. */
export function looEvaluate(rows) {
  const seasons = [...new Set(rows.map((r) => r.season))];
  const parts = seasons.map((s) => ({ s, ev: evaluate(rows.filter((r) => r.season === s), fitModels(rows.filter((r) => r.season !== s))) }));
  const w = (get) => parts.reduce((a, p) => a + get(p.ev) * p.ev.games, 0) / parts.reduce((a, p) => a + p.ev.games, 0);
  return { parts, margin: { model: w((e) => e.margin.model), market: w((e) => e.margin.market), blend: w((e) => e.margin.blend), brierModel: w((e) => e.margin.brierModel), brierBlend: w((e) => e.margin.brierBlend), brierMarket: w((e) => e.margin.brierMarket) }, total: { model: w((e) => e.total.model), market: w((e) => e.total.market), blend: w((e) => e.total.blend) } };
}
