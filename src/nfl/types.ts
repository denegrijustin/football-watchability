/** The shape of /data/nfl.json (built by scripts/fetch-nflverse.mjs from nflverse). */
export type Ratings = [sp: number, off: number, def: number, st: number];

export interface NflTeam {
  name: string;
  conf: string;
  div: string;
  color: string;
  /** Pre-game ratings for each week (week w = games before w, plus last season's as the prior). */
  r: Record<string, Ratings>;
}

export interface NflGame {
  id: string;
  espn: string | null;
  week: number;
  type: string;
  date: string;
  time: string | null;
  away: string;
  home: string;
  aS: number | null;
  hS: number | null;
  ot: number;
  neutral: number;
  /** Closing spread: positive = home favored by that many. */
  spread: number | null;
  total: number | null;
  aML: number | null;
  hML: number | null;
  /** The ratings' own margin (home minus away) and total for this game. */
  mm: number | null;
  mt: number | null;
  aRest: number | null;
  hRest: number | null;
  roof: string | null;
  surface: string | null;
  temp: number | null;
  wind: number | null;
  aQB: string | null;
  hQB: string | null;
  aCoach: string | null;
  hCoach: string | null;
  ref: string | null;
  stadium: string | null;
  div: number;
}

export interface NflBacktestBucket { lo: number; hi: number; w: number; l: number; p: number; pct: number }
export interface NflBacktestSeason { season: number; games: number; margin: { model: number; market: number; blend: number; brierModel: number; brierMarket: number }; total: { model: number; market: number } }

export interface NflData {
  version: 1;
  season: number;
  updatedAt: string;
  lastPlayedWeek: number;
  ratingsThroughWeek: number;
  source: { name: string; url: string; license: string };
  params: {
    model: { c0: number; c1: number; sigma: number };
    total: { a0: number; a1: number; sigma: number };
    rho: number;
    market: { sigmaMargin: number; biasMargin: number; sigmaTotal: number; biasTotal: number };
    scale: { k: number; kSt: number; P: number };
    trainedOn: number[];
    hyper: { keep: number; L: number; Lst: number };
  };
  backtest: {
    calibration: {
      games: number;
      leaveOneSeasonOut: {
        margin: { model: number; market: number; blend: number; brierModel: number; brierBlend: number; brierMarket: number };
        total: { model: number; market: number; blend: number };
        bySeason: NflBacktestSeason[];
      };
      ats: { all: { w: number; l: number; p: number; pct: number }; bySeason: Record<string, { w: number; l: number; p: number; pct: number }>; byGap: NflBacktestBucket[] };
    };
  };
  teams: Record<string, NflTeam>;
  games: NflGame[];
  depth: Record<string, { QB?: string[]; RB?: string[]; WR?: string[]; TE?: string[] }>;
  snaps: Record<string, Record<string, { off: [string, string, number, number][]; def: [string, string, number, number][] }>>;
}
