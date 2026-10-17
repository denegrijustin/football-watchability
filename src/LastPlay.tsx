import { useEffect, useMemo, useRef, useState } from "react";
import { teamColor } from "./data";
import { choreograph, parsePlay, type Choreo, type Key, type PlayShape } from "./lastPlay";

export type LastPlayTeam = { id?: string; abbr?: string; name: string; color?: string | null };
type FeedPlay = { id?: string; team: string; text: string; kind: string; yards: number; score?: boolean; turnover?: boolean };

const U = 10; // pixels per yard in the drawing
const Y_HALF = 25; // yards either side of the middle
const DURATION = 3400;

/** The latest play the picture can show (a run, pass, sack, punt or field goal), looking back over the last few plays. */
export function latestShape(plays: FeedPlay[] | undefined): { play: FeedPlay; shape: PlayShape } | null {
  if (!plays) return null;
  for (let i = plays.length - 1; i >= Math.max(0, plays.length - 4); i--) {
    const shape = parsePlay(plays[i]);
    if (shape) return { play: plays[i], shape };
  }
  return null;
}

const frames = (kf: Key[], px: (x: number, y: number) => [number, number], ball: boolean): Keyframe[] =>
  kf.map((k) => {
    const [x, y] = px(k[1], k[2]);
    return { offset: k[0], transform: `translate(${x}px, ${y}px)${ball ? ` scale(${1 + (k[3] ?? 0) * 0.9})` : ""}` };
  });

/**
 * The last play as play art: the formation, the routes or the runner's path, the ball's flight and the defense's motion, drawn from the play's own
 * text, so a short pass to the left looks different from a deep one to the right and a run up the middle from a run around the end.
 * Drawn facing the way the offense is driving, like the field above it.
 */
export function LastPlay({ plays, teams }: { plays: FeedPlay[] | undefined; teams: LastPlayTeam[] }) {
  const found = latestShape(plays);
  const id = found ? `${found.play.id ?? ""}|${found.play.team}|${found.play.text}` : "";
  // Rebuilt only when the play itself changes, so a refresh of the feed does not restart the animation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const chor = useMemo<Choreo | null>(() => (found ? choreograph(found.shape) : null), [id]);
  const [run, setRun] = useState(0);
  const actors = useRef<(SVGGElement | null)[]>([]);
  const ballRef = useRef<SVGGElement | null>(null);
  const lines = useRef<(SVGPathElement | null)[]>([]);
  const markRef = useRef<SVGGElement | null>(null);

  const offIdx = found ? (found.play.team === teams[0]?.id ? 0 : found.play.team === teams[1]?.id ? 1 : -1) : -1;
  const s = offIdx === 0 ? 1 : -1; // the away team drives to the right, the home team to the left
  const px = (x: number, y: number): [number, number] => [s * x * U, s * y * U];

  useEffect(() => {
    if (!chor) return;
    const still = !actors.current[0]?.animate || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const play = (el: Element | null | undefined, kfs: Keyframe[]) => {
      if (!el) return;
      const last = kfs[kfs.length - 1];
      (el as SVGElement).style.transform = String(last.transform);
      if (still || kfs.length < 2) return;
      (el as SVGElement).getAnimations().forEach((a) => a.cancel());
      el.animate(kfs, { duration: DURATION, easing: "linear", fill: "backwards" });
    };
    chor.actors.forEach((a, i) => play(actors.current[i], frames(a.kf, px, false)));
    play(ballRef.current, frames(chor.ball, px, true));
    chor.routes.forEach((r, i) => {
      const el = lines.current[i];
      if (!el) return;
      el.style.strokeDashoffset = "0";
      if (still) return;
      el.getAnimations().forEach((a) => a.cancel());
      el.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: DURATION * (r.at[1] - r.at[0]), delay: DURATION * r.at[0], easing: "ease-out", fill: "backwards" });
    });
    const mark = markRef.current;
    if (mark && !still) {
      mark.getAnimations().forEach((a) => a.cancel());
      mark.animate([{ opacity: 0 }, { opacity: 0, offset: 0.92 }, { opacity: 1 }], { duration: DURATION, fill: "backwards" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chor, run, s]);

  if (!found || !chor || offIdx < 0) return null;
  const off = teams[offIdx], def = teams[1 - offIdx];
  const offColor = teamColor(off.color ?? null) ?? "#c1403d";
  const defColor = teamColor(def.color ?? null) ?? "#2f7de1";
  const x0 = s > 0 ? chor.xMin * U : -chor.xMax * U;
  const w = (chor.xMax - chor.xMin) * U;
  const h = 2 * Y_HALF * U;
  const ticks: number[] = [];
  for (let t = Math.ceil(chor.xMin / 5) * 5; t <= chor.xMax; t += 5) ticks.push(t);
  const [bx0, by0] = px(0, 0);
  const side = chor.shape.side ? `${chor.shape.depth ? `${chor.shape.depth} ` : ""}${chor.shape.side}` : "";
  const endMark = chor.end ? px(chor.end[0], chor.end[1]) : null;
  return (
    <figure className="lp" data-play={chor.shape.type} data-facing={s > 0 ? "right" : "left"} data-run={run}>
      <svg viewBox={`${x0} ${-Y_HALF * U} ${w} ${h}`} role="img" aria-label={`Last play: ${chor.headline}. ${found.shape.text}`} className="lp-svg">
        <rect x={x0} y={-Y_HALF * U} width={w} height={h} className="lp-turf" />
        {ticks.map((t) => {
          const [tx] = px(t, 0);
          return (
            <g key={t}>
              <line x1={tx} x2={tx} y1={-Y_HALF * U} y2={Y_HALF * U} className={t === 0 ? "lp-los" : "lp-tick"} />
              {t !== 0 && t % 10 === 0 && <text x={tx} y={Y_HALF * U - 8} className="lp-num" textAnchor="middle">{t > 0 ? `+${t}` : t}</text>}
            </g>
          );
        })}
        {[-3, 3].map((hy) => (
          <line key={hy} x1={x0} x2={x0 + w} y1={hy * U * 1.1} y2={hy * U * 1.1} className="lp-hash" />
        ))}
        {chor.posts !== null && (() => {
          const [gx] = px(chor.posts, 0);
          return <path d={`M${gx} ${-1.9 * U}v${3.8 * U}M${gx} 0h${s * 1.2 * U}`} className="lp-post" />;
        })()}
        {chor.routes.map((r, i) => (
          <path
            key={i}
            ref={(el) => { lines.current[i] = el; }}
            d={r.pts.map((q, k) => { const [qx, qy] = px(q[0], q[1]); return `${k ? "L" : "M"}${qx},${qy}`; }).join("")}
            pathLength="1"
            className={`lp-route${r.hot ? " hot" : ""}`}
            data-route={r.hot ? "target" : "decoy"}
          />
        ))}
        {endMark && (
          <g ref={markRef} className="lp-end" transform={`translate(${endMark[0]} ${endMark[1]})`}>
            <line y1={-1.6 * U} y2={1.6 * U} />
            <circle r="5" />
          </g>
        )}
        {chor.actors.map((a, i) => (
          <g key={i} ref={(el) => { actors.current[i] = el; }} className={`lp-p ${a.off ? "off" : "def"}${a.hot ? " hot" : ""}`} data-side={a.off ? "off" : "def"} style={{ transform: `translate(${px(a.kf[0][1], a.kf[0][2]).join("px, ")}px)` }}>
            <circle r={a.hot ? 8.5 : 6.5} fill={a.off ? offColor : defColor} />
            {a.label && <text y={-13} className="lp-name" textAnchor="middle">{a.label}</text>}
          </g>
        ))}
        <g ref={ballRef} className="lp-ball" style={{ transform: `translate(${bx0}px, ${by0}px)` }}>
          <ellipse rx="6.5" ry="4" />
          <path d="M-2.5 0h5" />
        </g>
      </svg>
      <figcaption>
        <b>{chor.headline}</b>
        {side && <span> · {side}</span>}
        <span className="lp-text">{found.shape.text}</span>
        <button type="button" className="lp-replay" onClick={() => setRun((n) => n + 1)} aria-label="Replay the last play">↻ Replay</button>
      </figcaption>
    </figure>
  );
}
