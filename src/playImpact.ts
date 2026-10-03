/**
 * Player impact for the Game Center's Top 3 / Bottom 3, and the plays behind it.
 *
 * `impact()` scores a player from the box score. `attributePlays()` walks the
 * game's play log and credits each play to the players it involved using the
 * same weights, so the listed plays add up to the number on the card. Anything
 * the log can't tie to a play (a tackle on special teams, a stat we can't read
 * out of the play text) is shown as one "other box-score credit" line, so the
 * list always reconciles to the displayed value.
 */

export type PlayerRow = {
  id: string;
  name: string;
  short: string;
  jersey: string;
  pos?: string | null;
  headshot: string | null;
  passing?: { cmp: number; att: number; yds: number; td: number; int: number; sacks: number; qbr: number | null };
  rushing?: { att: number; yds: number; td: number; long: number };
  receiving?: { rec: number; yds: number; td: number; tgt: number; long: number };
  fumbles?: { fum: number; lost: number };
  defensive?: { tkl: number; sacks: number; tfl: number; pd: number; hits: number; td: number };
  interceptions?: { int: number; yds: number; td: number };
  kicking?: { fgm: number; fga: number; xpm: number; xpa: number; long: number };
};

/** One play from the trimmed game's full log (functions/api/game.js, src/gameTrim.js). */
export type PlayLog = {
  id: string;
  team: string;
  period: number | null;
  clock: string;
  text: string;
  kind: string;
  yards: number;
  score: boolean;
  turnover: boolean;
};

/** Points per event. The single source for both the box-score score and the play-by-play. */
export const W = {
  passYd: 0.04,
  passTd: 4,
  passInt: -4.5,
  sacked: -0.7,
  incomplete: -0.15,
  rushYd: 0.1,
  rushTd: 6,
  slowRush: -2, // 8+ carries under 3.0 yards each
  rec: 0.5,
  recYd: 0.1,
  recTd: 6,
  targetMiss: -0.4,
  fumbleLost: -4,
  tackle: 0.5,
  sack: 3,
  tfl: 1,
  pd: 1,
  hit: 0.5,
  defTd: 6,
  int: 4.5,
  intTd: 6,
  fgMade: 2,
  fgMiss: -3,
  xpMiss: -1.5,
} as const;

/**
 * A simple box-score impact score for ranking players within a game: yards,
 * touchdowns and takeaways count up; interceptions, fumbles lost, sacks taken
 * and incompletions on targets count down.
 */
export function impact(p: PlayerRow) {
  let v = 0;
  const why: string[] = [];
  const bad: string[] = [];
  if (p.passing && p.passing.att) {
    const x = p.passing;
    v += x.yds * W.passYd + x.td * W.passTd + x.int * W.passInt + x.sacks * W.sacked + (x.att - x.cmp) * W.incomplete;
    why.push(`${x.cmp}/${x.att}, ${x.yds} yds${x.td ? `, ${x.td} TD` : ""}${x.int ? `, ${x.int} INT` : ""}`);
    if (x.int) bad.push(`${x.int} INT`);
    if (x.sacks >= 3) bad.push(`sacked ${x.sacks}×`);
  }
  if (p.rushing && p.rushing.att) {
    const x = p.rushing;
    v += x.yds * W.rushYd + x.td * W.rushTd + (slowRush(p) ? W.slowRush : 0);
    why.push(`${x.att} car, ${x.yds} yds${x.td ? `, ${x.td} TD` : ""}`);
    if (slowRush(p)) bad.push(`${(x.yds / x.att).toFixed(1)} yds/car`);
  }
  if (p.receiving && (p.receiving.tgt || p.receiving.rec)) {
    const x = p.receiving;
    const miss = Math.max(0, x.tgt - x.rec);
    v += x.yds * W.recYd + x.rec * W.rec + x.td * W.recTd + miss * W.targetMiss;
    why.push(`${x.rec}/${x.tgt || x.rec} rec, ${x.yds} yds${x.td ? `, ${x.td} TD` : ""}`);
    if (miss >= 4) bad.push(`${miss} targets not caught`);
  }
  if (p.fumbles?.lost) {
    v += p.fumbles.lost * W.fumbleLost;
    bad.push(`${p.fumbles.lost} fumble${p.fumbles.lost > 1 ? "s" : ""} lost`);
  }
  if (p.defensive) {
    const x = p.defensive;
    v += x.tkl * W.tackle + x.sacks * W.sack + x.tfl * W.tfl + x.pd * W.pd + x.hits * W.hit + x.td * W.defTd;
    if (x.tkl || x.sacks || x.pd)
      why.push([x.tkl && `${x.tkl} tkl`, x.sacks && `${x.sacks} sk`, x.tfl && `${x.tfl} TFL`, x.pd && `${x.pd} PD`].filter(Boolean).join(", "));
  }
  if (p.interceptions?.int) {
    v += p.interceptions.int * W.int + p.interceptions.td * W.intTd;
    why.push(`${p.interceptions.int} INT`);
  }
  if (p.kicking && (p.kicking.fga || p.kicking.xpa)) {
    const x = p.kicking;
    v += x.fgm * W.fgMade + (x.fga - x.fgm) * W.fgMiss + (x.xpa - x.xpm) * W.xpMiss;
    why.push(`FG ${x.fgm}/${x.fga}, XP ${x.xpm}/${x.xpa}`);
    if (x.fga - x.fgm) bad.push(`${x.fga - x.fgm} missed FG`);
  }
  // Involvement: enough touches that a bad day means something.
  const touches =
    (p.passing?.att ?? 0) + (p.rushing?.att ?? 0) + (p.receiving?.tgt ?? p.receiving?.rec ?? 0) + (p.kicking?.fga ?? 0) * 3;
  return { value: Math.round(v * 10) / 10, line: why.join(" · "), bad, touches };
}

const slowRush = (p: PlayerRow) => !!p.rushing && p.rushing.att >= 8 && p.rushing.yds / p.rushing.att < 3;

// ---------- the plays behind the number ----------

export type PlayArtKind =
  | "run"
  | "pass"
  | "incomplete"
  | "td"
  | "sack"
  | "safety"
  | "int"
  | "fumble"
  | "fg"
  | "fgMiss"
  | "xpMiss"
  | "tackle"
  | "tfl"
  | "pd"
  | "qbhit"
  | "adjust"
  | "other";

export type ImpactEvent = {
  /** Play id, or "adjust"/"other" for the lines that are not a single play. */
  id: string;
  art: PlayArtKind;
  period: number | null;
  clock: string;
  /** What this player did on the play ("Rushed", "Caught", "Sack", ...). */
  role: string;
  /** ESPN's description of the play, tidied. */
  text: string;
  /** Yards the play gained for this player's side, when it has them. */
  yards: number | null;
  points: number;
};

type Mention = { player: PlayerRow; teamId: string; at: number; end: number };
type Form = { re: RegExp; player: PlayerRow; teamId: string };

const SUFFIX = /^(jr|sr|ii|iii|iv|v)\.?$/i;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** How a roster player shows up in ESPN's play text: "J.Cook" (NFL) or the full name (college). */
function formsFor(p: PlayerRow, teamId: string): Form[] {
  const tokens = p.name.replace(/\./g, ". ").split(/\s+/).filter(Boolean);
  while (tokens.length > 2 && SUFFIX.test(tokens[tokens.length - 1])) tokens.pop();
  if (tokens.length < 2) return [];
  const first = tokens[0];
  // "C.J. Gardner-Johnson" is "C.Gardner-Johnson" in play text: drop middle initials like "J.".
  const last = tokens.slice(1).filter((t) => !/^[A-Za-z]\.$/.test(t)).join(" ").replace(/\.\s+/g, ". ");
  if (!last) return [];
  const lastRe = esc(last).replace(/\\?\s+/g, "\\s?");
  const tail = "(?:\\s(?:Jr|Sr|II|III|IV)\\b\\.?)?(?![A-Za-z'\\-])";
  const pre = "(?<![A-Za-z'\\-])";
  const out: Form[] = [
    { re: new RegExp(`${pre}${esc(first[0])}\\.\\s?${lastRe}${tail}`), player: p, teamId },
  ];
  if (first.length > 1) out.push({ re: new RegExp(`${pre}${esc(first)}\\s${lastRe}${tail}`), player: p, teamId });
  return out;
}

const formCache = new WeakMap<object, Form[]>();
function rosterForms(game: { players: Record<string, PlayerRow[]> }): Form[] {
  let f = formCache.get(game.players);
  if (!f) {
    f = Object.entries(game.players).flatMap(([teamId, ps]) => ps.flatMap((p) => formsFor(p, teamId)));
    formCache.set(game.players, f);
  }
  return f;
}

/** Players named in a play's text, in the order they appear. */
function mentionsIn(text: string, forms: Form[]): Mention[] {
  const out: Mention[] = [];
  for (const f of forms) {
    const m = f.re.exec(text);
    if (m) out.push({ player: f.player, teamId: f.teamId, at: m.index, end: m.index + m[0].length });
  }
  out.sort((a, b) => a.at - b.at);
  // Same text matched twice (initial + full name form of one player): keep the first.
  return out.filter((m, i) => !out.slice(0, i).some((o) => o.player.id === m.player.id && o.at === m.at));
}

/** Opening formation notes and anything after a penalty flag: not part of what the player did. */
const tidy = (text: string) =>
  text
    .replace(/^\s*(?:\([^)]*\)\s*)+/, "")
    .replace(/\s*PENALTY on .*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

const round2 = (n: number) => Math.round(n * 100) / 100;

type Credit = { playerId: string; art: PlayArtKind; role: string; points: number; yards?: number };

/** Everyone a single play credits, with the points each earns under `W`. */
function creditsFor(play: PlayLog, forms: Form[], abbrById: Record<string, string>): Credit[] {
  if (/^(Penalty|Timeout|Official Timeout|Kickoff|Punt|End |Two-minute|Coin)/i.test(play.kind)) return [];
  const text = tidy(play.text);
  if (!text) return [];
  const all = mentionsIn(text, forms);
  if (!all.length) return [];

  // Which names sit inside (...) or [...]?
  const spans = (open: string, close: string) => {
    const out: [number, number][] = [];
    let from = 0;
    for (;;) {
      const a = text.indexOf(open, from);
      if (a < 0) break;
      const b = text.indexOf(close, a);
      out.push([a, b < 0 ? text.length : b]);
      from = (b < 0 ? text.length : b) + 1;
    }
    return out;
  };
  const paren = spans("(", ")");
  const brack = spans("[", "]");
  const within = (m: Mention, s: [number, number][]) => s.some(([a, b]) => m.at > a && m.at < b);
  const main = all.filter((m) => !within(m, paren) && !within(m, brack));
  const inParen = all.filter((m) => within(m, paren));
  const inBrack = all.filter((m) => within(m, brack));

  const offense = String(play.team);
  const sideOf = (cands: Mention[], team: "offense" | "defense", pool = cands) => {
    const want = (m: Mention) => (team === "offense" ? String(m.teamId) === offense : String(m.teamId) !== offense);
    return pool.find(want) ?? null;
  };
  const credits: Credit[] = [];
  const add = (m: Mention | null, art: PlayArtKind, role: string, points: number, yards?: number) => {
    if (m && points) credits.push({ playerId: m.player.id, art, role, points, yards });
  };

  const td = /TOUCHDOWN/i.test(text) && !/INTERCEPT/i.test(text);
  const sack = /\bsacked\b/i.test(text);
  const safety = /\bSAFETY\b/.test(text);
  const pass = /\bpass\b/i.test(text) && !sack;
  const incomplete = /pass incomplete/i.test(text);
  const intercepted = /INTERCEPTED by/i.test(text);
  const fg = /field goal/i.test(text);
  const xp = /extra point/i.test(text);
  const yards = play.yards;

  // Kicks: field goals and missed extra points.
  if (fg) {
    const kicker = sideOf(main, "offense") ?? main[0] ?? null;
    if (/is GOOD/i.test(text)) add(kicker, "fg", `${yards ? `${yards}-yard ` : ""}field goal made`, W.fgMade, yards);
    else add(kicker, "fgMiss", /BLOCKED/i.test(text) ? "field goal blocked" : "field goal missed", W.fgMiss, yards);
    return credits;
  }
  if (xp && /NO GOOD|BLOCKED/i.test(text)) {
    const at = text.search(/extra point/i);
    const kicker = [...main].reverse().find((m) => m.at < at) ?? main[0] ?? null;
    add(kicker, "xpMiss", "extra point missed", W.xpMiss);
  }

  // Sacks (and the safety when it ended in the end zone).
  if (sack) {
    const qb = sideOf(main, "offense") ?? main[0] ?? null;
    add(qb, safety ? "safety" : "sack", safety ? "sacked for a safety" : "sacked", W.sacked, yards);
    const split = /sack split by/i.test(text);
    const sackers = inParen.filter((m) => String(m.teamId) !== offense);
    for (const s of sackers) add(s, safety ? "safety" : "sack", split ? "half a sack" : safety ? "sack for a safety" : "sack", split ? W.sack / 2 : W.sack, yards);
  } else if (intercepted) {
    const passer = sideOf(main, "offense") ?? main[0] ?? null;
    const iAt = text.search(/INTERCEPTED by/i);
    const picker = all.find((m) => m.at > iAt && String(m.teamId) !== offense) ?? null;
    add(passer, "int", "intercepted", W.passInt);
    add(passer, "incomplete", "incomplete (intercepted)", W.incomplete);
    const target = main.find((m) => m.at > text.search(/\bto\b/i) && m.at < iAt && String(m.teamId) === offense && m.player.id !== passer?.player.id) ?? null;
    add(target, "incomplete", "target, not caught", W.targetMiss);
    const pickSix = /TOUCHDOWN/i.test(text);
    add(picker, "int", pickSix ? "interception returned for a touchdown" : "interception", W.int + (pickSix ? W.intTd : 0));
  } else if (pass) {
    const passer = sideOf(main, "offense") ?? main[0] ?? null;
    const toAt = text.search(/\bto\b/i);
    const target = main.find((m) => m.at > toAt && m.player.id !== passer?.player.id && String(m.teamId) === offense) ?? null;
    if (incomplete) {
      add(passer, "incomplete", "incomplete pass", W.incomplete);
      add(target, "incomplete", "target, not caught", W.targetMiss);
      for (const d of inParen.filter((m) => String(m.teamId) !== offense)) add(d, "pd", "pass defended", W.pd);
      for (const d of inBrack.filter((m) => String(m.teamId) !== offense)) add(d, "qbhit", "hit the QB", W.hit);
    } else {
      add(passer, td ? "td" : "pass", td ? "touchdown pass" : "completion", yards * W.passYd + (td ? W.passTd : 0), yards);
      add(target, td ? "td" : "pass", td ? "touchdown catch" : "catch", W.rec + yards * W.recYd + (td ? W.recTd : 0), yards);
      for (const t of inParen.filter((m) => String(m.teamId) !== offense)) add(t, "tackle", "tackle", W.tackle, yards);
    }
  } else if (/^Rush/i.test(play.kind) || /\b(scrambles|kneels)\b/i.test(text) || /\bfor (-?\d+|no gain)\b/i.test(text)) {
    const runner = sideOf(main, "offense") ?? main[0] ?? null;
    add(runner, td ? "td" : "run", td ? "rushing touchdown" : /kneels/i.test(text) ? "kneel" : "rush", yards * W.rushYd + (td ? W.rushTd : 0), yards);
    const tacklers = inParen.filter((m) => String(m.teamId) !== offense);
    tacklers.forEach((t, i) => {
      add(t, "tackle", "tackle", W.tackle, yards);
      if (i === 0 && yards < 0) add(t, "tfl", "tackle for loss", W.tfl, yards);
    });
  }

  // A lost fumble: the ball carrier loses it when the other team recovers.
  const fum = /FUMBLES/i.test(text) ? text.match(/RECOVERED by ([A-Z]{2,4})-/i) : null;
  if (fum && abbrById[offense] && fum[1].toUpperCase() !== abbrById[offense].toUpperCase()) {
    const before = text.search(/FUMBLES/i);
    const carrier = [...main.filter((m) => String(m.teamId) === offense && m.at < before)][0] ?? null;
    add(carrier, "fumble", "fumble lost", W.fumbleLost);
  }
  return credits;
}

/**
 * The plays behind a player's impact value. `events` are the plays that moved
 * it, in game order; `other` is whatever the play log doesn't account for, so
 * `sum(events) + other === value`.
 */
export function attributePlays(
  player: PlayerRow,
  game: { teams: { id: string; abbr: string }[]; players: Record<string, PlayerRow[]>; log?: PlayLog[] },
  value: number,
): { events: ImpactEvent[]; other: number } | null {
  if (!game.log?.length) return null;
  const forms = rosterForms(game);
  const abbrById = Object.fromEntries(game.teams.map((t) => [String(t.id), t.abbr]));
  const events: ImpactEvent[] = [];
  for (const play of game.log) {
    for (const c of creditsFor(play, forms, abbrById)) {
      if (c.playerId !== player.id) continue;
      events.push({
        id: play.id,
        art: c.art,
        period: play.period,
        clock: play.clock,
        role: c.role,
        text: tidy(play.text),
        yards: c.yards ?? null,
        points: round2(c.points),
      });
    }
  }
  if (slowRush(player)) {
    events.push({
      id: "adjust",
      art: "adjust",
      period: null,
      clock: "",
      role: "Efficiency",
      text: `Under 3.0 yards a carry on ${player.rushing!.att} carries (${(player.rushing!.yds / player.rushing!.att).toFixed(1)}).`,
      yards: null,
      points: W.slowRush,
    });
  }
  const sum = events.reduce((a, e) => a + e.points, 0);
  return { events, other: Math.round((value - sum) * 100) / 100 };
}

/** How each kind of play reads in a count: "22 completions", "1 sack". */
export const ART_COUNT: Record<PlayArtKind, [string, string]> = {
  run: ["rush", "rushes"],
  pass: ["completion", "completions"],
  incomplete: ["incompletion", "incompletions"],
  td: ["touchdown", "touchdowns"],
  sack: ["sack", "sacks"],
  safety: ["safety", "safeties"],
  int: ["interception", "interceptions"],
  fumble: ["fumble lost", "fumbles lost"],
  fg: ["field goal", "field goals"],
  fgMiss: ["missed kick", "missed kicks"],
  xpMiss: ["missed extra point", "missed extra points"],
  tackle: ["tackle", "tackles"],
  tfl: ["tackle for loss", "tackles for loss"],
  pd: ["pass breakup", "pass breakups"],
  qbhit: ["QB hit", "QB hits"],
  adjust: ["efficiency adjustment", "efficiency adjustments"],
  other: ["other play", "other plays"],
};

/**
 * A short version of a player's plays: the few plays that moved the number most
 * (biggest swing either way), and everything else rolled up by kind of play.
 * `top` + `rest` are exactly `events`, so with the other-credit line they still
 * add up to the player's value.
 */
export function summarizeEvents(events: ImpactEvent[], topN = 3) {
  const ranked = events
    .map((e, i) => ({ e, i }))
    // An efficiency adjustment is not a play; it stays in the roll-up.
    .filter(({ e }) => e.points !== 0 && e.art !== "adjust")
    .sort((a, b) => Math.abs(b.e.points) - Math.abs(a.e.points) || a.i - b.i);
  const top = ranked.slice(0, topN).map((x) => x.e);
  const chosen = new Set(top);
  const groups = new Map<PlayArtKind, { art: PlayArtKind; count: number; points: number }>();
  for (const e of events) {
    if (chosen.has(e)) continue;
    const g = groups.get(e.art) ?? { art: e.art, count: 0, points: 0 };
    g.count++;
    g.points = Math.round((g.points + e.points) * 100) / 100;
    groups.set(e.art, g);
  }
  const rest = [...groups.values()].sort((a, b) => Math.abs(b.points) - Math.abs(a.points) || b.count - a.count);
  const topPoints = Math.round(top.reduce((a, e) => a + e.points, 0) * 100) / 100;
  const restPoints = Math.round(rest.reduce((a, g) => a + g.points, 0) * 100) / 100;
  return { top, rest, topPoints, restPoints, restCount: rest.reduce((a, g) => a + g.count, 0) };
}
