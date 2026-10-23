// The record of the picks: every graded pick with the plain-English reason it won or missed, and a back-test of the recommended parlays week by week.
// Pure, so tests can import it.
import { atsGames as nflGraded } from "./nfl/model";
import type { NflData } from "./nfl/types";
import { atsGames as cfbGraded } from "./spplus/data/ats";
import type { Model } from "./spplus/data/types";
import { lineText } from "./livePicks";
import { BREAK_EVEN } from "./parlay";

export type Result = "win" | "loss" | "push";

export interface GradedPick {
  id: string;
  league: "CFB" | "NFL";
  week: number;
  date: string;
  game: string;
  away: string;
  home: string;
  pick: string;
  /** The margin the pick had to win by (negative for an underdog getting points). */
  need: number;
  /** "Chicago Bears −3". */
  label: string;
  /** Points the ratings liked the pick more than the line did. */
  edge: number;
  /** What the ratings projected the pick's margin to be. */
  projected: number;
  /** The pick's real margin, and how far past (or short of) the line it finished. */
  margin: number;
  coverBy: number;
  result: Result;
  final: string;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const pts = (n: number) => `${r1(Math.abs(n))} point${r1(Math.abs(n)) === 1 ? "" : "s"}`;

function build(base: { id: string; league: "CFB" | "NFL"; week: number; date: string; game: string; away: string; home: string; pick: string; edge: number; margin: number; coverBy: number; result: Result; final: string }): GradedPick {
  const need = r1(base.margin - base.coverBy);
  return { ...base, need, label: `${base.pick} ${lineText(need)}`, projected: r1(base.edge + need) };
}

/** Every graded FBS-vs-FBS pick this season, oldest first. */
export function cfbPicks(model: Model): GradedPick[] {
  return cfbGraded(model).filter((g) => g.group === "fbs" && g.edge != null).map((g) => build({ id: g.id, league: "CFB", week: g.week, date: g.date, game: `${g.away} at ${g.home}`, away: g.away, home: g.home, pick: g.pick, edge: g.edge as number, margin: g.margin, coverBy: g.coverBy, result: g.result, final: g.final }));
}

/** Every graded NFL pick this season, oldest first. */
export function nflPicks(data: NflData): GradedPick[] {
  return nflGraded(data).map((g) => build({ id: g.id, league: "NFL", week: g.week, date: g.date, game: `${g.away} at ${g.home}`, away: g.away, home: g.home, pick: data.teams[g.pick]?.name ?? g.pick, edge: g.edge, margin: g.margin, coverBy: g.coverBy, result: g.result, final: g.final }));
}

/**
 * Why a pick won or missed, in one or two sentences: the side and the number it needed, what it did, and how that compares with what the ratings expected.
 * Covering is only about the number, so a team can win the game and still miss (a favorite that wins by less than the spread) or lose the game and still cover.
 */
export function explain(p: GradedPick): { headline: string; why: string } {
  const fav = p.need > 0, won = p.margin > 0, tie = p.margin === 0;
  const did = tie ? "tied" : won ? `won by ${pts(p.margin)}` : `lost by ${pts(p.margin)}`;
  const vs = p.projected - p.margin;
  const model = `The ratings had ${p.pick} ${p.projected < 0 ? `losing by ${r1(-p.projected)}` : `winning by ${r1(p.projected)}`}; the game finished ${vs >= 0 ? `${pts(vs)} worse` : `${pts(vs)} better`} for them than that.`;
  if (p.result === "push") return { headline: "Push · stake back", why: `${p.pick} ${did}, exactly the ${lineText(p.need)} number, so the bet is refunded (a parlay leg drops out).` };
  if (p.result === "win") {
    const how = fav ? `${p.pick} laid ${pts(p.need)} and ${did}, clearing the number by ${pts(p.coverBy)}.`
      : won ? `${p.pick} took ${pts(p.need)} and won the game outright by ${pts(p.margin)}.`
      : `${p.pick} took ${pts(p.need)} and ${did}, inside the number by ${pts(p.coverBy)}.`;
    return { headline: `Covered by ${r1(p.coverBy)}`, why: `${how} ${model}` };
  }
  const how = fav ? (won ? `${p.pick} laid ${pts(p.need)} and ${did}: the game was won but the number was missed by ${pts(p.coverBy)}.` : `${p.pick} laid ${pts(p.need)} and ${did}, missing the number by ${pts(p.coverBy)}.`)
    : `${p.pick} took ${pts(p.need)} and ${did}, ${pts(p.coverBy)} more than the number allowed.`;
  return { headline: `Missed by ${r1(Math.abs(p.coverBy))}`, why: `${how} ${model}` };
}

export interface SlipResult {
  id: string;
  size: number;
  week: number;
  title: string;
  legs: GradedPick[];
  /** "win" if every leg that was not a push covered, "loss" if any missed, "void" if every leg pushed. */
  result: Result | "void";
  /** Profit per 1 staked at −110 a leg, counting a push as removed from the slip. */
  profit: number;
}

const DECIMAL = 1 + 100 / 110;

export function gradeSlip(legs: GradedPick[]): { result: SlipResult["result"]; profit: number } {
  if (legs.some((l) => l.result === "loss")) return { result: "loss", profit: -1 };
  const live = legs.filter((l) => l.result === "win").length;
  return live ? { result: "win", profit: DECIMAL ** live - 1 } : { result: "void", profit: 0 };
}

/** The most slips a week contributes. The app recommends the best couple of slips of each size, so the back-test takes the strongest few picks of every week. */
export const SLIPS_PER_WEEK = 3;

/**
 * Rebuilds what the parlay builder would have recommended each week, graded: that week's picks ranked by the size of the edge (the history behind the
 * live ranking does not exist for earlier weeks, so the edge is the stand-in), split into non-overlapping slips of `size`, strongest first.
 */
export function backtestSlips(picks: GradedPick[], size: number, perWeek = SLIPS_PER_WEEK): SlipResult[] {
  const weeks = [...new Set(picks.map((p) => p.week))].sort((a, b) => a - b);
  const out: SlipResult[] = [];
  for (const w of weeks) {
    const ranked = picks.filter((p) => p.week === w).sort((a, b) => b.edge - a.edge || a.id.localeCompare(b.id));
    for (let k = 0; k < perWeek; k++) {
      const legs = ranked.slice(k * size, k * size + size);
      if (legs.length < size) break;
      out.push({ id: `${w}-${size}-${k}`, size, week: w, title: k === 0 ? "Top picks" : k === 1 ? "Next best" : `Slip ${k + 1}`, legs, ...gradeSlip(legs) });
    }
  }
  return out;
}

export interface SlipRecord { w: number; l: number; v: number; n: number; pct: number | null; profit: number; roi: number | null }
export const emptySlipRecord = (): SlipRecord => ({ w: 0, l: 0, v: 0, n: 0, pct: null, profit: 0, roi: null });
export function slipRecord(slips: SlipResult[]): SlipRecord {
  const r = emptySlipRecord();
  for (const s of slips) { r.n++; if (s.result === "win") r.w++; else if (s.result === "loss") r.l++; else r.v++; r.profit += s.profit; }
  const played = r.w + r.l;
  r.pct = played ? r.w / played : null;
  r.roi = played ? r.profit / played : null;
  return r;
}

export interface SlipWeek { week: number; label: string; rec: SlipRecord; cumulative: SlipRecord; slips: SlipResult[] }
export function slipWeeks(slips: SlipResult[]): SlipWeek[] {
  const weeks = [...new Set(slips.map((s) => s.week))].sort((a, b) => a - b);
  const running: SlipResult[] = [];
  return weeks.map((w) => {
    const g = slips.filter((s) => s.week === w);
    running.push(...g);
    return { week: w, label: `Wk ${w}`, rec: slipRecord(g), cumulative: slipRecord(running), slips: g };
  });
}

/** What a slip of `size` legs needs to hit to break even at −110 a leg. */
export const slipBreakEven = (size: number) => BREAK_EVEN ** size;
