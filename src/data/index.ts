import slateData from "./slate.json";
import logoData from "./logos.json";
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

const DAY_ORDER = ["Thu", "Fri", "Sat", "Sun", "Mon"];
const DAY_NAMES: Record<string, string> = {
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

export function daysFor(league: League) {
  const present = new Set(
    slate.games
      .filter((g) => g.league === league)
      .map((g) => parseMeta(g.meta).day),
  );
  return DAY_ORDER.filter((d) => present.has(d));
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
          game.conferences.includes(conference)) &&
        (day === "all" || parseMeta(game.meta).day === day) &&
        game.score >= minScore &&
        `${game.matchup} ${game.broadcast} ${game.meta}`
          .toLowerCase()
          .includes(q),
    )
    .sort((a, b) => b.score - a.score);
}
