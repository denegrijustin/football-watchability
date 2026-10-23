import { useMemo, useState } from "react";
import { useWidth } from "../spplus/charts/kit";
import { backtestSlips, explain, slipBreakEven, slipRecord, slipWeeks, type GradedPick, type SlipResult, type SlipWeek } from "../pickRecord";
import { american } from "../parlay";

const pct = (n: number | null, d = 0) => (n == null ? "–" : `${(n * 100).toFixed(d)}%`);
const money = (n: number) => `${n >= 0 ? "+" : "−"}$${Math.abs(n).toFixed(2)}`;
const rec = (w: number, l: number, v = 0) => `${w}-${l}${v ? `-${v}` : ""}`;

/** One graded pick: what it was, what happened, and why it won or missed. */
export function PickResultRow({ p, showWeek = false }: { p: GradedPick; showWeek?: boolean }) {
  const e = explain(p);
  return (
    <li className={`pr-pick ${p.result}`}>
      <span className="pr-badge" aria-label={p.result === "win" ? "Won" : p.result === "loss" ? "Missed" : "Push"}>{p.result === "win" ? "✓" : p.result === "loss" ? "✕" : "–"}</span>
      <span className="pr-body">
        <b>{p.label}</b>
        <small>{showWeek ? `Wk ${p.week} · ` : ""}{p.game} · final {p.final}</small>
        <span className="pr-why"><strong>{e.headline}.</strong> {e.why}</span>
      </span>
      <span className="pr-edge" title="How many points the ratings liked this side more than the line did">+{p.edge.toFixed(1)} edge</span>
    </li>
  );
}

function Chart({ weeks, size }: { weeks: SlipWeek[]; size: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [open, setOpen] = useState<number | null>(null);
  const be = slipBreakEven(size);
  const w = Math.max(width, 300), h = 260, m = { l: 40, r: 12, t: 22, b: 46 };
  const y = (v: number) => h - m.b - v * (h - m.t - m.b);
  const slot = (w - m.l - m.r) / Math.max(weeks.length, 1), bw = Math.min(44, slot * 0.58);
  const cx = (i: number) => m.l + slot * i + slot / 2;
  const line = weeks.map((wk, i) => (wk.cumulative.pct == null ? null : `${i ? "L" : "M"}${cx(i).toFixed(1)},${y(wk.cumulative.pct).toFixed(1)}`)).filter(Boolean).join("");
  const sel = open == null ? null : weeks[open];
  return (
    <div className="pr-chart" ref={ref}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="group" aria-label={`Share of ${size}-leg slips that hit each week, with the season to date`}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => <g key={t}><line x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} className="pr-grid" /><text x={m.l - 6} y={y(t) + 4} textAnchor="end" className="pr-ax">{Math.round(t * 100)}%</text></g>)}
        <text x={2} y={11} className="pr-ax">Share of slips that hit</text>
        <line x1={m.l} x2={w - m.r} y1={y(be)} y2={y(be)} className="pr-be" />
        <text x={w - m.r} y={y(be) - 4} textAnchor="end" className="pr-be-t">break-even {pct(be, 1)}</text>
        {weeks.map((wk, i) => {
          const p = wk.rec.pct;
          return (
            <g key={wk.week} tabIndex={0} role="img" className="pr-col" aria-label={`Week ${wk.week}: ${rec(wk.rec.w, wk.rec.l)} slips, ${p == null ? "none graded" : pct(p)}`} onPointerEnter={() => setOpen(i)} onFocus={() => setOpen(i)} onClick={() => setOpen(i)}>
              <rect x={cx(i) - slot / 2} y={m.t} width={slot} height={h - m.t - m.b + 28} fill="transparent" />
              {p != null && <rect x={cx(i) - bw / 2} y={y(p)} width={bw} height={Math.max(y(0) - y(p), p === 0 ? 3 : 0)} rx={3} className={p >= be ? "pr-bar hit" : "pr-bar miss"} />}
              {p != null && <text x={cx(i)} y={y(p) - 5} textAnchor="middle" className="pr-val">{Math.round(p * 100)}%</text>}
              <text x={cx(i)} y={h - 28} textAnchor="middle" className="pr-ax">{wk.label}</text>
              <text x={cx(i)} y={h - 14} textAnchor="middle" className="pr-ax dim">{rec(wk.rec.w, wk.rec.l)}</text>
            </g>
          );
        })}
        {line && <path d={line} className="pr-line" />}
        {weeks.map((wk, i) => wk.cumulative.pct == null ? null : <circle key={i} cx={cx(i)} cy={y(wk.cumulative.pct)} r={4} className="pr-dot" />)}
      </svg>
      <div className="pr-legend"><span><i className="hit" />Week at or above break-even</span><span><i className="miss" />Week below it</span><span><i className="dot" />Season to date</span></div>
      {sel && <p className="pr-sel" role="status"><b>Wk {sel.week}:</b> {rec(sel.rec.w, sel.rec.l, sel.rec.v)} on {sel.slips.length} slips ({pct(sel.rec.pct)}) · season {rec(sel.cumulative.w, sel.cumulative.l, sel.cumulative.v)} ({pct(sel.cumulative.pct)}) · {money(sel.rec.profit)} per $1 slip that week</p>}
    </div>
  );
}

function SlipCard({ s }: { s: SlipResult }) {
  return (
    <article className={`pr-slip ${s.result}`}>
      <header><h5>{s.title} · {s.size} legs</h5><span className={`pr-res ${s.result}`}>{s.result === "win" ? `Hit ${money(s.profit)}` : s.result === "loss" ? "Missed −$1.00" : "Void"}</span></header>
      <ul className="pr-picks">{s.legs.map((p) => <PickResultRow key={p.id} p={p} />)}</ul>
      {s.result === "loss" && <p className="pr-note">{s.legs.filter((l) => l.result === "loss").length === 1 ? `One miss sank it: ${s.legs.find((l) => l.result === "loss")!.label}.` : `${s.legs.filter((l) => l.result === "loss").length} legs missed.`} {s.legs.filter((l) => l.result === "win").length} of {s.size} covered.</p>}
    </article>
  );
}

/**
 * The parlay record, in the same shape as the ATS tracker: weekly bars, a season-to-date line and the break-even mark, then every slip with each leg's
 * result and the reason it won or missed. Slips are rebuilt from the graded picks (strongest edges first), because past slips were not saved.
 */
export function ParlayRecord({ picks, label }: { picks: GradedPick[]; label: string }) {
  const [size, setSize] = useState(2);
  const slips = useMemo(() => backtestSlips(picks, size), [picks, size]);
  const weeks = useMemo(() => slipWeeks(slips), [slips]);
  const all = slipRecord(slips);
  const be = slipBreakEven(size);
  const legTotals = picks.length ? picks.filter((p) => p.result === "win").length / Math.max(1, picks.filter((p) => p.result !== "push").length) : null;
  if (!picks.length) return <p className="ol-note">No graded picks yet, so there is no parlay record to show.</p>;
  return (
    <section className="pr" aria-label="Parlay record">
      <h3 className="lev-h">How the parlays would have done</h3>
      <p className="ol-note">{label}: each week's strongest picks grouped into slips, graded at −110 a leg. These are rebuilt from the graded picks (past slips were not saved), ranked by the size of the edge.</p>
      <div className="segmented" role="group" aria-label="Slip size">
        {[2, 3, 4].map((n) => <button key={n} aria-pressed={size === n} onClick={() => setSize(n)}>{n}-leg</button>)}
      </div>
      {slips.length ? (
        <>
          <dl className="pr-tiles">
            <div><dt>Slips</dt><dd>{rec(all.w, all.l, all.v)}</dd></div>
            <div><dt>Hit rate</dt><dd>{pct(all.pct, 1)}</dd></div>
            <div><dt>Break-even ({american(Math.round((1.909 ** size - 1) * 100))})</dt><dd>{pct(be, 1)}</dd></div>
            <div><dt>Profit per $1 slip</dt><dd className={all.roi != null && all.roi >= 0 ? "pos" : "neg"}>{all.roi == null ? "–" : money(all.roi)}</dd></div>
          </dl>
          <Chart weeks={weeks} size={size} />
          <ul className="pr-bullets">
            <li>{all.w + all.l} slips played: {all.w} hit, {all.l} missed{all.v ? `, ${all.v} void` : ""}. A {size}-leg slip needs {pct(be, 1)} to break even; these hit {pct(all.pct, 1)}.</li>
            {legTotals != null && <li>Each leg on its own covered {pct(legTotals, 1)} of the time, so a {size}-leg slip should hit about {pct(legTotals ** size, 1)} if the legs are independent.</li>}
            {weeks.length > 1 && (() => { const ws = weeks.filter((x) => x.rec.pct != null); const best = ws.reduce((a, b) => (b.rec.pct! > a.rec.pct! ? b : a)), worst = ws.reduce((a, b) => (b.rec.pct! < a.rec.pct! ? b : a)); return <li>Best week: Wk {best.week} ({rec(best.rec.w, best.rec.l)}); weakest: Wk {worst.week} ({rec(worst.rec.w, worst.rec.l)}).</li>; })()}
          </ul>
          <div className="pr-weeks">
            {[...weeks].reverse().map((wk, i) => (
              <details key={wk.week} open={i === 0}>
                <summary><b>Week {wk.week}</b><span>{rec(wk.rec.w, wk.rec.l, wk.rec.v)} · {money(wk.rec.profit)}</span></summary>
                <div className="pr-slips">{wk.slips.map((s) => <SlipCard key={s.id} s={s} />)}</div>
              </details>
            ))}
          </div>
        </>
      ) : <p className="ol-note">Not enough graded picks in a week to build a {size}-leg slip yet.</p>}
    </section>
  );
}
