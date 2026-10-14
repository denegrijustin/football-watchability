/**
 * Finished college and NFL games, so the CFB SP+ and NFL+ against-the-spread trackers update the moment a game ends instead of
 * when the sheet or nflverse next catches up. Two sources, newest wins: /data/finals.json (rebuilt by the scheduled refresh,
 * scripts/fetch-finals.mjs) and ESPN's scoreboard for the last few days through /api/scores (edge-cached, polled while a tab
 * that uses it is open and visible).
 */
import { useSyncExternalStore } from "react";
import { fetchData } from "./data/load";

export interface FinalSide { id: string; n: string; ab: string; s: number }
export interface Final {
  l: "cfb" | "nfl";
  /** ESPN's game id. */
  id: string;
  date: string;
  week: number | null;
  ot: number;
  neutral: number;
  a: FinalSide;
  h: FinalSide;
}
interface FinalsFile { updated: string; season: number; games: Final[] }
export interface FinalsState { finals: Final[]; /** When the saved file was built. */ saved: string | null; /** When the newest live check succeeded. */ live: string | null }

type EspnEvent = {
  id: string; date: string; week?: { number?: number };
  status?: { type?: { state?: string; completed?: boolean; shortDetail?: string; detail?: string } };
  competitions?: { neutralSite?: boolean; status?: { type?: { state?: string; completed?: boolean; shortDetail?: string; detail?: string } };
    competitors?: { homeAway: string; score?: string; team?: { id?: string; location?: string; displayName?: string; abbreviation?: string } }[] }[];
};

/** A finished game out of an ESPN scoreboard event, or null. Same rules as scripts/finals-lib.mjs. */
export function finalFromEvent(league: "cfb" | "nfl", e: EspnEvent): Final | null {
  const c = e.competitions?.[0];
  const st = e.status?.type ?? c?.status?.type;
  if (!c || !(st?.state === "post" || st?.completed)) return null;
  const side = (ha: string) => c.competitors?.find((x) => x.homeAway === ha);
  const [a, h] = [side("away"), side("home")];
  const [as, hs] = [Number(a?.score), Number(h?.score)];
  if (!a?.team?.id || !h?.team?.id || a.score === "" || h.score === "" || !Number.isFinite(as) || !Number.isFinite(hs)) return null;
  const team = (x: NonNullable<typeof a>, s: number): FinalSide => ({ id: String(x.team!.id), n: x.team!.location ?? x.team!.displayName ?? "", ab: x.team!.abbreviation ?? "", s });
  return { l: league, id: String(e.id), date: e.date, week: e.week?.number ?? null, ot: /OT/i.test(st?.shortDetail ?? st?.detail ?? "") ? 1 : 0, neutral: c.neutralSite ? 1 : 0, a: team(a, as), h: team(h, hs) };
}

/** Newest copy of each game wins. */
export function mergeFinals(...lists: Final[][]): Final[] {
  const byId = new Map<string, Final>();
  for (const list of lists) for (const g of list) byId.set(`${g.l}:${g.id}`, g);
  return [...byId.values()];
}

const PATHS = { nfl: "nfl", cfb: "college-football" } as const;
const etYmd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/New_York" }).replace(/-/g, "");

/** Our edge-cached proxy first, ESPN directly (it allows cross-origin) as the fallback. */
async function scoreboard(league: "cfb" | "nfl", ymd: string): Promise<Final[]> {
  const get = async (url: string) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) throw new Error(String(res.status));
    return res.json();
  };
  let events: EspnEvent[] | null = null;
  try {
    const out = await get(`/api/scores?league=${league}&date=${ymd}&full=1`);
    if (Array.isArray(out) && out.every((x) => x && typeof x === "object" && "a" in x)) return out as Final[];
  } catch { /* fall through to ESPN */ }
  try {
    const data = await get(`https://site.api.espn.com/apis/site/v2/sports/football/${PATHS[league]}/scoreboard?dates=${ymd}${league === "cfb" ? "&groups=80&limit=300" : ""}`);
    events = data.events ?? [];
  } catch { return []; }
  return (events ?? []).map((e) => finalFromEvent(league, e)).filter((g): g is Final => !!g);
}

const POLL_MS = 120_000;
const DAYS = 3;
let state: FinalsState = { finals: [], saved: null, live: null };
let savedGames: Final[] = [];
let liveGames: Final[] = [];
const subs = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let started = false;
// Subscribers re-render (and the trackers recompute) only when a game is new or its score changed, not on every poll.
const signature = (list: Final[]) => list.map((g) => `${g.l}${g.id}:${g.a.s}-${g.h.s}`).sort().join("|");
const publish = (live?: string | null) => {
  const finals = mergeFinals(savedGames, liveGames);
  const changed = signature(finals) !== signature(state.finals);
  state = { ...state, finals: changed ? finals : state.finals, live: live === undefined ? state.live : live };
  subs.forEach((f) => f());
};

async function loadSaved() {
  try {
    const f = await fetchData<FinalsFile>("finals");
    savedGames = f.games ?? [];
    state = { ...state, saved: f.updated ?? null };
    publish();
  } catch { /* the live check below still works */ }
}
async function pollLive() {
  if (typeof document !== "undefined" && document.hidden) return;
  const days = Array.from({ length: DAYS }, (_, i) => etYmd(new Date(Date.now() - i * 864e5)));
  const batches = await Promise.all(days.flatMap((d) => (["cfb", "nfl"] as const).map((l) => scoreboard(l, d))));
  const got = batches.flat();
  if (!got.length && !batches.some((b) => b.length)) { return; }
  liveGames = mergeFinals(liveGames, got);
  publish(new Date().toISOString());
}
function start() {
  if (started) return;
  started = true;
  void loadSaved();
  void pollLive();
  timer = setInterval(() => void pollLive(), POLL_MS);
  document.addEventListener("visibilitychange", onVisible);
}
function onVisible() { if (!document.hidden) void pollLive(); }
function stop() {
  if (subs.size) return;
  started = false;
  if (timer) clearInterval(timer);
  document.removeEventListener("visibilitychange", onVisible);
}

// A stable function, so React subscribes once per component instead of on every render.
const subscribe = (cb: () => void) => { subs.add(cb); start(); return () => { subs.delete(cb); stop(); }; };
const snapshot = () => state;

/** Every finished game we know of, updating as games end. Polls only while a component using it is mounted. */
export function useFinals(): FinalsState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
