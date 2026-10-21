// Shared definitions for the team-performance tabs (CFB SP+ and NFL+). Pure functions with no Node or browser APIs, so the data
// builders (scripts/perf/build-*.mjs) and the app (src/perf) count plays exactly the same way, for both leagues.
//
// A "play" here is a scrimmage run or pass, one row of the normalized play record below. Everything else (kickoffs, punts, field
// goals, extra points, kneel-downs, spikes, two-point tries, timeouts, and plays wiped out by a penalty) is not a play for any rate.
//
// Material choices, all stated in the app next to the numbers (see DEFINITIONS):
//  - A sack is a pass play (a dropback) with the yards it lost. A scramble is a rush.
//  - Success: a play gains 40% of the yards to go on 1st down, 60% on 2nd, and all of them on 3rd and 4th (a touchdown always succeeds).
//  - Explosive: a pass of 20+ yards, a run of 10+ yards (the same for both leagues and both teams in a comparison).
//  - Garbage time: the score gap before the snap is more than 38 (1st quarter), 28 (2nd), 22 (3rd) or 16 (4th). Overtime never is.
//  - EPA is nflverse's own number, so it exists for the NFL only. College uses success rate and yards instead; it is never zero-filled.

export const SCHEMA = 1;

export const EXPLOSIVE = { pass: 20, rush: 10 };
/** Score gap that makes a play "garbage time", by quarter 1..4. */
export const GARBAGE_GAP = [38, 28, 22, 16];
/** Yards-to-go buckets for the down-and-distance grid. */
export const DIST_BUCKETS = [
  { label: "1–3", min: 1, max: 3 },
  { label: "4–6", min: 4, max: 6 },
  { label: "7–9", min: 7, max: 9 },
  { label: "10+", min: 10, max: 999 },
];
export const RED_ZONE = 20; // yards from the opponent's goal line, inclusive
export const OPPORTUNITY = 40; // a "scoring opportunity": the drive reached the opponent's 40 or closer

export const distBucket = (ytg) => DIST_BUCKETS.findIndex((b) => ytg >= b.min && ytg <= b.max);

/** Whether a play at this moment is garbage time. `gap` is the absolute score difference before the snap; `period` 1..4 (5+ = overtime). */
export const isGarbage = (period, gap) => period >= 1 && period <= 4 && gap > GARBAGE_GAP[period - 1];

/** Success on a scrimmage play (see the header). `td` plays always succeed. */
export function isSuccess(down, ytg, yards, td) {
  if (td) return true;
  const need = down === 1 ? 0.4 * ytg : down === 2 ? 0.6 * ytg : ytg;
  return yards >= need;
}

// ---------------------------------------------------------------------------------------------------------------------
// The count vector. One per team-game and partition ("clean" = not garbage time, "garbage" = garbage time), offense only: a
// team's defense is its opponents' offense in the same games. All counts are integers (EPA is stored in thousandths).
// ---------------------------------------------------------------------------------------------------------------------
export const V = {
  PN: 0, PYDS: 1, PSUC: 2, PEXP: 3, PSACK: 4, PINT: 5, PEPA: 6, PEPAN: 7,
  RN: 8, RYDS: 9, RSUC: 10, REXP: 11, RFUM: 12, REPA: 13, REPAN: 14,
  /** 4 downs x 4 distance buckets x [plays, successes], from here. */
  DD: 15,
  /** [plays, successes] for early downs (1st/2nd), late downs (3rd/4th), red zone, leading, tied, trailing. */
  EARLY: 47, LATE: 49, RZ: 51, LEAD: 53, TIED: 55, TRAIL: 57,
  LEN: 59,
};
export const ddIndex = (down, bucket) => V.DD + (down - 1) * 8 + bucket * 2;
export const emptyVec = () => new Array(V.LEN).fill(0);

/**
 * Add one scrimmage play to a vector.
 * p: { kind: "pass"|"rush", down 1..4, ytg, yl (yards to the opponent's goal line), yards, td, sack, int, fumLost, margin (offense's lead
 *      before the snap, negative when behind), epa (number, or null/undefined when the source has none) }
 */
export function addPlay(v, p) {
  const suc = isSuccess(p.down, p.ytg, p.yards, p.td) ? 1 : 0;
  const pass = p.kind === "pass";
  const exp = (pass ? p.yards >= EXPLOSIVE.pass : p.yards >= EXPLOSIVE.rush) ? 1 : 0;
  if (pass) {
    v[V.PN]++; v[V.PYDS] += p.yards; v[V.PSUC] += suc; v[V.PEXP] += exp;
    if (p.sack) v[V.PSACK]++;
    if (p.int) v[V.PINT]++;
    if (p.epa != null) { v[V.PEPA] += Math.round(p.epa * 1000); v[V.PEPAN]++; }
  } else {
    v[V.RN]++; v[V.RYDS] += p.yards; v[V.RSUC] += suc; v[V.REXP] += exp;
    if (p.fumLost) v[V.RFUM]++;
    if (p.epa != null) { v[V.REPA] += Math.round(p.epa * 1000); v[V.REPAN]++; }
  }
  if (p.down >= 1 && p.down <= 4) {
    const b = distBucket(p.ytg);
    if (b >= 0) { const i = ddIndex(p.down, b); v[i]++; v[i + 1] += suc; }
  }
  const bump = (i) => { v[i]++; v[i + 1] += suc; };
  bump(p.down <= 2 ? V.EARLY : V.LATE);
  if (p.yl <= RED_ZONE) bump(V.RZ);
  bump(p.margin > 0 ? V.LEAD : p.margin < 0 ? V.TRAIL : V.TIED);
}

export const sumVec = (a, b) => { for (let i = 0; i < V.LEN; i++) a[i] += b[i] ?? 0; return a; };

// ---------------------------------------------------------------------------------------------------------------------
// Drive records: [period, startElapsedSec, startYl, plays, yards, secs, result, offPts, startHow, minYl, garbage]
// ---------------------------------------------------------------------------------------------------------------------
export const DRIVE = { PERIOD: 0, START_SEC: 1, START_YL: 2, PLAYS: 3, YARDS: 4, SECS: 5, RESULT: 6, PTS: 7, HOW: 8, MIN_YL: 9, GARBAGE: 10 };
/** How a drive ended. TD is an offensive touchdown; DEF_SCORE is a score by the other side (pick-six, fumble return) or a safety. */
export const RESULT = { TD: 0, FG: 1, PUNT: 2, INT: 3, FUMBLE: 4, DOWNS: 5, MISSED_FG: 6, END: 7, SAFETY: 8, DEF_SCORE: 9, OTHER: 10 };
export const RESULT_LABEL = ["Touchdown", "Field goal", "Punt", "Interception", "Fumble lost", "Turned over on downs", "Missed field goal", "End of half or game", "Safety", "Defensive or special-teams score against", "Other"];
/** How a drive began. TAKEAWAY_* are turnovers by the other team; DOWNS is a turnover on downs. */
export const HOW = { KICKOFF: 0, PUNT: 1, INT: 2, FUMBLE: 3, DOWNS: 4, MISSED_FG: 5, HALF: 6, OTHER: 7 };
export const HOW_LABEL = ["Kickoff", "Punt", "Interception", "Fumble recovery", "Turnover on downs", "Missed field goal", "Start of half", "Other"];
export const isTakeaway = (how) => how === HOW.INT || how === HOW.FUMBLE;
export const isGiveaway = (res) => res === RESULT.INT || res === RESULT.FUMBLE;

/** Field-position bands for a drive's start, as yards to the opponent's goal line (smaller = better field). */
export const FIELD_BANDS = [
  { label: "Own 1–20", min: 81, max: 99, note: "Backed up" },
  { label: "Own 21–40", min: 61, max: 80, note: "Typical" },
  { label: "Own 41–Opp 41", min: 41, max: 60, note: "Midfield" },
  { label: "Opp 40–21", min: 21, max: 40, note: "Short field" },
  { label: "Opp 20 or closer", min: 1, max: 20, note: "Very short field" },
];
export const fieldBand = (yl) => FIELD_BANDS.findIndex((b) => yl >= b.min && yl <= b.max);

// ---------------------------------------------------------------------------------------------------------------------
// Metric catalog: every figure the tabs show is computed here from summed vectors, so the tabs cannot disagree.
// ---------------------------------------------------------------------------------------------------------------------
const rate = (n, d) => (d > 0 ? n / d : null);
const sum = (v, ...idx) => idx.reduce((s, i) => s + v[i], 0);

/** Derived values from an offense vector (a team's offense, or the vector summed over the opponents it faced = its defense). */
export function derive(v) {
  const plays = v[V.PN] + v[V.RN];
  const succ = v[V.PSUC] + v[V.RSUC];
  const dd = (down) => { let n = 0, s = 0; for (let b = 0; b < 4; b++) { const i = ddIndex(down, b); n += v[i]; s += v[i + 1]; } return [n, s]; };
  const [n3, s3] = dd(3), [n4, s4] = dd(4);
  const epaN = v[V.PEPAN] + v[V.REPAN];
  return {
    plays, passPlays: v[V.PN], rushPlays: v[V.RN],
    successRate: rate(succ, plays),
    passSuccess: rate(v[V.PSUC], v[V.PN]), rushSuccess: rate(v[V.RSUC], v[V.RN]),
    yardsPerPlay: rate(v[V.PYDS] + v[V.RYDS], plays),
    yardsPerDropback: rate(v[V.PYDS], v[V.PN]), yardsPerRush: rate(v[V.RYDS], v[V.RN]),
    explosiveRate: rate(v[V.PEXP] + v[V.REXP], plays), passExplosive: rate(v[V.PEXP], v[V.PN]), rushExplosive: rate(v[V.REXP], v[V.RN]),
    sackRate: rate(v[V.PSACK], v[V.PN]), intRate: rate(v[V.PINT], v[V.PN]),
    passEpa: v[V.PEPAN] ? v[V.PEPA] / 1000 / v[V.PEPAN] : null,
    rushEpa: v[V.REPAN] ? v[V.REPA] / 1000 / v[V.REPAN] : null,
    epaPerPlay: epaN ? (v[V.PEPA] + v[V.REPA]) / 1000 / epaN : null,
    thirdDown: rate(s3, n3), thirdDownPlays: n3, fourthDown: rate(s4, n4), fourthDownPlays: n4,
    earlyDown: rate(v[V.EARLY + 1], v[V.EARLY]), lateDown: rate(v[V.LATE + 1], v[V.LATE]),
    redZone: rate(v[V.RZ + 1], v[V.RZ]), redZonePlays: v[V.RZ],
    leading: rate(v[V.LEAD + 1], v[V.LEAD]), tied: rate(v[V.TIED + 1], v[V.TIED]), trailing: rate(v[V.TRAIL + 1], v[V.TRAIL]),
  };
}

export const DEFINITIONS = {
  success: "A play is a success if it gains 40% of the yards to go on 1st down, 60% on 2nd down, and all of them on 3rd or 4th down. A touchdown always counts.",
  explosive: `An explosive play is a pass of ${EXPLOSIVE.pass}+ yards or a run of ${EXPLOSIVE.rush}+ yards.`,
  garbage: "Garbage time is when a game is so lopsided that the result is settled and teams play differently: a lead of more than 38 points in the 1st quarter, 28 in the 2nd, 22 in the 3rd or 16 in the 4th. Overtime is never garbage time.",
  efficiency: "Efficiency (EPA per play) measures how much each play changes a team's expected scoring on the drive. Above zero helps the offense; the NFL data includes it and college data does not, so college shows success rate instead.",
  pass: "Pass plays are dropbacks: completions, incompletions, interceptions and sacks (a sack counts as a pass play for the yards it lost).",
  rush: "Rushes are designed runs and scrambles. Kneel-downs, spikes, two-point tries and plays nullified by penalty are not counted anywhere.",
  drive: "A drive is one possession. Offensive touchdowns are separate from touchdowns scored by the defense or special teams against that offense, which end the drive as a score for the other side.",
  redzone: `A red-zone trip is a drive that reached the opponent's ${RED_ZONE}-yard line or closer.`,
  opportunity: `A scoring opportunity is a drive that reached the opponent's ${OPPORTUNITY}-yard line or closer.`,
  afterTurnover: "Points after a takeaway are the offensive points scored on the drive that began with the interception or fumble recovery. They are not all caused by the turnover: a team given a short field might have scored anyway.",
};
