import type { Ranks } from "../rankLine";
import logoData from "./logos.json";
import networkData from "./networks.json";
import { fetchData } from "./load";
import { dayOf } from "../tz";
// The slate and the results are fetched before the app starts (see ./load), not bundled with the scripts.
const [slateData, broadcastChecks, resultsData] = await Promise.all([
  fetchData<typeof import("./slate.json")>("slate"),
  fetchData<unknown>("broadcast-checks"),
  fetchData<typeof import("./results.json")>("results"),
]);
export type Game = (typeof import("./slate.json"))["games"][number];
export type Team = Game["teams"][number];
export type League = "NFL" | "CFB";
export type Tier = "elite" | "vgood" | "good" | "watch" | "bg";
type BroadcastCheck = { date: string; broadcast: string; network: string | null; checkedAt: string; source: string };
const checks = broadcastChecks as Record<string, BroadcastCheck>;
export const slate = {
  ...slateData,
  broadcastNote: "TV/streaming uses ESPN listings, with missing or pending channels checked against FOX and CBS Sports. Final channel selections can remain pending; local NFL availability varies.",
  games: slateData.games.map(game => {
    const checked = checks[game.espnId];
    const date = new Date(game.date).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    if (!checked || checked.date !== date || !Number.isFinite(Date.parse(checked.checkedAt)) || Date.now() - Date.parse(checked.checkedAt) > 7 * 864e5 || !/\b(TBA|TBD|pending)\b|\sor\s/i.test(game.broadcast)) return game;
    return { ...game, broadcast: checked.broadcast, network: checked.network } as Game;
  }),
};
/** Logo URLs carry a stamp of the logo set, so they can be cached for a year and still update when one changes. */
export const logos: Record<string, string> = Object.fromEntries(
  Object.entries(logoData as Record<string, string>).map(([id, url]) => [id, url.startsWith("/logos/") ? `${url}?v=${__LOGO_V__}` : url]),
);

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

/** Days with a game on the board for this league, upcoming or finished. */
export function daysFor(league: League) {
  const present = new Set([
    ...results.filter((r) => r.league === league).map((r) => dayOf(r.date)),
    ...slate.games.filter((g) => g.league === league).map((g) => dayOf((g as { date?: string }).date ?? "")),
  ]);
  return DAY_ORDER.filter((d) => present.has(d));
}

// ---------- finished games ----------
export type View = "board" | "grid" | "insanity" | "outlook" | "empire";
export type StatusFilter = "all" | "live" | "final" | "upcoming";
export type Part = { id: string; label: string; max: number; pts: number; note: string };
export type Breakdown = { base: number; parts: Part[] };
export type ResultTeam = {
  name: string;
  logoId: string;
  abbr: string;
  color: string | null;
  record: string;
  ranks?: Ranks;
  advanced?: import("../components/AdvancedStats").Advanced;
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
  /** ESPN venue id and the announced attendance (scripts/attendance.mjs); null/missing when ESPN has none. */
  venueId?: string | null;
  attendance?: number | null;
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
  scoreCheck?: {
    projected: { away: number; home: number; source: string };
    winnerRight: boolean;
    marginMiss: number;
    totalMiss: number;
    miss: number;
    grade: "nailed" | "close" | "off" | "wrong";
    ats: string | null;
    headline: string;
    bullets: string[];
  };
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
        (day === "all" || dayOf(r.date) === day) &&
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
  status: StatusFilter;
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
        (day === "all" || dayOf((game as { date?: string }).date ?? "") === day) &&
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

const norm = (t: string) => t.toLowerCase().replace(/^the\s+/, "").replace(/network/g, "net").replace(/[^a-z0-9+]/g, "");
// Listings that spell a network out differently from its slug or short name.
const NETWORK_ALIASES: Record<string, string> = { cbssn: "cbssportsnet", espnews: "espnnews" };
/**
 * The part of a broadcast listing the network logo doesn't already say: "ESPN / ESPN App" → "" (the logo is ESPN and
 * links to the app), "CBS / Paramount+" → "Paramount+", "TNT" → "". Used beside a logo so the channel isn't named twice.
 */
export function broadcastExtra(broadcast: string, slug?: string | null) {
  const own = new Set([slug ? norm(slug) : "", slug && networks[slug]?.name ? norm(networks[slug].name!) : "", slug ? NETWORK_ALIASES[slug] ?? "" : "", "espnapp"].filter(Boolean));
  return broadcast
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part && !own.has(norm(part)))
    .join(" / ");
}

// ---------- conference and overall rank ----------
export { rankLine, rankTitle, type Ranks } from "../rankLine";
/** Record line without the college conference place, which the rank line covers. */
export function recordLine(record: string, league: string) {
  if (league !== "CFB") return record;
  const [wl, conf] = record.split(" · ");
  return conf && conf !== "Independent" ? `${wl} · ${conf.replace(/ (East|West)$/, "")}` : wl;
}

/**
 * Card/grid color for a team. The build deepens every team color until it is
 * nearly black so light text stays readable, which turns oranges into browns
 * (Tennessee's #FF8200 arrives as #482500). Oranges get their lightness back
 * to a level where white text still reads (about 4.8:1); other hues are as-is.
 */
export function teamColor(hex: string | null | undefined): string | null {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return hex ?? null;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    l = (max + min) / 2,
    d = max - min;
  if (!d) return hex;
  const sat = d / (1 - Math.abs(2 * l - 1));
  const hue =
    (max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  const h = (hue + 360) % 360;
  if (h < 15 || h > 36 || sat < 0.6 || l >= 0.36) return hex;
  const a = sat * Math.min(0.36, 1 - 0.36);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (0.36 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
