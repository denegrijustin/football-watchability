// Player value and contract estimates for the trade finder. Pure, so the builder, the tests and the browser engine share the numbers.
//
// Not available for free: current-season contracts and ratings from Madden/PFF/OverTheCap (their terms forbid copying). What this uses instead is
// open data (nflverse, CC-BY 4.0): this and last season's production by position, snap share, draft position, age, and nflverse's historical contracts
// (which stop at 2022 signings). Everything that is estimated says so (`src`), and src/data/contract-overrides.json lets a licensed source replace it.

export const CAP_2026 = 301_200_000; // the league cap assumed for 2026; an input, not a measurement

/** Position groups the trade market works in. */
export const GROUPS = ["QB", "RB", "WR", "TE", "OT", "OG", "C", "EDGE", "DT", "LB", "CB", "S"];
/** Starters a team plays at each group (what "a starter" means for need and for what a team can spare). */
export const STARTERS = { QB: 1, RB: 1, WR: 3, TE: 1, OT: 2, OG: 2, C: 1, EDGE: 2, DT: 2, LB: 2, CB: 3, S: 2 };
/** Players a team keeps at each group, starters and depth (the 53-man roster's shape). */
export const DEPTH = { QB: 2, RB: 4, WR: 6, TE: 3, OT: 4, OG: 4, C: 2, EDGE: 5, DT: 4, LB: 4, CB: 5, S: 4 };

const MAP = { QB: "QB", RB: "RB", FB: "RB", WR: "WR", TE: "TE", T: "OT", G: "OG", C: "C", DE: "EDGE", OLB: "EDGE", DT: "DT", NT: "DT", ILB: "LB", MLB: "LB", LB: "LB", CB: "CB", FS: "S", SS: "S", S: "S", DB: "S" };
/** The trade-market group for a depth-chart position, or null for the specialists (kicker, punter, long snapper), who are not traded. */
export const groupOf = (pos) => MAP[pos] ?? null;

// What the open market pays, as a share of the cap, for a player rated 90 / 75 / 60 in each group (a hand-set curve, checked against the contracts nflverse has).
const MARKET = {
  QB: [0.17, 0.06, 0.012], EDGE: [0.1, 0.045, 0.012], OT: [0.085, 0.04, 0.011], WR: [0.08, 0.04, 0.012], CB: [0.07, 0.035, 0.011], DT: [0.075, 0.038, 0.011],
  S: [0.045, 0.022, 0.009], LB: [0.045, 0.025, 0.01], OG: [0.05, 0.03, 0.01], C: [0.045, 0.027, 0.01], TE: [0.045, 0.022, 0.009], RB: [0.035, 0.018, 0.009],
};
const lerp = (a, b, t) => a + (b - a) * t;
/** The cap share a free-market contract would be, by group and rating (log-linear between the 60, 75 and 90 marks; floor at the league minimum). */
export function marketShare(group, rating) {
  const m = MARKET[group] ?? MARKET.LB;
  const [hi, mid, lo] = m;
  const r = Math.max(40, Math.min(99, rating));
  let share;
  if (r >= 75) share = Math.exp(lerp(Math.log(mid), Math.log(hi), (r - 75) / 15));
  else share = Math.exp(lerp(Math.log(lo), Math.log(mid), (r - 60) / 15));
  return Math.max(0.003, share);
}
export const marketApy = (group, rating, cap = CAP_2026) => marketShare(group, rating) * cap;

/** The rookie-scale contract's yearly value by overall draft pick (an approximation of the public scale), in dollars. */
export function rookieApy(overall, cap = CAP_2026) {
  if (!overall || overall <= 0) return 0.82e6 * (cap / CAP_2026); // undrafted: near the minimum
  const pick = Math.min(260, overall);
  const share = pick <= 32 ? lerp(0.0385, 0.0155, (pick - 1) / 31) : pick <= 64 ? lerp(0.0155, 0.0078, (pick - 33) / 31) : pick <= 100 ? lerp(0.0078, 0.0046, (pick - 65) / 35) : pick <= 135 ? lerp(0.0046, 0.0038, (pick - 101) / 34) : lerp(0.0038, 0.0033, (pick - 136) / 124);
  return share * cap;
}

const CHART = [[1, 3000], [5, 1700], [10, 1300], [16, 1000], [20, 850], [32, 590], [33, 580], [48, 380], [64, 270], [96, 110], [128, 45], [160, 22], [192, 10], [224, 4], [260, 2]];
/** The standard draft-pick trade chart (Jimmy Johnson's), as points for an overall pick, interpolated between its well-known values. */
export function pickPoints(overall) {
  const p = Math.max(1, Math.min(260, overall));
  for (let i = 1; i < CHART.length; i++) {
    const [p1, v1] = CHART[i - 1], [p2, v2] = CHART[i];
    if (p <= p2) return Math.round(Math.exp(lerp(Math.log(v1), Math.log(v2), (p - p1) / (p2 - p1))));
  }
  return 2;
}

/** Age's effect on what a player is worth to another team: 1 through the prime, falling after it, by group (running backs fade first; quarterbacks last). */
export function ageFactor(group, age) {
  const peakEnd = { QB: 35, OT: 32, OG: 32, C: 33, TE: 30, WR: 30, EDGE: 30, DT: 30, LB: 29, CB: 29, S: 30, RB: 27 }[group] ?? 30;
  if (age <= peakEnd) return age < 23 ? 0.9 : 1;
  return Math.max(0.12, 1 - 0.17 * (age - peakEnd));
}

/**
 * A rating from a z-score within the position group (0 = average of the players with real playing time). Stars sit in the high 80s and 90s,
 * a typical starter near 70, depth in the 50s and low 60s.
 */
export const ratingFromZ = (z) => Math.round(Math.max(40, Math.min(99, 69 + 11 * Math.max(-2.4, Math.min(2.6, z)))));

/** A rating for a player with too little playing time to measure: a depth-level number lifted a little by where he was drafted. */
export function priorRating(draftOverall) {
  if (!draftOverall) return 52;
  if (draftOverall <= 32) return 64;
  if (draftOverall <= 64) return 61;
  if (draftOverall <= 105) return 58;
  if (draftOverall <= 180) return 55;
  return 53;
}

/** Contract years left (counting this season) for a deal signed in `signed` for `years` seasons, or 0 when it has run out. */
export const yearsLeft = (signed, years, season = 2026) => Math.max(0, signed + years - season);
