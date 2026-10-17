import { useEffect, useMemo, useRef, useState } from "react";
import { logos, teamColor } from "./data";
import { helmetFor } from "./helmets";
import { choreograph, parsePlay, type Choreo, type Key, type PlayShape } from "./lastPlay";

export type LastPlayTeam = { id?: string; abbr?: string; name: string; color?: string | null; logoId?: string };
type FeedPlay = { id?: string; team: string; text: string; kind: string; yards: number; score?: boolean; turnover?: boolean; toGo?: number | null };

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
  const offHelmet = helmetFor(off.logoId, offColor);
  const defHelmet = helmetFor(def.logoId, defColor);
  const x0 = s > 0 ? chor.xMin * U : -chor.xMax * U;
  const w = (chor.xMax - chor.xMin) * U;
  const h = 2 * Y_HALF * U;
  // Anchor markings to the snap's actual spot when ESPN supplies it. Older
  // feeds retain explicitly relative yard labels rather than invented positions.
  const toGo = found.play.toGo;
  const fromOwn = toGo != null && Number.isFinite(toGo) && toGo >= 0 && toGo <= 100 ? 100 - toGo : null;
  const offset = fromOwn ?? 0;
  const ticks: number[] = [];
  for (let yard = Math.ceil((offset + chor.xMin) / 5) * 5; yard <= offset + chor.xMax; yard += 5) {
    if (fromOwn == null || (yard >= 0 && yard <= 100)) ticks.push(yard - offset);
  }
  const hashes: number[] = [];
  for (let yard = Math.ceil(offset + chor.xMin); yard <= offset + chor.xMax; yard++) {
    if (yard % 5 && (fromOwn == null || (yard > 0 && yard < 100))) hashes.push(yard - offset);
  }
  const fieldNumber = (t: number) => fromOwn == null ? (t > 0 ? `+${t}` : String(t)) : String(Math.min(offset + t, 100 - offset - t));
  const homeLogo = teams[1]?.logoId ? logos[teams[1].logoId!] : undefined;
  const midfield = fromOwn == null ? null : 50 - fromOwn;
  const [bx0, by0] = px(0, 0);
  const side = chor.shape.side ? `${chor.shape.depth ? `${chor.shape.depth} ` : ""}${chor.shape.side}` : "";
  const endMark = chor.end ? px(chor.end[0], chor.end[1]) : null;
  return (
    <figure className="lp" data-play={chor.shape.type} data-facing={s > 0 ? "right" : "left"} data-run={run}>
      <svg viewBox={`${x0} ${-Y_HALF * U} ${w} ${h}`} role="img" aria-label={`Last play: ${chor.headline}. ${found.shape.text}`} className="lp-svg">
        <rect x={x0} y={-Y_HALF * U} width={w} height={h} className="lp-turf" />
        {ticks.map((t, i) => {
          const [tx] = px(t, 0);
          return i % 2 === 0 ? <rect key={`stripe-${t}`} x={Math.min(tx, tx + s * 5 * U)} y={-Y_HALF * U} width={5 * U} height={h} className="lp-mow" /> : null;
        })}
        <rect x={x0 + 2} y={-Y_HALF * U + 3} width={w - 4} height={h - 6} className="lp-boundary" />
        {midfield != null && midfield >= chor.xMin && midfield <= chor.xMax && homeLogo && (
          <image href={homeLogo} x={px(midfield, 0)[0] - 48} y={-48} width="96" height="96" opacity="0.2" preserveAspectRatio="xMidYMid meet" />
        )}
        {teams.map((team, i) => team.logoId && logos[team.logoId] && (
          <image key={i} href={logos[team.logoId]} x={i === 0 ? x0 + 12 : x0 + w - 52} y={-Y_HALF * U + 12} width="40" height="40" opacity="0.8" preserveAspectRatio="xMidYMid meet" />
        ))}
        {ticks.map((t) => {
          const [tx] = px(t, 0);
          return (
            <g key={t}>
              <line x1={tx} x2={tx} y1={-Y_HALF * U} y2={Y_HALF * U} className="lp-tick" />
              {(offset + t) % 10 === 0 && [1, -1].map((edge) => (
                <text key={edge} x={tx} y={edge * (Y_HALF * U - 62)} transform={edge < 0 ? `rotate(180 ${tx} ${edge * (Y_HALF * U - 62)})` : undefined} className="lp-num" textAnchor="middle">{fieldNumber(t)}</text>
              ))}
            </g>
          );
        })}
        {hashes.map((t) => [-1, 1].map((edge) => {
          const [tx] = px(t, 0);
          return <path key={`${t}-${edge}`} d={`M${tx} ${edge * 31}v${edge * 5}M${tx} ${edge * (Y_HALF * U - 12)}v${edge * 6}`} className="lp-hash" />;
        }))}
        <line x1="0" x2="0" y1={-Y_HALF * U} y2={Y_HALF * U} className="lp-los" />
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
            <ellipse rx="10" ry="7" cy="3" fill={a.off ? offColor : defColor} className="lp-shoulders" />
            <g transform={`rotate(${(a.off ? s : -s) > 0 ? -90 : 90})`}>
              <path d="M-6 3V-2C-6 -9 6 -9 6 -2V3L3 5H-3Z" fill={(a.off ? offHelmet : defHelmet).shell} className="lp-player-shell" />
              <path d="M0 -7V1" className="lp-player-stripe" style={{ stroke: (a.off ? offHelmet : defHelmet).stripe }} />
              <path d="M-4 3V6H4V3M-3 4H3" className="lp-player-mask" style={{ stroke: (a.off ? offHelmet : defHelmet).mask }} />
            </g>
            {a.label && <text y={-13} className="lp-name" textAnchor="middle">{a.label}</text>}
          </g>
        ))}
        <g ref={ballRef} className="lp-ball" style={{ transform: `translate(${bx0}px, ${by0}px)` }}>
          <ellipse rx="6.5" ry="4" />
          <path d="M-3 0h6M-1.5 -1.5v3M1.5 -1.5v3" />
        </g>
      </svg>
      <figcaption>
        <b>{chor.headline}</b>
        <span className="lp-diagram-note">Illustrated from play text · {fromOwn == null ? "yards from snap" : "field position at snap"}</span>
        {side && <span> · {side}</span>}
        <span className="lp-text">{found.shape.text}</span>
        <button type="button" className="lp-replay" onClick={() => setRun((n) => n + 1)} aria-label="Replay the last play">↻ Replay</button>
      </figcaption>
    </figure>
  );
}
