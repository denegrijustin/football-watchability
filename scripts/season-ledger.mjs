// The season ledger (src/data/season.json): one compact row per finished game
// with its insanity score, kept for the whole season. results.json only holds
// the last two weeks, so the season ranking reads this file instead.
import { insanity } from "../src/insanity.js";

const MONTHS = ["Jan.", "Feb.", "March", "April", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];
/** "Sept. 24–28, 2026" from a list of ISO datetimes (Eastern dates, like the site's week labels). */
export function periodLabel(dates) {
  const et = (iso) => {
    const [y, m, d] = new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" }).split("-").map(Number);
    return { y, m, d };
  };
  const ds = dates.map(et).sort((p, q) => p.y - q.y || p.m - q.m || p.d - q.d);
  if (!ds.length) return "";
  const [f, l] = [ds[0], ds[ds.length - 1]];
  if (f.m === l.m && f.d === l.d) return `${MONTHS[f.m - 1]} ${f.d}, ${f.y}`;
  if (f.m === l.m) return `${MONTHS[f.m - 1]} ${f.d}–${l.d}, ${l.y}`;
  return `${MONTHS[f.m - 1]} ${f.d}–${MONTHS[l.m - 1]} ${l.d}, ${l.y}`;
}

/**
 * @param {{ id: string, league: string, week: string, date: string, matchup: string,
 *   away: { abbr: string, logoId: string, score: number }, home: { abbr: string, logoId: string, score: number },
 *   wp: [number, number | null][], overtime: boolean }} g
 */
export function ledgerEntry(g) {
  const ins = insanity(g.wp ?? [], { final: true, overtime: g.overtime });
  if (!ins) return null;
  return {
    id: g.id,
    league: g.league,
    week: g.week,
    date: g.date,
    matchup: g.matchup,
    away: g.away,
    home: g.home,
    insanity: ins.score,
    tier: ins.tier.id,
    flips: ins.flips,
    swing: ins.biggestSwing,
    comebackFrom: ins.comebackFrom,
    overtime: !!g.overtime,
    witchingPeriod: ins.witching.period,
  };
}

/** A results.json game as a ledger row (null without a usable win-probability line). */
export const fromResult = (r) =>
  ledgerEntry({
    id: r.espnId,
    league: r.league,
    week: r.week,
    date: r.date,
    matchup: r.matchup,
    away: { abbr: r.teams[0].abbr, logoId: r.teams[0].logoId, score: r.teams[0].score },
    home: { abbr: r.teams[1].abbr, logoId: r.teams[1].logoId, score: r.teams[1].score },
    wp: r.wp,
    overtime: r.final?.overtime,
  });

/** Adds or replaces rows by game id, newest first. */
export function mergeLedger(existing, entries, updated) {
  const byId = new Map((existing?.games ?? []).map((g) => [g.id, g]));
  for (const e of entries) if (e) byId.set(e.id, e);
  const games = [...byId.values()].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  return { updated, games };
}

/** The archive's thinning (results.json `wp`): about 80 points as whole percentages. */
export function thinForArchive(wp) {
  if (!wp?.length) return [];
  const step = Math.max(1, Math.ceil(wp.length / 80));
  const out = wp.filter((_, i) => i % step === 0).map(([p, q]) => [Math.round(p * 100), q]);
  const last = wp[wp.length - 1];
  out.push([Math.round(last[0] * 100), last[1]]);
  return out;
}
