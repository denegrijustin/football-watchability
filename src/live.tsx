import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { results, slate } from "./data";
import type { WpPoint } from "./insanity";
import { liveStatusParts } from "./liveStatus";

/** Live score for one game, from /api/scores (a Cloudflare Pages Function over ESPN). */
export type LiveScore = {
  id: string;
  state: "pre" | "in" | "post";
  detail: string;
  away: number;
  home: number;
};
type LiveMap = Record<string, LiveScore>;
const LiveContext = createContext<LiveMap>({});
export const useLive = (espnId?: string | null) => {
  const map = useContext(LiveContext);
  return espnId ? map[espnId] : undefined;
};
export const useLiveMap = () => useContext(LiveContext);

/** Where a game is in its life, for the board's sections and Status filter. */
export type GameStatus = "live" | "final" | "upcoming";
/** Final status requires a feed confirmation; elapsed time alone never ends a game. */
export function gameStatus(startIso: string, live: LiveScore | undefined, now: number): GameStatus {
  if (live) return live.state === "in" ? "live" : live.state === "post" ? "final" : "upcoming";
  const start = Date.parse(startIso);
  if (Number.isNaN(start) || start > now) return "upcoming";
  return "live";
}

/** Re-renders on an interval so games move between sections as kickoffs pass. */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const POLL_MS = 60_000;
const PATHS: Record<string, string> = { nfl: "nfl", cfb: "college-football" };

/** Our edge-cached proxy first; ESPN directly (it allows cross-origin) as a fallback. */
async function scores(league: string, date: string): Promise<LiveScore[]> {
  try {
    const res = await fetch(`/api/scores?league=${league}&date=${date}`);
    if (res.ok && (res.headers.get("content-type") ?? "").includes("json")) return await res.json();
  } catch {
    /* fall through */
  }
  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/football/${PATHS[league]}/scoreboard?dates=${date}${
        league === "cfb" ? "&groups=80&limit=300" : ""
      }`,
    );
    if (!res.ok) return [];
    const data = await res.json();
    type Comp = { homeAway: string; score?: string };
    return (data.events ?? []).map(
      (ev: { id: string; competitions?: { competitors?: Comp[]; status?: { type?: { state?: string; shortDetail?: string } } }[] }) => {
        const c = ev.competitions?.[0];
        const side = (h: string) => Number(c?.competitors?.find((x) => x.homeAway === h)?.score ?? 0);
        return {
          id: ev.id,
          state: (c?.status?.type?.state ?? "pre") as LiveScore["state"],
          detail: c?.status?.type?.shortDetail ?? "",
          away: side("away"),
          home: side("home"),
        };
      },
    );
  } catch {
    return [];
  }
}
const etYmd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/New_York" }).replace(/-/g, "");

/**
 * Polls live scores while any game on the board has kicked off but isn't in
 * the archived results yet, so scores update as games go on and end between
 * the scheduled rebuilds. Stops once everything that has started is final.
 */
export function LiveScores({ children }: { children: ReactNode }) {
  const [map, setMap] = useState<LiveMap>({});
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const archived = new Set(results.map((r) => r.espnId));
    const games = slate.games
      .map((g) => ({ id: g.espnId, league: g.league, date: new Date((g as { date?: string }).date ?? "") }))
      .filter((g) => !archived.has(g.id) && !Number.isNaN(g.date.getTime()));
    const tick = async () => {
      const now = Date.now();
      const started = games.filter((g) => g.date.getTime() - 10 * 60e3 <= now);
      if (!started.length) {
        // Nothing has started: check again when the next game is close.
        const next = Math.min(...games.map((g) => g.date.getTime()));
        if (Number.isFinite(next)) timer = setTimeout(tick, Math.max(POLL_MS, next - now - 10 * 60e3));
        return;
      }
      const wanted = new Map<string, Set<string>>();
      for (const g of started) {
        const key = g.league === "NFL" ? "nfl" : "cfb";
        if (!wanted.has(key)) wanted.set(key, new Set());
        wanted.get(key)!.add(etYmd(g.date));
      }
      const next: LiveMap = {};
      await Promise.all(
        [...wanted].flatMap(([league, dates]) =>
          [...dates].map(async (date) => {
            for (const s of await scores(league, date)) next[s.id] = s;
          }),
        ),
      );
      if (stop) return;
      if (!Object.keys(next).length) {
        // Scores unavailable (offline, local preview): back off.
        timer = setTimeout(tick, 5 * POLL_MS);
        return;
      }
      setMap((m) => ({ ...m, ...next }));
      const pending = started.some((g) => next[g.id]?.state !== "post");
      if (pending) timer = setTimeout(tick, POLL_MS);
      else {
        const future = games.filter((g) => g.date.getTime() - 10 * 60e3 > now).map((g) => g.date.getTime());
        if (future.length) timer = setTimeout(tick, Math.max(POLL_MS, Math.min(...future) - now - 10 * 60e3));
      }
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, []);
  return <LiveContext.Provider value={map}>{children}</LiveContext.Provider>;
}

/**
 * Status line above the team names on live and just-finished cards: LIVE with the
 * quarter and clock, or FINAL. The scores sit beside each team (see TeamScore).
 */
export function GameStatus({ live }: { live?: LiveScore }) {
  if (!live || live.state === "pre") return null;
  if (live.state === "post") {
    const extra = live.detail.replace(/^final\/?/i, "").trim();
    return (
      <div className="game-status post" role="status">
        <span className="gs-pill">Final</span>
        {extra && <span className="gs-period">{extra}</span>}
      </div>
    );
  }
  const { period, clock, text } = liveStatusParts(live.detail);
  return (
    <div className="game-status in" role="status">
      <span className="gs-pill">Live</span>
      {period && <span className="gs-period">{period}</span>}
      {clock && <span className="gs-clock">{clock}</span>}
      {text && <span className="gs-period">{text}</span>}
    </div>
  );
}

/** A team's score, shown beside its name and logo once the game has started. */
export function TeamScore({ live, side }: { live?: LiveScore; side: "away" | "home" }) {
  if (!live || live.state === "pre") return null;
  const mine = live[side];
  const theirs = live[side === "away" ? "home" : "away"];
  const cls = live.state === "post" ? (mine > theirs ? " won" : mine < theirs ? " lost" : "") : mine > theirs ? " lead" : "";
  return (
    <span className={`team-score${cls}`} aria-label={`${side === "away" ? "Away" : "Home"} score`}>
      {mine}
    </span>
  );
}

// ---------- live game flow (win-probability line) for the insanity meter ----------
const FLOW_MS = 45_000;
const flowCache = new Map<string, { at: number; wp: WpPoint[] }>();

/** Home win % (0–100) and period per play: our edge function first, ESPN directly as a fallback. */
async function flow(league: "nfl" | "cfb", id: string): Promise<WpPoint[] | null> {
  try {
    const res = await fetch(`/api/flow?v=2&league=${league}&id=${id}`);
    if (res.ok && (res.headers.get("content-type") ?? "").includes("json")) {
      const body = (await res.json()) as { wp?: WpPoint[] };
      if (body.wp?.length) return body.wp;
    }
  } catch {
    /* fall through */
  }
  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/football/${PATHS[league]}/summary?event=${id}`,
    );
    if (!res.ok) return null;
    const sum = await res.json();
    const periodByPlay = new Map<string, { id: string; text?: string; period?: { number: number }; clock?: { displayValue: string } }>();
    const drives = [...(sum.drives?.previous ?? []), ...(sum.drives?.current ? [sum.drives.current] : [])];
    for (const d of drives) for (const p of d.plays ?? []) periodByPlay.set(p.id, p);
    const wp = (sum.winprobability ?? []).map(
      (w: { homeWinPercentage?: number; playId: string }): WpPoint => [
        Math.round((w.homeWinPercentage ?? 0) * 1000) / 10,
        periodByPlay.get(w.playId)?.period?.number ?? null,
        { id: w.playId, text: periodByPlay.get(w.playId)?.text ?? "Play description unavailable", clock: periodByPlay.get(w.playId)?.clock?.displayValue ?? "" },
      ],
    );
    return wp.length ? wp : null;
  } catch {
    return null;
  }
}

/**
 * A live game's win-probability line, refreshed while it is in progress (and
 * once more when it ends, before the archive catches up). Null until the game
 * has started or when the feed is unavailable.
 */
export function useFlow(espnId: string, league: string, live?: LiveScore): WpPoint[] | null {
  const [wp, setWp] = useState<WpPoint[] | null>(() => flowCache.get(espnId)?.wp ?? null);
  const state = live?.state;
  useEffect(() => {
    if (state !== "in" && state !== "post") return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const key = league === "NFL" ? "nfl" : "cfb";
    const run = async () => {
      const cached = flowCache.get(espnId);
      if (!cached || Date.now() - cached.at > FLOW_MS - 1000) {
        const next = await flow(key, espnId);
        if (next) flowCache.set(espnId, { at: Date.now(), wp: next });
      }
      if (stop) return;
      const hit = flowCache.get(espnId);
      if (hit) setWp(hit.wp);
      if (state === "in") timer = setTimeout(run, FLOW_MS);
    };
    run();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [espnId, league, state]);
  return wp;
}
