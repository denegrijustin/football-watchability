import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { results, slate } from "./data";
import type { WpPoint } from "./insanity";
import { liveStatusParts } from "./liveStatus";
import { openStream, type Stream } from "./liveStream";
import { useChanged } from "./motion";

/** Live score for one game, from /api/scores (a Cloudflare Pages Function over ESPN). */
export type LiveScore = {
  id: string;
  state: "pre" | "in" | "post";
  detail: string;
  away: number;
  home: number;
  /** Which side has the ball, while the game is live. */
  ball?: "away" | "home" | null;
};
export type LiveMap = Record<string, LiveScore>;
const LiveContext = createContext<LiveMap>({});
const ReportContext = createContext<(score: LiveScore) => void>(() => {});
/** How fresh the scores are: when data last arrived, how (pushed or polled), and a way to ask again right now. */
export type LiveStatus = { at: number; via: "push" | "poll" | null; refresh: () => void };
const StatusContext = createContext<LiveStatus>({ at: 0, via: null, refresh: () => {} });
export const useLiveStatus = () => useContext(StatusContext);
export const useLive = (espnId?: string | null) => {
  const map = useContext(LiveContext);
  return espnId ? map[espnId] : undefined;
};
export const useLiveMap = () => useContext(LiveContext);
/** Hands the live scores to a React tree that was mounted on its own (the SP+ and NFL+ tabs live in shadow roots, so the page's contexts do not reach them). */
export function LiveMirror({ map, children }: { map: LiveMap; children: ReactNode }) {
  return <LiveContext.Provider value={map}>{children}</LiveContext.Provider>;
}
/**
 * Lets a fresher source hand the board a score: the game summary (the Game Center and the live field on a card poll it every few seconds) runs ahead of
 * the scoreboard feed, so what it saw is merged in the moment it arrives. It only moves a game forward: a later state, or more points.
 */
export const useReportLive = () => useContext(ReportContext);
const STATE_ORDER = { pre: 0, in: 1, post: 2 } as const;
export function liveFromSummary(g: { id?: string; status: { state: string; detail: string }; teams: { homeAway: string; score: number; possession?: boolean }[] }, espnId: string): LiveScore | null {
  const away = g.teams.find((t) => t.homeAway === "away"), home = g.teams.find((t) => t.homeAway === "home");
  const state = g.status.state as LiveScore["state"];
  if (!away || !home || !(state in STATE_ORDER)) return null;
  return { id: espnId, state, detail: g.status.detail, away: Number(away.score) || 0, home: Number(home.score) || 0, ball: state === "in" ? (away.possession ? "away" : home.possession ? "home" : null) : null };
}
/** When each game's score last changed here, so a copy older than what was just pushed cannot overwrite it. */
const changedAt = new Map<string, number>();
const RECENT_MS = 90_000;
/**
 * Whether `s` may replace `old`. Feeds reach the page at different speeds (the pushed stream, the game summary, the polled scoreboard), so a slower one
 * must not undo a newer one: a game never goes back a state, and its score does not go down within a minute and a half of its last change (a real
 * correction later still gets through).
 */
function accept(old: LiveScore | undefined, s: LiveScore): boolean {
  if (!old) return true;
  if (STATE_ORDER[s.state] < STATE_ORDER[old.state]) return false;
  if (s.state === old.state && s.away + s.home < old.away + old.home && Date.now() - (changedAt.get(s.id) ?? 0) < RECENT_MS) return false;
  return true;
}
const newer = (old: LiveScore | undefined, s: LiveScore) =>
  !old || STATE_ORDER[s.state] > STATE_ORDER[old.state] || (s.state === old.state && s.away + s.home > old.away + old.home);

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
    // A hidden tab has nothing to redraw; catch up the moment it is shown again.
    const t = setInterval(() => !document.hidden && setNow(Date.now()), ms);
    const show = () => !document.hidden && setNow(Date.now());
    document.addEventListener("visibilitychange", show);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", show);
    };
  }, [ms]);
  return now;
}

/** How often the scoreboard is asked: every 15 seconds while a game is on, every 30 while a kickoff is close or just past, a minute otherwise. */
const POLL_MS = 60_000;
const LIVE_POLL_MS = 15_000;
const SOON_POLL_MS = 30_000;
const PATHS: Record<string, string> = { nfl: "nfl", cfb: "college-football" };

/** Our edge-cached proxy first; ESPN directly (it allows cross-origin) as a fallback. */
async function scores(league: string, date: string): Promise<LiveScore[]> {
  try {
    const res = await fetch(`/api/scores?league=${league}&date=${date}`, { cache: "no-store" });
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
    type Comp = { id?: string; homeAway: string; score?: string };
    return (data.events ?? []).map(
      (ev: { id: string; competitions?: { competitors?: Comp[]; situation?: { possession?: string }; status?: { type?: { state?: string; shortDetail?: string } } }[] }) => {
        const c = ev.competitions?.[0];
        const side = (h: string) => Number(c?.competitors?.find((x) => x.homeAway === h)?.score ?? 0);
        return {
          id: ev.id,
          state: (c?.status?.type?.state ?? "pre") as LiveScore["state"],
          detail: c?.status?.type?.shortDetail ?? "",
          away: side("away"),
          home: side("home"),
          ball: (() => {
            const who = c?.situation?.possession;
            const sideOf = (h: string) => c?.competitors?.find((x) => x.homeAway === h)?.id;
            return c?.status?.type?.state === "in" && who ? (sideOf("home") === who ? "home" : sideOf("away") === who ? "away" : null) : null;
          })(),
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
  const [fresh, setFresh] = useState<{ at: number; via: "push" | "poll" | null }>({ at: 0, via: null });
  const refreshRef = useRef<() => void>(() => {});
  const refresh = useCallback(() => refreshRef.current(), []);
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopHidden = () => {};
    const archived = new Set(results.map((r) => r.espnId));
    const games = slate.games
      .map((g) => ({ id: g.espnId, league: g.league, date: new Date((g as { date?: string }).date ?? "") }))
      .filter((g) => !archived.has(g.id) && !Number.isNaN(g.date.getTime()));
    let busy = false;
    let lastAt = 0;
    // Only what changed is replaced, and when nothing did the same map is kept, so an update that brings nothing new re-renders nothing.
    const applyScores = (next: LiveMap) =>
      setMap((m) => {
        let changed = false;
        const merged: LiveMap = { ...m };
        for (const [id, s] of Object.entries(next)) {
          const old = m[id];
          if (old && old.state === s.state && old.detail === s.detail && old.away === s.away && old.home === s.home && old.ball === s.ball) continue;
          if (!accept(old, s)) continue;
          if (!old || old.away + old.home !== s.away + s.home || old.state !== s.state) changedAt.set(id, Date.now());
          merged[id] = s;
          changed = true;
        }
        return changed ? merged : m;
      });
    // Pushed scores: one event stream per league and day with a game on. The polling below keeps running (slower while the stream is delivering).
    const streams = new Map<string, Stream>();
    const syncStreams = (wanted: Map<string, Set<string>>) => {
      const keep = new Set<string>();
      for (const [league, dates] of wanted) for (const date of dates) {
        const key = `${league}:${date}`;
        keep.add(key);
        if (!streams.has(key)) streams.set(key, openStream<LiveScore[]>(`/api/live?league=${league}&date=${date}`, "scores", (list) => {
          applyScores(Object.fromEntries(list.map((x) => [x.id, x])));
          setFresh({ at: Date.now(), via: "push" });
        }));
      }
      for (const [key, st] of streams) if (!keep.has(key)) { st.close(); streams.delete(key); }
    };
    const streaming = () => [...streams.values()].some((st) => Date.now() - st.lastAt() < 20_000);
    const tick = async () => {
      if (busy) return;
      // No polling while the tab is hidden: wait until it is shown, then fetch straight away.
      if (document.hidden) {
        for (const st of streams.values()) st.close();
        streams.clear();
        const resume = () => {
          if (document.hidden || stop) return;
          document.removeEventListener("visibilitychange", resume);
          tick();
        };
        document.addEventListener("visibilitychange", resume);
        stopHidden = () => document.removeEventListener("visibilitychange", resume);
        return;
      }
      clearTimeout(timer);
      busy = true;
      lastAt = Date.now();
      try {
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
      syncStreams(wanted);
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
        timer = setTimeout(tick, POLL_MS);
        return;
      }
      applyScores(next);
      setFresh((f) => (Date.now() - f.at < 20_000 && f.via === "push" ? f : { at: Date.now(), via: "poll" }));
      const pending = started.some((g) => next[g.id]?.state !== "post");
      const anyLive = Object.values(next).some((s) => s.state === "in");
      if (pending) timer = setTimeout(tick, streaming() ? POLL_MS / 2 : anyLive ? LIVE_POLL_MS : SOON_POLL_MS);
      else {
        const future = games.filter((g) => g.date.getTime() - 10 * 60e3 > now).map((g) => g.date.getTime());
        if (future.length) timer = setTimeout(tick, Math.max(POLL_MS, Math.min(...future) - now - 10 * 60e3));
      }
      } finally {
        busy = false;
      }
    };
    // Coming back to the tab, or back online, asks straight away (unless it just did): a phone that slept through a quarter must not wait for the timer.
    const wake = () => {
      if (!document.hidden && !stop && Date.now() - lastAt > 5_000) {
        clearTimeout(timer);
        void tick();
      }
    };
    refreshRef.current = () => { clearTimeout(timer); void tick().then(() => window.dispatchEvent(new CustomEvent("fbwatch:refreshed", { detail: "scores" }))); };
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    window.addEventListener("pageshow", wake);
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
      stopHidden();
      for (const st of streams.values()) st.close();
      streams.clear();
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("pageshow", wake);
    };
  }, []);
  const report = useCallback((s: LiveScore) => setMap((m) => {
    if (!newer(m[s.id], s)) return m;
    changedAt.set(s.id, Date.now());
    return { ...m, [s.id]: { ...m[s.id], ...s } };
  }), []);
  return (
    <ReportContext.Provider value={report}>
      <StatusContext.Provider value={{ ...fresh, refresh }}>
        <LiveContext.Provider value={map}>{children}</LiveContext.Provider>
      </StatusContext.Provider>
    </ReportContext.Provider>
  );
}

/**
 * "LIVE · updated 8s ago" while any game is on: how old the scores on the page are and how they arrived (pushed or polled). Tapping it asks again
 * right now. It is also how a stale page shows itself, instead of quietly looking current.
 */
export function LiveFreshness() {
  const map = useContext(LiveContext);
  const { at, via, refresh } = useContext(StatusContext);
  const [now, setNow] = useState(() => Date.now());
  const anyLive = Object.values(map).some((g) => g.state === "in");
  useEffect(() => {
    if (!anyLive) return;
    const t = setInterval(() => !document.hidden && setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [anyLive]);
  if (!anyLive || !at) return null;
  const age = Math.max(0, Math.round((now - at) / 1000));
  const stale = age > 45;
  return (
    <button type="button" className={`live-fresh${stale ? " stale" : ""}`} onClick={refresh} title={`Scores ${via === "push" ? "pushed" : "polled"} ${age}s ago. Tap to refresh now.`} aria-label={`Live scores updated ${age} seconds ago. Refresh now.`}>
      <i aria-hidden="true" />
      {age < 3 ? "live · just now" : `live · ${age < 60 ? `${age}s` : `${Math.floor(age / 60)}m`} ago`}
    </button>
  );
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

/** A football on its side, for the team with the ball. */
export function FootballIcon({ title }: { title: string }) {
  return (
    <svg className="ball-icon" viewBox="0 0 24 14" width="18" height="11" role="img" aria-label={title}>
      <title>{title}</title>
      <ellipse cx="12" cy="7" rx="11" ry="6.2" fill="#8b4a1b" stroke="#2a1608" strokeWidth="1" />
      <path d="M5.2 2.2Q3 7 5.2 11.8M18.8 2.2Q21 7 18.8 11.8" fill="none" stroke="#fff" strokeWidth="1.2" />
      <path d="M8.5 7h7M10 5.2v3.6M12 5.2v3.6M14 5.2v3.6" stroke="#fff" strokeWidth="1" />
    </svg>
  );
}

/** A team's score, shown beside its name and logo once the game has started. It flashes and ticks over when the team scores. */
export function TeamScore({ live, side }: { live?: LiveScore; side: "away" | "home" }) {
  const mine = live ? live[side] : 0;
  const scored = useChanged(live?.state === "in" ? mine : undefined, 1300);
  if (!live || live.state === "pre") return null;
  const theirs = live[side === "away" ? "home" : "away"];
  const cls = live.state === "post" ? (mine > theirs ? " won" : mine < theirs ? " lost" : "") : mine > theirs ? " lead" : "";
  return (
    <span className={`team-score${cls}${scored ? " scored" : ""}`} aria-label={`${side === "away" ? "Away" : "Home"} score`}>
      {live.state === "in" && live.ball === side && <FootballIcon title="Has the ball" />}
      <span className="ts-num" key={mine}>{mine}</span>
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

/** A game's win-probability line, from the shared cache when it is younger than `maxAgeMs`, else fetched fresh. */
export async function latestFlow(league: "NFL" | "CFB", id: string, maxAgeMs = FLOW_MS - 1000): Promise<WpPoint[] | null> {
  const cached = flowCache.get(id);
  if (cached && Date.now() - cached.at < maxAgeMs) return cached.wp;
  const next = await flow(league === "NFL" ? "nfl" : "cfb", id);
  if (next) flowCache.set(id, { at: Date.now(), wp: next });
  return next ?? cached?.wp ?? null;
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
