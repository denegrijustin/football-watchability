import slateData from "./slate.json";
import logoData from "./logos.json";
import networkData from "./networks.json";
import resultsData from "./results.json";
export type Game = (typeof slateData.games)[number];
export type Team = Game["teams"][number];
export type League = "NFL" | "CFB";
export type Tier = "elite" | "vgood" | "good" | "watch" | "bg";
export const slate = slateData;
export const logos: Record<string, string> = logoData;

/** Display labels and score floors for each color tier, best first. */
export const tiers: { id: Tier; label: string; min: number }[] = [
  { id: "elite", label: "Must watch", min: 90 },
  { id: "vgood", label: "Very good", min: 82 },
  { id: "good", label: "Good", min: 74 },
  { id: "watch", label: "Watchable", min: 64 },
  { id: "bg", label: "Background", min: 0 },
];
export const tierLabel = (tier: string) =>
  tiers.find((t) => t.id === tier)?.label ?? tier;

/** Score filters offered in the UI. */
export const scoreFilters = [
  { id: 0, label: "All games" },
  { id: 82, label: "Very good+" },
  { id: 90, label: "Must watch" },
];

const DAY_ORDER = ["Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon"];
const DAY_NAMES: Record<string, string> = {
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
  Mon: "Monday",
};
export const dayName = (d: string) => DAY_NAMES[d] ?? d;

export type MetaInfo = {
  day: string;
  time: string;
  line: string | null;
  venue: string;
};

/**
 * `meta` is "Sun 4:25 ET · Must Watch · Ravens -2.5 • O/U 52.5 · Arlington, TX"
 * (college games omit the betting line). The second part repeats the tier
 * label, so it is dropped in favor of the score-derived tier.
 */
export function parseMeta(meta: string): MetaInfo {
  const parts = meta.split(" · ").map((p) => p.trim());
  const [kickoff = "", , ...rest] = parts;
  const [day = "", ...time] = kickoff.split(" ");
  const venue = rest.length ? rest[rest.length - 1] : "";
  const line = rest.length > 1 ? rest.slice(0, -1).join(" · ") : null;
  return { day, time: time.join(" "), line, venue };
}

/** "▲ AP #17" → "#17", "AP NR" → "NR" */
export const cleanRank = (rank: string) =>
  rank.replace(/^[▲▼]\s*/, "").replace(/^(AP|PR)\s+/, "");

/** "Δ +3" → 3 */
export const deltaValue = (delta: string) =>
  Number(delta.replace(/[^\d+-]/g, "")) || 0;

export function daysFor(league: League, view: View = "upcoming") {
  const present = new Set(
    view === "final"
      ? results.filter((r) => r.league === league).map((r) => r.day)
      : slate.games
          .filter((g) => g.league === league)
          .map((g) => parseMeta(g.meta).day),
  );
  return DAY_ORDER.filter((d) => present.has(d));
}

// ---------- finished games ----------
export type View = "upcoming" | "final";
export type Part = { id: string; label: string; max: number; pts: number; note: string };
export type Breakdown = { base: number; parts: Part[] };
export type ResultTeam = {
  name: string;
  logoId: string;
  abbr: string;
  color: string | null;
  record: string;
  score: number;
  linescores: number[];
};
export type Result = {
  espnId: string;
  league: League;
  week: string;
  date: string;
  day: string;
  time: string;
  matchup: string;
  conferences: string[];
  broadcast: string;
  network: string | null;
  venue: string;
  teams: ResultTeam[];
  final: { detail: string; overtime: boolean };
  forecast: {
    score: number;
    tier: string;
    base: number;
    parts: Part[] | null;
    line: string | null;
    pHome: number | null;
    take: string | null;
    source: "frozen" | "published" | "reconstructed";
  };
  actual: { score: number; tier: string; base: number; parts: Part[] };
  delta: number;
  readout: { headline: string; bullets: string[] };
  /** Home win probability (0–100) and quarter, thinned to ~80 points. */
  wp: [number, number | null][];
};
export const results = resultsData.games as unknown as Result[];

/** Weeks with results, newest first. */
export const resultWeeks = [...new Set(results.map((r) => r.week))];

export function filterResults({
  league,
  conference,
  query,
  day = "all",
  minScore = 0,
}: Partial<FilterState> & { league: League }) {
  const q = (query ?? "").trim().toLowerCase();
  return results
    .filter(
      (r) =>
        r.league === league &&
        (league === "NFL" || !conference || conference === "all-fbs" || r.conferences.includes(conference)) &&
        (day === "all" || r.day === day) &&
        r.actual.score >= minScore &&
        `${r.matchup} ${r.broadcast} ${r.venue}`.toLowerCase().includes(q),
    )
    .sort((a, b) => b.actual.score - a.actual.score);
}

export type FilterState = {
  league: League;
  conference: string;
  query: string;
  day: string;
  minScore: number;
};

export function filterGames({
  league,
  conference,
  query,
  day = "all",
  minScore = 0,
}: Partial<FilterState> & { league: League }) {
  const q = (query ?? "").trim().toLowerCase();
  return slate.games
    .filter(
      (game) =>
        game.league === league &&
        (league === "NFL" ||
          !conference ||
          conference === "all-fbs" ||
          (game.conferences as string[]).includes(conference)) &&
        (day === "all" || parseMeta(game.meta).day === day) &&
        game.score >= minScore &&
        `${game.matchup} ${game.broadcast} ${game.meta}`
          .toLowerCase()
          .includes(q),
    )
    .sort((a, b) => b.score - a.score);
}

/** Network logo path for a slate `network` slug, if we have one. */
const networks = networkData as Record<string, { src: string; name?: string }>;
export const networkLogo = (slug?: string | null) => (slug ? networks[slug]?.src ?? null : null);
