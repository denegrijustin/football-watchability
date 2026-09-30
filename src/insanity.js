/**
 * Insanity meter: how wild a game is (or was), from its home win-probability
 * line. Works on the archived series for finished games and on ESPN's live feed
 * for games in progress, so both use one scale.
 *
 * Input is [home win %, period] per play, thinned to ~80 points (thinWp) so a
 * live series and an archived one are comparable.
 */
export const INSANITY_TIERS = [
  { id: "witching", label: "Witching hour", min: 78 },
  { id: "unhinged", label: "Unhinged", min: 58 },
  { id: "wild", label: "Wild", min: 38 },
  { id: "restless", label: "Restless", min: 20 },
  { id: "calm", label: "Calm", min: 0 },
];
export const insanityTier = (score) => INSANITY_TIERS.find((t) => score >= t.min) ?? INSANITY_TIERS[INSANITY_TIERS.length - 1];

/** ~80 points, like the archived series. Archived series (already <= 82) pass through untouched. */
export function thinWp(wp, target = 80) {
  if (wp.length <= target + 20) return wp;
  const step = Math.ceil(wp.length / target);
  const out = wp.filter((_, i) => i % step === 0);
  const last = wp[wp.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

const clamp01 = (n) => Math.max(0, Math.min(1, n));

/**
 * @param {[number, number | null][]} series
 * @param {{ final?: boolean, overtime?: boolean }} [opts] final: true for a finished game, which adds
 *   "comeback" (how far the winner fell) and counts overtime. Live games skip both, since the ending is unknown.
 */
export function insanity(series, { final = false, overtime = false } = {}) {
  const wp = thinWp(series);
  if (wp.length < 8) return null;
  const p = wp.map(([v]) => v);
  const n = p.length;

  // Swing: total up-and-down movement. A quiet game drifts ~60 points, a wild one 300+.
  let tv = 0;
  for (let i = 1; i < n; i++) tv += Math.abs(p[i] - p[i - 1]);
  const swing = clamp01((tv - 50) / 280);

  // Lead flips: crossings of 50%, with a 6-point dead band so noise near 50 isn't counted.
  let side = p[0] >= 50 ? 1 : -1;
  let flips = 0;
  for (let i = 1; i < n; i++) {
    if (side === 1 && p[i] < 44) (side = -1), flips++;
    else if (side === -1 && p[i] > 56) (side = 1), flips++;
  }
  const flipScore = clamp01(flips / 4);

  // Late drama: how close it stayed over the last quarter of the game.
  const tail = p.slice(Math.floor(n * 0.75));
  const late = clamp01(tail.reduce((a, v) => a + (1 - Math.abs(v - 50) / 50), 0) / tail.length);

  // Comeback: the eventual winner's lowest win probability.
  let comebackFrom = null;
  let comeback = 0;
  if (final) {
    const homeWon = p[n - 1] >= 50;
    comebackFrom = Math.round(Math.min(...p.map((v) => (homeWon ? v : 100 - v))));
    comeback = clamp01((50 - comebackFrom) / 45);
  }

  const overtimeScore = final && overtime ? 1 : 0;
  // Live games have no comeback term, so its weight moves to swing and lateness.
  const raw = final
    ? 0.28 * swing + 0.22 * flipScore + 0.22 * late + 0.2 * comeback + 0.08 * overtimeScore
    : 0.4 * swing + 0.3 * flipScore + 0.3 * late;
  const score = Math.round(100 * clamp01(raw));

  // Biggest swing and the witching hour: the busiest window of ~a tenth of the game.
  const win = Math.max(4, Math.round(n / 10));
  let best = { at: 0, tv: -1 };
  let biggest = 0;
  for (let i = 0; i + win < n; i++) {
    let w = 0;
    for (let j = i + 1; j <= i + win; j++) w += Math.abs(p[j] - p[j - 1]);
    if (w > best.tv) best = { at: i, tv: w };
    biggest = Math.max(biggest, Math.abs(p[i + win] - p[i]));
  }
  const from = best.at,
    to = best.at + win;
  const period = wp[Math.round((from + to) / 2)]?.[1] ?? null;

  // Trend (live): the last window against the game's average window.
  let trend = null;
  if (!final && n >= win * 3) {
    let recent = 0;
    for (let j = n - win; j < n; j++) recent += Math.abs(p[j] - p[j - 1]);
    const avg = tv / ((n - 1) / win);
    trend = recent > avg * 1.3 ? "heating" : recent < avg * 0.6 ? "cooling" : "steady";
  }

  return {
    score,
    tier: insanityTier(score),
    flips,
    biggestSwing: Math.round(biggest),
    comebackFrom,
    witching: { from, to, period },
    trend,
    parts: { swing, flips: flipScore, late, comeback, overtime: overtimeScore },
  };
}
