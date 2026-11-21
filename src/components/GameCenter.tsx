import { TeamOpen } from "../openTeam";
import { decodeGame } from '../gameFeed';
import { provisionalActual } from "../provisionalScore";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ART_COUNT, attributePlays, impact, summarizeEvents, type ImpactEvent, type PlayLog, type PlayerRow } from "../playImpact";
import { ART_LABEL, PlayArt } from "./PlayArt";
import { openModal } from "../modal";
import { altColor } from "../teamAlt";
import { broadcastExtra, logos, networkLogo, rankLine, results, slate, teamColor, tierLabel, type Ranks } from "../data";
import { trimGame } from "../gameTrim.js";
import { rename } from "../data/load";
import { dayOf, timeOf, tzAbbr } from "../tz";
import { AdvancedStats, type Advanced } from "./AdvancedStats";
import { PregameWinProb, type WinProbData } from "./PregameWinProb";
import { ProjectedScore, type Projection } from "./ProjectedScore";
import { SpPlusProjection } from "./SpPlusProjection";
import { NflProjectionBlock, NflSettingPanel } from "./NflGameInfo";
import { InsanityMeter } from "./InsanityMeter";
import { Headshot } from "./Headshot";
import { GameDetails } from "./GameDetails";
import { RivalryDeepCut, loreFor } from "./RivalryDeepCut";
import { FootballIcon, liveFromSummary, useLive, useReportLive } from "../live";
import { LastPlay, latestShape } from "../LastPlayView";
import type { WeatherLike } from "../weatherFx";
import { HalftimeBand } from "../halftime";
import { HalftimeAct } from "../nflHalftime";
import { PregameCheer } from "../pregameCheer";
import { usePregame } from "../pregameLogic";
import { GameBadgeRow } from "./GameBadge";
import { RivalryBadge, type Rivalry } from "./RivalryBadge";
import { gameBadge } from "../gameLogo";
import { isHalftime } from "../halftimeLogic";
import { GameFlowPanel } from "./GameFlowPanel";
import { GlanceTiles } from "./GlanceTiles";
import { MatchupPanel } from "./MatchupPanel";
import { TakeawaysPanel, TeamStatsPanel, TiltPanel } from "./TeamStatsPanels";
import { ResultAnalysis } from "./ResultAnalysis";

import type { GameStub } from "./GameCenterContext";

// ---------- live data ----------
type Side = { id: string; abbr: string; name: string; homeAway: string; score: number; linescores: number[]; possession: boolean };
type Drive = { team: string; period: number | null; clock: string; from: number | null; to: number | null; yards: number; plays: number; result: string; score: boolean; time: string; current: boolean };
type Play = { id: string; team: string; period: number | null; clock: string; text: string; kind: string; yards: number; toGo: number | null; offense: boolean; score: boolean; turnover: boolean };
type TeamStats = { yards: number; ypp: number; plays: number; firstDowns: number; third: string; redZone: string; turnovers: number; top: string; penalties: string; passYds: number; rushYds: number };
export type LiveGame = {
  id: string;
  status: { state: "pre" | "in" | "post"; detail: string; period: number; clock: string };
  teams: Side[];
  situation: { text: string; possession: string | null; toGo: number | null; redZone: boolean; lastPlay: string } | null;
  wp: import("../insanity").WpPoint[];
  /** Every play that can credit a player; older cached responses may not have it. */
  log?: PlayLog[];
  drives: Drive[];
  plays: Play[];
  curPlays?: { down: string; text: string; yards: number; period: number | null; clock: string; kind: string; score: boolean; turnover: boolean }[];
  allOffense: [number, number, number, number][]; // [side 0 away/1 home, yards to end zone, quarter, yards gained]
  scoring: { period: number; clock: string; team: string; text: string; away: number; home: number }[];
  teamStats: Record<string, TeamStats>;
  players: Record<string, PlayerRow[]>;
};

const PATHS: Record<string, string> = { nfl: "nfl", cfb: "college-football" };
/** A game with fewer than two teams is not a usable summary (an empty or half-sent answer), so it is treated like no answer rather than drawn. */
const usable = (g: LiveGame): LiveGame | null => (g && Array.isArray(g.teams) && g.teams.length >= 2 ? g : null);
async function fetchGame(league: string, id: string): Promise<LiveGame | null> {
  try {
    const r = await fetch(`/api/game?league=${league}&event=${id}&format=raw`, { cache: "no-store" });
    if (r.ok && (r.headers.get("content-type") ?? "").includes("json")) { const g = usable(rename(await decodeGame(await r.json(), league)) as LiveGame); if (g) return g; }
  } catch {
    /* fall through */
  }
  try {
    const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/${PATHS[league]}/summary?event=${id}`);
    if (r.ok) return usable(rename(trimGame(await r.json())) as LiveGame);
  } catch {
    /* offline */
  }
  return null;
}

function useLiveGame(league: string | null, id: string | null, started: boolean) {
  const report = useReportLive();
  const [game, setGame] = useState<LiveGame | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);
  useEffect(() => {
    setGame(null);
    if (!id || !league || !started) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    let busy = false;
    let finished = false;
    const tick = async () => {
      if (stop || busy || document.hidden || finished) return;
      busy = true;
      const g = await fetchGame(league, id);
      busy = false;
      if (stop) return;
      if (g) {
        setGame(g);
        setUpdated(new Date());
        const l = liveFromSummary(g as never, id);
        if (l) report(l);
      }
      if (g?.status.state === "post") { finished = true; }
      // One compressed, cached snapshot every four seconds while live; finals stop and pregame checks continue through kickoff.
      if (!finished) timer = setTimeout(tick, !g ? 60_000 : g.status.state === "in" ? 4_000 : 15_000);
    };
    tick();
    const visible = () => { clearTimeout(timer); if (!document.hidden) void tick(); };
    document.addEventListener("visibilitychange", visible);
    return () => {
      stop = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [league, id, started]);
  return { game, updated };
}

// ---------- player impact (formula and play attribution live in src/playImpact.ts) ----------
export { impact };

/** Position from the roster when we have it, otherwise a best guess from the box score. */
export function positionOf(p: PlayerRow) {
  if (p.pos) return p.pos;
  if (p.kicking && (p.kicking.fga || p.kicking.xpa)) return "K";
  if (p.passing && p.passing.att >= 5) return "QB";
  const rush = p.rushing?.att ?? 0,
    tgt = p.receiving?.tgt ?? p.receiving?.rec ?? 0;
  if (rush || tgt) return rush > tgt ? "RB" : "WR/TE";
  if (p.defensive || p.interceptions) return "DEF";
  return "";
}

// ---------- helpers ----------
type GcTab = "overview" | "stats" | "plays" | "players" | "analysis";
type FlowSide = { abbr: string; name: string; logo?: string };
type TeamLike = { name: string; abbr?: string; logoId: string; color?: string | null; record: string; ranks?: Ranks; advanced?: Advanced };
const pct = (n: number) => `${Math.round(n)}%`;

export default function GameCenter({ espnId, stub, onClose }: { espnId: string | null; stub?: GameStub; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const up = espnId ? slate.games.find((g) => g.espnId === espnId) : undefined;
  const fin = espnId && !up ? results.find((r) => r.espnId === espnId) : undefined;
  const old = !up && !fin ? stub : undefined;
  const league = up?.league ?? fin?.league ?? old?.league ?? null;
  const date = (up as { date?: string } | undefined)?.date ?? fin?.date ?? old?.date ?? "";
  const started = !!date && Date.parse(date) - 20 * 60e3 <= Date.now();
  const boardLive = useLive(espnId);
  const { game, updated } = useLiveGame(league ? (league === "NFL" ? "nfl" : "cfb") : null, espnId, started || !!fin);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (espnId && !d.open) openModal(d);
    if (!espnId && d.open) d.close();
  }, [espnId]);

  // Escape closes it. The browser handles that itself, but it ignores the key for a dialog that opened without a fresh click (the Game Center opens
  // behind its loading shell this way), so if the dialog is still open a moment after Escape, close it here.
  useEffect(() => {
    const d = ref.current;
    if (!d || !espnId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      window.setTimeout(() => { if (d.open && ref.current === d) onClose(); }, 60);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [espnId, onClose]);

  // On a phone the Game Center is a sheet: pulling it down from the top closes it (the way a sheet is dismissed on iOS).
  useEffect(() => {
    const d = ref.current;
    if (!d || !espnId) return;
    let y0 = 0,
      dy = 0,
      dragging = false;
    const body = () => d.querySelector<HTMLElement>(".gc-body");
    const phone = () => window.matchMedia("(max-width: 760px)").matches;
    const start = (e: TouchEvent) => {
      if (!phone() || (body()?.scrollTop ?? 0) > 0) return;
      y0 = e.touches[0].clientY;
      dy = 0;
      dragging = true;
      d.style.transition = "none";
    };
    const move = (e: TouchEvent) => {
      if (!dragging) return;
      dy = e.touches[0].clientY - y0;
      if (dy <= 0) {
        d.style.transform = "";
        return;
      }
      if (e.cancelable) e.preventDefault();
      d.style.transform = `translateY(${dy}px)`;
    };
    const end = () => {
      if (!dragging) return;
      dragging = false;
      d.style.transition = "transform 0.2s ease-out";
      if (dy > 110) {
        d.style.transform = "translateY(100%)";
        setTimeout(() => {
          d.style.transform = "";
          d.style.transition = "";
          onClose();
        }, 180);
      } else {
        d.style.transform = "";
        setTimeout(() => {
          d.style.transition = "";
        }, 220);
      }
    };
    d.addEventListener("touchstart", start, { passive: true });
    d.addEventListener("touchmove", move, { passive: false });
    d.addEventListener("touchend", end);
    d.addEventListener("touchcancel", end);
    return () => {
      d.removeEventListener("touchstart", start);
      d.removeEventListener("touchmove", move);
      d.removeEventListener("touchend", end);
      d.removeEventListener("touchcancel", end);
    };
  }, [espnId, onClose]);

  const teams = ((up?.teams ?? fin?.teams ?? old?.teams.map((t) => ({ ...t, record: "" })) ?? []) as unknown as TeamLike[]).slice(0, 2);
  const [away, home] = teams;
  const abbr = (t?: TeamLike) => t?.abbr ?? t?.name ?? "";
  const flowSide = (t: TeamLike) => ({ abbr: t.abbr ?? t.name, name: t.name, logo: logos[t.logoId] });
  const state = game?.status.state ?? (fin || old ? "post" : "pre");
  const pregame = usePregame({ league: league ?? "", date, state, detail: game?.status.detail });
  const proj: Projection | null =
    ((up as { projected?: Projection } | undefined)?.projected as Projection) ??
    (fin?.scoreCheck ? ({ ...fin.scoreCheck.projected } as Projection) : null);
  const wpData = (up as { winProb?: WinProbData } | undefined)?.winProb ?? null;
  // The scoreboard feed runs 10 to 20 seconds ahead of the game summary, so the score shown is whichever of the two has more points.
  const fromSummary = game ? [game.teams[0]?.score ?? 0, game.teams[1]?.score ?? 0] : null;
  const fromBoard = boardLive && boardLive.state !== "pre" ? [boardLive.away, boardLive.home] : null;
  const ahead = fromBoard && (!fromSummary || fromBoard[0] + fromBoard[1] > fromSummary[0] + fromSummary[1]) ? fromBoard : fromSummary;
  const scoreA = ahead?.[0] ?? (fin ? fin.teams[0].score : old ? old.teams[0].score : null);
  const scoreH = ahead?.[1] ?? (fin ? fin.teams[1].score : old ? old.teams[1].score : null);
  const net = up?.broadcast ?? fin?.broadcast ?? "";
  const netSlug = (up as { network?: string } | undefined)?.network ?? fin?.network ?? null;
  const netLogo = networkLogo(netSlug);
  const badge = gameBadge({ meta: (up as { meta?: string } | undefined)?.meta, event: (up as { event?: string } | undefined)?.event, teams: teams as { logoId?: string }[] });
  const hasAnalysis = !!up || !!fin || !!(!up && !fin && (away?.advanced || home?.advanced));
  const tabs: { id: GcTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    ...(game && state !== "pre"
      ? [
          { id: "stats" as const, label: "Team stats" },
          { id: "plays" as const, label: "Plays & drives" },
          { id: "players" as const, label: "Players" },
        ]
      : []),
    ...(hasAnalysis ? [{ id: "analysis" as const, label: up ? "Matchup & season" : fin ? "Forecast vs final" : "Season stats" }] : []),
  ];
  const [tab, setTab] = useState<GcTab>("overview");
  useEffect(() => setTab("overview"), [espnId]);
  // A tab that goes away (the live data has not loaded yet) falls back to the overview.
  useEffect(() => {
    if (!tabs.some((t) => t.id === tab)) setTab("overview");
  }, [tabs.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const onTabKey = (e: React.KeyboardEvent, id: GcTab) => {
    const i = tabs.findIndex((t) => t.id === id);
    const next = e.key === "ArrowRight" ? tabs[(i + 1) % tabs.length] : e.key === "ArrowLeft" ? tabs[(i - 1 + tabs.length) % tabs.length] : e.key === "Home" ? tabs[0] : e.key === "End" ? tabs[tabs.length - 1] : null;
    if (!next) return;
    e.preventDefault();
    setTab(next.id);
    requestAnimationFrame(() => document.getElementById(`gc-tab-${next.id}`)?.focus());
  };
  // A game that has just ended is not archived yet: estimate its actual watch score from what is on hand.
  const est = !fin && state === "post" && up && game?.wp?.length ? provisionalActual(String(espnId), { away: scoreA ?? 0, home: scoreH ?? 0 }, game.wp as [number, number | null][], /ot/i.test(game.status.detail)) : null;
  const watch = up ? { score: up.score, tier: up.tier } : fin ? { score: fin.actual.score, tier: fin.actual.tier } : null;

  return (
    <dialog
      ref={ref}
      className="gc"
      style={{ "--team-bg": teamColor(home?.color ?? null) ?? "#1d2a35", "--away-bg": teamColor(away?.color ?? null) ?? "#1d2a35", ...(altColor(home?.logoId) ? { "--team-alt": altColor(home?.logoId) } : {}), ...(altColor(away?.logoId) ? { "--away-alt": altColor(away?.logoId) } : {}) } as CSSProperties}
      aria-label={up?.matchup ?? fin?.matchup ?? old?.matchup ?? "Game Center"}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {espnId && away && home && (
        <>
        <span className="gc-grabber" aria-hidden="true" />
        <button className="gc-close" onClick={onClose} aria-label="Close Game Center">
          <span className="gc-x" aria-hidden="true">×</span>
          <span className="gc-back" aria-hidden="true">‹</span>
        </button>
        <div className="gc-bar" aria-hidden="true">Game Center</div>
        <div className="gc-body">
          {pregame && (pregame.league === "NFL"
            ? <PregameCheer pregame={pregame} badge={badge} weather={(up as { weather?: WeatherLike } | undefined)?.weather} espnId={espnId} away={{ ...away, logoId: away.logoId, conf: away.ranks?.confName }} home={{ ...home, logoId: home.logoId, conf: home.ranks?.confName }} />
            : <HalftimeBand pregame={pregame} badge={badge} weather={(up as { weather?: WeatherLike } | undefined)?.weather} espnId={espnId} away={{ ...away, logoId: away.logoId, conf: away.ranks?.confName }} home={{ ...home, logoId: home.logoId, conf: home.ranks?.confName }} />)}
          {(league === "CFB" || league === "NFL") && state === "in" && isHalftime(game?.status.detail) && (() => {
            const Halftime = league === "NFL" ? HalftimeAct : HalftimeBand;
            return <Halftime badge={badge} weather={(up as { weather?: WeatherLike } | undefined)?.weather} espnId={espnId} away={{ ...away, logoId: away.logoId, conf: away.ranks?.confName }} home={{ ...home, logoId: home.logoId, conf: home.ranks?.confName }} />;
          })()}
          {/* Scoreboard */}
          <header className="gc-head" style={{ background: `linear-gradient(90deg, ${away.color ?? "#17222c"}, #111a22 42%, #111a22 58%, ${home.color ?? "#17222c"})` }}>
            <TeamHead t={away} league={league ?? ""} onClose={onClose} score={scoreA} poss={!!game?.situation?.possession && game.situation.possession === game.teams[0]?.id} win={state === "post" && scoreA! > scoreH!} />
            <div className="gc-mid">
              <GameBadgeRow badge={badge} large />
              <RivalryBadge rivalry={(up as { rivalry?: Rivalry } | undefined)?.rivalry} compact={false} />
              <span className={`gc-state ${state}`}>{state === "in" ? "Live" : state === "post" ? "Final" : "Upcoming"}</span>
              <strong className="gc-clock">
                {state === "pre" ? `${dayOf(date)} ${timeOf(date, undefined, true)} ${tzAbbr()}` : game?.status.detail ?? fin?.final.detail ?? "Final"}
              </strong>
              {game?.situation?.text && state === "in" && (
                <span className={`gc-sit ${game.situation.redZone ? "rz" : ""}`}>{game.situation.text}</span>
              )}
              <span className="gc-net">
                {netLogo && (
                  <span className="net-chip">
                    <img src={netLogo} alt="" height="14" />
                  </span>
                )}
                {netLogo ? (
                  <>
                    <span className="sr-only">{net}</span>
                    {broadcastExtra(net ?? "", netSlug) && <span aria-hidden="true">{broadcastExtra(net ?? "", netSlug)}</span>}
                  </>
                ) : (
                  net
                )}
              </span>
              {fin ? (
                <span className={`gc-watch ${fin.actual.tier}`}>
                  Forecast {fin.forecast.score} → Actual {fin.actual.score} · {tierLabel(fin.actual.tier)}
                </span>
              ) : (
                watch && (
                  <span className={`gc-watch ${watch.tier}`}>
                    {state === "post" ? "Forecast" : "Watchability"} {watch.score} · {tierLabel(watch.tier)}
                    {state === "post" && est && (
                      <>
                        {" "}→ Actual ~{est.score} · {est.label}
                      </>
                    )}
                    {state === "post" && <small className="gc-watch-note">{est ? "Actual is an estimate until the next refresh archives the game" : "Actual score posts with the next refresh"}</small>}
                  </span>
                )
              )}
            </div>
            <TeamHead t={home} league={league ?? ""} onClose={onClose} score={scoreH} poss={!!game?.situation?.possession && game.situation.possession === game.teams[1]?.id} win={state === "post" && scoreH! > scoreA!} right />
          </header>
          <div className="gc-scorebar">
          {game && (game.teams[0].linescores.length > 0) && <Linescore game={game} logoUrls={[logos[away.logoId], logos[home.logoId]]} />}
          {game && state !== "pre" && <GlanceTiles game={game} away={abbr(away)} home={abbr(home)} />}
          {updated && state === "in" && (
            <p className="gc-updated" role="status">
              Updating every 4 seconds · last {updated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}
            </p>
          )}
          </div>

          <nav className="gc-tabs" role="tablist" aria-label="Game Center sections">
            {tabs.map((t) => (
              <button key={t.id} id={`gc-tab-${t.id}`} role="tab" type="button" className="gc-tab" aria-selected={tab === t.id} aria-controls="gc-tabpanel" tabIndex={tab === t.id ? 0 : -1} onClick={() => setTab(t.id)} onKeyDown={(e) => onTabKey(e, t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
          <div className="gc-grid" id="gc-tabpanel" role="tabpanel" aria-labelledby={`gc-tab-${tab}`}>
            {tab === "overview" && (
              <>
                {game && state !== "pre" && !isHalftime(game.status.detail) && latestShape(game.plays) && (
                  <section className="gc-panel gc-wide gc-lastplay">
                    <h3 className="micro-label">{state === "in" ? "Live field · last play" : "Last play"}</h3>
                    <LastPlay plays={game.plays} nfl={league === "NFL"} live={state === "in"} situation={game.situation?.text} teams={[away, home].map((t, i) => ({ id: game.teams[i]?.id, abbr: t?.abbr, name: t?.name ?? "", color: t?.color, logoId: t?.logoId, conf: t?.ranks?.confName }))} />
                  </section>
                )}
            {/* Projection */}
            <section className="gc-panel">
              <h3 className="micro-label">Projection</h3>
              {league === "CFB" && date && (
                <SpPlusProjection
                  away={away}
                  home={home}
                  date={date}
                  onOpen={() => {
                    onClose();
                    window.dispatchEvent(new CustomEvent("fbwatch:open-view", { detail: "spplus" }));
                  }}
                />
              )}
              {league === "NFL" && (
                <NflProjectionBlock
                  espnId={espnId}
                  onOpen={() => {
                    onClose();
                    window.dispatchEvent(new CustomEvent("fbwatch:open-view", { detail: "nfl" }));
                  }}
                />
              )}
              {proj && (
                <div className="gc-proj">
                  <div>
                    <span className="gc-k">Projected score</span>
                    <strong>
                      {abbr(away)} {proj.away} – {proj.home} {abbr(home)}
                    </strong>
                  </div>
                  <div>
                    <span className="gc-k">Projected winner</span>
                    <strong>
                      {proj.home > proj.away ? home.name : away.name}
                      {` by ${Math.abs(proj.home - proj.away)}`}
                    </strong>
                  </div>
                  {game && state !== "pre" && game.wp.length > 0 && (
                    <div>
                      <span className="gc-k">{state === "in" ? "Win probability now" : "Final"}</span>
                      <strong>
                        {state === "post"
                          ? `${(scoreH ?? 0) > (scoreA ?? 0) ? home.name : away.name} won`
                          : (() => {
                              const h = game.wp[game.wp.length - 1][0];
                              return h >= 50 ? `${abbr(home)} ${pct(h)}` : `${abbr(away)} ${pct(100 - h)}`;
                            })()}
                      </strong>
                    </div>
                  )}
                </div>
              )}
              {proj?.parts && <ProjectedScore p={proj} away={abbr(away)} home={abbr(home)} listOnly />}
              {wpData && <PregameWinProb wp={wpData} away={abbr(away)} home={abbr(home)} />}
            </section>

            {league === "NFL" && <NflSettingPanel espnId={espnId} />}

            {game && game.wp.length > 8 ? (
              <section className="gc-panel">
                <InsanityMeter
                  wp={game.wp.map(([p, q]) => [Math.round(p), q])}
                  final={state === "post"}
                  overtime={game.status.period > 4}
                  away={abbr(away)}
                  home={abbr(home)}
                />
              </section>
            ) : (
              <section className="gc-panel gc-wait">
                <h3 className="micro-label">Live view</h3>
                <p>
                  {state === "pre"
                    ? `Top 3 / bottom 3 players, the live win-probability chart, momentum, field tilt, drive chart and player tracker start at kickoff (${dayOf(date)} ${timeOf(date, undefined, true)} ${tzAbbr()}).`
                    : "Loading live data…"}
                </p>
              </section>
            )}

                {game && state !== "pre" && <Momentum game={game} away={away} home={home} />}
                {up && loreFor(up) && <section className="gc-panel gc-wide"><h3 className="micro-label">The rivalry, deep cut</h3><RivalryDeepCut game={up} /></section>}
              </>
            )}
            {tab === "stats" && game && state !== "pre" && (
              <>
                <TeamStatsPanel game={game} away={flowSide(away)} home={flowSide(home)} />
                <div className="ts-col">
                  <TiltPanel game={game} away={flowSide(away)} home={flowSide(home)} />
                  <TakeawaysPanel game={game} away={flowSide(away)} home={flowSide(home)} />
                </div>
              </>
            )}
            {tab === "plays" && game && state !== "pre" && (
              <>
                <Feed game={game} away={flowSide(away)} home={flowSide(home)} />
                {latestShape(game.plays) && (
                  <section className="gc-panel pd-anim" aria-label="Play animation">
                    <h3 className="pd-title"><i aria-hidden="true" />Play animation{game.status.state === "in" && !isHalftime(game.status.detail) && <span className="pd-title-r">Q{game.status.period} {game.status.clock}</span>}</h3>
                    <LastPlay plays={game.plays} nfl={league === "NFL"} live={state === "in"} situation={game.situation?.text} teams={[away, home].map((t, i) => ({ id: game.teams[i]?.id, abbr: t?.abbr, name: t?.name ?? "", color: t?.color, logoId: t?.logoId, conf: t?.ranks?.confName }))} />
                  </section>
                )}
                <Drives game={game} away={flowSide(away)} home={flowSide(home)} />
              </>
            )}
            {tab === "players" && game && state !== "pre" && (
              <>
                <TopBottom game={game} teams={[away, home]} />
                <Tracker game={game} teams={[away, home]} />
              </>
            )}
            {tab === "analysis" && (
              <>
            {up && <><MatchupPanel game={up} /><section className="gc-panel gc-wide gc-deep-analysis"><h3 className="pd-title"><i aria-hidden="true" />Offense vs. defense <small className="mp-sub">(season avg)</small></h3><GameDetails game={up} defaultOpen={false} /></section></>}
            {fin && <section className="gc-panel gc-wide"><h3 className="micro-label">Forecast & final analysis</h3><ResultAnalysis result={fin} /></section>}
            {!up && !fin && (away.advanced || home.advanced) && (
              <section className="gc-panel gc-wide">
                <h3 className="micro-label">Advanced stats + rankings (season)</h3>
                <AdvancedStats league={league ?? "NFL"} away={{ abbr: abbr(away), adv: away.advanced ?? null }} home={{ abbr: abbr(home), adv: home.advanced ?? null }} />
              </section>
            )}
              </>
            )}
          </div>
        </div>
        </>
      )}
    </dialog>
  );
}

function TeamHead({ t, league, onClose, score, poss, win, right }: { t: TeamLike; league: string; onClose: () => void; score: number | null; poss?: boolean; win?: boolean; right?: boolean }) {
  return (
    <div className={`gc-team ${right ? "right" : ""}`}>
      <TeamOpen className="img" before={onClose} team={{ league, name: t.name, abbr: t.abbr }}><img src={logos[t.logoId]} alt="" width="64" height="64" /></TeamOpen>
      <div>
        <h2>
          <TeamOpen before={onClose} team={{ league, name: t.name, abbr: t.abbr }}>{t.name}</TeamOpen>
          {poss && <FootballIcon title="Has the ball" />}
        </h2>
        <p>{t.record.split(" · ")[0]}</p>
        {rankLine(t.ranks) && <p className="rank-line">{rankLine(t.ranks)}</p>}
      </div>
      {score != null && <strong className={`gc-score ${win ? "win" : ""}`}>{score}</strong>}
    </div>
  );
}

function Linescore({ game, logoUrls }: { game: LiveGame; logoUrls?: (string | undefined)[] }) {
  const n = Math.max(...game.teams.map((t) => t.linescores.length), 4);
  return (
    <table className="gc-lines">
      <thead>
        <tr>
          <th scope="col">
            <span className="sr-only">Team</span>
          </th>
          {Array.from({ length: n }, (_, i) => (
            <th scope="col" key={i}>
              {i < 4 ? i + 1 : "OT"}
            </th>
          ))}
          <th scope="col">T</th>
        </tr>
      </thead>
      <tbody>
        {game.teams.map((t, ti) => (
          <tr key={t.id}>
            <th scope="row">{logoUrls?.[ti] && <img src={logoUrls[ti]} alt="" width="22" height="22" className="gc-lines-logo" />}{t.abbr}</th>
            {Array.from({ length: n }, (_, i) => (
              <td key={i}>{t.linescores[i] ?? "–"}</td>
            ))}
            <td className="t">{t.score}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Game flow & momentum: the win-probability story of the game, in the design's panel. */
function Momentum({ game, away, home }: { game: LiveGame; away: TeamLike; home: TeamLike }) {
  const side = (t: TeamLike) => ({ abbr: t.abbr ?? t.name, name: t.name, logo: logos[t.logoId] });
  return <GameFlowPanel wp={game.wp} status={game.status} away={side(away)} home={side(home)} />;
}

/** Drive chart: every drive as a bar on the field, from start to finish. */
function Drives({ game, away, home }: { game: LiveGame; away: FlowSide; home: FlowSide }) {
  const ds = game.drives.filter((d) => d.from != null);
  if (!ds.length) return null;
  const hid = game.teams[1].id;
  return (
    <section className="gc-panel pd-drives">
      <h3 className="pd-title"><i aria-hidden="true" />Drive chart<span className="pd-key"><i className="a" />{away.abbr}<i className="h" />{home.abbr}</span></h3>
      <p className="sr-only">Each bar runs from where the drive started to where it ended, toward the opponent's end zone on the right.</p>
      <ol className="gc-drives">
        {ds.map((d, i) => {
          const isH = d.team === hid;
          const a = Math.max(0, Math.min(100, d.from ?? 0));
          const b = Math.max(0, Math.min(100, d.to ?? a));
          const lo = Math.min(a, b),
            hi = Math.max(a, b);
          const res = d.current ? "In progress" : d.result;
          return (
            <li key={i} className={`${d.score ? "scored" : ""} ${/intercept|fumble|downs/i.test(d.result) ? "lost" : ""}`}>
              <span className="gc-dteam">
                <b>{isH ? home.abbr : away.abbr}</b>
                <small>
                  Q{d.period} {d.clock}
                </small>
              </span>
              <span className="gc-field">
                <i className="gc-50" />
                <i className={`gc-dbar ${isH ? "h" : "a"}`} style={{ left: `${lo}%`, width: `${Math.max(1.2, hi - lo)}%` }} />
              </span>
              <span className="gc-dres">
                <strong>{res}</strong>
                <small>
                  {d.plays} plays, {d.yards} yds, {d.time}
                </small>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function TopBottom({ game, teams }: { game: LiveGame; teams: TeamLike[] }) {
  return (
    <section className="gc-panel gc-wide pl-top">
      <h3 className="pd-title"><i aria-hidden="true" />Top performers</h3>
      <p className="gc-note">
        Top 3 / bottom 3 by team, ranked by a box-score impact score: yards, touchdowns and takeaways add; interceptions, fumbles, sacks taken and
        missed targets or kicks subtract. Bottom 3 only counts players with real involvement.
      </p>
      <div className="gc-tb">
        {game.teams.map((t, i) => {
          const ps = (game.players[t.id] ?? []).map((p) => ({ p, ...impact(p) }));
          const top = [...ps].sort((a, b) => b.value - a.value).slice(0, 3);
          const involved = ps.filter((x) => x.touches >= 5 || x.bad.length);
          const bottom = [...involved]
            .filter((x) => !top.some((y) => y.p.id === x.p.id))
            .sort((a, b) => a.value - b.value)
            .slice(0, 3);
          return (
            <div key={t.id} className={`gc-tbteam ${i ? "h" : "a"}`}>
              <h4>
                <img src={logos[teams[i].logoId]} alt="" width="22" height="22" /> {teams[i].name}
              </h4>
              <h5 className="gc-tbl top">Top 3 impact</h5>
              <ol className="gc-top">
                {top.map((x) => (
                  <PlayerLine key={x.p.id} x={x} team={{ ...teams[i], abbr: t.abbr }} game={game} good />
                ))}
              </ol>
              <h5 className="gc-tbl bottom">Bottom 3 impact</h5>
              <ol className="gc-bottom">
                {bottom.map((x) => (
                  <PlayerLine key={x.p.id} x={x} team={{ ...teams[i], abbr: t.abbr }} game={game} />
                ))}
                {!bottom.length && <li className="gc-none">No one struggling yet</li>}
              </ol>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const periodName = (q: number | null) => (q == null ? "" : q > 4 ? "OT" : `Q${q}`);
/** "+1.1", "−0.15", "+6": sign always shown, at most two decimals. */
const pts = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(Math.round(n * 100) / 100)}`;

function PlayerLine({
  x,
  team,
  good,
  game,
}: {
  x: { p: PlayerRow; value: number; line: string; bad: string[] };
  team: TeamLike & { abbr: string };
  good?: boolean;
  game: LiveGame;
}) {
  const color = teamColor(team.color ?? null) ?? "#1d2a35";
  const pos = positionOf(x.p);
  const [open, setOpen] = useState(false);
  const canOpen = !!game.log?.length;
  const detail = useMemo(() => (open ? attributePlays(x.p, game, x.value) : null), [open, game, x.p, x.value]);
  const panel = `plays-${team.abbr}-${x.p.id}`;
  const value = (
    <>
      <span aria-hidden="true">{good ? "▲" : "▼"}</span>
      {x.value > 0 ? "+" : ""}
      {x.value}
    </>
  );
  return (
    <li className={`gc-pcard${open ? " open" : ""}`} style={{ "--team": color } as CSSProperties}>
      <span className="gc-ph">
        <Headshot src={x.p.headshot} name={x.p.name} size={40} />
        <img className="gc-plogo" src={logos[team.logoId]} alt="" width="20" height="20" />
      </span>
      <span className="gc-pl">
        <strong>
          {x.p.short}
          {pos && (
            <span className="gc-pos" title={pos === "WR/TE" || pos === "DEF" ? "Position estimated from the box score" : "Position"}>
              {pos}
            </span>
          )}
        </strong>
        <span className="gc-pteam">
          {team.abbr}
          {x.p.jersey ? ` · #${x.p.jersey}` : ""}
        </span>
        <small>{good || !x.bad.length ? x.line : `${x.bad.join(", ")} · ${x.line}`}</small>
      </span>
      {canOpen ? (
        <button
          type="button"
          className={`gc-imp gc-imp-btn ${good ? "pos" : "neg"}`}
          aria-expanded={open}
          aria-controls={panel}
          title="Impact score. Click to see the plays behind it"
          onClick={() => setOpen((v) => !v)}
        >
          {value}
          <span className="gc-imp-more" aria-hidden="true">
            {open ? "Hide plays ▴" : "Plays ▾"}
          </span>
        </button>
      ) : (
        <span className={`gc-imp ${good ? "pos" : "neg"}`} title="Impact score">
          {value}
        </span>
      )}
      {open && detail && <PlayList id={panel} detail={detail} value={x.value} name={x.p.short} />}
    </li>
  );
}

/**
 * The plays behind a player's impact number. Opens as a summary (the three plays that
 * moved it most, everything else rolled up by kind of play); the full list is one click away.
 */
function PlayList({ id, detail, value, name }: { id: string; detail: { events: ImpactEvent[]; other: number }; value: number; name: string }) {
  const [all, setAll] = useState(false);
  const { events, other } = detail;
  const sum = useMemo(() => summarizeEvents(events), [events]);
  const hasOther = Math.abs(other) >= 0.05;
  const small = events.length <= 3; // nothing to roll up
  const full = all || small;
  const row = (e: ImpactEvent, i: number) => (
    <li key={`${e.id}-${i}`} className={e.points >= 0 ? "pos" : "neg"}>
      <span className="gc-pa" title={ART_LABEL[e.art]}>
        <PlayArt kind={e.art} size={24} />
      </span>
      <span className="gc-pw">
        <strong>{e.role.charAt(0).toUpperCase() + e.role.slice(1)}</strong>
        {(e.period != null || e.clock) && (
          <em>
            {periodName(e.period)} {e.clock}
          </em>
        )}
        <small>{e.text}</small>
      </span>
      <span className="gc-ppts">
        {e.yards != null && (
          <i>
            {e.yards > 0 ? "+" : ""}
            {e.yards} yd
          </i>
        )}
        <b>{pts(e.points)}</b>
      </span>
    </li>
  );
  const otherNote = "Credit from the box score that the play log doesn't tie to a single play, such as tackles on special teams.";
  const parts = full
    ? [`${events.length} play${events.length === 1 ? "" : "s"} ${pts(Math.round((value - other) * 100) / 100)}`]
    : [`top ${sum.top.length} ${pts(sum.topPoints)}`, sum.restCount ? `${sum.restCount} other plays ${pts(sum.restPoints)}` : ""];
  if (hasOther) parts.push(`box-score credit ${pts(other)}`);
  return (
    <div className="gc-plays" id={id}>
      <p className="gc-plays-head">
        <strong>
          {name}'s {full ? "plays" : "biggest plays"}
        </strong>
        <span>
          {parts.filter(Boolean).join(" · ")} = <b>{pts(value)}</b>
        </span>
      </p>
      <ol className="gc-playlist">
        {(full ? events : sum.top).map(row)}
        {full && hasOther && (
          <li className="other" title={otherNote}>
            <span className="gc-pa">
              <PlayArt kind="other" size={24} />
            </span>
            <span className="gc-pw">
              <strong>Other box-score credit</strong>
              <small>Not tied to a listed play (special teams, assists, stats the play text doesn't name).</small>
            </span>
            <span className="gc-ppts">
              <b>{pts(other)}</b>
            </span>
          </li>
        )}
        {!events.length && !hasOther && (
          <li className="none">
            <span className="gc-pw">
              <small>No plays credited yet.</small>
            </span>
          </li>
        )}
      </ol>
      {!full && (sum.rest.length > 0 || hasOther) && (
        <ul className="gc-rest" aria-label="Everything else">
          {sum.rest.map((g) => (
            <li key={g.art} className={`gc-chip ${g.points >= 0 ? "pos" : "neg"}`}>
              <PlayArt kind={g.art} size={18} />
              <span>
                {g.count} {ART_COUNT[g.art][g.count === 1 ? 0 : 1]}
              </span>
              <b>{pts(g.points)}</b>
            </li>
          ))}
          {hasOther && (
            <li className="gc-chip other" title={otherNote}>
              <PlayArt kind="other" size={18} />
              <span>Other box-score credit</span>
              <b>{pts(other)}</b>
            </li>
          )}
        </ul>
      )}
      {!small && (
        <button type="button" className="gc-allplays" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? "Show biggest plays only" : `See all ${events.length} plays`}
        </button>
      )}
    </div>
  );
}

/** Player tracker: every player with a stat line, grouped by role. */
function Tracker({ game, teams }: { game: LiveGame; teams: TeamLike[] }) {
  const [tab, setTab] = useState(0);
  const t = game.teams[tab];
  const ps = game.players[t.id] ?? [];
  const n = (v: number | undefined) => String(v ?? 0);
  const groups: [string, string[], (p: PlayerRow) => string[] | null, (p: PlayerRow) => number][] = [
    ["Passing", ["C/Att", "Yds", "TD", "INT"], (p) => (p.passing?.att ? [`${p.passing.cmp}/${p.passing.att}`, n(p.passing.yds), n(p.passing.td), n(p.passing.int)] : null), (p) => p.passing?.yds ?? 0],
    ["Rushing", ["Car", "Yds", "Avg", "TD"], (p) => (p.rushing?.att ? [n(p.rushing.att), n(p.rushing.yds), (p.rushing.yds / p.rushing.att).toFixed(1), n(p.rushing.td)] : null), (p) => p.rushing?.yds ?? 0],
    ["Receiving", ["Rec", "Yds", "TD", "Long"], (p) => (p.receiving?.rec || p.receiving?.tgt ? [n(p.receiving.rec), n(p.receiving.yds), n(p.receiving.td), n(p.receiving.long)] : null), (p) => p.receiving?.yds ?? 0],
    ["Defense", ["Tkl", "TFL", "Sck", "INT"], (p) => (p.defensive && (p.defensive.tkl || p.defensive.sacks || p.defensive.pd) ? [n(p.defensive.tkl), n(p.defensive.tfl), n(p.defensive.sacks), n(p.interceptions?.int)] : null), (p) => (p.defensive?.tkl ?? 0) + (p.defensive?.sacks ?? 0) * 3],
  ];
  return (
    <section className="gc-panel gc-wide pl-track">
      <div className="gc-tabs-head">
        <h3 className="pd-title"><i aria-hidden="true" />Player tracker</h3>
        <div className="segmented" role="group" aria-label="Team">
          {game.teams.map((tm, i) => (
            <button key={tm.id} aria-pressed={tab === i} onClick={() => setTab(i)}>
              <img src={logos[teams[i].logoId]} alt="" width="22" height="22" /> {tm.abbr}
            </button>
          ))}
        </div>
      </div>
      <div className="gc-tracker">
        {groups.map(([label, cols, cells, sort]) => {
          const rows = ps.filter((p) => cells(p)).sort((a, b) => sort(b) - sort(a)).slice(0, label === "Defense" ? 6 : 5);
          if (!rows.length) return null;
          return (
            <div key={label} className="pl-group">
              <div className="pl-head" aria-hidden="true"><h4>{label}</h4>{cols.map((c) => <span key={c}>{c}</span>)}</div>
              <ul aria-label={label}>
                {rows.map((p) => (
                  <li key={p.id}>
                    <span className="gc-jersey">{p.jersey ? `#${p.jersey}` : ""}</span>
                    <strong>{p.short}</strong>
                    <span className="gc-pos">{positionOf(p)}</span>
                    {(cells(p) ?? []).map((v, i) => <span key={i} className="c" aria-label={`${cols[i]} ${v}`}>{v}</span>)}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Feed({ game, away, home }: { game: LiveGame; away: FlowSide; home: FlowSide }) {
  const hid = game.teams[1].id;
  const plays = [...game.plays].reverse().slice(0, 12);
  const head = game.status.state === "in" ? (isHalftime(game.status.detail) ? "Halftime" : `Q${game.status.period} ${game.status.clock}`) : game.status.state === "post" ? "Final" : "";
  return (
    <section className="gc-panel gc-feedpanel pd-feed">
      <h3 className="pd-title"><i aria-hidden="true" />{game.status.state === "in" ? "Live play-by-play" : "Last plays"}{head && <span className="pd-title-r">{head}</span>}</h3>
      {game.situation?.lastPlay && game.status.state === "in" && <p className="gc-last">{game.situation.lastPlay}</p>}
      <ol className="gc-feed">
        {plays.map((p, i) => {
          const side = p.team === hid ? home : away;
          return (
            <li key={p.id} className={`${p.score ? "is-score" : ""} ${p.turnover ? "is-to" : ""} ${i === 0 ? "latest" : ""} ${p.team === hid ? "h" : "a"}`}>
              <span className="gc-when">
                Q{p.period} {p.clock}
              </span>
              <span className="gc-who">{side.logo && <img src={side.logo} alt="" width="26" height="26" />}{side.abbr}</span>
              <span className="gc-what">{p.text}</span>
            </li>
          );
        })}
      </ol>
      {game.scoring.length > 0 && (
        <>
          <h4 className="gc-sub">Scoring</h4>
          <ol className="gc-feed gc-scoring">
            {game.scoring.map((s, i) => (
              <li key={i} className="is-score">
                <span className="gc-when">
                  Q{s.period} {s.clock}
                </span>
                <span className="gc-who">{s.team}</span>
                <span className="gc-what">
                  {s.text} <strong>({away.abbr} {s.away}–{s.home} {home.abbr})</strong>
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
