import { results, slate } from "./data";
import { insanity } from "./insanity";
import { currentPlusRanks, plusRankFor, type TeamRef } from "./plusRanks";

/** How completed games can be ordered on every tab that lists them. */
export type DoneSort = "watch" | "insanity" | "rank";
export const DONE_SORTS: { id: DoneSort; label: string; short?: string; note: string }[] = [
  { id: "watch", label: "Watch score", note: "Highest realized watch score first" },
  { id: "insanity", label: "Most insane", note: "Highest insanity score first" },
  { id: "rank", label: "Highest ranked", short: "Ranked", note: "Best-ranked team first (the SP+ / NFL+ rank beside each team)" },
];

/** What a sort needs to know about a game, whichever list it comes from. */
export type DoneRef = { id: string | null | undefined; league: string; teams: TeamRef[]; /** ranks already known for the teams (the Upset Meter's), in place of the current SP+ / NFL+ ones */ ranks?: (number | null)[] };

type Keys = { watch: number; insanity: number; forecast: number };
let byId: Map<string, Keys> | null = null;
/** Insanity scores from the season ledger, which reaches back past the archive's last two weeks (set once a tab has loaded it). */
const ledgerInsanity = new Map<string, number>();
export function registerLedger(games: { id: string; insanity: number }[]) {
  for (const g of games) ledgerInsanity.set(String(g.id), g.insanity);
}

function keys(id: string | null | undefined): Keys {
  if (!byId) {
    byId = new Map();
    for (const r of results) {
      byId.set(r.espnId, {
        watch: r.actual.score,
        forecast: r.forecast.score,
        insanity: insanity(r.wp, { final: true, overtime: r.final.overtime })?.score ?? -1,
      });
    }
  }
  const k = byId.get(String(id ?? ""));
  if (k) return k;
  // Not in the archive: only the ledger knows it (an earlier week), and it has the insanity score but no watch score.
  return { watch: -1, forecast: forecastScoreOf(id) ?? -1, insanity: ledgerInsanity.get(String(id ?? "")) ?? -1 };
}

/** The watch score forecast before kickoff (the archive keeps it with the result; a game not yet archived still has it on the slate). */
export const forecastScoreOf = (id: string | null | undefined): number | null => {
  const key = String(id ?? "");
  const r = results.find((x) => x.espnId === key);
  if (r) return r.forecast.score;
  const g = slate.games.find((x) => x.espnId === key);
  return g ? g.score : null;
};

/** The game's watch score, or null when the archive no longer holds it (an earlier week). */
export const watchScoreOf = (id: string | null | undefined): number | null => {
  const w = keys(id).watch;
  return w >= 0 ? w : null;
};

/** The SP+ (college) or NFL+ (NFL) rank of each team, in the order given; null when a team has none. */
export const teamRanksOf = (ref: DoneRef): (number | null)[] => ref.ranks ?? ref.teams.map((t) => plusRankFor(currentPlusRanks(), ref.league, t)?.n ?? null);

/** Higher is better: the better-ranked team decides, the other team's rank breaks a tie, and a game with no ranked team sorts last. */
function rankKey(ref: DoneRef): number {
  const n = teamRanksOf(ref).filter((x): x is number => x != null);
  if (!n.length) return -Infinity;
  const worst = n.length === 2 ? Math.max(...n) : 9999;
  return -(Math.min(...n) * 10000 + worst);
}

/** Compare two finished games under a sort; ties fall back to the other measures, then to the caller's own order. */
export function compareDone(by: DoneSort, a: DoneRef, b: DoneRef) {
  const ka = keys(a.id), kb = keys(b.id);
  const val = (k: Keys, r: DoneRef, m: "watch" | "forecast" | "insanity" | "rank") => (m === "rank" ? rankKey(r) : k[m]);
  const order: ("watch" | "forecast" | "insanity" | "rank")[] = by === "watch" ? ["watch", "forecast", "insanity"] : by === "rank" ? ["rank", "watch", "insanity"] : ["insanity", "watch"];
  for (const m of order) {
    const x = val(ka, a, m), y = val(kb, b, m);
    if (x !== y) return y - x || 0;
  }
  return 0;
}
