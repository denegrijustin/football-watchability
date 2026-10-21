// The shape of src/data/perf-nfl.json and perf-cfb.json (written by scripts/perf/build-*.mjs; the counting rules are in scripts/perf/lib.mjs).
export type PerfLeague = "nfl" | "cfb";

export interface PerfTeam { name: string; abbr: string; conf?: string | null; div?: string; color?: string | null; fbs?: boolean; logoId?: string }
export interface PerfGame { id: string; espn?: string | null; w: number; date: string; home: string; away: string; hs: number; as: number; ot: number; neutral?: number; plays: boolean; fetchedAt?: string }
/** [period, startElapsedSec, startYl, plays, yards, secs, result, offPts, startHow, minYl, garbage] (see DRIVE in lib.mjs). */
export type DriveTuple = [number, number, number, number, number, number, number, number, number, number, number];
/** [period, clock, yards, 1 pass / 0 rush, description, driveNo, garbage]. */
export type BigPlay = [number, string, number, number, string, number, number];

export interface PerfRow {
  /** Team, opponent and game ids (NFL abbreviations, college ESPN team ids). */
  t: string; o: string; g: string; w: number;
  /** 1 home, 0 away, 2 neutral site. */
  h: number; pf: number; pa: number;
  /** Offense count vectors (V in lib.mjs): not garbage time, and garbage time. */
  c: number[]; x: number[];
  d: DriveTuple[]; k: BigPlay[];
  /** Fumbles by this offense, and how many it lost. */
  fu: [number, number];
}

export interface PerfData {
  schema: number; league: PerfLeague; season: number;
  source: { name: string; url: string; license: string; fileModified?: string };
  latestWeek: number;
  config: { explosive: { pass: number; rush: number }; garbageGap: number[]; hasEpa: boolean; hasFumbles: boolean; fcsExcluded?: boolean; populationNote?: string };
  coverage: { games: number; gamesWithPlays: number; missing: string[]; plays: number; partial?: string[]; skippedPlays?: number };
  definitions: Record<string, string>;
  teams: Record<string, PerfTeam>;
  games: PerfGame[];
  rows: PerfRow[];
  contentHash: string;
  /** When the content last changed (not when it was last checked: that is in perf-status.json). */
  dataUpdatedAt?: string;
}

export interface PerfStatusEntry { checkedAt: string; ok: boolean; error?: string; dataUpdatedAt?: string }
export type PerfStatus = Record<string, PerfStatusEntry>;

export type PerfSide = "off" | "def";
export interface PerfSelection {
  team: string | null;
  /** Another team to compare with; null = none. */
  opp: string | null;
  /** Benchmark line: the league average, the comparison team, or nothing. */
  bench: "league" | "opp" | "none";
  season: number | null;
  window: "season" | "recent";
  recentN: number;
  /** "skip" leaves garbage-time plays out everywhere. */
  garbage: "all" | "skip";
  side: PerfSide;
  /** College: count games against non-FBS opponents (they are left out by default). */
  includeFcs: boolean;
  /** Per-tab extras that should survive tab switches (selected game, metric, outcome ...). */
  game: string | null;
  metric: string | null;
}
export const DEFAULT_SELECTION: PerfSelection = { team: null, opp: null, bench: "league", season: null, window: "season", recentN: 4, garbage: "all", side: "off", includeFcs: false, game: null, metric: null };
