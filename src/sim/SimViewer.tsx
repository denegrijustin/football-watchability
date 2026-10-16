import { useMemo } from "react";
import { clockText, downText, type GameCfg, type PlayRec, type TeamSim } from "./engine";
import { boxScore, mmss, quarterPoints, type TeamBox } from "./box";

const qLabel = (q: number) => (q > 4 ? "OT" : `Q${q}`);
const sideColor = (cfg: GameCfg, i: 0 | 1) => (i === 0 ? cfg.away.color : cfg.home.color);

export function Badge({ team, size = 40 }: { team: TeamSim; size?: number }) {
  return team.logo ? (
    <img className="sim-logo" src={team.logo} alt="" width={size} height={size} />
  ) : (
    <span className="sim-badge" style={{ width: size, height: size, background: team.color }} aria-hidden="true">
      {team.abbr.slice(0, 3)}
    </span>
  );
}

// ---- scoreboard ---------------------------------------------------------------------------------------------------------------------

export function Scoreboard({ cfg, plays, idx }: { cfg: GameCfg; plays: PlayRec[]; idx: number }) {
  const p = idx >= 0 ? plays[idx] : null;
  const final = idx >= plays.length - 1 && plays.length > 0;
  const score = p?.score ?? [0, 0];
  const off = p ? p.nextOff : 0;
  const toGoal = p ? Math.round(100 - (p.nextOff === 0 ? p.x1 : 100 - p.x1)) : 75;
  const sit = !p || final ? "" : `${downText(p.nextDown, p.nextDist, toGoal)} · ${spotLabel(cfg, p)}`;
  const status = !p ? "Kickoff" : final ? (score[0] === score[1] ? "FINAL (tie)" : plays.some((x) => x.q > 4) ? "FINAL/OT" : "FINAL") : `${qLabel(p.q)} ${p.q > 4 && cfg.league === "CFB" ? "" : clockText(p.clock)}`;
  return (
    <div className="sim-board" role="group" aria-label="Scoreboard">
      {([0, 1] as const).map((i) => {
        const t = i === 0 ? cfg.away : cfg.home;
        const win = final && score[i] > score[1 - i];
        return (
          <div key={i} className={`sim-side${win ? " win" : ""}`} style={{ ["--tc" as string]: t.color }}>
            <Badge team={t} size={44} />
            <div className="sim-side-name">
              <strong>{t.short}</strong>
              <span>{i === 0 ? "Away" : "Home"}</span>
            </div>
            <span className="sim-poss" aria-label={!final && off === i ? "Has the ball" : undefined}>{!final && off === i ? "●" : ""}</span>
            <output className="sim-score" aria-live="off">{score[i]}</output>
          </div>
        );
      })}
      <div className="sim-status">
        <strong>{status}</strong>
        {sit && <span>{sit}</span>}
      </div>
    </div>
  );
}

function spotLabel(cfg: GameCfg, p: PlayRec) {
  const x = p.x1;
  const mid = Math.round(x);
  if (mid === 50) return "50";
  return mid < 50 ? `${cfg.away.abbr} ${mid}` : `${cfg.home.abbr} ${100 - mid}`;
}

// ---- field --------------------------------------------------------------------------------------------------------------------------

const FW = 1200, FH = 270, EZ = 100, YD = (FW - 2 * EZ) / 100;
const fx = (x: number) => EZ + Math.max(0, Math.min(100, x)) * YD;

export function Field({ cfg, plays, idx }: { cfg: GameCfg; plays: PlayRec[]; idx: number }) {
  const p = idx >= 0 ? plays[idx] : null;
  const ball = p ? p.x1 : 25;
  const dir = p ? (p.nextOff === 0 ? 1 : -1) : 1;
  const lineToGain = p && p.nextDown > 0 && p.kind !== "kickoff" ? ball + dir * p.nextDist : null;
  // The current drive's ground gained so far, behind the ball.
  let driveFrom: number | null = null;
  if (p) for (let i = idx; i >= 0 && plays[i].drive === p.drive; i--) { if (plays[i].kind !== "kickoff" && plays[i].kind !== "end") driveFrom = plays[i].x0; }
  const trail = p && p.kind !== "kickoff" ? [p.x0, p.x1] : null;
  const col = p ? sideColor(cfg, p.off) : cfg.away.color;
  return (
    <svg className="sim-field" viewBox={`0 0 ${FW} ${FH}`} role="img" aria-label={p ? `Ball at ${spotLabel(cfg, p)}` : "Football field"}>
      <rect width={FW} height={FH} rx="14" fill="var(--field)" />
      <rect x="0" y="0" width={EZ} height={FH} fill={cfg.away.color} opacity="0.85" />
      <rect x={FW - EZ} y="0" width={EZ} height={FH} fill={cfg.home.color} opacity="0.85" />
      <text x={EZ / 2} y={FH / 2} className="sim-ez" transform={`rotate(-90 ${EZ / 2} ${FH / 2})`}>{cfg.away.short.toUpperCase().slice(0, 14)}</text>
      <text x={FW - EZ / 2} y={FH / 2} className="sim-ez" transform={`rotate(90 ${FW - EZ / 2} ${FH / 2})`}>{cfg.home.short.toUpperCase().slice(0, 14)}</text>
      {Array.from({ length: 21 }, (_, i) => i * 5).map((yd) => (
        <line key={yd} x1={fx(yd)} x2={fx(yd)} y1="0" y2={FH} className={yd % 10 === 0 ? "sim-yl major" : "sim-yl"} />
      ))}
      {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((yd) => (
        <g key={yd} className="sim-num">
          <text x={fx(yd)} y="52">{yd > 50 ? 100 - yd : yd}</text>
          <text x={fx(yd)} y={FH - 36}>{yd > 50 ? 100 - yd : yd}</text>
        </g>
      ))}
      {driveFrom !== null && <rect x={Math.min(fx(driveFrom), fx(ball))} y="84" width={Math.abs(fx(ball) - fx(driveFrom))} height={FH - 168} fill={col} opacity="0.28" rx="10" />}
      {trail && trail[0] !== trail[1] && <line x1={fx(trail[0])} x2={fx(trail[1])} y1={FH / 2} y2={FH / 2} stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeDasharray="2 12" opacity="0.9" />}
      {lineToGain !== null && lineToGain > 0 && lineToGain < 100 && <line x1={fx(lineToGain)} x2={fx(lineToGain)} y1="0" y2={FH} className="sim-first" />}
      {p && p.kind !== "kickoff" && <line x1={fx(ball)} x2={fx(ball)} y1="0" y2={FH} className="sim-los" />}
      <g className="sim-ball" style={{ transform: `translate(${fx(ball)}px, ${FH / 2}px)` }}>
        <ellipse rx="19" ry="12" fill="#8a4b1f" stroke="#fff" strokeWidth="2" />
        <line x1="-9" x2="9" y1="0" y2="0" stroke="#fff" strokeWidth="2" />
      </g>
    </svg>
  );
}

// ---- win probability ----------------------------------------------------------------------------------------------------------------

export function WinChart({ cfg, plays, idx, onSeek }: { cfg: GameCfg; plays: PlayRec[]; idx: number; onSeek: (i: number) => void }) {
  const W = 1000, H = 150;
  const n = plays.length;
  const pts = useMemo(() => {
    const step = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * W);
    const yy = (wp: number) => (1 - wp) * H;
    const line = plays.map((p, i) => `${i ? "L" : "M"}${step(i).toFixed(1)},${yy(p.wp).toFixed(1)}`).join("");
    return { step, yy, line };
  }, [plays, n]);
  if (!n) return null;
  const cur = Math.max(0, Math.min(idx, n - 1));
  const here = plays[cur];
  return (
    <figure className="sim-wp">
      <figcaption>
        <span>Win probability</span>
        <strong className="sim-dot" style={{ ["--tc" as string]: cfg.home.color }}>{cfg.home.short} {Math.round((here?.wp ?? 0.5) * 100)}%</strong>
        <strong className="sim-dot" style={{ ["--tc" as string]: cfg.away.color }}>{cfg.away.short} {Math.round((1 - (here?.wp ?? 0.5)) * 100)}%</strong>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Win probability by play"
        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onSeek(Math.round(((e.clientX - r.left) / r.width) * (n - 1))); }}>
        <rect width={W} height={H / 2} fill={cfg.away.color} opacity="0.16" />
        <rect y={H / 2} width={W} height={H / 2} fill={cfg.home.color} opacity="0.16" />
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} className="sim-wp-mid" />
        {[1, 2, 3].map((k) => (
          <line key={k} x1={(plays.findIndex((p) => p.q > k) / Math.max(1, n - 1)) * W} x2={(plays.findIndex((p) => p.q > k) / Math.max(1, n - 1)) * W} y1="0" y2={H} className="sim-wp-q" />
        ))}
        <path d={pts.line} className="sim-wp-line" vectorEffect="non-scaling-stroke" />
        {plays.map((p, i) => i <= cur && p.pts >= 3 && p.scorer !== null && (
          <circle key={i} cx={pts.step(i)} cy={pts.yy(p.wp)} r="6" fill={sideColor(cfg, p.scorer)} stroke="#fff" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        ))}
        <line x1={pts.step(cur)} x2={pts.step(cur)} y1="0" y2={H} className="sim-wp-cur" vectorEffect="non-scaling-stroke" />
      </svg>
    </figure>
  );
}

// ---- play feed ----------------------------------------------------------------------------------------------------------------------

export function PlayFeed({ cfg, plays, idx, onlyKey }: { cfg: GameCfg; plays: PlayRec[]; idx: number; onlyKey: boolean }) {
  const rows: PlayRec[] = [];
  for (let i = idx; i >= 0 && rows.length < 60; i--) {
    const p = plays[i];
    if (onlyKey && !(p.big || p.kind === "end")) continue;
    rows.push(p);
  }
  if (!rows.length) return <p className="sim-empty">Waiting for kickoff…</p>;
  return (
    <ol className="sim-feed" aria-label="Play by play, newest first">
      {rows.map((p) => {
        const scoring = p.scorer !== null && p.pts > 0;
        const marker = p.kind === "end" || p.kind === "xp" || p.kind === "two" || p.kind === "kickoff";
        return (
          <li key={p.n} className={`${scoring ? "sim-pt" : ""}${p.turnover && p.kind !== "fg" && p.kind !== "punt" ? " sim-turn" : ""}${p.big ? " sim-big" : ""}${marker ? " sim-marker" : ""}`}
            style={scoring && p.scorer !== null ? { ["--tc" as string]: sideColor(cfg, p.scorer) } : undefined}>
            <span className="sim-when">{qLabel(p.q)} {p.q > 4 && cfg.league === "CFB" ? "" : clockText(p.clock)}</span>
            {!marker && p.down > 0 && <span className="sim-sit">{downText(p.down, p.dist, 100 - (p.off === 0 ? p.x0 : 100 - p.x0))} at {p.spot}</span>}
            <span className="sim-text">{p.text}{scoring && p.kind !== "xp" && p.kind !== "two" ? ` (${p.score[0]}–${p.score[1]})` : ""}</span>
          </li>
        );
      })}
    </ol>
  );
}

// ---- box score and summary ----------------------------------------------------------------------------------------------------------

const rows: { label: string; get: (b: TeamBox) => string }[] = [
  { label: "Total yards", get: (b) => String(b.yds) },
  { label: "Passing", get: (b) => `${b.passComp}/${b.passAtt}, ${b.passYds} yds` },
  { label: "Rushing", get: (b) => `${b.rushAtt} for ${b.rushYds} yds` },
  { label: "Plays", get: (b) => String(b.plays) },
  { label: "First downs", get: (b) => String(b.firstDowns) },
  { label: "3rd down", get: (b) => `${b.third[0]}/${b.third[1]}` },
  { label: "4th down", get: (b) => `${b.fourth[0]}/${b.fourth[1]}` },
  { label: "Sacks taken", get: (b) => `${b.sacks} for ${b.sackYds}` },
  { label: "Turnovers", get: (b) => `${b.turnovers} (${b.ints} INT, ${b.fumbles} fum)` },
  { label: "Penalties", get: (b) => `${b.pens} for ${b.penYds}` },
  { label: "Punts", get: (b) => String(b.punts) },
  { label: "Field goals", get: (b) => `${b.fg[0]}/${b.fg[1]}` },
  { label: "Time of possession", get: (b) => mmss(b.top) },
];

export function BoxScore({ cfg, plays, idx }: { cfg: GameCfg; plays: PlayRec[]; idx: number }) {
  const box = useMemo(() => boxScore(plays, idx), [plays, idx]);
  const qs = useMemo(() => quarterPoints(plays, idx), [plays, idx]);
  const hasOt = plays.some((p) => p.q > 4);
  const cols = hasOt ? 5 : 4;
  return (
    <div className="sim-box">
      <table className="sim-lines">
        <thead>
          <tr><th scope="col">Team</th>{Array.from({ length: cols }, (_, i) => <th key={i} scope="col">{i === 4 ? "OT" : i + 1}</th>)}<th scope="col">T</th></tr>
        </thead>
        <tbody>
          {([0, 1] as const).map((i) => (
            <tr key={i}>
              <th scope="row">{(i === 0 ? cfg.away : cfg.home).abbr}</th>
              {qs[i].slice(0, cols).map((v, k) => <td key={k}>{v}</td>)}
              <td><strong>{box[i].pts}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="sim-stats">
        <thead>
          <tr><th scope="col" className="sim-dot" style={{ ["--tc" as string]: cfg.away.color }}>{cfg.away.abbr}</th><th scope="col"><span className="sr-only">Stat</span></th><th scope="col" className="sim-dot" style={{ ["--tc" as string]: cfg.home.color }}>{cfg.home.abbr}</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}><td>{r.get(box[0])}</td><th scope="row">{r.label}</th><td>{r.get(box[1])}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ScoringSummary({ cfg, plays, idx }: { cfg: GameCfg; plays: PlayRec[]; idx: number }) {
  const items = plays.slice(0, idx + 1).filter((p) => p.scorer !== null && p.pts >= 2 && p.kind !== "xp" && p.kind !== "two" || (p.td && p.scorer !== null));
  const seen = new Set<number>();
  const list = items.filter((p) => (seen.has(p.n) ? false : (seen.add(p.n), true)));
  if (!list.length) return <p className="sim-empty">No scoring yet.</p>;
  return (
    <ol className="sim-scoring">
      {list.map((p) => (
        <li key={p.n} style={{ ["--tc" as string]: sideColor(cfg, p.scorer as 0 | 1) }}>
          <span className="sim-when">{qLabel(p.q)} {p.q > 4 && cfg.league === "CFB" ? "" : clockText(p.clock)}</span>
          <span className="sim-text">{p.text}</span>
          <strong>{p.score[0]}–{p.score[1]}</strong>
        </li>
      ))}
    </ol>
  );
}
