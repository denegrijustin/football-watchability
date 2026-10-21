import { useRef, useState, type KeyboardEvent } from "react";
import { DIST_BUCKETS } from "../../../scripts/perf/lib.mjs";
import { TipView, centreIn, inkOn, useTip } from "../../spplus/charts/kit";
import { useLight } from "../ui";
import { downName, oriented, pts, type Cell, type SituationModel } from "../situationsCalc";
import type { PerfSide } from "../types";

export type ColorBy = "rate" | "diff";

// ---------------------------------------------------------------------------------------------------------------------
// Color. Numbers and glyphs carry every meaning; color only repeats them.
//  - "rate": a one-hue ramp of the success rate (blue for an offense, purple for the opponents' success against a defense).
//  - "diff": green when better than the benchmark, orange when worse, neutral when about even (oriented so a defense with fewer
//    opponent successes is green).
// ---------------------------------------------------------------------------------------------------------------------
type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, t: number): string => `rgb(${a.map((c, i) => Math.round(c + (b[i] - c) * Math.max(0, Math.min(1, t)))).join(",")})`;
const RAMP: Record<PerfSide, RGB> = { off: [57, 135, 229], def: [144, 133, 233] };
const GOOD: RGB = [25, 158, 112], BAD: RGB = [217, 89, 38];

export function cellColor(cell: Cell, colorBy: ColorBy, side: PerfSide, light: boolean): string | null {
  const neutral: RGB = light ? [236, 236, 230] : [44, 44, 42];
  if (colorBy === "rate") {
    if (cell.rate == null) return null;
    const lo: RGB = light ? [232, 240, 251] : [34, 42, 58];
    return mix(lo, RAMP[side], (cell.rate - 0.25) / 0.5);
  }
  if (cell.diff == null) return null;
  const o = oriented(cell.diff, side);
  return mix(neutral, o >= 0 ? GOOD : BAD, Math.abs(o) / 0.2);
}

export const glyphOf = (c: Cell) => (c.verdict === "better" ? "▲" : c.verdict === "worse" ? "▼" : c.verdict === "even" ? "≈" : "");
export const pctText = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

/** The spoken version of a cell, also used as its accessible name. */
export function cellSpeech(c: Cell, side: PerfSide, benchLabel: string | null): string {
  const base = c.n === 0 ? `${c.label}: no plays` : `${c.label}: ${side === "off" ? "" : "opponents "}${pctText(c.rate)} successful on ${c.n} plays${c.small ? ", small sample" : ""}`;
  if (c.n === 0 || c.diff == null || !benchLabel) return base;
  const w = Math.round(Math.abs(c.diff) * 100);
  const what = c.verdict === "unsure" ? "too few plays to compare" : c.verdict === "even" ? `about even with ${benchLabel}` : `${w} points ${c.diff > 0 ? "above" : "below"} ${benchLabel}, ${c.verdict === "better" ? "better" : "worse"} for the ${side === "off" ? "offense" : "defense"}`;
  return `${base}; ${what}`;
}

export function CellFace({ c, hasBench }: { c: Cell; hasBench: boolean }) {
  if (c.n === 0) return <><b className="sc-rate">—</b><span className="sc-n">no plays</span></>;
  return (
    <>
      <b className="sc-rate">{pctText(c.rate)}</b>
      <span className="sc-n">n={c.n}</span>
      {c.small ? <span className="sc-flag">n&lt;20</span> : hasBench && c.diff != null ? <span className={`sc-diff ${c.verdict}`}>{glyphOf(c)} {pts(c.diff)}</span> : <span className="sc-diff" />}
    </>
  );
}

export function cellTip(c: Cell, side: PerfSide, benchLabel: string | null): [string, string][] {
  const rows: [string, string][] = [
    ["Plays", String(c.n)],
    ["Successful", c.n ? `${c.succ} (${pctText(c.rate)})` : "—"],
  ];
  if (benchLabel) {
    rows.push([`vs ${benchLabel}`, c.benchRate == null ? "—" : pctText(c.benchRate)]);
    rows.push(["Difference", c.diff == null ? "—" : `${pts(c.diff, 1)} pts${c.verdict === "better" ? ", better" : c.verdict === "worse" ? ", worse" : c.verdict === "even" ? ", about even" : ""}`]);
  }
  if (c.small) rows.push(["Sample", "Small (n<20)"]);
  if (side === "def") rows.push(["Reading", "Lower is better"]);
  return rows;
}

// ---------------------------------------------------------------------------------------------------------------------
// The grid
// ---------------------------------------------------------------------------------------------------------------------
export function SituationsGrid({ model, colorBy, selected, onSelect, emphasize, ariaLabel }: {
  model: SituationModel; colorBy: ColorBy; selected: string | null; onSelect: (key: string | null) => void; emphasize: number[] | null; ariaLabel: string;
}) {
  const light = useLight();
  const wrap = useRef<HTMLDivElement>(null);
  const cells = useRef<(HTMLDivElement | null)[]>([]);
  const { tip, show, hide } = useTip();
  const firstFilled = Math.max(0, model.grid.flat().findIndex((c) => c.n > 0));
  const [active, setActive] = useState(firstFilled);
  const [w, setW] = useState(0);
  const flat = model.grid.flat();
  const COLS = DIST_BUCKETS.length;

  const move = (i: number) => { setActive(i); cells.current[i]?.focus(); };
  const key = (e: KeyboardEvent, i: number, c: Cell) => {
    const r = Math.floor(i / COLS), col = i % COLS;
    const go = (nr: number, nc: number) => { e.preventDefault(); move(Math.max(0, Math.min(model.grid.length - 1, nr)) * COLS + Math.max(0, Math.min(COLS - 1, nc))); };
    if (e.key === "ArrowRight") go(r, col + 1);
    else if (e.key === "ArrowLeft") go(r, col - 1);
    else if (e.key === "ArrowDown") go(r + 1, col);
    else if (e.key === "ArrowUp") go(r - 1, col);
    else if (e.key === "Home") go(e.ctrlKey ? 0 : r, 0);
    else if (e.key === "End") go(e.ctrlKey ? model.grid.length - 1 : r, COLS - 1);
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(selected === c.key ? null : c.key); }
    else if (e.key === "Escape") { hide(); if (selected) onSelect(null); }
  };
  const open = (el: HTMLElement, c: Cell) => { const p = centreIn(wrap.current, el); setW(wrap.current?.getBoundingClientRect().width ?? 320); show({ x: p.x, y: p.y - el.getBoundingClientRect().height / 2 + 6, title: c.label, rows: cellTip(c, model.side, model.benchLabel) }); };

  return (
    <div className="sg-wrap" ref={wrap} onPointerLeave={hide}>
      <div className="sg" role="grid" aria-label={ariaLabel} aria-rowcount={model.grid.length + 1} aria-colcount={COLS + 1}>
        <div className="sg-row sg-head" role="row">
          <span role="columnheader" className="sg-corner">Down<small>Yards to go →</small></span>
          {DIST_BUCKETS.map((b) => <span role="columnheader" key={b.label}>{b.label}</span>)}
        </div>
        {model.grid.map((row, r) => {
          const n = row.reduce((s, c) => s + c.n, 0);
          const dim = emphasize != null && !emphasize.includes(r + 1);
          return (
            <div className={`sg-row${dim ? " dim" : ""}`} role="row" key={r}>
              <span role="rowheader" className="sg-rh"><b>{downName(r + 1)}</b><small>{n} plays</small></span>
              {row.map((c, ci) => {
                const i = r * COLS + ci;
                const bg = cellColor(c, colorBy, model.side, light);
                return (
                  <div
                    key={c.key} role="gridcell" ref={(el) => { cells.current[i] = el; }}
                    className={`sc${c.small ? " small" : ""}${c.n === 0 ? " none" : ""}${selected === c.key ? " on" : ""}`}
                    style={{ backgroundColor: bg ?? undefined, color: bg ? inkOn(bg) : undefined }}
                    tabIndex={i === active ? 0 : -1} aria-selected={selected === c.key} aria-label={cellSpeech(c, model.side, model.benchLabel)}
                    onClick={() => { setActive(i); onSelect(selected === c.key ? null : c.key); }}
                    onKeyDown={(e) => key(e, i, flat[i])}
                    onPointerEnter={(e) => { if (e.pointerType !== "touch") open(e.currentTarget, c); }}
                    onFocus={(e) => { setActive(i); if (e.currentTarget.matches(":focus-visible")) open(e.currentTarget, c); }}
                    onBlur={hide}
                  >
                    <CellFace c={c} hasBench={model.hasBench} />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <TipView tip={tip} width={w || 320} />
    </div>
  );
}

export function GridLegend({ colorBy, side, benchLabel }: { colorBy: ColorBy; side: PerfSide; benchLabel: string | null }) {
  const lo = "rgb(232,240,251)";
  const hi = `rgb(${RAMP[side].join(",")})`;
  return (
    <div className="legend sg-legend" aria-label="How to read the colors">
      {colorBy === "rate" ? (
        <>
          <span>{side === "off" ? "Share of plays that were successful" : "Share of opponent plays that were successful"}:</span>
          <span className="sg-ramp" style={{ background: `linear-gradient(90deg, ${lo}, ${hi})` }} aria-hidden="true" />
          <span>{side === "off" ? "lower to higher (higher is better)" : "lower to higher (lower is better for the defense)"}</span>
        </>
      ) : (
        <>
          <span><i style={{ background: `rgb(${GOOD.join(",")})` }} />Better than {benchLabel ?? "the benchmark"}</span>
          <span><i style={{ background: `rgb(${BAD.join(",")})` }} />Worse</span>
          <span><i style={{ background: "var(--raise)", border: "1px solid var(--border-2)" }} />About even</span>
        </>
      )}
      <span><i className="sg-hatch" />Fewer than 20 plays (n&lt;20)</span>
    </div>
  );
}
