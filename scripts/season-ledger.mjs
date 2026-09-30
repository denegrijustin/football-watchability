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
    ...(g.mvp ? { mvp: g.mvp } : {}),
  };
}

/**
 * Player of the game from ESPN's game leaders (passing, rushing, receiving,
 * sacks, tackles for each team): yards, touchdowns, catches, sacks and
 * tackles score up, interceptions down, and the winning side gets a 25% edge.
 * Returns { name, short, pos, jersey, headshot, side, line, category } or null.
 */
export function mvpOf(summary, winner) {
  const num = (re, s) => Number((re.exec(s) ?? [])[1] ?? 0);
  const comps = summary?.header?.competitions?.[0]?.competitors ?? [];
  const sideOf = (teamId) => comps.find((c) => c.team?.id === teamId)?.homeAway ?? null;
  let best = null;
  for (const t of summary?.leaders ?? []) {
    const side = sideOf(t.team?.id);
    for (const cat of t.leaders ?? []) {
      const l = cat.leaders?.[0];
      if (!l?.athlete) continue;
      const s = String(l.displayValue ?? "");
      let v = 0;
      switch (cat.name) {
        case "passingYards":
          v = num(/(\d+) YDS/, s) * 0.04 + num(/(\d+) TD/, s) * 4 - num(/(\d+) INT/, s) * 4;
          break;
        case "rushingYards":
          v = num(/(\d+) YDS/, s) * 0.1 + num(/(\d+) TD/, s) * 6;
          break;
        case "receivingYards":
          v = num(/(\d+) YDS/, s) * 0.1 + num(/(\d+) REC/, s) * 0.5 + num(/(\d+) TD/, s) * 6;
          break;
        case "sacks":
          v = Number(l.value ?? s) * 4;
          break;
        case "totalTackles":
          v = Number(l.value ?? s) * 0.6;
          break;
        default:
          continue;
      }
      if (winner && side === winner) v *= 1.25;
      const unit = cat.name === "sacks" ? " sacks" : cat.name === "totalTackles" ? " tackles" : "";
      if (!best || v > best.v)
        best = {
          v,
          name: l.athlete.displayName,
          short: l.athlete.shortName ?? l.athlete.displayName,
          pos: l.athlete.position?.abbreviation ?? null,
          jersey: l.athlete.jersey ?? null,
          headshot: l.athlete.headshot?.href ?? null,
          side,
          line: `${s}${unit}`,
          category: cat.name,
        };
    }
  }
  if (!best) return null;
  const { v, ...rest } = best;
  void v;
  return rest;
}

/** A results.json game as a ledger row (null without a usable win-probability line). */
export const fromResult = (r) =>
  ledgerEntry({
    id: r.espnId,
    league: r.league,
    week: r.week,
    date: r.date,
    matchup: r.matchup,
    away: { abbr: r.teams[0].abbr, logoId: r.teams[0].logoId, score: r.teams[0].score, color: r.teams[0].color ?? null },
    home: { abbr: r.teams[1].abbr, logoId: r.teams[1].logoId, score: r.teams[1].score, color: r.teams[1].color ?? null },
    wp: r.wp,
    overtime: r.final?.overtime,
    mvp: r.mvp ?? null,
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
