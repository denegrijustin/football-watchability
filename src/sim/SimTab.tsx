import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { logos, slate, type Game, type League } from "../data";
import { fetchData } from "../data/load";
import { playGame, type GameCfg, type PlayRec, type TeamSim } from "./engine";
import { buildTeam, leagueAverages, statTargets, type BuiltTeam, type LeagueStats, type RawTeam, type TeamExtras } from "./profile";
import { legacyFor, type Legacy, type LegacyBox } from "./legacy";
import { fetchTeamInfo, type TeamInfo } from "./roster";
import { runForecast, type RunResult } from "./run";
import { Stage } from "./Stage";
import { BoxScore, PlayFeed, ScoringSummary, WinChart } from "./SimViewer";
import "./sim.css";

type Snapshot = { leagues: Partial<Record<League, LeagueStats>> };
const HFA: Record<League, number> = { NFL: 1.8, CFB: 2.5 };
const SIMS = 4000;
const SPEEDS = [
  { id: "0.5", label: "½×", pps: 0.8, hint: "Slow: each play takes about a second" },
  { id: "1", label: "1×", pps: 1.4, hint: "About two minutes a game" },
  { id: "4", label: "4×", pps: 5, hint: "About 30 seconds a game" },
  { id: "16", label: "16×", pps: 20, hint: "About 8 seconds a game" },
] as const;

const MASCOT_MODIFIERS = new Set(["golden", "red", "blue", "green", "fighting", "mean", "black", "yellow", "crimson", "scarlet", "rainbow", "nittany", "horned", "demon", "sun", "mountain", "thundering", "wolf", "ragin'", "runnin'", "scarlet", "tar", "banana", "river", "yellow"]);
const slug = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const schoolName = (full: string) => {
  const w = full.split(" ");
  if (w.length < 2) return full;
  w.pop();
  while (w.length > 1 && MASCOT_MODIFIERS.has(w[w.length - 1].toLowerCase())) w.pop();
  return w.join(" ");
};
const hashColor = (s: string) => {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 42%)`;
};
const hexDist = (a: string, b: string) => {
  const p = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) : null);
  const x = p(a), y = p(b);
  return x && y ? Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) : 999;
};

interface Known { short: string; color: string; logoId?: string; abbr: string }

/** What the board knows about a team by ESPN id: nickname, color and logo. */
function knownTeams(): Map<string, Known & { league: League }> {
  const m = new Map<string, Known & { league: League }>();
  for (const g of slate.games) for (const t of g.teams) if (t.espnId) m.set(`${g.league}:${t.espnId}`, { short: g.league === "NFL" ? t.name.split(" ").pop() ?? t.name : t.name, color: t.color, logoId: t.logoId, abbr: t.abbr, league: g.league as League });
  return m;
}

function rosterFrom(game: Game | undefined, side: "away" | "home"): TeamSim["roster"] {
  const boxes = (game?.history?.boxes ?? []) as { label: string; players?: { pos: string; short: string; side: string }[] }[];
  const players = boxes.find((b) => b.label.startsWith("Key"))?.players ?? [];
  const pick = (re: RegExp) => players.find((p) => p.side === side && re.test(p.pos))?.short;
  const rb = pick(/^(RB|FB)$/), wr = pick(/^(WR|TE)$/);
  return { qb: pick(/^QB$/), rushers: rb ? [{ name: rb, w: 100 }] : undefined, receivers: wr ? [{ name: wr, w: 100, pos: "WR" as const }] : undefined };
}

const lum = (hex: string) => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0.3;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** The team's real primary color; its alternate when the primary is near black (the Raiders) so it still shows on the field. */
const brandColor = (info: TeamInfo, fallback: string) => {
  const c = info.color ?? fallback;
  return lum(c) < 0.05 && info.alt && lum(info.alt) > 0.1 ? info.alt : c;
};

interface Prep extends RunResult {
  away: BuiltTeam;
  home: BuiltTeam;
  legacy: Legacy;
  market: { margin: number; total: number; awayPts: number; homePts: number } | null;
  espnHome: number | null;
  marketHome: number | null;
  usedLine: boolean;
  baseline: [number, number];
  game: Game | undefined;
}

export default function SimTab({ defaultLeague }: { defaultLeague: League }) {
  const [stats, setStats] = useState<Snapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [league, setLeague] = useState<League>(defaultLeague);
  const [pick, setPick] = useState<string>("");
  const [awayId, setAwayId] = useState("");
  const [homeId, setHomeId] = useState("");
  const [neutral, setNeutral] = useState(false);
  const [useLine, setUseLine] = useState(true);
  const [busy, setBusy] = useState(false);
  const [prep, setPrep] = useState<Prep | null>(null);
  const [seed, setSeed] = useState(0);
  const [plays, setPlays] = useState<PlayRec[]>([]);
  const [idx, setIdx] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<string>("1");
  const [onlyKey, setOnlyKey] = useState(false);
  const known = useMemo(knownTeams, []);

  useEffect(() => {
    let live = true;
    fetchData<Snapshot>("matchup-stats").then((d) => live && setStats(d), (e) => live && setErr(String(e?.message ?? e)));
    return () => { live = false; };
  }, []);

  const table = stats?.leagues[league];
  const games = useMemo(
    () => slate.games.filter((g) => g.league === league && (g.status as string) !== "post").filter((g) => g.teams.every((t) => table?.teams[t.espnId ?? ""])).sort((a, b) => a.date.localeCompare(b.date)),
    [league, table],
  );
  const teamOptions = useMemo(() => Object.values(table?.teams ?? {}).sort((a, b) => a.name.localeCompare(b.name)), [table]);
  useEffect(() => { setPick(""); setPrep(null); setPlays([]); setIdx(-1); setPlaying(false); setAwayId(""); setHomeId(""); }, [league]);
  useEffect(() => { if (!pick && games.length) setPick(games[0].id); }, [games, pick]);

  const resolve = useCallback((raw: RawTeam, game: Game | undefined, side: "away" | "home", info: TeamInfo, slateTeam?: Game["teams"][number]): TeamExtras => {
    const k = known.get(`${league}:${raw.id}`);
    const short = slateTeam ? (league === "NFL" ? slateTeam.name.split(" ").pop() ?? slateTeam.name : slateTeam.name) : k?.short ?? (league === "NFL" ? raw.name.split(" ").pop() ?? raw.name : schoolName(raw.name));
    const logoId = slateTeam?.logoId ?? k?.logoId ?? [slug(raw.name), slug(schoolName(raw.name))].find((s) => logos[s]);
    return { short, color: brandColor(info, slateTeam?.color ?? k?.color ?? hashColor(raw.name)), logo: logoId ? logos[logoId] : undefined, roster: { ...rosterFrom(game, side), ...info.roster } };
  }, [known, league]);

  const simulate = useCallback(async (kind: "pick" | "custom") => {
    if (!table) return;
    const avg = leagueAverages(table);
    let game: Game | undefined;
    let ra: RawTeam | undefined, rh: RawTeam | undefined;
    if (kind === "pick") {
      game = games.find((g) => g.id === pick);
      if (!game) return;
      ra = table.teams[game.teams[0].espnId ?? ""]; rh = table.teams[game.teams[1].espnId ?? ""];
    } else {
      ra = table.teams[awayId]; rh = table.teams[homeId];
    }
    if (!ra || !rh || ra.id === rh.id) return;
    setBusy(true); setPlaying(false);
    const [ia, ih] = await Promise.all([fetchTeamInfo(league, ra.id, table.season), fetchTeamInfo(league, rh.id, table.season)]);
    const A = buildTeam(ra, avg, resolve(ra, game, "away", ia, game?.teams[0]));
    const H = buildTeam(rh, avg, resolve(rh, game, "home", ih, game?.teams[1]));
    // Keep two similar team colors apart on the field.
    if (hexDist(A.team.color, H.team.color) < 130) {
      if (ih.alt && hexDist(ih.alt, A.team.color) >= 130) H.team.color = ih.alt;
      else if (ia.alt && hexDist(ia.alt, H.team.color) >= 130) A.team.color = ia.alt;
      else H.team.color = "#d98a3d";
    }
    const hfa = kind === "custom" && neutral ? 0 : HFA[league];
    const leg = game ? legacyFor(game.history?.boxes as LegacyBox[] | undefined, { name: game.teams[0].name, abbr: game.teams[0].abbr }, { name: game.teams[1].name, abbr: game.teams[1].abbr }) : legacyFor(undefined, { name: "", abbr: "" }, { name: "", abbr: "" });
    const t = statTargets(league, avg, A, H, hfa);
    const baseline: [number, number] = [t.away + leg.nudgeAway / 2, t.home - leg.nudgeAway / 2];
    const lineParts = (game?.projected?.parts as { id: string; away?: number; home?: number }[] | undefined)?.find((p) => p.id === "line");
    const market = lineParts?.away != null && lineParts.home != null ? { awayPts: lineParts.away, homePts: lineParts.home, margin: lineParts.home - lineParts.away, total: lineParts.home + lineParts.away } : null;
    const usedLine = useLine && !!market;
    const target: [number, number] = usedLine && market ? [0.65 * market.awayPts + 0.35 * baseline[0], 0.65 * market.homePts + 0.35 * baseline[1]] : baseline;
    const wxHours = game?.weather?.hours ?? [];
    const windMph = wxHours.length ? wxHours.reduce((s, h) => s + h.windMph, 0) / wxHours.length : 5;
    const rainPct = wxHours.length ? Math.max(...wxHours.map((h) => h.precip)) : 0;
    const cfg: GameCfg = { league, away: A.team, home: H.team, weather: { windMph, rainPct }, allowTies: league === "NFL", priorMargin: target[1] - target[0] };
    const base = (Math.random() * 2 ** 32) >>> 0;
    const res = await runForecast({ cfg, target, n: SIMS, seed: base, line: market ? { spreadHome: -market.margin, total: market.total } : undefined });
    const next: Prep = { ...res, away: A, home: H, legacy: leg, market, espnHome: game?.winProb?.espn ?? null, marketHome: game?.winProb?.market ?? null, usedLine, baseline, game };
    setPrep(next);
    setBusy(false);
    startGame(next, res.forecast.typicalSeed);
  }, [table, games, pick, awayId, homeId, neutral, useLine, league, resolve]);

  const startGame = (p: Prep, s: number) => {
    const r = playGame(p.cfg, s, true);
    setSeed(s); setPlays(r.plays); setIdx(-1); setPlaying(true);
  };

  // Playback: plays per second, accumulated so fast speeds can advance several plays per tick.
  const acc = useRef(0);
  useEffect(() => {
    if (!playing || !plays.length) return;
    const pps = SPEEDS.find((s) => s.id === speed)?.pps ?? 5;
    const id = setInterval(() => {
      acc.current += pps * 0.05;
      const step = Math.floor(acc.current);
      if (!step) return;
      acc.current -= step;
      setIdx((i) => {
        const n = Math.min(plays.length - 1, i + step);
        if (n >= plays.length - 1) setPlaying(false);
        return n;
      });
    }, 50);
    return () => clearInterval(id);
  }, [playing, speed, plays]);

  const atEnd = idx >= plays.length - 1 && plays.length > 0;
  const f = prep?.forecast;
  const cfg = prep?.cfg;

  if (err) return <p className="ol-note" role="alert">Could not load team statistics ({err}).</p>;
  if (!table) return <p className="ol-note" role="status">Loading team statistics…</p>;

  return (
    <div className="sim">
      <header className="sim-head">
        <h2>Game simulator</h2>
        <p>
          Plays a full game snap by snap from each team's real {table.season} numbers, then plays it {SIMS.toLocaleString()} more times for the forecast. Nothing here is a prediction of
          who is hurt or what the coach will call; it is what the season stats, the line and the series history imply.
        </p>
      </header>

      <section className="sim-controls" aria-label="Choose a game">
        <div className="segmented" role="group" aria-label="League">
          {(["NFL", "CFB"] as const).map((l) => (
            <button key={l} aria-pressed={league === l} onClick={() => setLeague(l)}>{l === "NFL" ? "NFL" : "College"}</button>
          ))}
        </div>
        <label>
          <span>This week's games</span>
          <select value={pick} onChange={(e) => setPick(e.target.value)} disabled={!games.length}>
            {games.map((g) => <option key={g.id} value={g.id}>{g.matchup}</option>)}
          </select>
        </label>
        <button className="sim-go" disabled={busy || !pick} onClick={() => simulate("pick")}>{busy ? "Simulating…" : "Simulate this game"}</button>
        <details className="sim-custom">
          <summary>Or build any matchup</summary>
          <div>
            <label><span>Away</span>
              <select value={awayId} onChange={(e) => setAwayId(e.target.value)}>
                <option value="">Choose a team</option>
                {teamOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label><span>Home</span>
              <select value={homeId} onChange={(e) => setHomeId(e.target.value)}>
                <option value="">Choose a team</option>
                {teamOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label className="sim-check"><input type="checkbox" checked={neutral} onChange={(e) => setNeutral(e.target.checked)} /> Neutral site</label>
            <button className="sim-go" disabled={busy || !awayId || !homeId || awayId === homeId} onClick={() => simulate("custom")}>Simulate matchup</button>
          </div>
        </details>
        <label className="sim-check">
          <input type="checkbox" checked={useLine} onChange={(e) => setUseLine(e.target.checked)} /> Blend in the betting line (65%), as the board's projection does
        </label>
      </section>

      {busy && <p className="ol-note" role="status">Loading rosters and colors, calibrating both teams to their season scoring, then playing {SIMS.toLocaleString()} games…</p>}

      {prep && f && cfg && (
        <>
          <section className="sim-forecast" aria-label="Forecast">
            <h3>Forecast</h3>
            <div className="sim-prob" role="img" aria-label={`${cfg.away.short} ${Math.round(f.winAway * 100)} percent, ${cfg.home.short} ${Math.round(f.winHome * 100)} percent`}>
              <div style={{ width: `${f.winAway * 100}%`, background: cfg.away.color }}><span>{cfg.away.short} {(f.winAway * 100).toFixed(0)}%</span></div>
              {f.tie > 0.003 && <div className="tie" style={{ width: `${f.tie * 100}%` }} title={`Tie ${(f.tie * 100).toFixed(1)}%`} />}
              <div style={{ width: `${f.winHome * 100}%`, background: cfg.home.color }}><span>{cfg.home.short} {(f.winHome * 100).toFixed(0)}%</span></div>
            </div>
            <div className="sim-tiles">
              <div><span>Projected score</span><strong>{cfg.away.abbr} {f.meanAway.toFixed(1)} – {cfg.home.abbr} {f.meanHome.toFixed(1)}</strong><em>average of {f.n.toLocaleString()} games</em></div>
              <div><span>Most likely final</span><strong>{f.typical[0]}–{f.typical[1]}</strong><em>the game replayed below</em></div>
              <div><span>Margin, middle 50%</span><strong>{marginRange(f.marginPct[1], f.marginPct[3], cfg)}</strong><em>80%: {marginRange(f.marginPct[0], f.marginPct[4], cfg)}</em></div>
              <div><span>Total points</span><strong>{f.totalPct[1]}</strong><em>middle half {f.totalPct[0]}–{f.totalPct[2]}</em></div>
              <div><span>Goes to overtime</span><strong>{(f.overtime * 100).toFixed(1)}%</strong>{cfg.league === "NFL" && <em>tie {(f.tie * 100).toFixed(1)}%</em>}</div>
            </div>
            <table className="sim-compare">
              <caption className="sr-only">Home win probability and lines, simulator against other sources</caption>
              <thead><tr><th scope="col" /><th scope="col">{cfg.home.short} win</th><th scope="col">Spread</th><th scope="col">Total</th></tr></thead>
              <tbody>
                <tr>
                  <th scope="row">This simulation{prep.usedLine ? " (with line)" : " (stats + legacy only)"}</th>
                  <td>{(f.winHome * 100).toFixed(0)}%</td>
                  <td>{fmtSpread(f.meanHome - f.meanAway, cfg)}</td>
                  <td>{(f.meanAway + f.meanHome).toFixed(1)}</td>
                </tr>
                {prep.market && (
                  <tr>
                    <th scope="row">Betting line</th>
                    <td>{prep.marketHome != null ? `${Math.round(prep.marketHome)}%` : "—"}</td>
                    <td>{fmtSpread(prep.market.margin, cfg)}</td>
                    <td>{prep.market.total.toFixed(1)}</td>
                  </tr>
                )}
                {prep.espnHome != null && <tr><th scope="row">ESPN matchup predictor</th><td>{Math.round(prep.espnHome)}%</td><td>—</td><td>—</td></tr>}
                {prep.market && f.cover != null && f.over != null && (
                  <tr className="sim-ats"><th scope="row">Simulated vs the line</th><td colSpan={3}>{f.cover >= 0.5 ? cfg.home.short : cfg.away.short} covers {(Math.max(f.cover, 1 - f.cover) * 100).toFixed(0)}% · {f.over >= 0.5 ? "Over" : "Under"} {(Math.max(f.over, 1 - f.over) * 100).toFixed(0)}%</td></tr>
                )}
              </tbody>
            </table>
            <Histogram cfg={cfg} f={f} />
            <details className="sim-how">
              <summary>How the forecast is built</summary>
              <ol>
                <li><strong>Season stats.</strong> Each team's passing and rushing yards for and against, third-down rate, giveaways and takeaways (ESPN, {prep.away.gp} and {prep.home.gp} games) become strengths against the league average, pulled toward average while the sample is small.</li>
                <li><strong>Calibration.</strong> The two teams' efficiency is tuned until the simulated game averages what the stats say each should score ({prep.baseline[0].toFixed(1)}–{prep.baseline[1].toFixed(1)}), with home field of {neutral ? 0 : HFA[cfg.league]} points{prep.usedLine ? " and the betting line mixed in at 65%" : ""}.</li>
                <li><strong>Legacy.</strong> {prep.legacy.note}</li>
                <li><strong>Weather.</strong> {cfg.weather.windMph >= 12 ? `Wind averaging ${Math.round(cfg.weather.windMph)} mph trims deep passing and long kicks.` : "Calm enough that it does not change the numbers."}{cfg.weather.rainPct >= 50 ? " Rain makes the ball slicker (more fumbles, fewer completions)." : ""}</li>
                <li><strong>The game.</strong> Every snap draws a call, a result, yards, penalties, a clock and a next down from league base rates scaled by the matchup. Coaches kick, punt and go for it from field position, score and time; teams hurry, kneel and use timeouts late. Overtime follows each league's rules.</li>
                <li><strong>Limits.</strong> No injuries, depth charts or play-calling tendencies beyond pass/run balance; named players are each team's season leaders; strength of schedule is only as good as the stats themselves. Treat it as a well-calibrated base case, not a lock.</li>
              </ol>
            </details>
            {prep.legacy.series && (
              <aside className="sim-legacy" aria-label="Legacy">
                <h4>Legacy</h4>
                <p><strong>{prep.legacy.series}</strong></p>
                {prep.legacy.recent.length > 0 && <p>Recent: {prep.legacy.recent.join(" · ")}</p>}
                <p className="sim-small">{prep.legacy.note}</p>
              </aside>
            )}
          </section>

          <section className="sim-viewer" aria-label="Simulated game">
            <div className="sim-viewer-head">
              <h3>Play by play</h3>
              <span className="sim-small">Game #{seed.toString(36)}</span>
            </div>
            <Stage cfg={cfg} plays={plays} idx={idx} pps={SPEEDS.find((x) => x.id === speed)?.pps ?? 5} />
            <div className="sim-transport">
              <button onClick={() => { if (atEnd) { setIdx(-1); setPlaying(true); } else setPlaying(!playing); }} aria-label={playing ? "Pause" : atEnd ? "Replay" : "Play"}>{playing ? "Pause" : atEnd ? "Replay" : "Play"}</button>
              <div className="segmented" role="group" aria-label="Speed">
                {SPEEDS.map((s) => <button key={s.id} aria-pressed={speed === s.id} title={s.hint} onClick={() => setSpeed(s.id)}>{s.label}</button>)}
              </div>
              <button onClick={() => { setIdx(plays.length - 1); setPlaying(false); }} disabled={atEnd}>Skip to final</button>
              <button onClick={() => startGame(prep, f.typicalSeed)}>Most likely game</button>
              <button onClick={() => startGame(prep, (Math.random() * 2 ** 32) >>> 0)}>New random game</button>
            </div>
            <WinChart cfg={cfg} plays={plays} idx={Math.max(0, idx)} onSeek={(i) => { setIdx(i); setPlaying(false); }} />
            <div className="sim-cols">
              <div>
                <div className="sim-feed-head">
                  <h4>Plays</h4>
                  <label className="sim-check"><input type="checkbox" checked={onlyKey} onChange={(e) => setOnlyKey(e.target.checked)} /> Key plays only</label>
                </div>
                <PlayFeed cfg={cfg} plays={plays} idx={idx} onlyKey={onlyKey} />
              </div>
              <div>
                <h4>Box score</h4>
                <BoxScore cfg={cfg} plays={plays} idx={Math.max(idx, -1)} />
                <h4>Scoring</h4>
                <ScoringSummary cfg={cfg} plays={plays} idx={idx} />
              </div>
            </div>
          </section>
        </>
      )}
      {!prep && !busy && <p className="ol-note">Pick a game and press Simulate. You will get a forecast and a full accelerated replay of the most likely outcome.</p>}
    </div>
  );
}

const fmtSpread = (homeMargin: number, cfg: GameCfg) => {
  const r = Math.round(homeMargin * 2) / 2;
  return r === 0 ? "Pick'em" : r > 0 ? `${cfg.home.short} -${r}` : `${cfg.away.short} -${-r}`;
};
const marginRange = (lo: number, hi: number, cfg: GameCfg) => {
  const side = (m: number) => (m === 0 ? "tie" : m > 0 ? `${cfg.home.abbr} by ${m}` : `${cfg.away.abbr} by ${-m}`);
  return `${side(lo)} to ${side(hi)}`;
};

function Histogram({ cfg, f }: { cfg: GameCfg; f: NonNullable<Prep["forecast"]> }) {
  const max = Math.max(...f.hist.map((b) => b.count), 1);
  const W = 600, H = 120, bw = W / f.hist.length;
  return (
    <figure className="sim-hist">
      <figcaption>Simulated margin of victory ({f.n.toLocaleString()} games)</figcaption>
      <svg viewBox={`0 0 ${W} ${H + 22}`} role="img" aria-label="Distribution of final margins">
        {f.hist.map((b, i) => {
          const mid = (b.lo + b.hi) / 2;
          const h = (b.count / max) * H;
          return <rect key={b.lo} x={i * bw + 1} y={H - h} width={bw - 2} height={h} fill={mid > 0 ? cfg.home.color : cfg.away.color} opacity="0.85"><title>{`${b.lo <= -30 ? "≥30" : b.lo} to ${b.hi >= 30 ? "30+" : b.hi}: ${((b.count / f.n) * 100).toFixed(1)}%`}</title></rect>;
        })}
        <line x1={W / 2} x2={W / 2} y1="0" y2={H} className="sim-hist-mid" />
        <text x="4" y={H + 16} className="sim-hist-lbl">← {cfg.away.abbr} wins</text>
        <text x={W - 4} y={H + 16} textAnchor="end" className="sim-hist-lbl">{cfg.home.abbr} wins →</text>
      </svg>
    </figure>
  );
}

