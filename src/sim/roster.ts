/**
 * Real players and real colors for a team, from ESPN's public feeds (the same source as the rest of the board): the team record for its
 * true colors, the roster for names and positions, and the season leaders for who actually carries the ball and catches the passes.
 * Everything is fetched when a game is simulated and cached; if any piece fails the simulation still runs with generic names.
 */
import { fetchData } from "../data/load";
import type { Roster } from "./engine";
import type { League } from "../data";

const SPORT: Record<League, string> = { NFL: "nfl", CFB: "college-football" };
const cache = new Map<string, Promise<TeamInfo>>();

export interface TeamInfo { color?: string; alt?: string; roster: Roster; /** the team's quarterbacks on its roster, for matching a known starter by name */ qbs?: { name: string; exp: number }[] }

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

export interface Raw {
  color: string | null;
  alt: string | null;
  people: { id: string; name: string; pos: string; exp?: number }[];
  leaders: Record<"passingYards" | "rushingYards" | "receivingYards", { id: string; w: number }[]>;
}

const isComplete = (r: Raw | null): boolean => !!r && Array.isArray(r.people) && r.people.length > 0 && !!r.leaders?.passingYards?.length;

/** Straight from ESPN. Every piece is optional: a feed that fails just leaves its part empty. */
async function directRaw(league: League, id: string, season: number): Promise<Raw> {
  const sport = SPORT[league];
  const [team, roster, leaders] = await Promise.all([
    getJson(`https://site.api.espn.com/apis/site/v2/sports/football/${sport}/teams/${id}`).catch(() => null),
    getJson(`https://site.api.espn.com/apis/site/v2/sports/football/${sport}/teams/${id}/roster`).catch(() => null),
    getJson(`https://sports.core.api.espn.com/v2/sports/football/leagues/${sport}/seasons/${season}/types/2/teams/${id}/leaders`).catch(() => null),
  ]);
  const people: Raw["people"] = [];
  for (const grp of roster?.athletes ?? []) for (const a of grp.items ?? []) people.push({ id: String(a.id), name: a.shortName ?? a.displayName, pos: a.position?.abbreviation ?? "", exp: a.experience?.years ?? 0 });
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

/**
 * Our own /api/teaminfo (a Cloudflare Pages Function over ESPN) first; if it is missing or its answer is partial (ESPN dropped a feed on the
 * server's side), the browser asks ESPN directly and fills in whatever the answer lacked.
 */
async function loadRaw(league: League, id: string, season: number): Promise<Raw> {
  let fromFn: Raw | null = null;
  try {
    fromFn = await getJson(`/api/teaminfo?league=${league === "NFL" ? "nfl" : "cfb"}&id=${id}&season=${season}`);
  } catch {
    /* no function here (local preview): ask ESPN directly */
  }
  if (fromFn && isComplete(fromFn)) return fromFn;
  const d = await directRaw(league, id, season);
  const f = fromFn && Array.isArray(fromFn.people) ? fromFn : null;
  return {
    color: f?.color ?? d.color,
    alt: f?.alt ?? d.alt,
    people: f?.people?.length ? f.people : d.people,
    leaders: f?.leaders?.passingYards?.length ? f.leaders : d.leaders,
  };
}

/** Turn ESPN's trimmed answer into colors and a weighted roster. Pure, so it can be tested with made-up data. */
export function shape(raw: Raw): TeamInfo {
  const hex = (c?: string | null) => (c && /^[0-9a-f]{6}$/i.test(c) ? `#${c.toLowerCase()}` : undefined);
  const info: TeamInfo = { roster: {}, color: hex(raw.color), alt: hex(raw.alt), qbs: raw.people.filter((p) => p.pos === "QB").map((p) => ({ name: p.name, exp: p.exp ?? 0 })) };
  const people = new Map(raw.people.map((x) => [x.id, x]));
  const cat = (name: keyof Raw["leaders"]) => (raw.leaders?.[name] ?? []).filter((x) => people.has(x.id));
  const pass = cat("passingYards")[0];
  // Without season leaders, the most experienced quarterback on the roster (a starter, not a backup or a rookie).
  const qbs = raw.people.filter((p) => p.pos === "QB").sort((a, b) => (b.exp ?? 0) - (a.exp ?? 0));
  info.roster.qb = pass ? people.get(pass.id)!.name : qbs[0]?.name;
  // Ball carriers and targets are backs, receivers and tight ends; ESPN also lists a punter or a lineman who ran or caught one.
  const skill = new Set(["RB", "FB", "WR", "TE"]);
  const rush = cat("rushingYards").filter((x) => skill.has(people.get(x.id)!.pos)).slice(0, 4);
  if (rush.length) info.roster.rushers = rush.map((x) => ({ name: people.get(x.id)!.name, w: Math.max(x.w, 20) }));
  else {
    const rbs = raw.people.filter((p) => p.pos === "RB" || p.pos === "FB").slice(0, 3);
    if (rbs.length) info.roster.rushers = rbs.map((p, i) => ({ name: p.name, w: [60, 30, 10][i] }));
  }
  const rec = cat("receivingYards").filter((x) => skill.has(people.get(x.id)!.pos)).slice(0, 7);
  if (!rec.length) {
    // Real names at least: the first few receivers, tight end and back on the roster, weighted toward the top of the list.
    const pool = [...raw.people.filter((p) => p.pos === "WR").slice(0, 4), ...raw.people.filter((p) => p.pos === "TE").slice(0, 1), ...raw.people.filter((p) => p.pos === "RB").slice(0, 1)];
    if (pool.length) info.roster.receivers = pool.map((p, i) => ({ name: p.name, w: Math.max(10, 40 - i * 7), pos: p.pos === "TE" ? ("TE" as const) : p.pos === "RB" ? ("RB" as const) : ("WR" as const) }));
  } else {
    info.roster.receivers = rec.map((x) => {
      const p = people.get(x.id)!;
      return { name: p.name, w: Math.max(x.w, 20), pos: p.pos === "TE" ? ("TE" as const) : p.pos === "RB" || p.pos === "FB" ? ("RB" as const) : ("WR" as const) };
    });
  }
  return info;
}

async function load(league: League, id: string, season: number): Promise<TeamInfo> {
  const raw = await loadRaw(league, id, season);
  return shape(raw);
}

/** One team in the site's own /data/team-players.json (collected by the refresh, see scripts/fetch-team-players.mjs). */
interface Packed { c: string | null; a: string | null; qb: string | null; qbs: [string, number][]; rush: [string, number][]; rec: [string, number, "WR" | "TE" | "RB"][]; leaders: boolean }
interface PackedFile { nfl: Record<string, Packed>; cfb: Record<string, Packed> }
let packedFile: Promise<PackedFile | null> | null = null;
const packed = () => (packedFile ??= fetchData<PackedFile>("team-players").catch(() => { packedFile = null; return null; }));

/** The team from the site's own file, when it has season leaders for it; otherwise null and the live feeds are asked. */
export function fromPacked(p: Packed | undefined): TeamInfo | null {
  if (!p?.leaders) return null;
  return {
    color: p.c ?? undefined, alt: p.a ?? undefined,
    roster: { qb: p.qb ?? undefined, rushers: p.rush.map(([name, w]) => ({ name, w })), receivers: p.rec.map(([name, w, pos]) => ({ name, w, pos })) },
    qbs: p.qbs.map(([name, exp]) => ({ name, exp })),
  };
}

/** Colors, names and weights for one team. Never rejects: a failed lookup gives an empty roster. */
export function fetchTeamInfo(league: League, id: string, season: number): Promise<TeamInfo> {
  const key = `${league}:${id}:${season}`;
  let p = cache.get(key);
  if (!p) {
    p = packed()
      .then((f) => fromPacked(f?.[league === "NFL" ? "nfl" : "cfb"]?.[id]) ?? load(league, id, season))
      .catch(() => ({ roster: {} }));
    cache.set(key, p);
  }
  return p;
}

/**
 * The quarterback to use when the team's current starter is known by full name ("Patrick Mahomes", from nflverse): the roster's own short name for
 * him ("P. Mahomes") when it matches by last name and first initial, otherwise the name shortened the same way.
 */
export function startingQb(info: TeamInfo, full?: string | null): string | undefined {
  if (!full) return info.roster.qb;
  const words = full.replace(/\b(Jr|Sr|II|III|IV)\.?$/i, "").trim().split(/\s+/);
  const last = (words[words.length - 1] ?? "").toLowerCase();
  const initial = (words[0]?.[0] ?? "").toLowerCase();
  const hit = info.qbs?.find((q) => q.name.toLowerCase().endsWith(last) && q.name.toLowerCase().startsWith(initial));
  return hit?.name ?? `${words[0]?.[0] ?? ""}. ${words.slice(1).join(" ") || words[0]}`;
}
