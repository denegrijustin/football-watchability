// Pure helpers for the injury report (scripts/build-injuries.mjs): what an injury is, how bad, when the player is likely back,
// and how much his absence matters. No network and no files, so the tests can import it.

/** Position groups: offense and defense positions are measured differently. */
export const GROUP = {
  QB: "QB", RB: "RB", HB: "RB", FB: "RB", WR: "WR", TE: "TE",
  T: "OL", OT: "OL", G: "OL", OG: "OL", C: "OL", OL: "OL",
  DE: "DL", DT: "DL", NT: "DL", DL: "DL", EDGE: "DL",
  LB: "LB", ILB: "LB", OLB: "LB", MLB: "LB",
  CB: "DB", S: "DB", SS: "DB", FS: "DB", SAF: "DB", DB: "DB",
  K: "ST", P: "ST", PK: "ST", LS: "ST",
};
export const groupOf = (pos) => GROUP[String(pos ?? "").toUpperCase()] ?? null;
export const isOffense = (g) => g === "QB" || g === "RB" || g === "WR" || g === "TE" || g === "OL";

/** Typical games missed for an injury, as [low, high] weeks. These are rules of thumb for a player who is out, not a diagnosis. */
const TYPE_WEEKS = [
  [/acl|achilles|torn|rupture/i, [30, 40]],
  [/lisfranc/i, [8, 12]],
  [/fracture|broken|break/i, [4, 8]],
  [/concussion|head/i, [1, 2]],
  [/hamstring/i, [2, 4]],
  [/groin/i, [2, 4]],
  [/quad/i, [2, 4]],
  [/calf/i, [1, 3]],
  [/ankle/i, [1, 4]],
  [/foot|toe|heel|plantar/i, [2, 6]],
  [/knee|mcl|pcl|meniscus/i, [2, 6]],
  [/shoulder|collarbone|clavicle|ac joint/i, [3, 8]],
  [/elbow|wrist|hand|finger|thumb/i, [2, 6]],
  [/hip|pelvis/i, [2, 5]],
  [/back|spine|disc/i, [1, 4]],
  [/neck/i, [1, 4]],
  [/rib|chest|oblique|abdom/i, [1, 3]],
  [/illness|flu|sick|virus/i, [0, 1]],
  [/thigh|glute|shin/i, [1, 3]],
  [/biceps|triceps|pectoral|pec/i, [4, 10]],
];
const FALLBACK = [1, 4];

const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
const num = (s) => (/^\d+$/.test(s) ? Number(s) : NUM[String(s).toLowerCase()] ?? null);

/**
 * A timeline in a team or ESPN note: "out for the season", "expected to miss 4-6 weeks", "multiple weeks", "day-to-day".
 * Returns { season, weeks: [lo, hi] | null, text } (text is what matched, for display) or null when the note says nothing about timing.
 */
export function parseTimeline(note) {
  const t = String(note ?? "");
  if (/(out|done|lost|miss(?:es|ing)?)\s+(for\s+)?the\s+(rest\s+of\s+the\s+)?(season|year)|season[-\s]ending|ruled out for the season|torn acl|torn achilles/i.test(t)) return { season: true, weeks: null, text: "out for the season" };
  let m = /(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s*(?:-|–|to)\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s*weeks?/i.exec(t);
  if (m) return { season: false, weeks: [num(m[1]), num(m[2])], text: `${m[1]}–${m[2]} weeks` };
  m = /(?:miss|out|sidelined)\s+(?:about\s+|roughly\s+|at least\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s*(?:more\s+)?weeks?/i.exec(t);
  if (m) return { season: false, weeks: [num(m[1]), num(m[1])], text: `${m[1]} weeks` };
  if (/multiple weeks|several weeks|extended (?:absence|time)/i.test(t)) return { season: false, weeks: [3, 6], text: "multiple weeks" };
  if (/week[-\s]to[-\s]week/i.test(t)) return { season: false, weeks: [1, 3], text: "week to week" };
  if (/day[-\s]to[-\s]day/i.test(t)) return { season: false, weeks: [0, 1], text: "day to day" };
  return null;
}

export const typeWeeks = (type, detail) => {
  const s = `${type ?? ""} ${detail ?? ""}`;
  for (const [re, w] of TYPE_WEEKS) if (re.test(s)) return w;
  return FALLBACK;
};

const DAY = 86_400_000;
const fmtDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const range = (lo, hi) => (lo === hi ? `${lo}` : `${lo}–${hi}`);
const wk = (n) => (n === 1 ? "1 week" : `${n} weeks`);

/**
 * When the player is likely back, and where that comes from.
 *   source "ESPN"     ESPN's own projected return date
 *   source "reported" a timeline in the team or ESPN note
 *   source "estimate" what is typical for that kind of injury (and for IR, the 4-game minimum)
 * `weeks` is the range of weeks still to miss (0 = could play this weekend).
 */
export function returnInfo({ status, returnDate, type, detail, note, now = Date.now(), weeksLeft = 12 }) {
  const ir = /injured reserve/i.test(status);
  const gameTime = /questionable|probable|game-time/i.test(status);
  if (returnDate) {
    const days = Math.round((Date.parse(`${returnDate}T12:00:00Z`) - now) / DAY);
    const lo = Math.max(0, Math.floor(days / 7)), hi = Math.max(lo, Math.ceil(days / 7));
    const back = days <= 1 ? "this weekend" : `${fmtDate(returnDate)}`;
    return { source: "ESPN", date: returnDate, weeks: [lo, hi], season: days / 7 > weeksLeft, label: days <= 1 ? "Could play this weekend" : `Back about ${back} (${days < 7 ? `${days} days` : wk(Math.round(days / 7))})` };
  }
  const t = parseTimeline(note);
  if (t?.season) return { source: "reported", date: null, weeks: [weeksLeft, weeksLeft], season: true, label: "Out for the season" };
  if (t?.weeks) {
    const [lo, hi] = t.weeks;
    return { source: "reported", date: null, weeks: [lo, hi], season: false, label: hi === 0 ? "Day to day" : `Out ${range(lo, hi)} weeks (reported)` };
  }
  if (gameTime) return { source: "estimate", date: null, weeks: [0, 1], season: false, label: "Day to day, game-time decision" };
  let [lo, hi] = typeWeeks(type, detail);
  if (ir) { lo = Math.max(lo, 4); hi = Math.max(hi, lo); }
  const season = lo >= weeksLeft;
  return { source: "estimate", date: null, weeks: [Math.min(lo, weeksLeft), Math.min(hi, weeksLeft)], season, label: season ? "Likely out for the season" : `${ir ? "At least 4 games; " : ""}typically ${range(lo, hi)} weeks` };
}

/** One word for how serious it is, from the longest the player could miss. A player on IR with a near return date (cleared to practice) is a game-time call, not long-term. */
export function severityOf({ status, ret }) {
  if (ret.season) return "Season-ending";
  const [lo, hi] = ret.weeks, mid = (lo + hi) / 2;
  if (mid >= 4) return "Long-term";
  if (lo === 0) return "Game-time";
  if (mid >= 2 || (hi >= 1 && /^(out|injured reserve)$/i.test(status))) return "Short-term";
  return "Game-time";
}
export const SEVERITY_RANK = { "Season-ending": 3, "Long-term": 2, "Short-term": 1, "Game-time": 0 };

/** Share of 1: the fraction of values at or below x (ties count half), so the best of a group is near 1. */
export function percentile(values, x) {
  const v = values.filter(Number.isFinite);
  if (!v.length) return null;
  let below = 0, same = 0;
  for (const y of v) { if (y < x) below++; else if (y === x) same++; }
  return (below + same / 2) / v.length;
}

/** How much a position's absence tends to matter: a quarterback is hard to replace, a kicker is not. A rule of thumb, shown on the page. */
export const POSITION_WEIGHT = { QB: 1.15, RB: 0.9, WR: 0.95, TE: 0.9, OL: 0.85, DL: 0.95, LB: 0.9, DB: 0.95, ST: 0.5 };

/**
 * 0 to 100: how much the team leaned on this player in the games he played. `usage` is his share of snaps (0 to 1) and `prod` is where his
 * per-game production ranks among players at his position (0 to 1; null when the position has no stats, as for linemen). Production counts
 * more than snaps because many players on the field are interchangeable.
 */
export function impactScore({ group, usage, prod }) {
  const w = POSITION_WEIGHT[group] ?? 0.9;
  const base = prod == null ? usage * 0.7 : 0.4 * usage + 0.6 * prod;
  return Math.round(Math.max(0, Math.min(1, base * w)) * 100);
}
export const impactTier = (score) => (score == null ? "Unknown" : score >= 70 ? "High" : score >= 45 ? "Medium" : score >= 20 ? "Low" : "Minimal");
export const IMPACT_RANK = { High: 3, Medium: 2, Low: 1, Minimal: 0, Unknown: -1 };

/** "Top 8% of WRs in EPA per game" style wording for a production percentile. */
export const topPct = (p) => Math.max(1, Math.round((1 - p) * 100));

export const median = (a) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };

/** Player name key that survives suffixes and punctuation: "Jon Gaines II" and "Jon Gaines" match. */
export const nameKey = (s) => String(s ?? "").toLowerCase().replace(/[.'’]/g, "").replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "").replace(/[^a-z]/g, "");
