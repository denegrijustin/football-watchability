import type { RecordInfo } from "./cells";

export type DivKey = "FBS" | "FCS" | "D2" | "D3" | "NAIA";
export const DIVISIONS: DivKey[] = ["FBS", "FCS", "D2", "D3", "NAIA"];
export const DIV_LABEL: Record<DivKey, string> = { FBS: "FBS", FCS: "FCS", D2: "Division II", D3: "Division III", NAIA: "NAIA" };

/** Where a value sits in the source workbook. */
export interface Src { sheet: string; row: number }

export interface TeamWeek {
  week: number;
  division: DivKey;
  team: string;
  conf: string | null;
  record: RecordInfo | null;
  sp: number | null; spRk: number | null;
  off: number | null; offRk: number | null;
  def: number | null; defRk: number | null;
  st: number | null; stRk: number | null;
  pctile: number | null;
  lastRk: number | null;
  chg: number | null;
  src: Src;
}

/** A row of the cross-division "TOP 772" sheet (its SP+ scale is not the same as a division tab's). */
export interface TopRow {
  week: number;
  team: string;
  conf: string | null;
  record: RecordInfo | null;
  sp: number | null; spRk: number | null;
  off: number | null; offRk: number | null;
  def: number | null; defRk: number | null;
  division: DivKey | null;
  src: Src;
}

export interface Team {
  id: string;
  name: string;
  division: DivKey;
  weeks: Record<number, TeamWeek>;
  top: Record<number, TopRow>;
  /** Latest week this team appears in. */
  latest: number;
  logo: { local?: string; remote?: string } | null;
}

export interface Projection {
  id: string;
  week: number;
  row: number;
  date: string | null;
  time: string | null;
  game: string;
  /** Derived from the "A at B" / "A vs. B" text. */
  away: string; home: string; neutral: boolean;
  projWinner: string | null;
  projMargin: number | null;
  winProb: number | null;
  projScore: string | null;
  spread: string | null;
  /** Derived from the spread text: the favorite and the points it lays. */
  spreadTeam: string | null; spreadPts: number | null;
  atsPick: string | null;
  spreadDiff: number | null;
  ou: number | null;
  ouPick: string | null;
  ouDiff: number | null;
}

export interface SmallGame {
  id: string;
  week: number;
  division: DivKey;
  row: number;
  date: string | null;
  /** The sub-table heading above the game in the sheet ("FCS vs. FCS", "FCS vs. D2", ...). */
  group: string;
  text: string;
  /** Derived from "Team 24.7, Team 15.8": each side's SP+ rating. */
  sides: { team: string; rating: number }[] | null;
}

export interface GameResult {
  id: string;
  row: number;
  date: string;
  team: string; opp: string;
  win: number | null; pts: number | null; oppPts: number | null; margin: number | null;
  pgwe: number | null; adjMgn: number | null;
}

export interface SeasonLine {
  row: number;
  team: string;
  games: number | null; wins: number | null; secondOrder: number | null; diff: number | null;
  scoringMgn: number | null; adjMgn: number | null; mgnDiff: number | null;
}

export interface PerfRow {
  id: string;
  section: "fbs-fbs" | "fbs-fcs" | "last-year";
  row: number;
  hidden: boolean;
  week: string;
  ats: string | null; atsPct: number | null; atsAbs: number | null; atsMed: number | null;
  ou: string | null; ouPct: number | null; ouAbs: number | null; ouMed: number | null;
  total: boolean;
}

export interface Model {
  weeks: number[];
  latest: number;
  teams: Team[];
  byId: Map<string, Team>;
  /** name -> teams with that name (a few names exist in two divisions). */
  byName: Map<string, Team[]>;
  projections: Projection[];
  smallGames: SmallGame[];
  results: GameResult[];
  /** Finals from ESPN for games the sheet has not recorded yet (the ATS tracker grades with these too). Absent until they load. */
  liveResults?: GameResult[];
  season: SeasonLine[];
  perf: PerfRow[];
  /** Conference lists per division from the latest week. */
  conferences: Record<DivKey, string[]>;
  issues: string[];
}
