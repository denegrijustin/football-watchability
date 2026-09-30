import { results, slate, cleanRank, type League, type Ranks, type Tier } from "./index";
import { dateOf, dayOf, minutesOf } from "../tz";

/** One game placed on the TV grid (upcoming or already final). */
export type GridGame = {
  key: string;
  espnId: string;
  league: League;
  start: Date;
  minutes: number;
  network: string;
  netLabel: string;
  matchup: string;
  score: number;
  tier: Tier;
  final: string | null;
  sides: { abbr: string; name: string; logoId: string; color: string | null; tag: string | null; ranks?: Ranks }[];
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

// Days and minutes follow the site's chosen time zone (Central by default).
const etDay = (d: Date) => dayOf(d);
export const etDate = (d: Date) => dateOf(d);
const etMinutes = (d: Date) => minutesOf(d);

export function gridGames(): GridGame[] {
  const live: GridGame[] = slate.games.map((g) => {
    const teams = g.teams as unknown as {
      name: string;
      abbr?: string;
      logoId: string;
      color?: string | null;
      record: string;
      rankings: string[];
      ranks?: Ranks;
    }[];
    return {
      key: g.id,
      espnId: g.espnId,
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
          ranks: t.ranks,
        };
      }),
    };
  });
  const done: GridGame[] = results
    .filter((r) => r.week === slate.period)
    .map((r) => ({
      key: `r-${r.espnId}`,
      espnId: r.espnId,
      league: r.league,
      start: new Date(r.date),
      minutes: r.league === "NFL" ? 195 : 210,
      network: r.network ?? "tba",
      netLabel: netLabel(r.broadcast),
      matchup: r.matchup,
      score: r.actual.score,
      tier: r.actual.tier as Tier,
      final: `${r.teams[0].score}–${r.teams[1].score}${r.final.overtime ? " OT" : ""}`,
      sides: r.teams.map((t) => ({ abbr: t.abbr, name: t.name, logoId: t.logoId, color: t.color, tag: t.record, ranks: t.ranks })),
    }));
  return [...live, ...done].filter((g) => !Number.isNaN(g.start.getTime()));
}

/**
 * A game's TV day and minute on that day's grid. Kickoffs before 4am local
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

export const GRID_SLOT = 30; // minutes per time step
export type PlacedGame = GridGame & { minute: number; lane: number };

/**
 * Lays one day's games out as a TV grid: a lane per network (extra lanes when a
 * network carries overlapping games) and the time range they cover. Shared by
 * the on-screen grid and the JPG export so both always match.
 */
export function layoutGrid(games: GridGame[]) {
  const nets = [...new Set(games.map((g) => g.network))].sort((a, b) => netRank(a) - netRank(b) || a.localeCompare(b));
  const lanes: { network: string; label: string }[] = [];
  const placed: PlacedGame[] = [];
  for (const net of nets) {
    const ends: number[] = [];
    const first = lanes.length;
    const gs = games
      .filter((g) => g.network === net)
      .map((g) => ({ ...g, minute: slot(g.start).minute }))
      .sort((a, b) => a.minute - b.minute);
    for (const g of gs) {
      let lane = ends.findIndex((end) => end <= g.minute);
      if (lane < 0) {
        lane = ends.length;
        ends.push(0);
        lanes.push({ network: net, label: g.netLabel });
      }
      ends[lane] = g.minute + g.minutes;
      placed.push({ ...g, lane: first + lane });
    }
  }
  const startMin = placed.length ? Math.floor(Math.min(...placed.map((g) => g.minute)) / GRID_SLOT) * GRID_SLOT : 12 * 60;
  const endMin = placed.length
    ? Math.ceil(Math.max(...placed.map((g) => g.minute + g.minutes)) / GRID_SLOT) * GRID_SLOT
    : startMin + 4 * 60;
  return { lanes, placed, startMin, endMin, steps: (endMin - startMin) / GRID_SLOT };
}
