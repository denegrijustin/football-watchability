import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { PlayArt } from "../components/PlayArt";
import type { PlayArtKind } from "../playImpact";
import { clockText, downText, type GameCfg, type PlayRec, type TeamSim } from "./engine";
import { playerStats, type TeamPlayers } from "./box";

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

type Flight = { cls: string; x0: number; x1: number; lift: number } | null;
function flightFor(p: PlayRec | null): Flight {
  if (!p) return null;
  const d = p.off === 0 ? 1 : -1;
  if (p.kind === "pass") {
    const incomplete = p.complete === false;
    return { cls: "arc", x0: fx(p.x0 - d * 4), x1: fx(incomplete ? p.x0 + d * 12 : p.x1), lift: 110 };
  }
  if (p.kind === "rush") return { cls: "run", x0: fx(p.x0), x1: fx(p.x1), lift: 10 };
  if (p.kind === "punt") return { cls: "arc", x0: fx(p.x0), x1: fx(p.x1), lift: 230 };
  if (p.kind === "kickoff") return { cls: "arc", x0: fx(p.off === 0 ? 35 : 65), x1: fx(p.x1), lift: 230 };
  if (p.kind === "fg" || p.kind === "xp") return { cls: "arc", x0: fx(p.x0 - d * 7), x1: fx(p.off === 0 ? 102 : -2), lift: 160 };
  return null;
}

/** Formation dots around the line of scrimmage, in field units (yards along x, pixels across). */
const OFF: [number, number][] = [[-1.2, -48], [-1.2, -24], [-1.2, 0], [-1.2, 24], [-1.2, 48], [-1.4, 78], [-4.5, 0], [-7.5, 14], [-0.8, -190], [-0.8, 190], [-1.8, -125]];
const DEF: [number, number][] = [[1.5, -60], [1.5, -20], [1.5, 20], [1.5, 60], [5, -75], [5, 0], [5, 75], [3, -185], [3, 185], [12, -62], [12, 62]];

function Dots({ ball, off, cfg, jitter }: { ball: number; off: 0 | 1; cfg: GameCfg; jitter: number }) {
  const d = off === 0 ? 1 : -1;
  const T = [cfg.away, cfg.home];
  const place = (list: [number, number][], team: TeamSim, dir: number, tag: string) =>
    list.map(([dx, dy], i) => (
      <circle key={`${tag}${i}`} className="st-dot" r="9" cx="0" cy="0" fill={team.color} style={{ transform: `translate(${fx(ball + dir * dx)}px, ${CY + dy + ((i * 7 + jitter) % 5) - 2}px)` }} />
    ));
  return (
    <g className="st-dots">
      {place(OFF, T[off], d, "o")}
      {place(DEF, T[1 - off], d, "d")}
    </g>
  );
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

  const dur = Math.max(0.12, Math.min(0.9, 1.2 / pps));
  const quick = pps > 8;
  const offNext = p ? p.nextOff : 0;
  const ball = p ? p.x1 : 35;
  const flight = quick && !(p?.kind === "punt" || p?.kind === "fg") ? null : flightFor(p);
  const banner = p ? bannerFor(p) : null;
  const showBanner = banner && (!quick || p?.td);
  const toGoal = p ? Math.round(100 - (p.nextOff === 0 ? p.x1 : 100 - p.x1)) : 65;
  const sit = !p || final ? "" : `${downText(p.nextDown, p.nextDist, toGoal)}`;
  const status = !p ? "Q1 15:00" : final ? (score[0] === score[1] ? "FINAL (TIE)" : plays.some((x) => x.q > 4) ? "FINAL/OT" : "FINAL") : `${qLabel(p.q)}${p.q > 4 && cfg.league === "CFB" ? "" : ` ${clockText(p.clock)}`}`;
  const caption = !p ? "The coin is in the air" : p.text;
  const first = p && p.nextDown > 0 && p.kind !== "kickoff" && !final ? ball + (p.nextOff === 0 ? 1 : -1) * p.nextDist : null;
  const lead = p && p.scorer !== null && p.pts > 0 ? p.scorer : null;
  const style = { ["--dur" as string]: `${dur}s`, ["--home" as string]: cfg.home.color, ["--away" as string]: cfg.away.color } as CSSProperties;
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
            <rect width={FW} height={FH} fill="#2c6b3d" />
            {Array.from({ length: 20 }, (_, i) => <rect key={i} x={EZ + i * 5 * YD} width={5 * YD} height={FH} fill={i % 2 ? "#2f7040" : "#286238"} />)}
            <rect width={EZ} height={FH} fill={cfg.away.color} />
            <rect x={FW - EZ} width={EZ} height={FH} fill={cfg.home.color} />
            {Array.from({ length: 21 }, (_, i) => i * 5).map((yd) => (
              <line key={yd} x1={fx(yd)} x2={fx(yd)} y1="0" y2={FH} stroke="#fff" strokeOpacity={yd % 10 === 0 ? 0.85 : 0.4} strokeWidth={yd % 10 === 0 ? 4 : 2} />
            ))}
            {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((yd) => (
              <text key={yd} x={fx(yd)} y={FH - 40} className="st-yd">{yd > 50 ? 100 - yd : yd}</text>
            ))}
            {mid && <image href={mid} x={fx(50) - 55} y={CY - 55} width="110" height="110" opacity="0.9" />}
            {lead !== null && <rect key={`g${p!.n}`} className="st-flash" x={lead === 0 ? FW - EZ : 0} width={EZ} height={FH} fill="#fff" />}
            {first !== null && first > 0 && first < 100 && <rect x={fx(first) - 3} y="0" width="6" height={FH} fill="#ffd84a" />}
            {p && p.kind !== "kickoff" && <rect x={fx(ball) - 2.5} y="0" width="5" height={FH} fill="#4aa3ff" opacity="0.9" />}
            <Dots ball={ball} off={offNext} cfg={cfg} jitter={p ? p.n : 0} />
            <g key={p?.n ?? 0}>
              <g className="st-rest" style={{ transform: `translate(${fx(ball)}px, ${CY}px)` }}><Ball /></g>
              {flight && (
                <g className={`st-flight ${flight.cls}`} style={{ ["--x0" as string]: `${flight.x0}px`, ["--x1" as string]: `${flight.x1}px`, ["--cy" as string]: `${CY}px`, ["--lift" as string]: `${flight.lift}px` }}>
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
