import { useDiscFill } from "./logoDisc";
import { useEffect, useMemo, useRef, useState } from "react";
import { logos, teamColor } from "./data";
import { ConfMark } from "./ConfMark";
import { EndZones } from "./sim/EndZones";
import { endzoneFor } from "./sim/endzone";
import { MIDFIELD_ART } from "./sim/midfield";
import { driveHistory, driveStats } from "./driveHistory";
import { choreograph, parsePlay, playDetail, type Choreo, type Key, type PlayShape } from "./lastPlay";

export type LastPlayTeam = { id?: string; abbr?: string; name: string; color?: string | null; logoId?: string; conf?: string | null };
type FeedPlay = { id?: string; team: string; text: string; kind: string; yards: number; score?: boolean; turnover?: boolean; toGo?: number | null };

// The same field box as the simulator: 1200 x 560 with 100-wide end zones, ten units to the yard.
const FW = 1200, FH = 560, EZ = 100, U = 10, CY = FH / 2;
const fx = (yd: number) => EZ + Math.max(-10, Math.min(110, yd)) * U;
const DURATION = 3400;

/** The latest play the picture can show (a run, pass, sack, punt or field goal), looking back over the last few plays. */
export function latestShape(plays: FeedPlay[] | undefined): { play: FeedPlay; shape: PlayShape; index: number } | null {
  if (!plays) return null;
  for (let i = plays.length - 1; i >= Math.max(0, plays.length - 4); i--) {
    const shape = parsePlay(plays[i]);
    if (shape) return { play: plays[i], shape, index: i };
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
function PlayerDisc({ logo, ring }: { logo?: string; ring: string }) {
  const fill = useDiscFill(logo);
  return (
    <>
      <circle r="9.5" cy="2" fill={fill} className="lp-player-disc" style={{ stroke: ring }} />
      {logo && <image href={logo} x="-7" y="-5" width="14" height="14" preserveAspectRatio="xMidYMid meet" />}
    </>
  );
}

export function LastPlay({ plays, teams, live, situation, nfl }: { plays: FeedPlay[] | undefined; teams: LastPlayTeam[]; live?: boolean; situation?: string; nfl?: boolean }) {
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
  // Where the play started, in yards from the left goal line: ESPN's yards-to-end-zone at the snap, or midfield when it does not say.
  const toGo = found?.play.toGo;
  const known = toGo != null && Number.isFinite(toGo) && toGo >= 0 && toGo <= 100;
  const los = known ? (s > 0 ? 100 - toGo! : toGo!) : 50;
  const px = (x: number, y: number): [number, number] => [fx(los + s * x), CY + s * y * U];

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
  const home = teams[1];
  const nflGame = !!nfl || home.conf === "AFC" || home.conf === "NFC";
  const homeShort = nflGame ? home.name.split(" ").pop() ?? home.name : home.name;
  const ez = endzoneFor({ short: homeShort, color: home.color ?? defColor, alt: undefined });
  const fieldConf = nflGame ? "NFL" : home.conf && home.conf !== "Independent" ? home.conf : null;
  const midArt = home.logoId ? MIDFIELD_ART[home.logoId] : undefined;
  const homeLogo = home.logoId ? logos[home.logoId] : undefined;
  const history = driveHistory(plays ?? [], found.index, teams[0]?.id);
  const HIST_Y = FH - 112, HIST_H = 28;
  const stats = chor.shape.type === "kickoff" ? null : driveStats(plays ?? [], found.index, off.abbr);
  const detail = playDetail(chor.shape);
  const [bx0, by0] = px(0, 0);
  const side = chor.shape.side ? `${chor.shape.depth ? `${chor.shape.depth} ` : ""}${chor.shape.side}` : "";
  const endMark = chor.end ? px(chor.end[0], chor.end[1]) : null;
  return (
    <figure className="lp" data-play={chor.shape.type} data-facing={s > 0 ? "right" : "left"} data-run={run}>
      <p className="lp-head">
        {off.logoId && logos[off.logoId] && <img src={logos[off.logoId]} alt="" width="20" height="20" />}
        <b>{off.name}</b>
        <span>{live ? "have the ball" : "had the ball"}</span>
        <span className="lp-dir" aria-label={`driving ${s > 0 ? "right" : "left"}`}>driving {s > 0 ? "→" : "←"}</span>
        {live && situation && <span className="lp-sit">{situation}</span>}
      </p>
      <svg viewBox={`0 0 ${FW} ${FH}`} role="img" aria-label={`Last play: ${chor.headline}. ${found.shape.text}`} className="lp-svg">
        <rect width={FW} height={FH} className="lp-turf" />
        {Array.from({ length: 20 }, (_, i) => <rect key={i} x={EZ + i * 5 * U} width={5 * U} height={FH} className={i % 2 ? "lp-mow" : "lp-mow alt"} />)}
        <EndZones ez={ez} name={homeShort} />
        {Array.from({ length: 21 }, (_, i) => i * 5).map((yd) => (
          <line key={yd} x1={fx(yd)} x2={fx(yd)} y1="0" y2={FH} className="lp-tick" style={{ strokeOpacity: yd % 10 === 0 ? 0.8 : 0.4 }} />
        ))}
        {Array.from({ length: 99 }, (_, i) => i + 1).filter((yd) => yd % 5).map((yd) => (
          <path key={yd} d={`M${fx(yd)} 6v12M${fx(yd)} ${FH - 18}v12M${fx(yd)} ${CY - 52}v8M${fx(yd)} ${CY + 44}v8`} className="lp-hash" />
        ))}
        {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((yd) => (
          <g key={yd}>
            <text x={fx(yd)} y={FH - 34} className="lp-num" textAnchor="middle">{yd > 50 ? 100 - yd : yd}</text>
            <text x={fx(yd)} y="34" transform={`rotate(180 ${fx(yd)} 28)`} className="lp-num" textAnchor="middle">{yd > 50 ? 100 - yd : yd}</text>
          </g>
        ))}
        {fieldConf && (
          <>
            <ConfMark conf={fieldConf} cx={fx(25)} cy={86} size={46} />
            <g transform={`rotate(180 ${fx(75)} ${FH - 86})`}><ConfMark conf={fieldConf} cx={fx(75)} cy={FH - 86} size={46} /></g>
          </>
        )}
        {midArt ? (
          <image href={midArt.src} data-midfield="art" x={fx(50) - midArt.stage / 2} y={CY - midArt.stage / midArt.ratio / 2} width={midArt.stage} height={midArt.stage / midArt.ratio} opacity="0.9" />
        ) : (
          homeLogo && <image href={homeLogo} x={fx(50) - 55} y={CY - 55} width="110" height="110" opacity="0.5" preserveAspectRatio="xMidYMid meet" />
        )}
        <rect x={EZ} y="1.5" width={FW - 2 * EZ} height={FH - 3} className="lp-boundary" />
        {history.map((b, i) => {
          const x1 = fx(Math.min(b.from, b.to)), x2 = fx(Math.max(b.from, b.to));
          const w = Math.max(x2 - x1, 8);
          return (
            <g key={i} className={`lp-box ${b.type}`} data-box={b.type}>
              <rect x={x1} y={HIST_Y} width={w} height={HIST_H} rx="3" />
              {b.firstDown && (
                <>
                  <rect x={x1 + w - 5} y={HIST_Y - 2} width="5" height={HIST_H + 4} className="lp-first" />
                  <g className="lp-first-tag" transform={`translate(${Math.max(x1, x1 + w - 34)} ${HIST_Y - 21})`}>
                    <rect width="34" height="17" rx="3" />
                    <text x="17" y="12.5" textAnchor="middle">1st</text>
                  </g>
                </>
              )}
              {w >= 38 && <text x={x1 + w / 2} y={HIST_Y + HIST_H / 2 + 5} textAnchor="middle">{b.yards > 0 ? `+${b.yards}` : b.yards}</text>}
            </g>
          );
        })}
        <line x1={fx(los)} x2={fx(los)} y1="0" y2={FH} className="lp-los" />
        {chor.posts !== null && (() => {
          const [gx] = px(chor.posts, 0);
          return <path d={`M${gx} ${CY - 19}v38M${gx} ${CY}h${s * 12}`} className="lp-post" />;
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
            <g transform="scale(1.45)">
            <ellipse rx="10" ry="7" cy="3" fill={a.off ? offColor : defColor} className="lp-shoulders" />
            <PlayerDisc logo={(a.off ? off : def).logoId ? logos[(a.off ? off : def).logoId!] : undefined} ring={a.off ? offColor : defColor} />
            </g>
            {a.label && <text y={-22} className="lp-name" textAnchor="middle">{a.label}</text>}
          </g>
        ))}
        <g ref={ballRef} className="lp-ball" style={{ transform: `translate(${bx0}px, ${by0}px)` }}>
          <ellipse rx="9" ry="5.5" />
          <path d="M-4 0h8M-2 -2v4M2 -2v4" />
        </g>
      </svg>
      <figcaption>
        <b>{chor.headline}</b>
        <span className="lp-diagram-note">Illustrated from play text{known ? "" : " · field position approximate"}</span>
        {side && <span> · {side}</span>}
        <span className="lp-key" aria-hidden="true"><i className="pass" /> pass <i className="run" /> run <i className="penalty" /> penalty <i className="first" /> first down</span>
        {detail.length > 0 && <span className="lp-detail" data-detail>{detail.map((d, i) => <em key={i}>{d}</em>)}</span>}
        <span className="lp-text">{found.shape.text}</span>
        <button type="button" className="lp-replay" onClick={() => setRun((n) => n + 1)} aria-label="Replay the last play">↻ Replay</button>
      </figcaption>
      {stats && (
        <dl className="lp-stats" aria-label="Drive stats">
          {([
            ["Run plays", stats.runPlays, "Run plays"], ["Run yards", stats.runYards, "Run yds"], ["Pass plays", stats.passPlays, "Pass plays"], ["Pass yards", stats.passYards, "Pass yds"],
            ["Penalty for", stats.penaltiesFor.n ? `${stats.penaltiesFor.n} · ${stats.penaltiesFor.yards} yds` : 0, "Pen. for"],
            ["Penalty against", stats.penaltiesAgainst.n ? `${stats.penaltiesAgainst.n} · ${stats.penaltiesAgainst.yards} yds` : 0, "Pen. against"],
            ["Total plays", stats.totalPlays, "Total plays"], ["Total yards", stats.totalYards, "Total yds"],
          ] as [string, number | string, string][]).map(([k, v, short]) => (
            <div key={k} data-stat={k}><dt><span className="full">{k}</span><span className="short" aria-hidden="true">{short}</span></dt><dd>{v}</dd></div>
          ))}
        </dl>
      )}
    </figure>
  );
}
