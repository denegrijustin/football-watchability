/**
 * Real players and real colors for a team, from ESPN's public feeds (the same source as the rest of the board): the team record for its
 * true colors, the roster for names and positions, and the season leaders for who actually carries the ball and catches the passes.
 * Everything is fetched when a game is simulated and cached; if any piece fails the simulation still runs with generic names.
 */
import type { Roster } from "./engine";
import type { League } from "../data";

const SPORT: Record<League, string> = { NFL: "nfl", CFB: "college-football" };
const cache = new Map<string, Promise<TeamInfo>>();

export interface TeamInfo { color?: string; alt?: string; roster: Roster }

async function getJson(url: string): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 9000);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

const idOf = (ref: string | undefined) => ref?.match(/athletes\/(\d+)/)?.[1];

interface Raw {
  color: string | null;
  alt: string | null;
  people: { id: string; name: string; pos: string }[];
  leaders: Record<"passingYards" | "rushingYards" | "receivingYards", { id: string; w: number }[]>;
}

/** The trimmed shape, from our own /api/teaminfo (a Cloudflare Pages Function over ESPN) or, failing that, straight from ESPN. */
async function loadRaw(league: League, id: string, season: number): Promise<Raw> {
  try {
    return await getJson(`/api/teaminfo?league=${league === "NFL" ? "nfl" : "cfb"}&id=${id}&season=${season}`);
  } catch {
    /* no function here (local preview): ask ESPN directly */
  }
  const sport = SPORT[league];
  const [team, roster, leaders] = await Promise.all([
    getJson(`https://site.api.espn.com/apis/site/v2/sports/football/${sport}/teams/${id}`).catch(() => null),
    getJson(`https://site.api.espn.com/apis/site/v2/sports/football/${sport}/teams/${id}/roster`).catch(() => null),
    getJson(`https://sports.core.api.espn.com/v2/sports/football/leagues/${sport}/seasons/${season}/types/2/teams/${id}/leaders`).catch(() => null),
  ]);
  const people: Raw["people"] = [];
  for (const grp of roster?.athletes ?? []) for (const a of grp.items ?? []) people.push({ id: String(a.id), name: a.shortName ?? a.displayName, pos: a.position?.abbreviation ?? "" });
  const cat = (name: string) =>
    ((leaders?.categories ?? []).find((c: any) => c.name === name)?.leaders ?? [])
      .map((l: any) => ({ id: idOf(l.athlete?.$ref) ?? "", w: Number(l.value) || 0 }))
      .filter((x: { id: string }) => x.id)
      .slice(0, 10);
  return {
    color: team?.team?.color ?? null,
    alt: team?.team?.alternateColor ?? null,
    people,
    leaders: { passingYards: cat("passingYards"), rushingYards: cat("rushingYards"), receivingYards: cat("receivingYards") },
  };
}

async function load(league: League, id: string, season: number): Promise<TeamInfo> {
  const raw = await loadRaw(league, id, season);
  const hex = (c?: string | null) => (c && /^[0-9a-f]{6}$/i.test(c) ? `#${c.toLowerCase()}` : undefined);
  const info: TeamInfo = { roster: {}, color: hex(raw.color), alt: hex(raw.alt) };
  const people = new Map(raw.people.map((x) => [x.id, x]));
  const cat = (name: keyof Raw["leaders"]) => (raw.leaders?.[name] ?? []).filter((x) => people.has(x.id));
  const pass = cat("passingYards")[0];
  info.roster.qb = pass ? people.get(pass.id)!.name : raw.people.find((p) => p.pos === "QB")?.name;
  const rush = cat("rushingYards").filter((x) => people.get(x.id)!.pos !== "QB").slice(0, 4);
  if (rush.length) info.roster.rushers = rush.map((x) => ({ name: people.get(x.id)!.name, w: Math.max(x.w, 20) }));
  const rec = cat("receivingYards").slice(0, 7);
  if (rec.length) {
    info.roster.receivers = rec.map((x) => {
      const p = people.get(x.id)!;
      return { name: p.name, w: Math.max(x.w, 20), pos: p.pos === "TE" ? ("TE" as const) : p.pos === "RB" || p.pos === "FB" ? ("RB" as const) : ("WR" as const) };
    });
  }
  return info;
}

/** Colors, names and weights for one team. Never rejects: a failed lookup gives an empty roster. */
export function fetchTeamInfo(league: League, id: string, season: number): Promise<TeamInfo> {
  const key = `${league}:${id}:${season}`;
  let p = cache.get(key);
  if (!p) {
    p = load(league, id, season).catch(() => ({ roster: {} }));
    cache.set(key, p);
  }
  return p;
}
