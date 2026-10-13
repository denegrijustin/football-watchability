import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { teamColor } from "./data";
import type { GameBadge } from "./gameLogo";
import { WeatherLayer } from "./WeatherFx";
import type { WeatherLike } from "./weatherFx";
import { FieldArt, type Side } from "./halftime";
import { NFL_HALFTIME_MS, actFor, clockText, firstSeen, halftimeLeft } from "./halftimeLogic";

/**
 * NFL halftime: twelve minutes, one act. The act is picked from a rotation by the game's id and plays as a looping scene on the
 * field for the whole halftime (the card and the Game Center show the same one). Still for visitors who ask for reduced motion.
 * Seen from above, like the band: a person is a head, shoulders and a shadow.
 */
const v = (o: Record<string, string | number>) => o as unknown as CSSProperties;
const SKIN = ["#f1c9a5", "#d8a47a", "#a8734e", "#7a4e30"];

/** One person, facing right (+x) at the origin. */
function Person({ c, skin = 0, blind, s = 1.8 }: { c: string; skin?: number; blind?: boolean; s?: number }) {
  return (
    <g transform={`scale(${s})`}>
      <ellipse cx="0.2" cy="0.3" rx="1.3" ry="1.5" className="band-shadow" />
      <ellipse cx="0" cy="0" rx="1" ry="1.68" fill="none" stroke="rgb(255 255 255 / 75%)" strokeWidth="0.22" />
      <ellipse cx="0" cy="0" rx="0.8" ry="1.5" fill={c} className="band-shoulders" />
      <circle cx="0.15" cy="0" r="0.85" fill={SKIN[skin % SKIN.length]} stroke="rgb(0 0 0 / 35%)" strokeWidth="0.15" />
      {blind && <rect x="-0.35" y="-0.9" width="1.1" height="1.8" fill="#161616" />}
    </g>
  );
}
const Ball = ({ r = 0.9 }: { r?: number }) => (
  <g>
    <ellipse rx={r * 1.35} ry={r} fill="#8a4a1f" stroke="#2c1608" strokeWidth="0.15" />
    <path d={`M${-r * 0.5} 0H${r * 0.5}`} stroke="#fff" strokeWidth="0.18" />
  </g>
);
/** A scene that repeats; an element's own delay (in seconds) places its moment within the 14-second loop. */
const at = (delay: number, extra: Record<string, string | number> = {}) => v({ animationDelay: `${delay}s`, ...extra });

function Shoe({ x, y, r, c }: { x: number; y: number; r: number; c: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r})`}>
      <ellipse rx="1.15" ry="0.5" fill={c} stroke="rgb(0 0 0 / 55%)" strokeWidth="0.12" />
      <ellipse cx="0.5" rx="0.45" ry="0.38" fill="rgb(0 0 0 / 30%)" />
    </g>
  );
}

const PILE = Array.from({ length: 22 }, (_, i) => ({ x: 30 + Math.cos(i * 2.4) * (1 + (i % 5) * 0.75), y: 20 + Math.sin(i * 2.4) * (1 + (i % 4) * 1.1), r: (i * 47) % 360, c: ["#e8e8e8", "#e04b3a", "#2f7de1", "#f0c030", "#222", "#6cc070", "#c070c8"][i % 7] }));

function ShoeScramble() {
  const crew = [
    { y: 9, c: "#e04b3a", a: -2, b: 3, k: 5, ex: 46 },
    { y: 16, c: "#2f7de1", a: 2, b: -3, k: 1, ex: 48 },
    { y: 24, c: "#f0c030", a: -3, b: 2, k: -2, ex: 44 },
    { y: 31, c: "#6cc070", a: 1, b: -2, k: -4, ex: 47 },
  ];
  return (
    <>
      <text x="30" y="11.5" className="ha-tag" textAnchor="middle">SHOE PILE</text>
      <g className="ha-pile">{PILE.map((s, i) => <Shoe key={i} {...s} />)}</g>
      {crew.map((p, i) => (
        <g key={i} transform={`translate(60 ${p.y})`}>
          <g className="ha-shoe-run" style={v({ "--a": `${p.a * 1.8 + (20 - p.y) * 0.5}px`, "--b": `${p.b * 2.5 + (20 - p.y) * 0.4}px`, "--c": `${p.k * 1.5 + (20 - p.y) * 0.6}px`, "--ex": `${p.ex}px`, "--y": `${(20 - p.y) * 0.1}px` })}>
            <g className="ha-sway" style={at(-i * 0.13)}>
              <g className="ha-face"><Person c={p.c} skin={i} blind /></g>
            </g>
          </g>
        </g>
      ))}
    </>
  );
}

function Inflatables() {
  const suits = [
    { y: 8, c: "#8a4a1f", k: 1.04, fall: 1, kind: "football" },
    { y: 16, c: "#4fb35a", k: 0.9, fall: 1, kind: "dino" },
    { y: 24, c: "#e68aa8", k: 1.1, fall: 0, kind: "sumo" },
    { y: 32, c: "#f0a030", k: 0.96, fall: 1, kind: "bear" },
  ];
  return (
    <>
      <path d="M100 1v38" className="ha-finish" />
      {suits.map((p, i) => (
        <g key={i} transform={`translate(20 ${p.y})`}>
          <g className="ha-infl-run" style={v({ "--k": p.k, "--fall": p.fall, animationDelay: `${i * 0.18}s` })}>
            <g className="ha-wobble" style={at(-i * 0.2)}><g transform="scale(0.8)">
              <ellipse cx="0.5" cy="0.6" rx="4.4" ry="3.6" className="band-shadow" />
              <ellipse cx="0" cy="0" rx="4" ry="3.2" fill={p.c} stroke="rgb(0 0 0 / 45%)" strokeWidth="0.25" />
              {p.kind === "football" && <path d="M-2.2 0H2.4M-1 -0.9v1.8M0.3 -0.9v1.8M1.5 -0.9v1.8" stroke="#fff" strokeWidth="0.3" />}
              {p.kind === "dino" && <path d="M-4 0l-2.6 -1.4v2.8zM-2.4 -3l0.6 1.2M-0.6 -3.2l0.6 1.2M1.2 -3l0.6 1.2" fill={p.c} stroke="#2c6e32" strokeWidth="0.3" />}
              {p.kind === "sumo" && <circle cx="-1.2" cy="0" r="0.8" fill="#222" />}
              {p.kind === "bear" && (
                <>
                  <circle cx="2.4" cy="-2.7" r="1" fill={p.c} stroke="rgb(0 0 0 / 45%)" strokeWidth="0.2" />
                  <circle cx="2.4" cy="2.7" r="1" fill={p.c} stroke="rgb(0 0 0 / 45%)" strokeWidth="0.2" />
                </>
              )}
              <circle cx="2.6" cy="0" r="1.15" fill={SKIN[i]} stroke="rgb(0 0 0 / 35%)" strokeWidth="0.15" />
              <g className="ha-wave-arms"><path d="M0.5 -3.1l2 -1.2M0.5 3.1l2 1.2" stroke="#fff" strokeWidth="0.5" strokeLinecap="round" /></g>
            </g></g>
          </g>
        </g>
      ))}
    </>
  );
}

function DizzyBat() {
  return (
    <>
      <g className="ha-posts"><path d="M1.5 14v12M1.5 20h-1.6M1.5 14h1.4M1.5 26h1.4" stroke="#f2d23c" strokeWidth="0.5" fill="none" /></g>
      <g className="ha-bat-spot"><circle cx="24" cy="20" r="1.1" className="ha-spot" /><path d="M24 20v-5" stroke="#d9a35a" strokeWidth="1" strokeLinecap="round" /></g>
      {/* ten spins around the bat, then a stagger toward the ball that misses it altogether */}
      <g className="ha-orbit"><g transform="translate(27 20)"><g transform="rotate(180)"><Person c="#e04b3a" skin={1} s={2.4} /></g></g></g>
      <g transform="translate(27 20)">
        <g className="ha-stagger">
          <g transform="rotate(180)"><Person c="#e04b3a" skin={1} s={2.4} /></g>
          <g className="ha-stars"><circle cx="0" cy="-3.3" r="0.45" /><circle cx="2.4" cy="2.4" r="0.45" /><circle cx="-2.4" cy="2.4" r="0.45" /></g>
        </g>
      </g>
      <g transform="translate(17 20)"><g className="ha-skid"><Ball /></g></g>
      <text x="14" y="36" className="ha-tag" textAnchor="middle">10 SPINS</text>
      <g className="ha-pop" style={at(10.2)}><text x="14" y="9" className="ha-word" textAnchor="middle">NO GOOD!</text></g>
    </>
  );
}

function CashKick() {
  return (
    <>
      <ellipse cx="38" cy="20" rx="1.4" ry="4.6" className="ha-target" />
      <text x="38" y="30" className="ha-tag" textAnchor="middle">TARGET</text>
      <path d="M40 0.4v39.2" className="ha-line-gold" />
      <text x="41.4" y="38" className="ha-tag">30</text>
      <g className="ha-posts"><path d="M118.6 14v12M118.6 20h1.4M118.6 14h-1.4M118.6 26h-1.4" stroke="#f2d23c" strokeWidth="0.5" fill="none" /></g>
      <text x="76" y="38" className="ha-tag" textAnchor="middle">35-YARD LINE</text>
      {/* one fan, three tries: a pass through the target, a punt past the 30, and a field goal from the 35 */}
      <g transform="translate(20 20)">
        <g className="ha-fan-walk"><g><Person c="#2f7de1" skin={2} s={2.4} /></g></g>
      </g>
      <g transform="translate(22 20)">
        <g className="ha-fly" style={at(0.8, { "--dx": "16px", "--dy": "0px" })}><g className="ha-arc"><Ball /></g></g>
      </g>
      <g transform="translate(22 20)">
        <g className="ha-fly" style={at(4.8, { "--dx": "38px", "--dy": "0px" })}><g className="ha-arc big"><Ball /></g></g>
      </g>
      <g transform="translate(77 20)">
        <g className="ha-fly" style={at(9.2, { "--dx": "42px", "--dy": "0px" })}><g className="ha-arc big"><Ball /></g></g>
      </g>
      <g className="ha-pop" style={at(2.9)}><text x="40" y="12" className="ha-word" textAnchor="middle">T-SHIRT!</text></g>
      <g className="ha-pop" style={at(6.9)}><text x="58" y="12" className="ha-word" textAnchor="middle">$250</text></g>
      <g className="ha-pop" style={at(11.3)}><text x="92" y="12" className="ha-word big" textAnchor="middle">$10,000!</text></g>
    </>
  );
}

function AirCannon() {
  return (
    <>
      <g transform="translate(52 20)">
        <rect x="-3" y="-2" width="6" height="4" rx="1" className="ha-cannon" />
        <rect x="2" y="-1" width="4" height="2" className="ha-cannon-bore" />
      </g>
      <text x="52" y="28" className="ha-tag" textAnchor="middle">AIR CANNON</text>
      <g transform="translate(55 20)">
        <g className="ha-fly" style={at(1.2, { "--dx": "53px", "--dy": "-8px" })}><g className="ha-arc big"><Ball /></g></g>
      </g>
      <g transform="translate(55 20)">
        <g className="ha-fly" style={at(6.4, { "--dx": "56px", "--dy": "8px" })}><g className="ha-arc big"><Ball /></g></g>
      </g>
      <g transform="translate(114 20)">
        <g className="ha-catcher"><Person c="#e04b3a" skin={0} s={2.4} /><circle r="2.2" className="ha-ring" /></g>
      </g>
      <g className="ha-pop" style={at(3.4)}><text x="84" y="7" className="ha-word" textAnchor="middle">MISSED!</text></g>
      <g className="ha-pop wide" style={at(8.6)}>
        <text x="82" y="7" className="ha-word big" textAnchor="middle">CAUGHT!</text>
        <text x="82" y="12" className="ha-sub" textAnchor="middle">the whole section gets a coupon</text>
      </g>
      <g className="ha-confetti" style={at(8.6)}>{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <circle key={i} cx={113 + (i % 4) * 1.2} cy={19 + ((i * 3) % 5)} r="0.5" style={v({ "--cx": `${Math.cos(i) * 8}px`, "--cy": `${Math.sin(i * 1.7) * 8}px`, fill: ["#f2d23c", "#e04b3a", "#2f7de1", "#6cc070"][i % 4] })} />)}</g>
    </>
  );
}

function Dachshund({ c }: { c: string }) {
  return (
    <g>
      <ellipse cx="0.4" cy="0.35" rx="3.1" ry="1" className="band-shadow" />
      <g className="ha-legs"><path d="M-1.6 -1.1v2.2M1.2 -1.1v2.2" stroke="#3c2312" strokeWidth="0.5" strokeLinecap="round" /></g>
      <ellipse cx="0" cy="0" rx="2.6" ry="0.95" fill={c} stroke="rgb(0 0 0 / 40%)" strokeWidth="0.15" />
      <circle cx="2.9" cy="0" r="0.95" fill={c} stroke="rgb(0 0 0 / 40%)" strokeWidth="0.15" />
      <ellipse cx="2.5" cy="-0.95" rx="0.5" ry="0.3" fill="#3c2312" />
      <ellipse cx="2.5" cy="0.95" rx="0.5" ry="0.3" fill="#3c2312" />
      <circle cx="3.8" cy="0" r="0.3" fill="#111" />
      <path d="M-2.6 0l-1.1 -0.5" stroke="#3c2312" strokeWidth="0.3" strokeLinecap="round" />
    </g>
  );
}
const EASES = ["cubic-bezier(.3,.7,.4,1)", "cubic-bezier(.5,0,.5,1)", "cubic-bezier(.2,.9,.6,1)", "cubic-bezier(.6,.1,.9,.8)", "linear", "cubic-bezier(.4,.2,.3,1)", "cubic-bezier(.25,.8,.75,1)", "cubic-bezier(.5,.2,.2,1)"];
const DOGS = ["#9c5b2e", "#c58a4a", "#5a3820", "#d3a266", "#7a4a26", "#3d2a1d", "#b3763a", "#8a6a45"];
function Wieners() {
  return (
    <>
      <path d="M108 0.4v39.2" className="ha-finish" />
      {DOGS.map((c, i) => (
        <g key={i} transform={`translate(12 ${4.2 + i * 4.5})`}>
          <g className="ha-dash" style={v({ "--ease": EASES[i], "--k": 1 - (i % 3) * 0.015, "--vy": `${i === 3 ? 4.5 : 0}px`, animationDelay: `${(i % 4) * 0.05}s` })}>
            <g transform="scale(1.3)"><Dachshund c={c} /></g>
          </g>
        </g>
      ))}
    </>
  );
}

function Tron() {
  const dancers = Array.from({ length: 16 }, (_, i) => i);
  const col = ["#31e8ff", "#ff3ad8", "#b6ff3a", "#ffe03a"];
  return (
    <>
      <rect x="0" y="0" width="120" height="40" className="ha-dark" />
      <g className="ha-led-grid"><path d="M10 20H110M60 0V40M35 0V40M85 0V40" /></g>
      <g className="ha-led-spin a" style={{ transformOrigin: "60px 20px" }}>
        {dancers.map((i) => {
          const a = (i / 16) * Math.PI * 2;
          return (
            <g key={i} transform={`translate(${60 + Math.cos(a) * 16} ${20 + Math.sin(a) * 15}) rotate(${(a * 180) / Math.PI + 90})`}>
              <g className="ha-led-man" style={{ stroke: col[i % 4], animationDelay: `${-i * 0.18}s` }}>
                <ellipse rx="0.9" ry="1.8" /><circle cx="0.2" r="0.95" /><path d="M-0.2 -1.8l-1.5 -1.5M-0.2 1.8l-1.5 1.5" />
              </g>
            </g>
          );
        })}
      </g>
      <g className="ha-led-spin b" style={{ transformOrigin: "60px 20px" }}>
        {dancers.slice(0, 8).map((i) => {
          const a = (i / 8) * Math.PI * 2;
          return (
            <g key={i} transform={`translate(${60 + Math.cos(a) * 8} ${20 + Math.sin(a) * 7.5}) rotate(${(a * 180) / Math.PI + 90})`}>
              <g className="ha-led-man" style={{ stroke: col[(i + 2) % 4], animationDelay: `${-i * 0.25}s` }}>
                <ellipse rx="0.9" ry="1.8" /><circle cx="0.2" r="0.95" />
              </g>
            </g>
          );
        })}
      </g>
    </>
  );
}

const SCENES: Record<string, () => ReactNode> = { shoe: ShoeScramble, inflatable: Inflatables, dizzy: DizzyBat, cash: CashKick, slingshot: AirCannon, wiener: Wieners, tron: Tron };

export function HalftimeAct({ espnId, home, away, badge, weather }: { espnId: string; home: Side; away: Side; badge?: GameBadge | null; weather?: WeatherLike | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seenAt] = useState(() => firstSeen(espnId, Date.now()));
  const [now, setNow] = useState(() => Date.now());
  const [visible, setVisible] = useState(true);
  const act = actFor(espnId);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    const clock = setInterval(() => !document.hidden && setNow(Date.now()), 1000);
    setNow(Date.now());
    return () => clearInterval(clock);
  }, [visible]);

  const left = halftimeLeft(seenAt, now, NFL_HALFTIME_MS);
  const hc = teamColor(home.color) ?? "#2f7de1";
  const ac = teamColor(away.color) ?? "#c1403d";
  const label = left > 0 ? `Second half in ${clockText(left)}` : "Second half starting";
  const Scene = SCENES[act.id];
  return (
    <div ref={ref} className="halftime-act" data-act={act.id} role="img" aria-label={`${label}. Halftime act: ${act.name}, ${act.blurb}.`}>
      <div className="band-count" aria-hidden="true">
        <span className="band-count-k">HALFTIME</span>
        <strong className="band-count-t">{left > 0 ? clockText(left) : "0:00"}</strong>
        <span className="band-count-l">{left > 0 ? "until the second half" : "second half starting"}</span>
        <i className="band-count-bar"><b style={{ width: `${Math.round((left / NFL_HALFTIME_MS) * 100)}%` }} /></i>
      </div>
      <svg viewBox="0 0 120 40" className="band-svg ha-svg" aria-hidden="true">
        <FieldArt id={espnId} home={home} away={away} hc={hc} ac={ac} badge={badge} />
        <g className="ha-scene">
          <Scene />
        </g>
        <WeatherLayer weather={weather} period={2} h={40} seed={Number(espnId) || 1} />
      </svg>
      <p className="drive-cap">
        <span className="drive-dot" aria-hidden="true" />
        <b>{label}</b>
        <span> · {act.name}: {act.blurb}</span>
      </p>
    </div>
  );
}
