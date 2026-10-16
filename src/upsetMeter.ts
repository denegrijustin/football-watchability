/**
 * Upset Alert Meter logic. Pure (no site data), so tests can feed it their own games.
 *
 * Teams are compared by their national rank (SP+ for college, NFL+ for the NFL: the same ranks as the game cards). The lower-ranked team is
 * the underdog, and the tier comes from how far apart the two ranks are as a share of the league: a top-5 team against the 120th is "Act of
 * God Required", two teams a few places apart is "Picking the Upset". A game that has gone final is scored the same way: the lower-ranked
 * team winning is an upset. The betting line is shown for reference but plays no part in the tier.
 */
export interface MeterTier { id: 1 | 2 | 3 | 4 | 5; label: string; color: string; short: string }

export const TIERS: MeterTier[] = [
  { id: 1, label: "Act of God Required", short: "Act of God", color: "#3f9f55" },
  { id: 2, label: "Wizardry Needed", short: "Wizardry", color: "#86b83f" },
  { id: 3, label: "A Few Good Bounces", short: "Good Bounces", color: "#d4a63a" },
  { id: 4, label: "Mayhem on the Horizon", short: "Mayhem", color: "#d9722f" },
  { id: 5, label: "Picking the Upset", short: "Pick", color: "#c4303f" },
];

/** Rank gap as a share of the league (places apart / teams in the league) to tier. */
export function tierFor(gapShare: number): MeterTier {
  return TIERS[gapShare >= 0.45 ? 0 : gapShare >= 0.28 ? 1 : gapShare >= 0.14 ? 2 : gapShare >= 0.05 ? 3 : 4];
}

export interface MeterTeam { name: string; abbr: string; logoId: string; color: string | null; espnId?: string | null; rank: number | null; /** offense and defense ranks (1 = best), when known */ o?: number; d?: number }
export interface MeterRow {
  key: string;
  espnId: string | null;
  league: "NFL" | "CFB";
  /** away, home */
  teams: [MeterTeam, MeterTeam];
  /** Index (0 away, 1 home) of the better-ranked team, and how many places ahead of the other it is. */
  favorite: 0 | 1;
  gap: number;
  /** Teams in the league's ranking (for the tier and the "of 138"). */
  of: number;
  /** The betting line in points for the favorite, shown for reference only. */
  line: number | null;
  tier: MeterTier;
  date: string;
  status: "pre" | "live" | "final";
  score: [number, number] | null;
  detail: string;
  /** Only for final games: the lower-ranked team won. For live games: the lower-ranked team is ahead right now. */
  upset: boolean;
  brewing: boolean;
}

interface SlateTeam { name: string; abbr: string; logoId: string; color?: string | null; espnId?: string | null }
export interface SlateLike {
  id: string; espnId: string; league: string; date: string;
  teams: SlateTeam[];
  projected?: { parts?: { id: string; away?: number; home?: number }[] } | null;
}
interface ResultTeam { name: string; abbr: string; logoId: string; color?: string | null; score: number }
export interface ResultLike {
  espnId: string; league: string; week: string; date: string;
  teams: ResultTeam[];
  final: { detail: string };
  forecast: { line: string | null };
}
export interface LiveLike { state: "pre" | "in" | "post"; detail: string; away: number; home: number }

export interface RankSource {
  /** Teams in the league's ranking. */
  of: number;
  /** A team's national rank, or null when it has none (an FCS opponent). */
  rankOf: (t: { name: string; abbr: string; logoId: string; espnId?: string | null }) => number | null;
  /** Offense and defense ranks, if known. */
  detailOf?: (t: { name: string; abbr: string; logoId: string; espnId?: string | null }) => { o?: number; d?: number } | null;
}

/** Order the two teams by rank. A team with no rank (an FCS opponent) sits just below the last ranked team. Null when neither has one. */
function compare(away: MeterTeam, home: MeterTeam, of: number): Pick<MeterRow, "favorite" | "gap" | "tier"> | null {
  if (away.rank == null && home.rank == null) return null;
  const a = away.rank ?? of + 1, h = home.rank ?? of + 1;
  const homeFav = h < a;
  const gap = Math.abs(a - h);
  return { favorite: homeFav ? 1 : 0, gap, tier: tierFor(gap / of) };
}

export function buildRows(input: { league: "NFL" | "CFB"; games: SlateLike[]; results: ResultLike[]; live: Record<string, LiveLike | undefined>; period: string; ranks: RankSource }): MeterRow[] {
  const rows: MeterRow[] = [];
  const seen = new Set<string>();
  const { of, rankOf, detailOf } = input.ranks;
  const mk = (t: SlateTeam | ResultTeam): MeterTeam => ({ name: t.name, abbr: t.abbr, logoId: t.logoId, color: t.color ?? null, espnId: "espnId" in t ? t.espnId : null, rank: null });
  const withRank = (t: MeterTeam): MeterTeam => ({ ...t, rank: rankOf(t), ...(detailOf?.(t) ?? {}) });

  for (const r of input.results) {
    if (r.league !== input.league || r.week !== input.period) continue;
    const [a, h] = r.teams;
    const away = withRank(mk(a)), home = withRank(mk(h));
    const c = compare(away, home, of);
    if (!c) continue;
    const lineNum = /([-+]\d+(?:\.\d+)?)/.exec(r.forecast?.line ?? "");
    const under = (1 - c.favorite) as 0 | 1;
    const sc: [number, number] = [a.score, h.score];
    seen.add(r.espnId);
    rows.push({ ...c, teams: [away, home], of, line: lineNum ? Math.abs(Number(lineNum[1])) : null, key: `r-${r.espnId}`, espnId: r.espnId, league: input.league, date: r.date, status: "final", score: sc, detail: r.final.detail, upset: sc[under] > sc[c.favorite], brewing: false });
  }

  for (const g of input.games) {
    if (g.league !== input.league || seen.has(g.espnId)) continue;
    const [a, h] = g.teams;
    const away = withRank(mk(a)), home = withRank(mk(h));
    const c = compare(away, home, of);
    if (!c) continue;
    const lp = g.projected?.parts?.find((p) => p.id === "line");
    const line = lp?.away != null && lp.home != null ? Math.round(Math.abs(lp.home - lp.away) * 10) / 10 : null;
    const under = (1 - c.favorite) as 0 | 1;
    const lv = input.live[g.espnId];
    const sc: [number, number] | null = lv && lv.state !== "pre" ? [lv.away, lv.home] : null;
    const status = lv?.state === "post" ? "final" : lv?.state === "in" ? "live" : "pre";
    rows.push({
      ...c, teams: [away, home], of, line, key: `g-${g.espnId}`, espnId: g.espnId, league: input.league, date: g.date, status, score: sc,
      detail: lv?.detail ?? "",
      upset: status === "final" && !!sc && sc[under] > sc[c.favorite],
      brewing: status === "live" && !!sc && sc[under] > sc[c.favorite],
    });
  }

  // Biggest mismatch first, like the poster this is modeled on; ties by kickoff.
  return rows.sort((x, y) => y.gap / y.of - x.gap / x.of || x.date.localeCompare(y.date));
}
