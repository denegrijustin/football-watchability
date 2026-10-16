import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { PlayArt } from "../components/PlayArt";
import type { PlayArtKind } from "../playImpact";
import { clockText, downText, type GameCfg, type PlayRec, type TeamSim } from "./engine";
import { playerStats, type TeamPlayers } from "./box";
import { ConfMark } from "../ConfMark";
import { endzoneFor } from "./endzone";
import { EndZones } from "./EndZones";
import { MIDFIELD_ART } from "./midfield";

const FW = 1200, FH = 560, EZ = 100, YD = (FW - 2 * EZ) / 100, CY = FH / 2;
const fx = (x: number) => EZ + Math.max(-4, Math.min(104, x)) * YD;
const qLabel = (q: number) => (q > 4 ? "OT" : `Q${q}`);

function artFor(p: PlayRec): PlayArtKind {
  if (p.kind === "sack") return p.pts ? "safety" : "sack";
  if (p.kind === "pass") return p.turnover === "int" ? "int" : p.td ? "td" : p.complete === false ? "incomplete" : "pass";
  if (p.kind === "rush") return p.turnover === "fumble" ? "fumble" : p.td ? "td" : p.pts ? "safety" : "run";
  if (p.kind === "fg") return p.pts ? "fg" : "fgMiss";
  if (p.kind === "xp") return p.pts ? "fg" : "xpMiss";
  if (p.kind === "two") return p.pts ? "td" : "tackle";
  if (p.kind === "end" && p.turnover === "downs") return "tackle";
  if (p.kind === "kickoff" && p.td) return "td";
  return "other";
}

function bannerFor(p: PlayRec): string | null {
  if (p.td) return "TOUCHDOWN";
  if (p.kind === "fg") return p.pts ? "FIELD GOAL" : "NO GOOD";
  if (p.pts === 2 && p.scorer !== null && p.kind !== "two") return "SAFETY";
  if (p.turnover === "int") return "INTERCEPTION";
  if (p.turnover === "fumble") return "FUMBLE";
  if (p.kind === "sack") return "SACK";
  if (p.kind === "end" && p.turnover === "downs") return "TURNOVER ON DOWNS";
  if (p.kind === "kickoff" && p.big) return "ONSIDE KICK";
  if (p.kind === "punt" && p.big) return "BLOCKED PUNT";
  if (p.kind === "end" && /Halftime/.test(p.text)) return "HALFTIME";
  if (p.kind === "end" && /overtime/i.test(p.text)) return "OVERTIME";
  if (p.first && (p.kind === "rush" || p.kind === "pass") && p.yds >= 20) return `${p.yds}-YARD GAIN`;
  return null;
}

type P = [number, number];
interface Route { pts: P[]; hot: boolean }
interface Choreo {
  /** Where each of the 22 players (11 offense, then 11 defense) starts the snap, and the waypoints each walks after it. */
  pre: P[];
  path: P[][];
  routes: Route[];
  /** Offense index of the ball carrier or target, to highlight. */
  hot: number | null;
  /** The ball's flight: where it leaves from, where it lands, how high it flies, and how far into the play it leaves. */
  ball: { x0: number; x1: number; lift: number; at: number; span: number; kind: "arc" | "run" } | null;
}

/** Base formation in field units: [yards behind(-)/ahead(+) of the line, pixels across]. */
const OFF: [number, number][] = [[-1.2, -48], [-1.2, -24], [-1.2, 0], [-1.2, 24], [-1.2, 48], [-1.4, 78], [-4.5, 0], [-7.5, 16], [-0.8, -195], [-0.8, 195], [-1.8, -125]];
const DEF: [number, number][] = [[1.5, -60], [1.5, -20], [1.5, 20], [1.5, 60], [5, -75], [5, 0], [5, 75], [3, -190], [3, 190], [12, -62], [12, 62]];
const pos = (x: number, dy: number): P => [fx(x), CY + dy];

function formation(L: number, d: number): P[] {
  return [...OFF.map(([dx, dy]) => pos(L + d * dx, dy)), ...DEF.map(([dx, dy]) => pos(L + d * dx, dy))];
}

function choreograph(p: PlayRec | null): Choreo {
  if (!p) return { pre: formation(35, 1), path: formation(35, 1).map((q) => [q]), routes: [], hot: null, ball: null };
  const d = p.off === 0 ? 1 : -1;
  const scrimmage = p.kind === "rush" || p.kind === "pass" || p.kind === "sack" || p.kind === "penalty" || p.kind === "kneel" || p.kind === "spike" || p.kind === "punt" || p.kind === "fg" || p.kind === "xp" || p.kind === "two";
  // Between snaps the teams simply line up for the next one.
  if (!scrimmage) {
    const f = formation(p.x1, p.nextOff === 0 ? 1 : -1);
    return { pre: f, path: f.map((q) => [q]), routes: [], hot: null, ball: null };
  }
  const L = p.x0;
  const pre = formation(L, d);
  const path: P[][] = pre.map((q) => [q]);
  const go = (i: number, ...pts: P[]) => { path[i] = [pre[i], ...pts]; };
  const dyOf = (i: number) => pre[i][1] - CY;
  const routes: Route[] = [];
  let hot: number | null = null;
  let ball: Choreo["ball"] = null;
  const along = (dx: number) => L + d * dx;

  if (p.kind === "pass" || p.kind === "sack") {
    const tIdx = p.kind === "sack" ? -1 : p.tpos === "RB" ? 7 : p.tpos === "TE" ? 5 : [8, 9, 10][p.n % 3];
    const sacked = p.kind === "sack";
    const catchX = p.complete === false || p.turnover === "int" ? along(12) : p.x1;
    const qbX = sacked ? p.x1 : along(-7);
    go(6, pos(qbX, 0));
    for (let i = 0; i < 5; i++) go(i, pos(along(-2.2 - (sacked ? 0.6 : 0)), dyOf(i) * (sacked ? 0.7 : 1)));
    const run = (i: number, endX: number, endDy: number, bend: number) => {
      const a = pos(endX - d * bend, dyOf(i) * 0.9), b = pos(endX, endDy);
      go(i, a, b);
      routes.push({ pts: [pre[i], a, b], hot: i === tIdx });
    };
    if (tIdx !== 8) run(8, along(sacked ? 6 : 14), -215, 3);
    if (tIdx !== 9) run(9, along(sacked ? 6 : 14), 215, 3);
    if (tIdx !== 10) run(10, along(sacked ? 4 : 9), 40, 2);
    if (tIdx !== 5) go(5, pos(along(sacked ? 1 : 6), dyOf(5) * 0.6));
    if (tIdx !== 7) { const e = pos(along(1), 120); go(7, pos(along(-3), 60), e); routes.push({ pts: [pre[7], pos(along(-3), 60), e], hot: false }); }
    if (tIdx >= 0) {
      const endDy = tIdx === 7 ? 110 : dyOf(tIdx) * 0.8;
      if (tIdx === 7) go(7, pos(along(-3), 60), pos(catchX, endDy));
      else go(tIdx, pos(catchX - d * 3, dyOf(tIdx) * 0.9), pos(catchX, endDy));
      routes.push({ pts: path[tIdx], hot: true });
      hot = tIdx;
      ball = { x0: qbX, x1: catchX, lift: 120, at: 0.3, span: 0.5, kind: "arc" };
    }
    // Defense: line rushes, linebackers drop, corners and safeties cover.
    for (let i = 0; i < 4; i++) go(11 + i, pos(sacked ? p.x1 + d * (i === 1 || i === 2 ? 1.2 : 2.5) : along(-2.5), (sacked ? (i - 1.5) * 10 : dyOf(11 + i) * 0.4)));
    go(15, pos(sacked ? p.x1 + d * 1.5 : along(6), sacked ? 8 : -90));
    go(16, pos(along(sacked ? 3 : 7), sacked ? -10 : 0));
    go(17, pos(along(6), 90));
    const cover = (di: number, oi: number, off = 1.4) => { const e = path[oi][path[oi].length - 1]; go(11 + di, [e[0] + d * YD * off, e[1] + 8]); };
    cover(7, 8); cover(8, 9);
    go(20, pos(along(13), -62)); go(21, pos(along(13), 62));
    if (tIdx >= 0) {
      const e = path[tIdx][path[tIdx].length - 1];
      const di = tIdx === 9 ? 8 : tIdx === 5 || tIdx === 7 ? 5 : 7;
      go(11 + di, [e[0] + d * YD * 1.3, e[1] + 10]);
    }
    if (p.turnover === "int" && tIdx >= 0) { const e = path[tIdx][path[tIdx].length - 1]; go(18, [e[0] + d * YD * 0.6, e[1] - 4]); }
    return { pre, path, routes, hot, ball };
  }

  if (p.kind === "rush") {
    const gap = (p.n % 2 ? 1 : -1) * 26;
    const rb = pos(p.x1, gap + (p.n % 3) * 4);
    go(6, pos(along(-3.5), 0));
    go(7, pos(along(-3), 14), pos(along(0.6), gap), rb);
    routes.push({ pts: path[7], hot: true });
    hot = 7;
    for (let i = 0; i < 5; i++) go(i, pos(along(1.8), dyOf(i)));
    go(5, pos(along(2.5), dyOf(5) * 0.8));
    go(8, pos(along(4), dyOf(8) * 0.8)); go(9, pos(along(4), dyOf(9) * 0.8)); go(10, pos(along(3), dyOf(10) * 0.8));
    const g = Math.max(p.yds, 0);
    for (let i = 0; i < 4; i++) go(11 + i, pos(along(3), dyOf(11 + i) * 1.1));
    go(15, pos(p.x1 + d * 0.9, gap - 14)); go(16, pos(p.x1 + d * 0.8, gap + 12)); go(17, pos(p.x1 + d * (g > 3 ? 2 : 1), 60));
    go(20, pos(p.x1 + d * 3.2, gap - 30)); go(21, pos(p.x1 + d * 3.8, gap + 40));
    go(18, pos(p.x1 + d * 5, -110)); go(19, pos(p.x1 + d * 5, 110));
    ball = { x0: along(-7.5), x1: p.x1, lift: 8, at: 0.2, span: 0.8, kind: "run" };
    return { pre, path, routes, hot, ball };
  }

  if (p.kind === "punt") {
    go(6, pos(along(-13), 0));
    go(8, pos(p.x1 - d * 3, -60)); go(9, pos(p.x1 - d * 3, 60));
    for (let i = 0; i < 4; i++) go(11 + i, pos(along(-2), dyOf(11 + i) * 0.5));
    go(20, pos(p.x1, 0)); hot = 6;
    ball = { x0: along(-13), x1: p.x1, lift: 240, at: 0.3, span: 0.6, kind: "arc" };
    return { pre, path, routes, hot, ball };
  }

  if (p.kind === "fg" || p.kind === "xp") {
    go(6, pos(along(-7), 0)); go(7, pos(along(-9), 14), pos(along(-6), 10));
    for (let i = 0; i < 4; i++) go(11 + i, pos(along(0.5), dyOf(11 + i) * 0.8));
    hot = 7;
    ball = { x0: along(-7), x1: p.off === 0 ? 103 : -3, lift: 170, at: 0.3, span: 0.6, kind: "arc" };
    return { pre, path, routes, hot, ball };
  }
  return { pre, path, routes, hot, ball };
}

function PlayerPanel({ team, p, side }: { team: TeamSim; p: TeamPlayers; side: "left" | "right" }) {
  return (
    <aside className={`st-panel ${side}`} style={{ ["--tc" as string]: team.color }} aria-label={`${team.short} leaders`}>
      <header>{team.logo ? <img src={team.logo} alt="" width="22" height="22" /> : <i />}<strong>{team.short}</strong></header>
      <dl>
        <dt>Passing</dt>
        <dd><b>{p.pass?.name ?? team.roster.qb ?? "—"}</b><span>{p.pass ? `${p.pass.comp}/${p.pass.att} · ${p.pass.yds} yds${p.pass.td ? ` · ${p.pass.td} TD` : ""}${p.pass.int ? ` · ${p.pass.int} INT` : ""}` : "0/0 · 0 yds"}</span></dd>
        <dt>Rushing</dt>
        <dd><b>{p.rush?.name ?? "—"}</b>{p.rush && <span>{p.rush.att} car · {p.rush.yds} yds{p.rush.td ? ` · ${p.rush.td} TD` : ""}</span>}</dd>
        <dt>Receiving</dt>
        <dd><b>{p.rec?.name ?? "—"}</b>{p.rec && <span>{p.rec.n} rec · {p.rec.yds} yds{p.rec.td ? ` · ${p.rec.td} TD` : ""}</span>}</dd>
      </dl>
    </aside>
  );
}

export function Stage({ cfg, plays, idx, pps }: { cfg: GameCfg; plays: PlayRec[]; idx: number; pps: number }) {
  const p = idx >= 0 ? plays[idx] : null;
  const final = plays.length > 0 && idx >= plays.length - 1;
  const score = p?.score ?? [0, 0];
  const stats = useMemo(() => playerStats(plays, idx), [plays, idx]);
  const ref = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  // One play takes most of the gap between plays: a quarter of it resetting to the formation, the rest running the play.
  const total = Math.max(0.06, Math.min(1.6, 0.85 / pps));
  const quick = pps > 8;
  const ball = p ? p.x1 : 35;
  const chor = useMemo(() => choreograph(p), [p]);
  const scrim = p && chor.ball !== null || (p && chor.routes.length > 0);
  const offTeam: 0 | 1 = p ? (scrim ? p.off : p.nextOff) : 0;
  const dots = useRef<(SVGCircleElement | null)[]>([]);
  const last = useRef<P[] | null>(null);
  useLayoutEffect(() => {
    const from = last.current ?? chor.pre;
    chor.path.forEach((wp, i) => {
      const el = dots.current[i];
      if (!el) return;
      const pts: P[] = [from[i], ...wp];
      const final = wp[wp.length - 1];
      el.style.transform = `translate(${final[0]}px, ${final[1]}px)`;
      if (quick || !el.animate || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
      const steps = pts.length - 1;
      const frames = pts.map((q, k) => ({ transform: `translate(${q[0]}px, ${q[1]}px)`, offset: k === 0 ? 0 : k === 1 ? 0.25 : 0.25 + (0.75 * (k - 1)) / (steps - 1) }));
      if (frames.length < 2) return;
      el.getAnimations().forEach((a) => a.cancel());
      el.animate(frames, { duration: total * 1000, easing: "ease-in-out" });
    });
    last.current = chor.path.map((wp) => wp[wp.length - 1]);
  }, [chor, total, quick]);
  const flight = chor.ball && !quick ? chor.ball : null;
  const fdelay = total * (0.25 + 0.75 * (flight?.at ?? 0));
  const fdur = total * 0.75 * (flight?.span ?? 1);
  const banner = p ? bannerFor(p) : null;
  const showBanner = banner && (!quick || p?.td);
  const toGoal = p ? Math.round(100 - (p.nextOff === 0 ? p.x1 : 100 - p.x1)) : 65;
  const sit = !p || final ? "" : `${downText(p.nextDown, p.nextDist, toGoal)}`;
  const status = !p ? "Q1 15:00" : final ? (score[0] === score[1] ? "FINAL (TIE)" : plays.some((x) => x.q > 4) ? "FINAL/OT" : "FINAL") : `${qLabel(p.q)}${p.q > 4 && cfg.league === "CFB" ? "" : ` ${clockText(p.clock)}`}`;
  const caption = !p ? "The coin is in the air" : p.text;
  const first = p && p.nextDown > 0 && p.kind !== "kickoff" && !final ? ball + (p.nextOff === 0 ? 1 : -1) * p.nextDist : null;
  const lead = p && p.scorer !== null && p.pts > 0 ? p.scorer : null;
  const midArt = cfg.home.logoId ? MIDFIELD_ART[cfg.home.logoId] : undefined;
  const ez = useMemo(() => endzoneFor(cfg.home), [cfg.home]);
  const notreDame = cfg.home.short.toLowerCase() === "notre dame";
  const style = { ["--home" as string]: cfg.home.color, ["--away" as string]: cfg.away.color } as CSSProperties;
  const mid = (cfg.home.logo ?? cfg.away.logo) ? (cfg.home.logo ?? cfg.away.logo) : undefined;

  return (
    <div ref={ref} className={`st${full ? " full" : ""}`} style={style}>
      <div className="st-glow" aria-hidden="true" />
      <div className="st-bar" role="group" aria-label="Scoreboard">
        <div className="st-team" style={{ ["--tc" as string]: cfg.away.color }}>
          {cfg.away.logo && <img src={cfg.away.logo} alt="" width="30" height="30" />}
          <strong>{cfg.away.short}</strong><output>{score[0]}</output>
        </div>
        <div className="st-clock"><b>{status}</b>{sit && <span>{sit}</span>}</div>
        <div className="st-team home" style={{ ["--tc" as string]: cfg.home.color }}>
          <output>{score[1]}</output><strong>{cfg.home.short}</strong>
          {cfg.home.logo && <img src={cfg.home.logo} alt="" width="30" height="30" />}
        </div>
      </div>
      <PlayerPanel team={cfg.away} p={stats[0]} side="left" />
      <PlayerPanel team={cfg.home} p={stats[1]} side="right" />
      <div className="st-view">
        <div className="st-plane">
          <svg viewBox={`0 0 ${FW} ${FH}`} role="img" aria-label={p ? p.text : "Football field"}>
            <rect width={FW} height={FH} fill={ez.field?.[0] ?? "#2c6b3d"} />
            {Array.from({ length: 20 }, (_, i) => <rect key={i} x={EZ + i * 5 * YD} width={5 * YD} height={FH} fill={ez.field ? ez.field[i % 2] : i % 2 ? "#2f7040" : "#286238"} />)}
            <EndZones ez={ez} name={cfg.home.short} />
            {Array.from({ length: 21 }, (_, i) => i * 5).map((yd) => (
              <line key={yd} x1={fx(yd)} x2={fx(yd)} y1="0" y2={FH} stroke="#fff" strokeOpacity={yd % 10 === 0 ? 0.85 : 0.4} strokeWidth={yd % 10 === 0 ? 4 : 2} />
            ))}
            {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((yd) => (
              <text key={yd} x={fx(yd)} y={FH - 40} className="st-yd">{yd > 50 ? 100 - yd : yd}</text>
            ))}
            {cfg.home.conf && (
              <>
                <ConfMark conf={cfg.home.conf} cx={fx(25)} cy={78} size={46} />
                <g transform={`rotate(180 ${fx(75)} ${FH - 78})`}><ConfMark conf={cfg.home.conf} cx={fx(75)} cy={FH - 78} size={46} /></g>
              </>
            )}
            {notreDame && (
              <g className="st-nd" aria-label="Touchdown Jesus">
                <line x1={fx(52)} x2={FW - EZ - 28} y1="26" y2="26" stroke="#c99700" strokeWidth="5" strokeDasharray="16 12" strokeLinecap="round" />
                <polygon points={`${FW - EZ - 6},26 ${FW - EZ - 34},12 ${FW - EZ - 34},40`} fill="#c99700" />
                <text x={FW - EZ - 44} y="64" className="st-ndtext">TOUCHDOWN JESUS</text>
              </g>
            )}
            {midArt ? <image href={midArt.src} data-midfield="art" x={fx(50) - midArt.stage / 2} y={CY - midArt.stage / midArt.ratio / 2} width={midArt.stage} height={midArt.stage / midArt.ratio} opacity="0.95" /> : mid && <image href={mid} x={fx(50) - 55} y={CY - 55} width="110" height="110" opacity="0.9" />}
            {lead !== null && <rect key={`g${p!.n}`} className="st-flash" x={lead === 0 ? FW - EZ : 0} width={EZ} height={FH} fill="#fff" />}
            {first !== null && first > 0 && first < 100 && <rect x={fx(first) - 3} y="0" width="6" height={FH} fill="#ffd84a" />}
            {p && p.kind !== "kickoff" && <rect x={fx(ball) - 2.5} y="0" width="5" height={FH} fill="#4aa3ff" opacity="0.9" />}
            {p && chor.routes.map((r, i) => (
              <g key={`r${p.n}-${i}`} className="st-routeg" style={{ ["--rd" as string]: `${total * 0.25}s`, ["--rt" as string]: `${total * 0.75}s` }}>
                <path d={r.pts.map((q, k) => `${k ? "L" : "M"}${q[0]},${q[1]}`).join("")} pathLength="1" className={r.hot ? "st-route hot" : "st-route"} />
                {r.hot && <circle cx={r.pts[r.pts.length - 1][0]} cy={r.pts[r.pts.length - 1][1]} r="7" className="st-routeend" />}
              </g>
            ))}
            {chor.pre.map((_, i) => (
              <circle key={i} ref={(el) => { dots.current[i] = el; }} className={`st-dot${chor.hot === i && scrim ? " hot" : ""}`} r="9" cx="0" cy="0"
                fill={(i < 11 ? cfg : cfg) && (i < 11 ? [cfg.away, cfg.home][offTeam] : [cfg.away, cfg.home][1 - offTeam]).color} style={{ transform: `translate(${chor.pre[i][0]}px, ${chor.pre[i][1]}px)` }} />
            ))}
            <g key={p?.n ?? 0}>
              <g className="st-rest" style={{ transform: `translate(${fx(ball)}px, ${CY}px)`, animationDelay: `${flight ? fdelay + fdur : 0}s` }}><Ball /></g>
              {flight && (
                <g className={`st-flight ${flight.kind}`} style={{ ["--x0" as string]: `${fx(flight.x0)}px`, ["--x1" as string]: `${fx(flight.x1)}px`, ["--cy" as string]: `${CY}px`, ["--lift" as string]: `${flight.lift}px`, animationDelay: `${fdelay}s`, animationDuration: `${fdur}s` }}>
                  <Ball />
                </g>
              )}
            </g>
          </svg>
        </div>
      </div>
      {showBanner && <div key={`b${p!.n}`} className={`st-banner${p?.td || p?.kind === "fg" ? " good" : ""}`}>{banner}</div>}
      <div className="st-caption" aria-live="off">
        {p && <span className="st-art"><PlayArt kind={artFor(p)} size={26} /></span>}
        <span>{caption}</span>
      </div>
      <div className="st-tag"><span>Simulated game</span></div>
      <button className="st-full" onClick={() => (full ? document.exitFullscreen() : ref.current?.requestFullscreen?.())} aria-label={full ? "Exit full screen" : "Full screen"}>{full ? "Exit" : "Full screen"}</button>
    </div>
  );
}

const Ball = () => (
  <g>
    <ellipse className="st-shadow" rx="16" ry="6" cy="14" />
    <ellipse rx="14" ry="9" fill="#8a4b1f" stroke="#fff" strokeWidth="1.5" />
    <path d="M-6 0h12M-3 -3v6M0 -3v6M3 -3v6" stroke="#fff" strokeWidth="1.3" />
  </g>
);
