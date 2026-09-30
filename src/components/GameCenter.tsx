import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { logos, networkLogo, rankLine, results, slate, tierLabel, type Ranks } from "../data";
import { trimGame } from "../gameTrim.js";
import { dayOf, timeOf, tzAbbr } from "../tz";
import { AdvancedStats, type Advanced } from "./AdvancedStats";
import { PregameWinProb, type WinProbData } from "./PregameWinProb";
import { ProjectedScore, type Projection } from "./ProjectedScore";
import { WinProb } from "./WinProb";

// ---------- open/close from anywhere ----------
const Ctx = createContext<(espnId: string) => void>(() => {});
export const useOpenGame = () => useContext(Ctx);

export function GameCenterProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<string | null>(null);
  return (
    <Ctx.Provider value={setId}>
      {children}
      <GameCenter espnId={id} onClose={() => setId(null)} />
    </Ctx.Provider>
  );
}

// ---------- live data ----------
type Side = { id: string; abbr: string; name: string; homeAway: string; score: number; linescores: number[]; possession: boolean };
type Drive = { team: string; period: number | null; clock: string; from: number | null; to: number | null; yards: number; plays: number; result: string; score: boolean; time: string; current: boolean };
type Play = { id: string; team: string; period: number | null; clock: string; text: string; kind: string; yards: number; toGo: number | null; offense: boolean; score: boolean; turnover: boolean };
type TeamStats = { yards: number; ypp: number; plays: number; firstDowns: number; third: string; redZone: string; turnovers: number; top: string; penalties: string; passYds: number; rushYds: number };
type PlayerRow = {
  id: string;
  name: string;
  short: string;
  jersey: string;
  headshot: string | null;
  passing?: { cmp: number; att: number; yds: number; td: number; int: number; sacks: number; qbr: number | null };
  rushing?: { att: number; yds: number; td: number; long: number };
  receiving?: { rec: number; yds: number; td: number; tgt: number; long: number };
  fumbles?: { fum: number; lost: number };
  defensive?: { tkl: number; sacks: number; tfl: number; pd: number; hits: number; td: number };
  interceptions?: { int: number; yds: number; td: number };
  kicking?: { fgm: number; fga: number; xpm: number; xpa: number; long: number };
};
export type LiveGame = {
  id: string;
  status: { state: "pre" | "in" | "post"; detail: string; period: number; clock: string };
  teams: Side[];
  situation: { text: string; possession: string | null; toGo: number | null; redZone: boolean; lastPlay: string } | null;
  wp: [number, number | null][];
  drives: Drive[];
  plays: Play[];
  allOffense: [number, number, number, number][]; // [side 0 away/1 home, yards to end zone, quarter, yards gained]
  scoring: { period: number; clock: string; team: string; text: string; away: number; home: number }[];
  teamStats: Record<string, TeamStats>;
  players: Record<string, PlayerRow[]>;
};

const PATHS: Record<string, string> = { nfl: "nfl", cfb: "college-football" };
async function fetchGame(league: string, id: string): Promise<LiveGame | null> {
  try {
    const r = await fetch(`/api/game?league=${league}&event=${id}`);
    if (r.ok && (r.headers.get("content-type") ?? "").includes("json")) return await r.json();
  } catch {
    /* fall through */
  }
  try {
    const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/${PATHS[league]}/summary?event=${id}`);
    if (r.ok) return trimGame(await r.json()) as LiveGame;
  } catch {
    /* offline */
  }
  return null;
}

function useLiveGame(league: string | null, id: string | null, started: boolean) {
  const [game, setGame] = useState<LiveGame | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);
  useEffect(() => {
    setGame(null);
    if (!id || !league || !started) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const g = await fetchGame(league, id);
      if (stop) return;
      if (g) {
        setGame(g);
        setUpdated(new Date());
      }
      // Every 15 seconds while live; a finished game needs one load.
      if (!g || g.status.state === "in") timer = setTimeout(tick, g ? 15_000 : 60_000);
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [league, id, started]);
  return { game, updated };
}

// ---------- player impact ----------
/**
 * A simple box-score impact score for ranking players within a game: yards,
 * touchdowns and takeaways count up; interceptions, fumbles lost, sacks taken
 * and incompletions on targets count down.
 */
export function impact(p: PlayerRow) {
  let v = 0;
  const why: string[] = [];
  const bad: string[] = [];
  if (p.passing && p.passing.att) {
    const x = p.passing;
    v += x.yds * 0.04 + x.td * 4 - x.int * 4.5 - x.sacks * 0.7 - (x.att - x.cmp) * 0.15;
    why.push(`${x.cmp}/${x.att}, ${x.yds} yds${x.td ? `, ${x.td} TD` : ""}${x.int ? `, ${x.int} INT` : ""}`);
    if (x.int) bad.push(`${x.int} INT`);
    if (x.sacks >= 3) bad.push(`sacked ${x.sacks}×`);
  }
  if (p.rushing && p.rushing.att) {
    const x = p.rushing;
    v += x.yds * 0.1 + x.td * 6 - (x.att >= 8 && x.yds / x.att < 3 ? 2 : 0);
    why.push(`${x.att} car, ${x.yds} yds${x.td ? `, ${x.td} TD` : ""}`);
    if (x.att >= 8 && x.yds / x.att < 3) bad.push(`${(x.yds / x.att).toFixed(1)} yds/car`);
  }
  if (p.receiving && (p.receiving.tgt || p.receiving.rec)) {
    const x = p.receiving;
    const miss = Math.max(0, x.tgt - x.rec);
    v += x.yds * 0.1 + x.rec * 0.5 + x.td * 6 - miss * 0.4;
    why.push(`${x.rec}/${x.tgt || x.rec} rec, ${x.yds} yds${x.td ? `, ${x.td} TD` : ""}`);
    if (miss >= 4) bad.push(`${miss} targets not caught`);
  }
  if (p.fumbles?.lost) {
    v -= p.fumbles.lost * 4;
    bad.push(`${p.fumbles.lost} fumble${p.fumbles.lost > 1 ? "s" : ""} lost`);
  }
  if (p.defensive) {
    const x = p.defensive;
    v += x.tkl * 0.5 + x.sacks * 3 + x.tfl * 1 + x.pd * 1 + x.hits * 0.5 + x.td * 6;
    if (x.tkl || x.sacks || x.pd)
      why.push([x.tkl && `${x.tkl} tkl`, x.sacks && `${x.sacks} sk`, x.tfl && `${x.tfl} TFL`, x.pd && `${x.pd} PD`].filter(Boolean).join(", "));
  }
  if (p.interceptions?.int) {
    v += p.interceptions.int * 4.5 + p.interceptions.td * 6;
    why.push(`${p.interceptions.int} INT`);
  }
  if (p.kicking && (p.kicking.fga || p.kicking.xpa)) {
    const x = p.kicking;
    v += x.fgm * 2 - (x.fga - x.fgm) * 3 - (x.xpa - x.xpm) * 1.5;
    why.push(`FG ${x.fgm}/${x.fga}, XP ${x.xpm}/${x.xpa}`);
    if (x.fga - x.fgm) bad.push(`${x.fga - x.fgm} missed FG`);
  }
  // Involvement: enough touches that a bad day means something.
  const touches =
    (p.passing?.att ?? 0) + (p.rushing?.att ?? 0) + (p.receiving?.tgt ?? p.receiving?.rec ?? 0) + (p.kicking?.fga ?? 0) * 3;
  return { value: Math.round(v * 10) / 10, line: why.join(" · "), bad, touches };
}

// ---------- helpers ----------
type SlateGame = (typeof slate.games)[number];
type Result = (typeof results)[number];
type TeamLike = { name: string; abbr?: string; logoId: string; color?: string | null; record: string; ranks?: Ranks; advanced?: Advanced };
const mmss = (t: string) => {
  const [m, s] = t.split(":").map(Number);
  return (m || 0) * 60 + (s || 0);
};
const pct = (n: number) => `${Math.round(n)}%`;

function GameCenter({ espnId, onClose }: { espnId: string | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const up = espnId ? slate.games.find((g) => g.espnId === espnId) : undefined;
  const fin = espnId && !up ? results.find((r) => r.espnId === espnId) : undefined;
  const league = up?.league ?? fin?.league ?? null;
  const date = (up as { date?: string } | undefined)?.date ?? fin?.date ?? "";
  const started = !!date && Date.parse(date) - 20 * 60e3 <= Date.now();
  const { game, updated } = useLiveGame(league ? (league === "NFL" ? "nfl" : "cfb") : null, espnId, started || !!fin);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (espnId && !d.open) d.showModal();
    if (!espnId && d.open) d.close();
  }, [espnId]);

  const teams = ((up?.teams ?? fin?.teams ?? []) as unknown as TeamLike[]).slice(0, 2);
  const [away, home] = teams;
  const abbr = (t?: TeamLike) => t?.abbr ?? t?.name ?? "";
  const state = game?.status.state ?? (fin ? "post" : "pre");
  const proj: Projection | null =
    ((up as { projected?: Projection } | undefined)?.projected as Projection) ??
    (fin?.scoreCheck ? ({ ...fin.scoreCheck.projected } as Projection) : null);
  const wpData = (up as { winProb?: WinProbData } | undefined)?.winProb ?? null;
  const scoreA = game?.teams[0]?.score ?? (fin ? fin.teams[0].score : null);
  const scoreH = game?.teams[1]?.score ?? (fin ? fin.teams[1].score : null);
  const net = up?.broadcast ?? fin?.broadcast ?? "";
  const netSlug = (up as { network?: string } | undefined)?.network ?? fin?.network ?? null;
  const netLogo = networkLogo(netSlug);
  const watch = up ? { score: up.score, tier: up.tier } : fin ? { score: fin.actual.score, tier: fin.actual.tier } : null;

  return (
    <dialog
      ref={ref}
      className="gc"
      aria-label={up?.matchup ?? fin?.matchup ?? "Game Center"}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {espnId && away && home && (
        <>
        <button className="gc-close" onClick={onClose} aria-label="Close Game Center">
          ×
        </button>
        <div className="gc-body">
          {/* Scoreboard */}
          <header className="gc-head" style={{ background: `linear-gradient(90deg, ${away.color ?? "#17222c"}, #111a22 42%, #111a22 58%, ${home.color ?? "#17222c"})` }}>
            <TeamHead t={away} score={scoreA} poss={!!game?.situation?.possession && game.situation.possession === game.teams[0]?.id} win={state === "post" && scoreA! > scoreH!} />
            <div className="gc-mid">
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
                {net}
              </span>
              {watch && (
                <span className={`gc-watch ${watch.tier}`}>
                  {fin ? "Actual" : "Watchability"} {watch.score} · {tierLabel(watch.tier)}
                </span>
              )}
            </div>
            <TeamHead t={home} score={scoreH} poss={!!game?.situation?.possession && game.situation.possession === game.teams[1]?.id} win={state === "post" && scoreH! > scoreA!} right />
          </header>
          {game && (game.teams[0].linescores.length > 0) && <Linescore game={game} />}
          {updated && state === "in" && (
            <p className="gc-updated" role="status">
              Updating every 15 seconds · last {updated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}
            </p>
          )}

          <div className="gc-grid">
            {/* Projection */}
            <section className="gc-panel">
              <h3 className="micro-label">Projection</h3>
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

            {game && game.wp.length > 8 ? (
              <section className="gc-panel">
                <WinProb wp={game.wp.map(([p, q]) => [Math.round(p), q])} away={abbr(away)} home={abbr(home)} />
              </section>
            ) : (
              <section className="gc-panel gc-wait">
                <h3 className="micro-label">Live view</h3>
                <p>
                  {state === "pre"
                    ? `The live win-probability chart, momentum, field tilt, drive chart and player tracker start at kickoff (${dayOf(date)} ${timeOf(date, undefined, true)} ${tzAbbr()}).`
                    : "Loading live data…"}
                </p>
              </section>
            )}

            {game && state !== "pre" && (
              <>
                <Momentum game={game} away={abbr(away)} home={abbr(home)} />
                <Tilt game={game} away={abbr(away)} home={abbr(home)} />
                <TeamCompare game={game} away={abbr(away)} home={abbr(home)} />
                <Feed game={game} away={abbr(away)} home={abbr(home)} />
                <Drives game={game} away={abbr(away)} home={abbr(home)} />
                <TopBottom game={game} teams={[away, home]} />
                <Tracker game={game} teams={[away, home]} />
              </>
            )}

            {(away.advanced || home.advanced) && (
              <section className="gc-panel gc-wide">
                <h3 className="micro-label">Advanced stats + rankings (season)</h3>
                <AdvancedStats league={league ?? "NFL"} away={{ abbr: abbr(away), adv: away.advanced ?? null }} home={{ abbr: abbr(home), adv: home.advanced ?? null }} />
              </section>
            )}
          </div>
        </div>
        </>
      )}
    </dialog>
  );
}

function TeamHead({ t, score, poss, win, right }: { t: TeamLike; score: number | null; poss?: boolean; win?: boolean; right?: boolean }) {
  return (
    <div className={`gc-team ${right ? "right" : ""}`}>
      <img src={logos[t.logoId]} alt="" width="64" height="64" />
      <div>
        <h2>
          {t.name}
          {poss && <span className="gc-ball" title="Has the ball" aria-label="has the ball" />}
        </h2>
        <p>{t.record.split(" · ")[0]}</p>
        {rankLine(t.ranks) && <p className="rank-line">{rankLine(t.ranks)}</p>}
      </div>
      {score != null && <strong className={`gc-score ${win ? "win" : ""}`}>{score}</strong>}
    </div>
  );
}

function Linescore({ game }: { game: LiveGame }) {
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
        {game.teams.map((t) => (
          <tr key={t.id}>
            <th scope="row">{t.abbr}</th>
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

/** Momentum: win-probability swing over the last 12 plays and last 3 drives. */
function Momentum({ game, away, home }: { game: LiveGame; away: string; home: string }) {
  const wp = game.wp.map((w) => w[0]);
  if (wp.length < 4) return null;
  const n = Math.min(12, wp.length - 1);
  const swing = wp[wp.length - 1] - wp[wp.length - 1 - n]; // + toward home
  const hid = game.teams[1].id;
  const last3 = game.drives.filter((d) => !d.current).slice(-6);
  const pts = (d: Drive) => (/touchdown/i.test(d.result) ? 7 : /field goal/i.test(d.result) && d.score ? 3 : 0);
  const recent = { away: 0, home: 0 };
  for (const d of last3) recent[d.team === hid ? "home" : "away"] += pts(d);
  const side = Math.abs(swing) < 3 ? null : swing > 0 ? home : away;
  const w = Math.min(50, Math.abs(swing));
  return (
    <section className="gc-panel">
      <h3 className="micro-label">Momentum</h3>
      <p className="gc-big">
        {side ? (
          <>
            <strong>{side}</strong> +{Math.round(Math.abs(swing))} pts of win probability over the last {n} plays
          </>
        ) : (
          <>Even: win probability has held steady over the last {n} plays</>
        )}
      </p>
      <div className="gc-diverge" role="img" aria-label={side ? `Momentum toward ${side}` : "Momentum even"}>
        <span className="lbl">{away}</span>
        <span className="track">
          <i className="mid" />
          <i className={`bar ${swing > 0 ? "home" : "away"}`} style={swing > 0 ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }} />
        </span>
        <span className="lbl">{home}</span>
      </div>
      <p className="gc-note">
        Last {last3.length} drives: {away} {recent.away} pts, {home} {recent.home} pts
      </p>
    </section>
  );
}

/** Field tilt: share of each offense's snaps run in the opponent's territory, overall and by quarter. */
function Tilt({ game, away, home }: { game: LiveGame; away: string; home: string }) {
  const snaps = game.allOffense;
  if (snaps.length < 6) return null;
  const share = (side: number, q?: number) => {
    const s = snaps.filter((p) => p[0] === side && (q == null || p[2] === q));
    return s.length ? (s.filter((p) => p[1] < 50).length / s.length) * 100 : null;
  };
  const a = share(0) ?? 0,
    h = share(1) ?? 0;
  const tot = a + h || 1;
  const tiltH = (h / tot) * 100;
  const leader = Math.abs(a - h) < 5 ? null : a > h ? away : home;
  const [topA, topH] = game.teams.map((t) => mmss(game.teamStats[t.id]?.top ?? "0:00"));
  const topTot = topA + topH;
  const quarters = [1, 2, 3, 4].filter((q) => snaps.some((p) => p[2] === q));
  return (
    <section className="gc-panel">
      <h3 className="micro-label">Who's tilting the field</h3>
      <p className="gc-big">
        {leader ? (
          <>
            <strong>{leader}</strong> is tilting the field: {pct(Math.max(a, h))} of its snaps in enemy territory vs {pct(Math.min(a, h))}
          </>
        ) : (
          <>Level field: {away} {pct(a)} vs {home} {pct(h)} of snaps in enemy territory</>
        )}
      </p>
      <div className="gc-split" role="img" aria-label={`Field tilt ${away} ${Math.round(100 - tiltH)}%, ${home} ${Math.round(tiltH)}%`}>
        <i className="away" style={{ width: `${100 - tiltH}%` }}>
          {away} {Math.round(100 - tiltH)}
        </i>
        <i className="home" style={{ width: `${tiltH}%` }}>
          {Math.round(tiltH)} {home}
        </i>
      </div>
      {topTot > 0 && (
        <>
          <h4 className="gc-sub">Time on the field (possession)</h4>
          <div className="gc-split" role="img" aria-label={`Time of possession ${away} ${game.teamStats[game.teams[0].id]?.top}, ${home} ${game.teamStats[game.teams[1].id]?.top}`}>
            <i className="away" style={{ width: `${(topA / topTot) * 100}%` }}>
              {away} {game.teamStats[game.teams[0].id]?.top}
            </i>
            <i className="home" style={{ width: `${(topH / topTot) * 100}%` }}>
              {game.teamStats[game.teams[1].id]?.top} {home}
            </i>
          </div>
        </>
      )}
      {quarters.length > 1 && (
        <>
          <h4 className="gc-sub">Tilt by quarter (snaps in enemy territory)</h4>
          <table className="gc-q">
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">Team</span>
                </th>
                {quarters.map((q) => (
                  <th scope="col" key={q}>
                    Q{q}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[0, 1].map((side) => (
                <tr key={side}>
                  <th scope="row">{side ? home : away}</th>
                  {quarters.map((q) => {
                    const v = share(side, q);
                    return (
                      <td key={q}>
                        <span className={`gc-qbar ${side ? "home" : "away"}`} style={{ height: `${Math.max(3, (v ?? 0) * 0.34)}px` }} />
                        {v == null ? "–" : pct(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

/** Drive chart: every drive as a bar on the field, from start to finish. */
function Drives({ game, away, home }: { game: LiveGame; away: string; home: string }) {
  const ds = game.drives.filter((d) => d.from != null);
  if (!ds.length) return null;
  const hid = game.teams[1].id;
  return (
    <section className="gc-panel gc-wide">
      <h3 className="micro-label">Drive chart</h3>
      <p className="gc-note">
        Each bar runs from where the drive started to where it ended, toward the opponent's end zone on the right.{" "}
        <span className="gc-key away">{away}</span> <span className="gc-key home">{home}</span>
      </p>
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
                {isH ? home : away}
                <small>
                  Q{d.period} {d.clock}
                </small>
              </span>
              <span className="gc-field">
                <i className="gc-50" />
                <i
                  className="gc-dbar"
                  style={{ left: `${lo}%`, width: `${Math.max(1.2, hi - lo)}%`, background: isH ? "var(--win)" : "var(--loss)" }}
                />
              </span>
              <span className="gc-dres">
                <strong>{res}</strong>
                <small>
                  {d.plays} pl · {d.yards} yds · {d.time}
                </small>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function TeamCompare({ game, away, home }: { game: LiveGame; away: string; home: string }) {
  const [A, H] = game.teams.map((t) => game.teamStats[t.id]);
  if (!A || !H) return null;
  const rows: [string, number, number, string, string, boolean?][] = [
    ["Total yards", A.yards, H.yards, String(A.yards), String(H.yards)],
    ["Yards / play", A.ypp, H.ypp, A.ypp ? A.ypp.toFixed(1) : "–", H.ypp ? H.ypp.toFixed(1) : "–"],
    ["Passing yards", A.passYds, H.passYds, String(A.passYds), String(H.passYds)],
    ["Rushing yards", A.rushYds, H.rushYds, String(A.rushYds), String(H.rushYds)],
    ["First downs", A.firstDowns, H.firstDowns, String(A.firstDowns), String(H.firstDowns)],
    ["Turnovers", A.turnovers, H.turnovers, String(A.turnovers), String(H.turnovers), true],
  ];
  return (
    <section className="gc-panel">
      <h3 className="micro-label">Team stats</h3>
      <table className="gc-compare">
        <thead>
          <tr>
            <th scope="col">{away}</th>
            <th scope="col">
              <span className="sr-only">Stat</span>
            </th>
            <th scope="col">{home}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, a, h, as, hs, lowGood]) => {
            const max = Math.max(a, h) || 1;
            const better = a === h ? -1 : (a > h) !== !!lowGood ? 0 : 1;
            return (
              <tr key={label}>
                <td className={better === 0 ? "edge" : ""}>
                  <span className="gc-cbar away" style={{ width: `${(a / max) * 100}%` }} />
                  {as}
                </td>
                <th scope="row">{label}</th>
                <td className={better === 1 ? "edge" : ""}>
                  <span className="gc-cbar home" style={{ width: `${(h / max) * 100}%` }} />
                  {hs}
                </td>
              </tr>
            );
          })}
          <tr>
            <td>{A.third || "–"}</td>
            <th scope="row">3rd down</th>
            <td>{H.third || "–"}</td>
          </tr>
          {(A.redZone || H.redZone) && (
            <tr>
              <td>{A.redZone || "–"}</td>
              <th scope="row">Red zone</th>
              <td>{H.redZone || "–"}</td>
            </tr>
          )}
          <tr>
            <td>{A.penalties || "–"}</td>
            <th scope="row">Penalties</th>
            <td>{H.penalties || "–"}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function TopBottom({ game, teams }: { game: LiveGame; teams: TeamLike[] }) {
  return (
    <section className="gc-panel gc-wide">
      <h3 className="micro-label">Top 3 / bottom 3 by team</h3>
      <p className="gc-note">
        Ranked by a box-score impact score: yards, touchdowns and takeaways add; interceptions, fumbles, sacks taken and
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
            <div key={t.id} className="gc-tbteam">
              <h4>
                <img src={logos[teams[i].logoId]} alt="" width="22" height="22" /> {teams[i].name}
              </h4>
              <ol className="gc-top">
                {top.map((x) => (
                  <PlayerLine key={x.p.id} x={x} good />
                ))}
              </ol>
              <ol className="gc-bottom">
                {bottom.map((x) => (
                  <PlayerLine key={x.p.id} x={x} />
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

function PlayerLine({ x, good }: { x: { p: PlayerRow; value: number; line: string; bad: string[] }; good?: boolean }) {
  return (
    <li>
      {x.p.headshot ? <img src={x.p.headshot} alt="" width="34" height="34" loading="lazy" /> : <span className="gc-nohead" />}
      <span className="gc-pl">
        <strong>{x.p.short}</strong>
        <small>{good || !x.bad.length ? x.line : `${x.bad.join(", ")} · ${x.line}`}</small>
      </span>
      <span className={`gc-imp ${x.value >= 0 ? "pos" : "neg"}`}>
        {x.value > 0 ? "+" : ""}
        {x.value}
      </span>
    </li>
  );
}

/** Player tracker: every player with a stat line, grouped by role. */
function Tracker({ game, teams }: { game: LiveGame; teams: TeamLike[] }) {
  const [tab, setTab] = useState(0);
  const t = game.teams[tab];
  const ps = game.players[t.id] ?? [];
  const groups: [string, (p: PlayerRow) => string | null, (p: PlayerRow) => number][] = [
    ["Passing", (p) => (p.passing?.att ? `${p.passing.cmp}/${p.passing.att} · ${p.passing.yds} yds · ${p.passing.td} TD · ${p.passing.int} INT${p.passing.qbr ? ` · QBR ${p.passing.qbr}` : ""}` : null), (p) => p.passing?.yds ?? 0],
    ["Rushing", (p) => (p.rushing?.att ? `${p.rushing.att} car · ${p.rushing.yds} yds · ${(p.rushing.yds / p.rushing.att).toFixed(1)} avg${p.rushing.td ? ` · ${p.rushing.td} TD` : ""}` : null), (p) => p.rushing?.yds ?? 0],
    ["Receiving", (p) => (p.receiving?.rec || p.receiving?.tgt ? `${p.receiving!.rec}/${p.receiving!.tgt || p.receiving!.rec} · ${p.receiving!.yds} yds${p.receiving!.td ? ` · ${p.receiving!.td} TD` : ""} · long ${p.receiving!.long}` : null), (p) => p.receiving?.yds ?? 0],
    ["Defense", (p) => (p.defensive && (p.defensive.tkl || p.defensive.sacks || p.defensive.pd) ? `${p.defensive.tkl} tkl · ${p.defensive.sacks} sk · ${p.defensive.tfl} TFL · ${p.defensive.pd} PD${p.interceptions?.int ? ` · ${p.interceptions.int} INT` : ""}` : null), (p) => (p.defensive?.tkl ?? 0) + (p.defensive?.sacks ?? 0) * 3],
  ];
  return (
    <section className="gc-panel gc-wide">
      <div className="gc-tabs-head">
        <h3 className="micro-label">Player tracker</h3>
        <div className="segmented" role="group" aria-label="Team">
          {game.teams.map((tm, i) => (
            <button key={tm.id} aria-pressed={tab === i} onClick={() => setTab(i)}>
              <img src={logos[teams[i].logoId]} alt="" width="18" height="18" /> {tm.abbr}
            </button>
          ))}
        </div>
      </div>
      <div className="gc-tracker">
        {groups.map(([label, line, sort]) => {
          const rows = ps.filter((p) => line(p)).sort((a, b) => sort(b) - sort(a)).slice(0, label === "Defense" ? 6 : 5);
          if (!rows.length) return null;
          return (
            <div key={label}>
              <h4 className="gc-sub">{label}</h4>
              <ul>
                {rows.map((p) => (
                  <li key={p.id}>
                    <span className="gc-jersey">{p.jersey ? `#${p.jersey}` : ""}</span>
                    <strong>{p.short}</strong>
                    <span>{line(p)}</span>
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

function Feed({ game, away, home }: { game: LiveGame; away: string; home: string }) {
  const hid = game.teams[1].id;
  const plays = [...game.plays].reverse().slice(0, 12);
  return (
    <section className="gc-panel gc-feedpanel">
      <h3 className="micro-label">{game.status.state === "in" ? "Live play-by-play" : "Last plays"}</h3>
      {game.situation?.lastPlay && game.status.state === "in" && <p className="gc-last">{game.situation.lastPlay}</p>}
      <ol className="gc-feed">
        {plays.map((p) => (
          <li key={p.id} className={`${p.score ? "is-score" : ""} ${p.turnover ? "is-to" : ""}`}>
            <span className="gc-when">
              Q{p.period} {p.clock}
            </span>
            <span className="gc-who">{p.team === hid ? home : away}</span>
            <span className="gc-what">{p.text}</span>
          </li>
        ))}
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
                  {s.text} <strong>({away} {s.away}–{s.home} {home})</strong>
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
