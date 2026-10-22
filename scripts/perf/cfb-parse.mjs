// Turns one ESPN college-football `summary` payload into the per-team-game records of perf-cfb.json (count vectors, drive tuples, big
// plays). Pure: no network, no file access, so build-cfb.mjs and validate-cfb.mjs share the exact same logic.
//
// What ESPN gives us (checked against all 513 finished FBS games of 2026): summary.drives.previous[] = drives in game order, each with
// the plays of that possession. Two text formats coexist (the "#7 J.Doe rush left for 5 yards gain" tracker and the older "John Doe run
// for 5 yds to the ALA 32"), so plays are classified by ESPN's play TYPE first and by text only where the type is ambiguous.
//
// Decisions (all documented here because the app states them as definitions):
//  - A play is a scrimmage rush/pass. Whitelisted types: Rush, Rushing Touchdown, Pass Reception, Pass Incompletion, Passing Touchdown,
//    Sack, Interception, Pass Interception Return, Interception Return Touchdown, Fumble, Fumble Recovery (Own|Opponent), Safety and
//    the rare untyped play. Everything else (Kickoff*, Punt*, Field Goal*, Blocked *, Timeout, End *, Penalty, Two Point *, Defensive 2pt
//    Conversion) is not a play. Kneel-downs and spikes are typed "Rush"/"Pass*" so they are excluded by text. Plays whose text says
//    "NO PLAY" (penalty wiped the snap) are excluded. Two-point tries are excluded by text.
//  - Sacks are pass plays with negative yards; the sack-fumble types are classified from the text.
//  - Interceptions count 0 pass yards (ESPN's statYardage is the return). Plays with a turnover return (fumble types) take their yards
//    from the play text ("rush ... for 2 yards gain ... fumbled ... return for 57 yds") because statYardage includes the return.
//  - Plays without start.down 1-4, distance or yardsToEndzone (ESPN also uses 0 for "unknown") are skipped and counted (skipped.missing), never zero-filled. Plays whose
//    kind cannot be told ("Team Safety", a bare "Fumble Return Touchdown" with no snap description) are counted in skipped.unclassified.
//  - Pre-play margin comes from a running score updated only by scoring plays (ESPN's after-play scores on other plays are unreliable). Overtime (period 5+) is never garbage time.
//  - Drives: the drive belongs to the team in possession (drive.team). Result: ESPN's drive result. TD/FG/PUNT/INT/FUMBLE/DOWNS/MISSED FG/
//    END OF HALF|GAME|QUARTER/SF map straight across. "INT TD", "FUMBLE TD", "FUMBLE RETURN TD", "PUNT TD" and "MISSED FG TD" are scores
//    BY THE OTHER SIDE on this offense's drive -> RESULT.DEF_SCORE (the pick-six is the throwing team's drive, as in the NFL file); SF
//    (safety) -> RESULT.SAFETY. Offensive points (offPts) are the offense's own score change over the drive's plays, clamped to 6..8 on
//    a TD (6 + extra point or two-point try), 3 on a field goal, 0 otherwise.
//  - A "drive" with no scrimmage plays whose result is TD is a kickoff-return touchdown by the receiving team (ESPN puts it under
//    that team); it is not an offensive drive, so no tuple is written and its points are tallied as special-teams points (diag only).
//    Phantom drives (result KICKOFF or missing, zero plays) are dropped.
//  - startHow: KICKOFF when the drive's first play is a kickoff (every post-score and half start, including the second half); else from
//    the previous drive's result (punt, interception, fumble, downs, missed FG); else OTHER (overtime starts).
//  - startYl: yards to the opponent's goal at the first snap (ESPN's drive.start.yardLine is not consistently oriented, so the first
//    scrimmage play's yardsToEndzone is used; the drive start text is the fallback).
//  - Fumbles: see HAS_FUMBLES (off): fu stays [0,0] and the fumbles-lost vector slot stays 0; the validator still measures how unreliable the feed is.
import { EXPLOSIVE, GARBAGE_GAP, V, emptyVec, addPlay, isGarbage, RESULT, HOW } from "./lib.mjs";

/** Fumble support: ESPN's play feed flags fumbles inconsistently (isTurnover missing on sack-fumbles, the "(Own)/(Opponent)" label wrong, fumbles
 *  missing from the text), so per-game fumble totals agree with the box score only about 60% of the time and fumbles lost about 80-90%. Counted
 *  in `diag` for the validator but NOT written to the output (fu stays [0,0], RFUM stays 0). Drive results still carry ESPN's FUMBLE (lost). */
export const HAS_FUMBLES = false;
const SCRIMMAGE_TYPES = new Set([
  "Rush", "Rushing Touchdown", "Pass Reception", "Pass Incompletion", "Passing Touchdown", "Sack", "Interception",
  "Pass Interception Return", "Interception Return Touchdown", "Fumble", "Fumble Recovery (Own)", "Fumble Recovery (Opponent)", "Safety",
]);
// Types whose yardage field includes a return, so the play's own yards come from the text.
const TEXT_YARD_TYPES = new Set(["Fumble", "Fumble Recovery (Own)", "Fumble Recovery (Opponent)", "Safety"]);
const KICK_RE = /\b(punt|kickoff|field goal|FG)\b/i;
const TWO_PT_RE = /two[- ]point|2-?pt\b|\bPAT\b/i;

const RESULT_MAP = {
  TD: RESULT.TD, FG: RESULT.FG, PUNT: RESULT.PUNT, INT: RESULT.INT, FUMBLE: RESULT.FUMBLE, DOWNS: RESULT.DOWNS, "MISSED FG": RESULT.MISSED_FG,
  "END OF HALF": RESULT.END, "END OF GAME": RESULT.END, "END OF QUARTER": RESULT.END, SF: RESULT.SAFETY,
  "INT TD": RESULT.DEF_SCORE, "FUMBLE TD": RESULT.DEF_SCORE, "FUMBLE RETURN TD": RESULT.DEF_SCORE, "PUNT TD": RESULT.DEF_SCORE, "MISSED FG TD": RESULT.DEF_SCORE,
};
const HOW_BY_PREV = { [RESULT.PUNT]: HOW.PUNT, [RESULT.INT]: HOW.INT, [RESULT.FUMBLE]: HOW.FUMBLE, [RESULT.DOWNS]: HOW.DOWNS, [RESULT.MISSED_FG]: HOW.MISSED_FG };

const num = (x) => (x === "" || x == null || !Number.isFinite(Number(x)) ? null : Number(x));
export const clockSec = (t) => { const m = /^(\d+):(\d+)/.exec(t ?? ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const clean = (s) => (s ?? "").replace(/\s+/g, " ").trim();

/** Yards of the snap from the play text: first "for N yards/yds [loss]", "for (a) loss of N", or "for no gain". Null when absent. */
export function textYards(text) {
  const m = /for (?:a )?loss of (\d+)|for (\d+) y(?:ar)?ds?( loss)?|for no gain/i.exec(text ?? "");
  if (!m) return null;
  if (m[1]) return -Number(m[1]);
  if (m[2]) return m[3] ? -Number(m[2]) : Number(m[2]);
  return 0;
}

const sameAbbr = (a, b) => !!a && !!b && (a === b || a.startsWith(b) || b.startsWith(a));
/** Yards to the opponent's goal from ESPN's "at ABC 40" spot text; null when it cannot be told which side of the field ABC is. */
function spotFromText(start, offAbbr, defAbbr) {
  const t = start?.downDistanceText ?? start?.possessionText ?? "";
  if (/\bat 50$/.test(t) || /^50$/.test(start?.possessionText ?? "")) return 50;
  const m = /(?:at |^)([A-Za-z&.\-]+) (\d+)$/.exec(t) ?? /^([A-Za-z&.\-]+) (\d+)$/.exec(start?.possessionText ?? "");
  if (!m) return null;
  const a = m[1].toUpperCase(), n = Number(m[2]);
  const own = sameAbbr(a, offAbbr), theirs = sameAbbr(a, defAbbr);
  if (own && !theirs) return 100 - n;
  if (theirs && !own) return n;
  return null;
}

function kindOf(type, text) {
  if (type === "Rush" || type === "Rushing Touchdown") return "rush";
  if (type === "Pass Reception" || type === "Pass Incompletion" || type === "Passing Touchdown" || type === "Sack" || /Interception/.test(type ?? "")) return "pass";
  if (/sacked/i.test(text)) return "pass";
  if (/\bpass(ed)?\b|intercept/i.test(text)) return "pass";
  if (/\brush|\brun\b|scrambl|keeper|\bsneak/i.test(text)) return "rush";
  return null;
}

/**
 * sum: the ESPN summary. Returns null when the game has no drives. Otherwise
 *  { teams: {[id]: {c,x,d,k,fu}}, plays, skipped:{missing,unclassified,nullified}, nDrives, nPlays (counted scrimmage plays),
 *    diag: { [id]: {rush,pass,sack,kneel,spike,fumLost,fumLostSt,...}, pts: {[id]: {off,def,st,loose}}, homeId, awayId, finalHome, finalAway } }
 */
export function parseSummary(sum) {
  const comp = sum?.header?.competitions?.[0];
  const home = comp?.competitors?.find((c) => c.homeAway === "home"), away = comp?.competitors?.find((c) => c.homeAway === "away");
  const drives = sum?.drives?.previous;
  if (!home || !away || !Array.isArray(drives) || !drives.length) return null;
  const H = String(home.team.id), A = String(away.team.id);
  const other = (id) => (id === H ? A : H);
  const abbr = { [H]: String(home.team.abbreviation ?? "").toUpperCase(), [A]: String(away.team.abbreviation ?? "").toUpperCase() };
  const run = { [H]: 0, [A]: 0 };
  const teams = { [H]: { c: emptyVec(), x: emptyVec(), d: [], k: [], fu: [0, 0] }, [A]: { c: emptyVec(), x: emptyVec(), d: [], k: [], fu: [0, 0] } };
  const zero = () => ({ rush: 0, pass: 0, sack: 0, kneel: 0, spike: 0, twoPt: 0, fumbles: 0, fumLost: 0, fumLostSt: 0, fumblesSt: 0 });
  const diag = { [H]: zero(), [A]: zero(), pts: { [H]: { off: 0, def: 0, st: 0, loose: 0 }, [A]: { off: 0, def: 0, st: 0, loose: 0 } }, homeId: H, awayId: A, finalHome: num(home.score), finalAway: num(away.score), mismatchedOffense: 0, recoveredYl: 0, otherFumblePlays: 0 };
  const skipped = { missing: 0, unclassified: 0, nullified: 0, duplicate: 0 };
  const seenSeq = new Set();
  let nPlays = 0;
  let prevResult = null;

  drives.forEach((d, di) => {
    const dno = di + 1;
    const team = String(d.team?.id ?? "");
    const resultKey = d.result == null ? null : String(d.result).toUpperCase();
    const rawPlays = Array.isArray(d.plays) ? d.plays : [];
    if (team !== H && team !== A) { for (const p of rawPlays) bumpScore(p); prevResult = null; return; }
    const opp = other(team);
    const before = run[team], beforeOpp = run[opp];
    const t = teams[team];
    const dv = { period: null, startSec: null, startYl: null, ylFromKick: null, plays: 0, yards: 0, minYl: null, garbage: 0, scrim: 0, kickReturnTd: false, hasKickoff: false };
    const first = rawPlays[0];
    const firstType = first?.type?.text ?? "";
    dv.hasKickoff = /^Kickoff/.test(firstType);

    // ESPN's after-play scores on non-scoring plays are often stale or ahead of the play (a kickoff can show the next touchdown), so the
    // running score moves only on plays flagged scoringPlay, and never backwards.
    function bumpScore(p) {
      if (p.scoringPlay !== true) return;
      const a = num(p.awayScore), h = num(p.homeScore);
      if (a != null && a > run[A]) run[A] = a;
      if (h != null && h > run[H]) run[H] = h;
    }

    for (const p of rawPlays) {
      const type = p.type?.text ?? "";
      const text = clean(p.text);
      const margin = run[team] - run[opp];
      const period = num(p.period?.number) ?? 1;
      if (type === "Kickoff Return Touchdown") dv.kickReturnTd = true;
      if (dv.ylFromKick == null && /^Kickoff/.test(type) && num(p.end?.yardsToEndzone) != null && String(p.end?.team?.id) === team) dv.ylFromKick = num(p.end.yardsToEndzone);
      // A "Penalty" entry that describes a snap and is not marked "NO PLAY" is the play itself (penalty declined, or a foul after the whistle;
      // its yards come from the text since statYardage is the penalty; an incompletion with an enforced penalty, i.e. pass interference, is not a play).
      // Penalties that erase the snap say "NO PLAY" and are not plays.
      const scrimmage = SCRIMMAGE_TYPES.has(type) || (!type && /sacked|rush|pass/i.test(text)) || (type === "Penalty" && !/NO PLAY/i.test(text) && !(/incomplete/i.test(text) && /\d+ yards? from/i.test(text)) && /sacked|rush|\brun\b|pass/i.test(text));
      if (scrimmage) classify(p, type, text, margin, period);
      else if (/fumbl/i.test(text) && type !== "Penalty") diag.otherFumblePlays++;
      bumpScore(p);
    }

    function classify(p, type, text, margin, period) {
      if (KICK_RE.test(text) && !/^(Rush|Pass)/.test(type)) { // fumble on a punt/kick return that ESPN typed as a fumble recovery
        if (/fumbl/i.test(text)) { diag[team].fumblesSt++; if (p.isTurnover) diag[team].fumLostSt++; }
        return;
      }
      if (TWO_PT_RE.test(text)) { diag[team].twoPt++; return; }
      const spot = num(p.start?.yardsToEndzone);
      if (dv.anyYl == null && spot != null && spot >= 1) dv.anyYl = spot;
      if (/kneel|victory formation/i.test(text)) { diag[team].kneel++; return; }
      if (/\bspike|spiked\b|clock the ball/i.test(text)) { diag[team].spike++; return; }
      if (/NO PLAY/i.test(text)) { skipped.nullified++; return; }
      const kind = kindOf(type, text);
      if (!kind) { skipped.unclassified++; return; }
      const down = num(p.start?.down), ytg = num(p.start?.distance);
      let yl = num(p.start?.yardsToEndzone);
      // yardsToEndzone is sometimes 0 on a real snap; the spot is still in the text ("3rd & 6 at LOU 40"), so recover it from there.
      if (yl === 0 || yl == null) { const r = spotFromText(p.start, abbr[team], abbr[opp]); if (r != null) { yl = r; diag.recoveredYl++; } }
      if (down == null || ytg == null || yl == null || down < 1 || down > 4 || ytg < 1 || yl < 1 || yl > 100) { skipped.missing++; return; }
      // ESPN sometimes lists a snap twice (the copy has yardsToEndzone 0 and no offense, or differs only in a name): keep the first.
      // Some snaps appear twice (e.g. the same fumble with two different "forced by" names): same period, clock, down, distance and opening text.
      const key = `${period}|${p.clock?.displayValue}|${down}|${ytg}|${text.slice(0, 80)}`;
      if (seenSeq.has(key)) { skipped.duplicate++; return; }
      seenSeq.add(key);
      const startTeam = String(p.start?.team?.id ?? "");
      if (startTeam && startTeam !== team) diag.mismatchedOffense++;
      const isInt = /Interception/.test(type) || (!type && /intercept/i.test(text));
      const sack = type === "Sack" || /sacked/i.test(text);
      let yards = num(p.statYardage) ?? 0;
      if (isInt) yards = 0;
      else if (TEXT_YARD_TYPES.has(type) || !type || type === "Penalty") { const ty = textYards(text); if (ty != null) yards = ty; else if (p.isTurnover) { skipped.unclassified++; return; } else if (type === "Penalty") yards = 0; }
      const td = type === "Rushing Touchdown" || type === "Passing Touchdown";
      const fumble = /fumbl/i.test(text) && !isInt;
      // ESPN's isTurnover and its "(Own)/(Opponent)" label are unreliable on sack-fumbles, so a fumble is also lost when it is the last
      // fumble play of a drive that ESPN ends with a fumble result (settled after the loop below).
      const fumLost = fumble && p.isTurnover === true;
      const garbage = isGarbage(period, Math.abs(margin));
      const pl = { kind, down, ytg, yl, yards, td, sack, int: isInt, fumLost: HAS_FUMBLES && kind === "rush" && fumLost, margin, epa: null };
      addPlay(garbage ? t.x : t.c, pl);
      nPlays++; dv.scrim++; dv.plays++;
      dv.yards += yards;
      const reach = Math.min(yl, Math.max(0, yl - yards));
      dv.minYl = dv.minYl == null ? reach : Math.min(dv.minYl, reach);
      if (dv.startYl == null) dv.startYl = yl;
      if (garbage) dv.garbage = 1;
      if (kind === "pass") { diag[team].pass++; if (sack) diag[team].sack++; } else diag[team].rush++;
      if (fumble) {
        if (HAS_FUMBLES) t.fu[0]++;
        diag[team].fumbles++;
        if (fumLost) { if (HAS_FUMBLES) t.fu[1]++; diag[team].fumLost++; }
        dv.lastFumble = { lost: fumLost, rush: kind === "rush", vec: garbage ? t.x : t.c };
      }
      const thr = kind === "pass" ? EXPLOSIVE.pass : EXPLOSIVE.rush;
      if (yards >= thr) t.k.push([period, p.clock?.displayValue ?? "", yards, kind === "pass" ? 1 : 0, text.replace(/^\(\d+:\d+\)\s*/, "").slice(0, 120), dno, garbage ? 1 : 0]);
    }

    const lf = dv.lastFumble;
    if (lf && !lf.lost && (resultKey === "FUMBLE" || resultKey === "FUMBLE TD" || resultKey === "FUMBLE RETURN TD")) {
      if (HAS_FUMBLES) t.fu[1]++;
      diag[team].fumLost++;
      if (HAS_FUMBLES && lf.rush) lf.vec[V.RFUM]++;
    }
    const deltaOff = run[team] - before, deltaOpp = run[opp] - beforeOpp;
    const res = RESULT_MAP[resultKey ?? ""];
    // Not an offensive drive: kickoff-return touchdown filed under the returner, phantom drives around half-ends.
    if (dv.scrim === 0 && (resultKey === "TD" || res == null)) {
      // (ESPN sometimes files the return touchdown under the kicking team, so whichever side's score moved gets the special-teams points.)
      const bucket = resultKey === "TD" ? "st" : "loose";
      diag.pts[team][bucket] += deltaOff;
      diag.pts[opp][bucket] += deltaOpp;
      // (A kickoff-return touchdown means the next drive starts with a kickoff; a phantom drive changes nothing.)
      if (resultKey === "TD") prevResult = RESULT.TD;
      return;
    }
    let result = res ?? RESULT.OTHER;
    // ESPN sometimes files a touchdown scored BY the other side (punt/kick return, pick-six) as this drive's "TD": if this offense's score did
    // not move and the opponent's moved by a touchdown, it is a score against.
    if ((result === RESULT.TD || result === RESULT.FG) && deltaOff === 0 && deltaOpp >= 6) result = RESULT.DEF_SCORE;
    // A touchdown or field goal that never moved the score is a feed glitch (e.g. a stray copy of a drive): not a score for this offense.
    else if ((result === RESULT.TD && deltaOff < 6) || (result === RESULT.FG && deltaOff < 3)) result = RESULT.OTHER;
    if (result === RESULT.TD) diag.pts[team].off += Math.min(8, Math.max(6, deltaOff));
    else if (result === RESULT.FG) diag.pts[team].off += 3;
    else if (result === RESULT.DEF_SCORE || result === RESULT.SAFETY) diag.pts[opp].def += deltaOpp;
    else diag.pts[opp].loose += deltaOpp;
    // Points this team scored during its own drive without an offensive TD/FG: a safety forced on a punt return, a returned blocked kick...
    if (result !== RESULT.TD && result !== RESULT.FG && deltaOff > 0) diag.pts[team].st += deltaOff;
    const pts = result === RESULT.TD ? Math.min(8, Math.max(6, deltaOff)) : result === RESULT.FG ? 3 : 0;

    const sp = num(d.start?.period?.number) ?? num(first?.period?.number) ?? 1;
    const period = Math.min(5, Math.max(1, sp));
    const cs = clockSec(d.start?.clock?.displayValue ?? first?.clock?.displayValue);
    const startSec = period <= 4 ? Math.max(0, (period - 1) * 900 + (900 - (cs ?? 900))) : 3600;
    let startYl = dv.startYl ?? dv.ylFromKick ?? dv.anyYl;
    if (startYl == null) {
      const m = /^(\S+)\s+(\d+)$/.exec(d.start?.text ?? "");
      if (m) startYl = m[1].toUpperCase() === String(d.team?.abbreviation ?? "").toUpperCase() ? 100 - Number(m[2]) : Number(m[2]);
      else if (/^\d+$/.test(d.start?.text ?? "")) startYl = Number(d.start.text);
    }
    startYl = Math.min(99, Math.max(1, startYl ?? 75));
    const secs = clockSec(d.timeElapsed?.displayValue) ?? 0;
    // A kickoff starts the drive after any score, a safety (free kick), and each half; ESPN does not always list the kickoff play itself.
    const afterScore = prevResult === RESULT.TD || prevResult === RESULT.FG || prevResult === RESULT.SAFETY || prevResult === RESULT.DEF_SCORE;
    const halfStart = period <= 4 && (cs ?? 0) >= 895 && (period === 1 || period === 3);
    const how = dv.hasKickoff || afterScore || halfStart ? HOW.KICKOFF : (HOW_BY_PREV[prevResult] ?? HOW.OTHER);
    const nPl = num(d.offensivePlays) ?? dv.plays;
    t.d.push([period, startSec, startYl, nPl, dv.yards, secs, result, pts, how, Math.min(startYl, dv.minYl ?? startYl), dv.garbage]);
    prevResult = result;
  });

  for (const id of [H, A]) {
    teams[id].k.sort((a, b) => b[2] - a[2]);
    teams[id].k = teams[id].k.slice(0, 6);
  }
  return { teams, home: H, away: A, plays: nPlays, skipped, nDrives: drives.length, diag };
}
