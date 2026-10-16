/**
 * Play-by-play football engine. No React, DOM or network code.
 *
 * A game is played snap by snap: down and distance, field position, a running clock with timeouts and two-minute drills, punts,
 * field goals, two-point tries, turnovers, penalties, weather, and overtime (NFL modified sudden death, college alternating
 * possessions from the 25). Every outcome is drawn from league base rates that are scaled by the two teams' real season numbers
 * (see profile.ts): passing and rushing yards for and against, third-down rate, giveaways and takeaways. Each team also carries a
 * calibrated efficiency scalar (calibrate.ts) that lines its scoring up with what the season stats say it should score.
 *
 * `x` is a spot on a 0-100 field with the away team's goal line at 0 and the home team's at 100; `y` is the distance a team has
 * to travel from its own goal line (0-100), so it attacks toward y = 100.
 */
import { makeRng, normCdf } from "../spplus/sim/rng";

export type Lg = "NFL" | "CFB";
type Side = 0 | 1;

/** A team's real players, weighted by season production, so the right names carry the ball and catch the passes. */
export interface Roster {
  qb?: string;
  rushers?: { name: string; w: number }[];
  receivers?: { name: string; w: number; pos: "WR" | "TE" | "RB" }[];
}

export interface TeamSim {
  name: string;
  short: string;
  abbr: string;
  color: string;
  logo?: string;
  /** Alternate brand color, the board logo id, and the conference name (or "NFL"), for the end zones and the logos painted on the field. */
  alt?: string;
  logoId?: string;
  conf?: string | null;
  /** Strength ratios against the league average (1 = average): offense and defense, passing and rushing, third down, giveaways and takeaways. */
  passO: number; rushO: number; passD: number; rushD: number;
  thirdO: number; thirdD: number; giveO: number; takeD: number;
  /** Yardage scalar set by calibrate(). */
  eff: number;
  /** Season leaders, used to name the players in the play text. */
  roster: Roster;
}

export interface GameCfg {
  league: Lg;
  away: TeamSim;
  home: TeamSim;
  weather: { windMph: number; rainPct: number };
  /** An NFL regular-season game can end tied; a playoff game cannot. College never ties. */
  allowTies: boolean;
  /** Pre-game expected margin (home minus away), used only to start the win-probability line where the forecast says it should. */
  priorMargin: number;
}

export type Kind = "kickoff" | "rush" | "pass" | "sack" | "punt" | "fg" | "xp" | "two" | "penalty" | "timeout" | "kneel" | "spike" | "end";

export interface PlayRec {
  n: number;
  q: number;
  /** Seconds left in the quarter after the play. */
  clock: number;
  /** Seconds the play and the wait before the next snap took. */
  dt: number;
  drive: number;
  off: Side;
  kind: Kind;
  down: number;
  dist: number;
  /** Where the offense started this snap, as text ("OSU 25"), and as 0-100 field positions before and after. */
  spot: string;
  x0: number;
  x1: number;
  yds: number;
  first: boolean;
  td: boolean;
  /** "int", "fumble" or "downs" when the ball changed hands on the play. */
  turnover?: "int" | "fumble" | "downs";
  complete?: boolean;
  /** Players involved, for the broadcast panels. */
  passer?: string;
  target?: string;
  /** Where the target lines up, so the play diagram sends the right player. */
  tpos?: "WR" | "TE" | "RB";
  runner?: string;
  /** Points added on this play and to whom. */
  pts: number;
  scorer: Side | null;
  text: string;
  score: [number, number];
  /** Home win probability after the play. */
  wp: number;
  /** A play worth highlighting: scores, turnovers, 20+ yard gains, big stops. */
  big: boolean;
  /** The offense for the next snap, and the down and distance it faces. */
  nextOff: Side;
  nextDown: number;
  nextDist: number;
}

export interface GameResult {
  score: [number, number];
  overtime: boolean;
  tie: boolean;
  plays: PlayRec[];
}

interface Base {
  pass: number; comp: number; ypc: number; cvPass: number; sack: number; int: number; ypr: number; cvRush: number; fum: number; pen: number;
  gap: number; tbProb: number; tbY: number; retY: number; punt: number; puntSd: number; fgMid: number; fgScale: number; fgCap: number;
  xp: number; two: number; onside: number;
}

/** League base rates (NFL regular seasons 2021-25, FBS 2021-25), rounded. */
const BASE: Record<Lg, Base> = {
  NFL: { pass: 0.575, comp: 0.665, ypc: 11.3, cvPass: 1.0, sack: 0.062, int: 0.017, ypr: 4.65, cvRush: 0.9, fum: 0.007, pen: 0.07, gap: 31, tbProb: 0.58, tbY: 35, retY: 30, punt: 42, puntSd: 6, fgMid: 56, fgScale: 5, fgCap: 0.975, xp: 0.945, two: 0.48, onside: 0.13 },
  CFB: { pass: 0.47, comp: 0.645, ypc: 12.5, cvPass: 1.05, sack: 0.052, int: 0.02, ypr: 4.85, cvRush: 0.95, fum: 0.008, pen: 0.075, gap: 26, tbProb: 0.55, tbY: 25, retY: 27, punt: 40.5, puntSd: 6.5, fgMid: 52, fgScale: 5.8, fgCap: 0.965, xp: 0.955, two: 0.47, onside: 0.1 },
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const sigmaFor = (cv: number) => Math.sqrt(Math.log(1 + cv * cv));
const other = (s: Side): Side => (s === 0 ? 1 : 0);

/** A team with every ratio at 1: the league average. */
export const avgTeam = (name = "Average", abbr = "AVG"): TeamSim => ({
  name, short: name, abbr, color: "#6b7785", passO: 1, rushO: 1, passD: 1, rushD: 1, thirdO: 1, thirdD: 1, giveO: 1, takeD: 1, eff: 1, roster: {},
});

export const clockText = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
export const downText = (down: number, dist: number, toGoal: number) => `${["", "1st", "2nd", "3rd", "4th"][down] ?? "4th"} & ${dist >= toGoal ? "Goal" : dist}`;

export function playGame(cfg: GameCfg, seed: number, record = false): GameResult {
  const { uniform: u, normal: nrm } = makeRng(seed);
  const B = BASE[cfg.league];
  const T: [TeamSim, TeamSim] = [cfg.away, cfg.home];
  const nfl = cfg.league === "NFL";
  const wind = cfg.weather.windMph;
  const wet = cfg.weather.rainPct >= 50;
  const windPass = wind > 12 ? clamp(1 - 0.008 * (wind - 12), 0.8, 1) : 1;
  const fgWind = wind > 10 ? 0.3 * (wind - 10) : 0;

  // Matchup multipliers for offense i against defense 1-i.
  const mu = ([0, 1] as const).map((i) => {
    const o = T[i], d = T[other(i)];
    return {
      pass: Math.pow(o.passO, 0.55) * Math.pow(d.passD, 0.55) * o.eff * windPass,
      rush: Math.pow(o.rushO, 0.55) * Math.pow(d.rushD, 0.55) * o.eff,
      third: Math.sqrt(o.thirdO * d.thirdD),
      tf: Math.sqrt(o.giveO * d.takeD),
      sack: Math.pow(d.passD, -0.3),
      passShare: clamp(B.pass * Math.pow(o.passO / o.rushO, 0.25), 0.4, 0.72),
    };
  });

  /** Pick from a weighted list. */
  const pickW = <T extends { w: number }>(list: T[] | undefined): T | undefined => {
    if (!list?.length) return undefined;
    let r = u() * list.reduce((a, b) => a + b.w, 0);
    for (const x of list) { r -= x.w; if (r <= 0) return x; }
    return list[list.length - 1];
  };

  /** Lognormal draw with the given mean and coefficient of variation. */
  const ln = (mean: number, cv: number) => {
    const s = sigmaFor(cv);
    return Math.exp(Math.log(Math.max(mean, 0.1)) - (s * s) / 2 + s * nrm());
  };

  const score: [number, number] = [0, 0];
  let q = 1, clock = 900, drive = 0, n = 0, otNumber = 0, overtime = false;
  const timeouts: [number, number] = [3, 3];
  const plays: PlayRec[] = [];
  let pending: PlayRec[] = [];
  let off: Side = 0, y = 25, down = 1, dist = 10;
  let stopped = true;
  /** A team that has just scored and kicks off once the current play and its try are done (and any quarter break has been taken). */
  let pendingKick: Side | null = null;
  const openingReceiver: Side = u() < 0.5 ? 1 : 0;

  const abbrs = [cfg.away.abbr, cfg.home.abbr];
  const spotText = (yy: number, o: Side) => (yy < 50 ? `${abbrs[o]} ${Math.round(yy)}` : yy > 50 ? `${abbrs[other(o)]} ${Math.round(100 - yy)}` : "50");
  const toX = (yy: number, o: Side) => (o === 0 ? yy : 100 - yy);
  const leadOf = (i: Side) => score[i] - score[other(i)];

  /** Home win probability given a score, the team with the ball and its field position, anchored to the pre-game forecast. */
  const wpAt = (sc: [number, number], o: Side, yy: number, qq: number, cl: number, finished: boolean) => {
    const diff = sc[1] - sc[0];
    if (finished) return diff > 0 ? 1 : diff < 0 ? 0 : 0.5;
    const total = qq > 4 ? 120 : (4 - qq) * 900 + cl;
    const ep = (clamp(yy, 1, 99) - 25) * 0.062 + 0.3;
    const mean = diff + (o === 1 ? ep : -ep) + cfg.priorMargin * (total / 3600);
    const sd = (nfl ? 13.5 : 16) * Math.sqrt(Math.max(total, 40) / 3600);
    return clamp(normCdf(mean / sd), 0.001, 0.999);
  };

  type EmitArgs = Partial<PlayRec> & { kind: Kind; text: string; dt: number; x0: number; x1: number; off: Side };
  const emit = (p: EmitArgs) => {
    n++;
    if (!record) return;
    const rec: PlayRec = {
      n, q, clock: 0, drive, down: 0, dist: 0, spot: "", yds: 0, first: false, td: false, pts: 0, scorer: null, big: false,
      score: [score[0], score[1]], wp: 0.5, nextOff: off, nextDown: down, nextDist: dist, ...p,
    };
    rec.clock = Math.max(0, Math.round(clock));
    pending.push(rec);
  };
  /** Fill in the state after the play (possession, down, win probability) on every record made since the last call. */
  const settle = (finished = false) => {
    if (!record || !pending.length) { pending = []; return; }
    for (const p of pending) {
      p.wp = wpAt(p.score, off, y, p.q, p.clock, finished && p === pending[pending.length - 1]);
    }
    const last = pending[pending.length - 1];
    last.nextOff = off; last.nextDown = down; last.nextDist = dist;
    plays.push(...pending);
    pending = [];
  };

  const fgProb = (kick: number) => clamp(1 / (1 + Math.exp((kick - (B.fgMid - fgWind)) / B.fgScale)), 0.02, B.fgCap);

  /** Kickoff by `kicker`; the other team (or the kicker, on a recovered onside kick) takes over. */
  const kickoff = (kicker: Side, opening = false) => {
    drive++;
    const rec = other(kicker);
    const kx = toX(35, kicker);
    const late = !opening && score[kicker] < score[rec] && q === 4 && clock <= 240;
    stopped = true;
    if (late && u() < 0.55) {
      clock -= 6;
      if (u() < B.onside) {
        off = kicker; y = 45 + Math.round(nrm() * 3); down = 1; dist = 10;
        emit({ kind: "kickoff", off: kicker, text: `${T[kicker].short} onside kick — RECOVERED by ${T[kicker].short}!`, dt: 6, x0: kx, x1: toX(y, off), first: true, big: true });
      } else {
        off = rec; y = 100 - (46 + Math.round(nrm() * 3)); down = 1; dist = 10;
        emit({ kind: "kickoff", off: kicker, text: `${T[kicker].short} onside kick — recovered by ${T[rec].short} at ${spotText(y, rec)}.`, dt: 6, x0: kx, x1: toX(y, off), big: true });
      }
      return;
    }
    off = rec; down = 1; dist = 10;
    if (u() < 0.006) {
      score[rec] += 6;
      clock -= 14;
      emit({ kind: "kickoff", off: kicker, text: `${T[rec].short} returns the kickoff for a TOUCHDOWN!`, dt: 14, x0: kx, x1: toX(100, rec), td: true, pts: 6, scorer: rec, big: true });
      y = 25;
      conversionAfter(rec);
      pendingKick = rec;
      return;
    }
    if (u() < B.tbProb) {
      y = B.tbY;
      emit({ kind: "kickoff", off: kicker, text: `${T[kicker].short} kicks off, touchback. ${T[rec].short} ball at the ${spotText(y, rec)}.`, dt: 0, x0: kx, x1: toX(y, rec) });
    } else {
      y = clamp(Math.round(B.retY + nrm() * 7), 12, 58);
      clock -= 8;
      emit({ kind: "kickoff", off: kicker, text: `${T[kicker].short} kicks off, returned to the ${spotText(y, rec)}.`, dt: 8, x0: kx, x1: toX(y, rec) });
    }
  };

  /** The try after a touchdown by `team`, with the touchdown already on the board. */
  const conversionAfter = (team: Side) => {
    if (q > 4 && nfl) return; // a touchdown ends NFL overtime
    const d = leadOf(team);
    if (q === 4 && clock <= 0 && !(d <= 0 && d >= -2)) return; // nothing left for the try to change
    const late = q === 4 || (q === 3 && clock < 200);
    const goTwo = (late && (d === -2 || d === -5 || d === -10 || d === -13)) || (q > 4 && !nfl && otNumber >= 3);
    const x = toX(98, team);
    if (goTwo) {
      const ok = u() < clamp(B.two * Math.pow(mu[team].rush * mu[team].pass, 0.2), 0.3, 0.62);
      if (ok) score[team] += 2;
      emit({ kind: "two", off: team, text: ok ? `${T[team].short} converts the two-point try!` : `${T[team].short}'s two-point try is stopped.`, dt: 0, x0: x, x1: x, pts: ok ? 2 : 0, scorer: ok ? team : null, big: true });
    } else {
      const ok = u() < B.xp;
      if (ok) score[team] += 1;
      emit({ kind: "xp", off: team, text: ok ? `${T[team].short} extra point is good.` : `${T[team].short} extra point is NO GOOD.`, dt: 0, x0: x, x1: x, pts: ok ? 1 : 0, scorer: ok ? team : null, big: !ok });
    }
  };

  /** Spend `playSecs` plus the wait for the next snap (none if the clock stops). College overtime has no clock. */
  const burn = (playSecs: number, clockStops: boolean, hurry: boolean, leading: boolean) => {
    if (q > 4 && !nfl) { stopped = true; return 0; }
    const wait = clockStops ? 0 : hurry ? 12 + u() * 4 : leading && q === 4 && clock < 400 ? 38 + u() * 2 : B.gap - 4 + u() * 8;
    const dt = Math.round(playSecs + wait);
    clock -= dt;
    stopped = clockStops;
    return dt;
  };

  const swap = (newY: number) => {
    y = clamp(Math.round(newY), 1, 99); off = other(off); down = 1; dist = Math.min(10, 100 - y); stopped = true; drive++;
  };

  const turnoverOnDowns = () => {
    const was = off;
    emit({ kind: "end", off: was, text: `Turnover on downs — ${T[other(was)].short} takes over at the ${spotText(100 - y, other(was))}.`, dt: 0, x0: toX(y, was), x1: toX(y, was), turnover: "downs", big: true, down: 4, dist });
    swap(100 - y);
  };

  const safety = (loser: Side) => {
    score[other(loser)] += 2;
    drive++;
    // The team that gave up the safety kicks from its 20; the other team starts about its 40.
    const rec = other(loser);
    const startY = Math.round(clamp(38 + nrm() * 6, 20, 55));
    off = rec; y = startY; down = 1; dist = 10; stopped = true;
    emit({ kind: "kickoff", off: loser, text: `${T[loser].short} free kick; ${T[rec].short} ball at the ${spotText(y, rec)}.`, dt: 6, x0: toX(20, loser), x1: toX(y, rec) });
    clock -= 6;
  };

  const scoreTd = (scorer: Side) => {
    conversionAfter(scorer);
    pendingKick = scorer;
  };

  type Base0 = { off: Side; down: number; dist: number; spot: string; x0: number };

  const punt = (b: Base0) => {
    const O = T[off], was = off, rec = other(was);
    const net = B.punt + nrm() * B.puntSd - (wind > 15 ? 2 : 0);
    if (u() < 0.006) {
      const oy = clamp(100 - (y - 3), 5, 95);
      const dt = burn(8, true, false, false);
      emit({ ...b, kind: "punt", text: `${O.short} punt BLOCKED! ${T[rec].short} ball at the ${spotText(oy, rec)}.`, dt, x1: toX(oy, rec), turnover: "downs", big: true });
      swap(oy);
      return;
    }
    let oy = 100 - (y + net);
    let text: string;
    if (oy <= 0) { oy = 20; text = `${O.short} punts into the end zone, touchback.`; }
    else if (oy < 12) { oy = clamp(oy + (u() < 0.5 ? 0 : 3), 3, 11); text = `${O.short} punts ${Math.round(net)} yards, downed at the ${spotText(Math.round(oy), rec)}.`; }
    else { oy = clamp(oy + u() * 4, 12, 99); text = `${O.short} punts ${Math.round(net)} yards, fair catch at the ${spotText(Math.round(oy), rec)}.`; }
    const dt = burn(10, true, false, false);
    emit({ ...b, kind: "punt", text, dt, x1: toX(Math.round(oy), rec) });
    swap(oy);
  };

  const fieldGoal = (b: Base0, kick: number) => {
    const O = T[off], was = off;
    const good = u() < fgProb(kick);
    const dt = burn(6, true, false, false);
    if (good) {
      score[was] += 3;
      emit({ ...b, kind: "fg", text: `${O.short} ${Math.round(kick)}-yard field goal is GOOD.`, dt, x1: toX(100, was), pts: 3, scorer: was, big: true });
      pendingKick = was;
      return;
    }
    const oy = Math.max(20, 107 - y);
    emit({ ...b, kind: "fg", text: `${O.short} ${Math.round(kick)}-yard field goal is NO GOOD.`, dt, x1: toX(oy, other(was)), turnover: "downs", big: true });
    swap(oy);
  };

  // --- one scrimmage snap ----------------------------------------------------------------------------------------------------------------
  const snap = () => {
    const O = T[off], D = T[other(off)], m = mu[off];
    const lead = leadOf(off);
    const inOt = q > 4;
    const hurry = !inOt && ((q === 2 && clock <= 120 && lead <= 7) || (q === 4 && clock <= 300 && lead < 0));
    const leadingLate = q === 4 && lead > 0 && clock < 400;
    const startX = toX(y, off);
    const b: Base0 = { off, down, dist, spot: spotText(y, off), x0: startX };
    const oppTO = timeouts[other(off)];
    const fgDist = 100 - y + 17;
    const toGoal = 100 - y;

    // Victory formation.
    if (!inOt && q === 4 && lead > 0 && clock <= 150 && clock <= (5 - down) * 40 - oppTO * 38 + 1) {
      const dt = burn(2, false, false, true);
      y = Math.max(1, y - 1); dist += 1; down++;
      emit({ ...b, kind: "kneel", text: `${O.short} takes a knee.`, dt, x1: toX(y, off), yds: -1 });
      if (down > 4) turnoverOnDowns();
      return;
    }
    // Spike to stop the clock.
    if (hurry && !stopped && timeouts[off] === 0 && clock <= 30 && down < 4 && u() < 0.7) {
      const dt = burn(1, true, true, false);
      down++;
      emit({ ...b, kind: "spike", text: `${O.short} spikes the ball to stop the clock.`, dt, x1: startX });
      return;
    }
    // Timeouts: the trailing offense saves time; the defense stops the clock when the other team is ahead and running it down.
    if (!stopped && !inOt && (q === 2 || q === 4) && clock <= 150) {
      if (hurry && timeouts[off] > 0 && clock <= 100 && u() < 0.65) {
        timeouts[off]--; stopped = true;
        emit({ ...b, kind: "timeout", text: `Timeout, ${O.short}. (${timeouts[off]} left)`, dt: 0, x1: startX });
        return;
      }
      if (lead > 0 && q === 4 && timeouts[other(off)] > 0 && clock <= 130 && u() < 0.75) {
        const d = other(off);
        timeouts[d]--; stopped = true;
        emit({ ...b, kind: "timeout", text: `Timeout, ${T[d].short}. (${timeouts[d]} left)`, dt: 0, x1: startX });
        return;
      }
    }

    // Fourth down: kick, punt or go.
    if (down === 4) {
      const endOfHalfFg = !inOt && clock <= 12 && (q === 2 || q === 4) && fgDist <= B.fgMid;
      const needTd = !inOt && q === 4 && lead < -3 && clock < 300;
      const trailing = !inOt && q === 4 && lead < -3 && clock < 480;
      let go: boolean;
      if (inOt && !nfl) go = fgDist > 52;
      else if (inOt) go = (fgDist > B.fgMid + 4 && y >= 50 && dist <= 4) || (dist <= 1 && y >= 55);
      else if (endOfHalfFg) go = false;
      else if (needTd) go = y >= 30 || clock < 120;
      else if (trailing) go = y >= 40 && dist <= 8;
      else if (dist <= 1 && y >= 45) go = u() < (nfl ? 0.7 : 0.6);
      else if (dist <= 2 && y >= 60 && fgDist > 38) go = u() < (nfl ? 0.4 : 0.3);
      else if (dist <= 4 && y >= 70 && fgDist > 44 && lead < 0) go = u() < 0.35;
      else go = false;
      if (!go) {
        if (fgDist <= (nfl ? 57 : 53) && (y >= 45 || endOfHalfFg)) fieldGoal(b, fgDist);
        else punt(b);
        return;
      }
    }

    // Choose the call.
    let passP = m.passShare;
    if (dist <= 2) passP -= 0.28;
    else if (down >= 3 && dist >= 8) passP = 0.9;
    else if (down === 3 && dist >= 5) passP = 0.78;
    if (!inOt && q === 4) {
      if (lead <= -9 && clock < 700) passP += 0.18;
      if (lead >= 9 && clock < 800) passP -= 0.2;
      if (lead >= 1 && clock < 200) passP -= 0.2;
    }
    if (hurry) passP = Math.max(passP, 0.84);
    if (toGoal <= 3) passP = Math.min(passP, 0.5);
    const isPass = u() < clamp(passP, 0.05, 0.97);
    const late34 = down >= 3;

    // A flag before the play is run.
    if (u() < B.pen) {
      const r = u();
      let text: string, yardsPen: number, auto = false;
      if (r < 0.28) { text = `Holding on ${O.short}`; yardsPen = -10; }
      else if (r < 0.58) { text = `False start, ${O.short}`; yardsPen = -5; }
      else if (r < 0.77) { text = `Offside, ${D.short}`; yardsPen = 5; }
      else if (r < 0.86) { text = `Defensive holding on ${D.short}`; yardsPen = 5; auto = true; }
      else if (r < 0.96) {
        auto = true;
        if (isPass) { yardsPen = Math.round(8 + u() * 18); text = `Pass interference on ${D.short}`; } else { yardsPen = 15; text = `Face mask on ${D.short}`; }
      } else { text = `Unnecessary roughness on ${D.short}`; yardsPen = 15; auto = true; }
      const gain = yardsPen > 0 ? Math.min(yardsPen, Math.floor(toGoal / 2)) : -Math.min(-yardsPen, Math.floor(y / 2));
      y += gain;
      if (auto || gain >= dist) { down = 1; dist = Math.min(10, 100 - y); } else dist = Math.min(100 - y, Math.max(1, dist - gain));
      const dt = burn(5, true, hurry, false);
      emit({ ...b, kind: "penalty", text: `PENALTY: ${text}, ${Math.abs(gain)} yards${auto ? ", automatic first down" : ""}.`, dt, x1: toX(y, off), yds: gain, first: auto });
      return;
    }

    if (isPass) {
      const passer = O.roster.qb ?? `${O.short} QB`;
      const sackP = clamp(B.sack * m.sack * (hurry ? 1.1 : 1), 0.02, 0.14);
      if (u() < sackP) {
        const loss = Math.max(1, Math.round(4 + u() * 6));
        const ny = y - loss;
        const dt = burn(5, false, hurry, false);
        if (ny <= 0) {
          emit({ ...b, kind: "sack", text: `${passer} sacked in the end zone — SAFETY! ${D.short} +2`, dt, x1: toX(0, off), yds: -y, pts: 2, scorer: other(off), big: true });
          safety(off);
          return;
        }
        if (u() < 0.12 * Math.min(2, m.tf)) {
          emit({ ...b, kind: "sack", text: `${passer} sacked for a loss of ${loss} — FUMBLE, recovered by ${D.short}!`, dt, x1: toX(ny, off), yds: -loss, turnover: "fumble", big: true });
          swap(100 - ny);
          return;
        }
        y = ny; down++; dist += loss;
        emit({ ...b, kind: "sack", text: `${passer} sacked for a loss of ${loss}.`, dt, x1: toX(y, off), yds: -loss, big: loss >= 9 });
        if (down > 4) turnoverOnDowns();
        return;
      }
      const rcv = pickW(O.roster.receivers);
      const target = rcv?.name ?? `${O.abbr} receiver`;
      const tpos = rcv?.pos ?? "WR";
      const intP = clamp(B.int * m.tf * (hurry ? 1.25 : 1) * (wet ? 1.1 : 1), 0.004, 0.07);
      if (u() < intP) {
        const air = ln(late34 && dist > 7 ? Math.min(dist + 2, 16) : 8.5, 0.75);
        const spotY = Math.min(y + air, 100);
        const rec = other(off);
        const dt = burn(7, true, hurry, false);
        if (spotY >= 100) {
          emit({ ...b, kind: "pass", passer, target, tpos, text: `${passer} intercepted in the end zone by ${D.short} — touchback.`, dt, x1: toX(100, off), turnover: "int", big: true });
          swap(20);
          return;
        }
        if (u() < 0.055) {
          score[rec] += 6;
          emit({ ...b, kind: "pass", passer, target, tpos, text: `${passer} INTERCEPTED by ${D.short} — returned for a TOUCHDOWN!`, dt, x1: toX(0, off), turnover: "int", td: true, pts: 6, scorer: rec, big: true });
          scoreTd(rec);
          return;
        }
        const oppY = clamp(100 - spotY + ln(9, 1.1), 1, 99);
        emit({ ...b, kind: "pass", passer, target, tpos, text: `${passer} pass intercepted by ${D.short}, returned to the ${spotText(Math.round(oppY), rec)}.`, dt, x1: toX(Math.round(oppY), rec), turnover: "int", big: true });
        swap(oppY);
        return;
      }
      const compP = clamp(B.comp * Math.pow(m.pass, 0.35) * (late34 ? Math.pow(m.third, 0.4) : 1) * (wet ? 0.97 : 1) * (dist > 12 ? 0.88 : 1), 0.4, 0.8);
      if (u() >= compP) {
        const dt = burn(5, true, hurry, false);
        down++;
        emit({ ...b, kind: "pass", passer, target, tpos, text: `${passer} pass incomplete${u() < 0.35 ? ` intended for ${target}` : ""}.`, dt, x1: startX, complete: false });
        if (down > 4) turnoverOnDowns();
        return;
      }
      let gain = Math.round(1 + ln(Math.max(1, B.ypc * m.pass * (late34 ? Math.pow(m.third, 0.2) : 1) - 1), B.cvPass));
      gain = Math.min(gain, toGoal);
      const ny = y + gain;
      const dt = burn(gain > 15 ? 8 : 6, hurry ? u() < 0.3 : u() < 0.12, hurry, leadingLate);
      if (ny >= 100) {
        score[off] += 6;
        emit({ ...b, kind: "pass", passer, target, tpos, text: `${passer} pass complete to ${target} for ${gain} yards — TOUCHDOWN ${O.short}!`, dt, x1: toX(100, off), yds: gain, td: true, first: true, complete: true, pts: 6, scorer: off, big: true });
        scoreTd(off);
        return;
      }
      if (u() < 0.004 * m.tf) {
        emit({ ...b, kind: "pass", passer, target, tpos, text: `${passer} pass complete to ${target} for ${gain} — FUMBLE, recovered by ${D.short}!`, dt, x1: toX(ny, off), yds: gain, turnover: "fumble", complete: true, big: true });
        swap(100 - ny);
        return;
      }
      const first = gain >= dist;
      y = ny;
      if (first) { down = 1; dist = Math.min(10, 100 - y); } else { down++; dist -= gain; }
      emit({ ...b, kind: "pass", passer, target, tpos, text: `${passer} pass complete to ${target} for ${gain} yards${first ? ", first down" : ""}.`, dt, x1: toX(y, off), yds: gain, first, complete: true, big: gain >= 20 });
      if (down > 4) turnoverOnDowns();
      return;
    }

    // Run.
    const rr = u();
    const runner = rr < 0.07 && O.roster.qb ? O.roster.qb : pickW(O.roster.rushers)?.name ?? `${O.abbr} RB`;
    let gain = Math.round(ln(B.ypr * m.rush * (late34 ? Math.pow(m.third, 0.15) : 1) + 3, B.cvRush) - 3);
    if (dist <= 2 && gain > dist && u() < 0.15) gain = dist - 1;
    gain = Math.min(gain, toGoal);
    const dt = burn(5, hurry ? u() < 0.28 : u() < 0.1, hurry, leadingLate);
    const ny = y + gain;
    if (ny >= 100) {
      score[off] += 6;
      emit({ ...b, kind: "rush", runner, text: `${runner} runs ${gain} yard${gain === 1 ? "" : "s"} — TOUCHDOWN ${O.short}!`, dt, x1: toX(100, off), yds: gain, td: true, first: true, pts: 6, scorer: off, big: true });
      scoreTd(off);
      return;
    }
    if (ny <= 0) {
      emit({ ...b, kind: "rush", runner, text: `${runner} tackled in the end zone — SAFETY! ${D.short} +2`, dt, x1: toX(0, off), yds: -y, pts: 2, scorer: other(off), big: true });
      safety(off);
      return;
    }
    if (u() < B.fum * m.tf * (wet ? 1.3 : 1)) {
      if (u() < 0.06) {
        const rec = other(off);
        score[rec] += 6;
        emit({ ...b, kind: "rush", runner, text: `${runner} FUMBLES — ${D.short} returns it for a TOUCHDOWN!`, dt, x1: toX(0, off), yds: gain, turnover: "fumble", td: true, pts: 6, scorer: rec, big: true });
        scoreTd(rec);
        return;
      }
      emit({ ...b, kind: "rush", runner, text: `${runner} runs for ${gain} — FUMBLE, recovered by ${D.short}!`, dt, x1: toX(ny, off), yds: gain, turnover: "fumble", big: true });
      swap(100 - ny);
      return;
    }
    const first = gain >= dist;
    y = ny;
    if (first) { down = 1; dist = Math.min(10, 100 - y); } else { down++; dist -= gain; }
    const word = gain === 0 ? "no gain" : gain < 0 ? `a loss of ${-gain}` : `${gain} yard${gain === 1 ? "" : "s"}`;
    emit({ ...b, kind: "rush", runner, text: `${runner} runs for ${word}${first ? ", first down" : ""}.`, dt, x1: toX(y, off), yds: gain, first, big: gain >= 20 });
    if (down > 4) turnoverOnDowns();
  };

  const marker = (text: string) => emit({ kind: "end", off, text, dt: 0, x0: toX(y, off), x1: toX(y, off), big: true });

  // --- regulation ------------------------------------------------------------------------------------------------------------------------
  kickoff(other(openingReceiver), true);
  settle();
  for (let guard = 0; guard < 3000; guard++) {
    snap();
    if (clock <= 0) {
      if (q === 4) break;
      if (q === 2) {
        pendingKick = null;
        marker("Halftime.");
        q = 3; clock = 900; timeouts[0] = 3; timeouts[1] = 3;
        kickoff(openingReceiver);
        settle();
        continue;
      }
      marker(`End of quarter ${q}.`);
      q++; clock = 900;
    }
    if (pendingKick !== null) {
      const k = pendingKick;
      pendingKick = null;
      kickoff(k);
    }
    settle();
  }
  pendingKick = null;
  settle(score[0] !== score[1]);

  // --- overtime --------------------------------------------------------------------------------------------------------------------------
  if (score[0] === score[1]) {
    overtime = true;
    q = 5;
    if (nfl) nflOvertime();
    else collegeOvertime();
  }
  settle(true);
  return { score: [score[0], score[1]], overtime, tie: score[0] === score[1], plays };

  /** Ten-minute modified sudden death: a touchdown wins at once, a field goal lets the other team answer, then the next score wins. */
  function nflOvertime() {
    clock = 600; otNumber = 1;
    marker("End of regulation — overtime.");
    const kicker: Side = u() < 0.5 ? 0 : 1;
    kickoff(kicker);
    settle();
    const poss: [number, number] = [0, 0];
    let last: Side | null = null;
    for (let guard = 0; guard < 1500; guard++) {
      if (off !== last) { poss[off]++; last = off; }
      const before: [number, number] = [score[0], score[1]];
      snap();
      const scored = score[0] !== before[0] || score[1] !== before[1];
      const decided = scored && score[0] !== score[1] && (poss[0] >= 1 && poss[1] >= 1 || Math.abs(score[0] - before[0]) + Math.abs(score[1] - before[1]) >= 6);
      if (decided) { pendingKick = null; settle(true); return; }
      if (clock <= 0) {
        pendingKick = null;
        if (score[0] !== score[1] || cfg.allowTies || otNumber >= 4) { settle(true); return; }
        otNumber++; clock = 600; marker("Overtime continues.");
      }
      if (pendingKick !== null) { const k: Side = pendingKick; pendingKick = null; kickoff(k); }
      settle();
    }
  }

  /** Each team gets the ball at the opponent's 25 until one leads after both have had a turn; two-point tries from the third overtime on. */
  function collegeOvertime() {
    marker("End of regulation — overtime.");
    let first: Side = openingReceiver === 0 ? 1 : 0;
    for (otNumber = 1; otNumber <= 12; otNumber++) {
      for (const team of [first, other(first)] as Side[]) {
        drive++;
        off = team; y = 75; down = 1; dist = 10; stopped = true; clock = 900;
        marker(`Overtime ${otNumber}: ${T[team].short} has the ball at the ${spotText(y, team)}.`);
        const s0: [number, number] = [score[0], score[1]];
        for (let guard = 0; guard < 80; guard++) {
          snap();
          pendingKick = null;
          settle();
          if (off !== team || score[0] !== s0[0] || score[1] !== s0[1]) break;
        }
        if (team === other(first) && score[0] !== score[1]) return;
      }
      first = other(first);
    }
    // Safety valve: settle a never-ending game with a coin flip.
    score[u() < 0.5 ? 0 : 1] += 1;
  }
}
