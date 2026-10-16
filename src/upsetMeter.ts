/**
 * Upset Alert Meter logic. Pure (no site data), so tests can feed it their own games.
 *
 * Every game gets the chance its underdog wins, from the board's blended pre-game win probability (the betting line and ESPN's predictor).
 * That chance maps to one of five tiers, drawn as a bar that fills a fifth at a time. A game that has gone final is scored against the same
 * pre-game number: if the underdog won, it is an upset.
 */
export interface MeterTier { id: 1 | 2 | 3 | 4 | 5; label: string; color: string; short: string }

export const TIERS: MeterTier[] = [
  { id: 1, label: "Act of God Required", short: "Act of God", color: "#3f9f55" },
  { id: 2, label: "Wizardry Needed", short: "Wizardry", color: "#86b83f" },
  { id: 3, label: "A Few Good Bounces", short: "Good Bounces", color: "#d4a63a" },
  { id: 4, label: "Mayhem on the Horizon", short: "Mayhem", color: "#d9722f" },
  { id: 5, label: "Picking the Upset", short: "Pick", color: "#c4303f" },
];

/** Underdog win chance (percent) to tier. Under 8% needs a miracle; 44% and up is a coin flip worth picking. */
export function tierFor(upsetPct: number): MeterTier {
  return TIERS[upsetPct < 8 ? 0 : upsetPct < 20 ? 1 : upsetPct < 32 ? 2 : upsetPct < 44 ? 3 : 4];
}

export interface MeterTeam { name: string; abbr: string; logoId: string; color: string | null; rank: number | null }
export interface MeterRow {
  key: string;
  espnId: string | null;
  league: "NFL" | "CFB";
  /** away, home */
  teams: [MeterTeam, MeterTeam];
  /** Index (0 away, 1 home) of the favorite, and the points they are favored by (null when no line). */
  favorite: 0 | 1;
  line: number | null;
  upsetPct: number;
  tier: MeterTier;
  date: string;
  status: "pre" | "live" | "final";
  score: [number, number] | null;
  detail: string;
  /** Only for final games: the underdog won. For live games: the underdog is ahead right now. */
  upset: boolean;
  brewing: boolean;
}

interface SlateTeam { name: string; abbr: string; logoId: string; color?: string | null; rankings?: string[] }
export interface SlateLike {
  id: string; espnId: string; league: string; date: string;
  teams: SlateTeam[];
  winProb?: { home?: number | null } | null;
  projected?: { parts?: { id: string; away?: number; home?: number }[] } | null;
}
interface ResultTeam { name: string; abbr: string; logoId: string; color?: string | null; score: number }
export interface ResultLike {
  espnId: string; league: string; week: string; date: string;
  teams: ResultTeam[];
  final: { detail: string };
  forecast: { pHome: number | null; line: string | null };
}
export interface LiveLike { state: "pre" | "in" | "post"; detail: string; away: number; home: number }

/** The AP rank in a team's ranking chips ("AP #5", "▲ AP #7"); NFL teams have none. */
export function apRank(rankings?: string[]): number | null {
  for (const r of rankings ?? []) {
    const m = /AP\s*#(\d+)/.exec(r);
    if (m) return Number(m[1]);
  }
  return null;
}

const asPct = (p: number) => (p <= 1 ? p * 100 : p);

function build(parts: { away: MeterTeam; home: MeterTeam; pHome: number; line: number | null }): Pick<MeterRow, "teams" | "favorite" | "line" | "upsetPct" | "tier"> {
  const homeFav = parts.pHome >= 50;
  const upsetPct = Math.round((homeFav ? 100 - parts.pHome : parts.pHome) * 10) / 10;
  return { teams: [parts.away, parts.home], favorite: homeFav ? 1 : 0, line: parts.line, upsetPct, tier: tierFor(upsetPct) };
}

export function buildRows(input: { league: "NFL" | "CFB"; games: SlateLike[]; results: ResultLike[]; live: Record<string, LiveLike | undefined>; period: string }): MeterRow[] {
  const rows: MeterRow[] = [];
  const seen = new Set<string>();

  for (const r of input.results) {
    if (r.league !== input.league || r.week !== input.period || r.forecast?.pHome == null) continue;
    const [a, h] = r.teams;
    const lineNum = /([-+]\d+(?:\.\d+)?)/.exec(r.forecast.line ?? "");
    const base = build({
      away: { name: a.name, abbr: a.abbr, logoId: a.logoId, color: a.color ?? null, rank: null },
      home: { name: h.name, abbr: h.abbr, logoId: h.logoId, color: h.color ?? null, rank: null },
      pHome: asPct(r.forecast.pHome),
      line: lineNum ? Math.abs(Number(lineNum[1])) : null,
    });
    const under = (1 - base.favorite) as 0 | 1;
    const sc: [number, number] = [a.score, h.score];
    seen.add(r.espnId);
    rows.push({ ...base, key: `r-${r.espnId}`, espnId: r.espnId, league: input.league, date: r.date, status: "final", score: sc, detail: r.final.detail, upset: sc[under] > sc[base.favorite], brewing: false });
  }

  for (const g of input.games) {
    if (g.league !== input.league || seen.has(g.espnId) || g.winProb?.home == null) continue;
    const [a, h] = g.teams;
    const lp = g.projected?.parts?.find((p) => p.id === "line");
    const margin = lp?.away != null && lp.home != null ? Math.round(Math.abs(lp.home - lp.away) * 10) / 10 : null;
    const base = build({
      away: { name: a.name, abbr: a.abbr, logoId: a.logoId, color: a.color ?? null, rank: apRank(a.rankings) },
      home: { name: h.name, abbr: h.abbr, logoId: h.logoId, color: h.color ?? null, rank: apRank(h.rankings) },
      pHome: asPct(g.winProb.home),
      line: margin,
    });
    const under = (1 - base.favorite) as 0 | 1;
    const lv = input.live[g.espnId];
    const sc: [number, number] | null = lv && lv.state !== "pre" ? [lv.away, lv.home] : null;
    const status = lv?.state === "post" ? "final" : lv?.state === "in" ? "live" : "pre";
    rows.push({
      ...base, key: `g-${g.espnId}`, espnId: g.espnId, league: input.league, date: g.date, status, score: sc,
      detail: lv?.detail ?? "",
      upset: status === "final" && !!sc && sc[under] > sc[base.favorite],
      brewing: status === "live" && !!sc && sc[under] > sc[base.favorite],
    });
  }

  // Most lopsided first, like the poster this is modeled on; ties by kickoff.
  return rows.sort((x, y) => x.upsetPct - y.upsetPct || x.date.localeCompare(y.date));
}
