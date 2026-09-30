import { results, slate, cleanRank, type League, type Tier } from "./index";

/** One game placed on the TV grid (upcoming or already final). */
export type GridGame = {
  key: string;
  league: League;
  start: Date;
  minutes: number;
  network: string;
  netLabel: string;
  matchup: string;
  score: number;
  tier: Tier;
  final: string | null;
  sides: { abbr: string; name: string; logoId: string; color: string | null; tag: string | null }[];
};

// Broadcast order across the grid: broadcast networks, then ESPN family,
// FOX cable, conference networks, other cable, then streaming.
const ORDER = [
  "abc", "cbs", "fox", "nbc", "espn", "espn2", "espnu", "fs1", "fs2", "cbssn", "acc-network", "btn",
  "sec-network", "usa-net", "cw", "tnt", "nfl-net", "prime-video", "peacock", "espn-plus", "mw-plus",
];
export const netRank = (slug: string) => {
  const i = ORDER.indexOf(slug);
  return i < 0 ? ORDER.length : i;
};
const netLabel = (broadcast: string) =>
  broadcast
    .split(" / ")[0]
    .replace(/^Mountain West Network \(MW\+\)$/, "MW+")
    .replace(/^CBS Sports Network$/, "CBSSN")
    .replace(/^ACC Network$/, "ACCN")
    .replace(/^SEC Network$/, "SECN")
    .replace(/^USA Network$/, "USA")
    .replace(/^NFL Network$/, "NFL Net");

const etDay = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", timeZone: "America/New_York" });
export const etDate = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
/** Minutes after midnight Eastern. */
export const etMinutes = (d: Date) => {
  const [h, m] = d
    .toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" })
    .split(":")
    .map(Number);
  return h * 60 + m;
};

export function gridGames(): GridGame[] {
  const live: GridGame[] = slate.games.map((g) => {
    const teams = g.teams as unknown as {
      name: string;
      abbr?: string;
      logoId: string;
      color?: string | null;
      record: string;
      rankings: string[];
    }[];
    return {
      key: g.id,
      league: g.league as League,
      start: new Date((g as { date?: string }).date ?? ""),
      minutes: g.league === "NFL" ? 195 : 210,
      network: (g as { network?: string | null }).network ?? "tba",
      netLabel: netLabel(g.broadcast),
      matchup: g.matchup,
      score: g.score,
      tier: g.tier as Tier,
      final: null,
      sides: teams.map((t) => {
        const r = cleanRank(t.rankings[0] ?? "");
        return {
          abbr: t.abbr ?? t.name,
          name: t.name,
          logoId: t.logoId,
          color: t.color ?? null,
          tag: g.league === "CFB" && r.startsWith("#") ? r : t.record.split(" · ")[0],
        };
      }),
    };
  });
  const done: GridGame[] = results
    .filter((r) => r.week === slate.period)
    .map((r) => ({
      key: `r-${r.espnId}`,
      league: r.league,
      start: new Date(r.date),
      minutes: r.league === "NFL" ? 195 : 210,
      network: r.network ?? "tba",
      netLabel: netLabel(r.broadcast),
      matchup: r.matchup,
      score: r.actual.score,
      tier: r.actual.tier as Tier,
      final: `${r.teams[0].score}–${r.teams[1].score}${r.final.overtime ? " OT" : ""}`,
      sides: r.teams.map((t) => ({ abbr: t.abbr, name: t.name, logoId: t.logoId, color: t.color, tag: t.record })),
    }));
  return [...live, ...done].filter((g) => !Number.isNaN(g.start.getTime()));
}

/**
 * A game's TV day and minute on that day's grid. Kickoffs before 4am Eastern
 * belong to the previous night (minute 1440+).
 */
export const slot = (d: Date) => {
  const m = etMinutes(d);
  if (m >= 240) return { date: etDate(d), day: etDay(d), minute: m };
  const prev = new Date(d.getTime() - 5 * 3600e3);
  return { date: etDate(prev), day: etDay(prev), minute: m + 1440 };
};

export const gridDays = (games: GridGame[]) => {
  const seen = new Map<string, string>();
  for (const g of [...games].sort((a, b) => a.start.getTime() - b.start.getTime())) {
    const s = slot(g.start);
    seen.set(s.date, s.day);
  }
  return [...seen].map(([date, day]) => ({ date, day }));
};
