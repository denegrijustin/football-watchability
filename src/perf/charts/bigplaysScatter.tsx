import { useRef, useState, type KeyboardEvent } from "react";
import { TipView, centreIn, niceTicks, useTip, useWidth } from "../../spplus/charts/kit";
import { usePerf } from "../data";
import { modeDef, neighbor, quadrant, quadrantCounts, type BpMode, type BpPoint, type Dir } from "../bigplaysCalc";

export interface ScatterDot extends BpPoint { name: string }

const pc = (v: number, d = 0) => `${(v * 100).toFixed(d)}%`;
const tickFmt = (ts: number[]) => (ts.every((t) => Math.abs(t * 100 - Math.round(t * 100)) < 1e-6) ? 0 : 1);
/** Splits a label into two lines at the space nearest its middle when there is not room for one. */
const wrap = (s: string, narrow: boolean): string[] => {
  if (!narrow || s.length < 17) return [s];
  const mid = s.length / 2;
  const sp = [...s].map((c, i) => (c === " " ? i : -1)).filter((i) => i >= 0).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))[0];
  return sp == null ? [s] : [s.slice(0, sp), s.slice(sp + 1)];
};

export function BigPlaysScatter({ dots, line, mode, selected, compare, inspected, colorA, colorB, onInspect, onClear }: {
  dots: ScatterDot[]; line: { x: number; y: number }; mode: BpMode;
  selected: string | null; compare: string | null; inspected: string | null; colorA: string; colorB: string;
  onInspect: (id: string) => void; onClear: () => void;
}) {
  const { adapter } = usePerf();
  const [ref, width] = useWidth<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  const svgRef = useRef<SVGSVGElement>(null);
  const items = useRef(new Map<string, SVGGElement>());
  const [active, setActive] = useState<string | null>(null);
  const w = Math.max(width, 300);
  const narrow = w < 520;
  const h = Math.round(Math.max(330, Math.min(470, w * 0.9)));
  const m = { l: 46, r: 12, t: 12, b: 44 };
  const xs = [...dots.map((d) => d.x), line.x], ys = [...dots.map((d) => d.y), line.y];
  const pad = (lo: number, hi: number) => (hi - lo) * 0.08 || 0.02;
  const x0 = Math.max(0, Math.min(...xs) - pad(Math.min(...xs), Math.max(...xs))), x1 = Math.max(...xs) + pad(Math.min(...xs), Math.max(...xs));
  const y0 = Math.max(0, Math.min(...ys) - pad(Math.min(...ys), Math.max(...ys))), y1 = Math.max(...ys) + pad(Math.min(...ys), Math.max(...ys));
  const fx = (v: number) => m.l + ((v - x0) / (x1 - x0)) * (w - m.l - m.r);
  const fy = (v: number) => h - m.b - ((v - y0) / (y1 - y0)) * (h - m.t - m.b);
  const xt = niceTicks(x0 * 100, x1 * 100, narrow ? 4 : 7).map((t) => t / 100), yt = niceTicks(y0 * 100, y1 * 100, 6).map((t) => t / 100);
  const defense = mode === "def";
  const md = modeDef(mode);
  const xTitle = defense ? "Success rate allowed (steady gains for opponents)" : `Success rate (${md.noun} that stay on schedule)`;
  const yTitle = defense ? "Explosive rate allowed" : "Explosive rate (big gains)";
  const px = fx(line.x), py = fy(line.y);
  const counts = quadrantCounts(mode, dots, line);
  const act = active && dots.some((d) => d.id === active) ? active : inspected && dots.some((d) => d.id === inspected) ? inspected : selected && dots.some((d) => d.id === selected) ? selected : dots[0]?.id ?? null;
  const pos = dots.map((d) => ({ id: d.id, px: fx(d.x), py: fy(d.y) }));

  const say = (d: ScatterDot) => {
    const q = quadrant(mode, d.x >= line.x, d.y >= line.y);
    return `${d.name}: ${defense ? "opponents succeeded on" : ""} ${pc(d.x, 1)} success, ${pc(d.y, 1)} explosive, ${q.label}${d.small ? ", small sample" : ""}`;
  };
  const tipFor = (d: ScatterDot): [string, string][] => {
    const q = quadrant(mode, d.x >= line.x, d.y >= line.y);
    return [[defense ? "Success allowed" : "Success rate", pc(d.x, 1)], [defense ? "Explosive allowed" : "Explosive rate", pc(d.y, 1)], ["Plays", `${d.n} in ${d.games} game${d.games === 1 ? "" : "s"}${d.small ? " (small)" : ""}`], ["Corner", q.label]];
  };
  const open = (d: ScatterDot, el?: Element | null) => { const c = el ? centreIn(ref.current, el) : { x: fx(d.x), y: fy(d.y) }; show({ x: c.x, y: c.y, title: d.name, logo: adapter.mark(d.id, 20), rows: tipFor(d) }); };
  const focusDot = (id: string) => { setActive(id); items.current.get(id)?.focus(); };
  const onKey = (e: KeyboardEvent, d: ScatterDot) => {
    const dir: Dir | null = e.key === "ArrowRight" ? "right" : e.key === "ArrowLeft" ? "left" : e.key === "ArrowUp" ? "up" : e.key === "ArrowDown" ? "down" : null;
    if (dir) { e.preventDefault(); focusDot(neighbor(pos, d.id, dir)); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onInspect(d.id); }
    else if (e.key === "Escape") { hide(); onClear(); }
    else if (e.key === "Home") { e.preventDefault(); focusDot([...dots].sort((a, b) => a.x - b.x)[0].id); }
    else if (e.key === "End") { e.preventDefault(); focusDot([...dots].sort((a, b) => b.x - a.x)[0].id); }
  };

  // The four corners, written in the corner they sit in.
  const corners: { hiX: boolean; hiY: boolean; x: number; y: number; anchor: "start" | "end" }[] = [
    { hiX: false, hiY: true, x: m.l + 8, y: m.t + 16, anchor: "start" }, { hiX: true, hiY: true, x: w - m.r - 8, y: m.t + 16, anchor: "end" },
    { hiX: false, hiY: false, x: m.l + 8, y: h - m.b - 10, anchor: "start" }, { hiX: true, hiY: false, x: w - m.r - 8, y: h - m.b - 10, anchor: "end" },
  ];
  const ordered = [...dots].sort((a, b) => rank(a.id) - rank(b.id));
  function rank(id: string) { return id === selected ? 4 : id === compare ? 3 : id === inspected ? 2 : 0; }

  return (
    <div className="chart bp-chart" ref={ref}>
      <svg ref={svgRef} width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="group" aria-label="Success rate against explosive-play rate for every team. Use the arrow keys to move between teams and Enter to open one." onPointerLeave={hide}>
        {/* best corner tint */}
        {(() => {
          const best = defense ? { x: m.l, y: py, w: px - m.l, h: h - m.b - py } : { x: px, y: m.t, w: w - m.r - px, h: py - m.t };
          return <rect x={best.x} y={best.y} width={Math.max(0, best.w)} height={Math.max(0, best.h)} className="bp-best" />;
        })()}
        <g className="grid">{xt.map((t) => <line key={`x${t}`} x1={fx(t)} x2={fx(t)} y1={m.t} y2={h - m.b} />)}{yt.map((t) => <line key={`y${t}`} x1={m.l} x2={w - m.r} y1={fy(t)} y2={fy(t)} />)}</g>
        <g className="axis">
          {xt.map((t) => <text key={`xt${t}`} x={fx(t)} y={h - m.b + 14} textAnchor="middle">{pc(t, tickFmt(xt))}</text>)}
          {yt.map((t) => <text key={`yt${t}`} x={m.l - 6} y={fy(t) + 4} textAnchor="end">{pc(t, tickFmt(yt))}</text>)}
          <text x={(m.l + w - m.r) / 2} y={h - 6} textAnchor="middle" className="bp-ax">{xTitle} →</text>
          <text x={12} y={(m.t + h - m.b) / 2} textAnchor="middle" transform={`rotate(-90 12 ${(m.t + h - m.b) / 2})`} className="bp-ax">{yTitle} →</text>
        </g>
        {/* league crosshair */}
        <line x1={px} x2={px} y1={m.t} y2={h - m.b} className="bp-line" />
        <line x1={m.l} x2={w - m.r} y1={py} y2={py} className="bp-line" />
        <text x={px + 4} y={h - m.b - 3} className="bp-linelab">League {pc(line.x, 1)}</text>
        <text x={w - m.r - 3} y={py - 4} textAnchor="end" className="bp-linelab">League {pc(line.y, 1)}</text>
        {corners.map((c) => {
          const q = quadrant(mode, c.hiX, c.hiY);
          const lines = wrap(q.label, narrow);
          const up = !c.hiY === false; // top corners grow downward, bottom corners grow upward
          const n = counts.get(q.label) ?? 0;
          return (
            <text key={`${c.hiX}${c.hiY}`} x={c.x} y={up ? c.y : c.y - (lines.length + 1) * 13} textAnchor={c.anchor} className={`bp-q${q.best ? " best" : ""}`}>
              {lines.map((l, i) => <tspan key={i} x={c.x} dy={i === 0 ? (up ? 0 : 13) : 13}>{l}{i === lines.length - 1 && q.best ? " (best)" : ""}</tspan>)}
              <tspan x={c.x} dy={13} className="bp-qn">{n} team{n === 1 ? "" : "s"}</tspan>
            </text>
          );
        })}
        {/* Dots stay in one fixed order so keyboard focus is never lost when a team is opened; the highlighted markers are drawn on top of them. */}
        {dots.map((d) => {
          const cx = fx(d.x), cy = fy(d.y);
          const hi = d.id === selected || d.id === compare || d.id === inspected;
          return (
            <g
              key={d.id} className="pt bp-dot" transform={`translate(${cx},${cy})`} role="button" aria-pressed={d.id === inspected} aria-label={say(d)} tabIndex={d.id === act ? 0 : -1}
              ref={(el) => { if (el) items.current.set(d.id, el); else items.current.delete(d.id); }}
              onClick={() => { setActive(d.id); onInspect(d.id); }} onKeyDown={(e) => onKey(e, d)}
              onPointerEnter={(e) => { if (e.pointerType !== "touch") open(d, e.currentTarget); }} onFocus={(e) => { setActive(d.id); if (e.currentTarget.matches(":focus-visible")) open(d, e.currentTarget); }} onBlur={hide}
            >
              <circle r={11} fill="transparent" />
              {!hi && <circle r={5.5} className={`bp-other${d.small ? " small" : ""}`} />}
              <circle className="ring" r={hi ? 14 : 10} fill="none" />
            </g>
          );
        })}
        <g className="bp-marks" pointerEvents="none">
          {ordered.filter((d) => rank(d.id) > 0).map((d) => {
            const cx = fx(d.x), cy = fy(d.y);
            const isSel = d.id === selected, isCmp = d.id === compare, isIns = d.id === inspected;
            const big = isSel || isCmp;
            return (
              <g key={`m${d.id}`} transform={`translate(${cx},${cy})`}>
                {isSel ? <circle r={8} fill={colorA} stroke="var(--surface)" strokeWidth={2} /> : isCmp ? <rect x={-7.5} y={-7.5} width={15} height={15} transform="rotate(45)" fill={colorB} stroke="var(--surface)" strokeWidth={2} /> : <circle r={5.5} className={`bp-other${d.small ? " small" : ""}`} />}
                {isIns && <circle r={big ? 13 : 10} fill="none" stroke="var(--ink)" strokeWidth={2} />}
                {d.small && big && <circle r={10.5} fill="none" stroke="var(--surface)" strokeWidth={1.5} strokeDasharray="2 2" />}
              </g>
            );
          })}
        </g>
        {ordered.filter((d) => rank(d.id) > 0).map((d) => {
          const cx = fx(d.x), cy = fy(d.y);
          const right = cx < w * 0.7;
          const mark = d.id === selected ? "●" : d.id === compare ? "◆" : "";
          return <text key={`l${d.id}`} x={cx + (right ? 14 : -14)} y={cy + 4} textAnchor={right ? "start" : "end"} className="bp-name" pointerEvents="none">{mark} {d.name}</text>;
        })}
      </svg>
      <TipView tip={tip} width={w} />
    </div>
  );
}
