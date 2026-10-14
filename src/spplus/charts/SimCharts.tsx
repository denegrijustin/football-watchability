import { C, TipView, niceTicks, useTip, useWidth } from "./kit";
import { heatColor } from "./Heat";

/** Margin histogram (team A minus team B). Bars are 3 points wide; blue = A wins, orange = B wins. */
export function MarginHistogram({ counts, n, aName, bName, expected, line, ariaLabel }: { counts: Map<number, number>; n: number; aName: string; bName: string; expected: number; line: number | null; ariaLabel: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  const w = Math.max(width, 300), h = 280, m = { l: 44, r: 14, t: 26, b: 34 };
  const BW = 3;
  const bins = new Map<number, number>();
  for (const [mg, c] of counts) { if (mg === 0) continue; const k = Math.sign(mg) * Math.ceil(Math.abs(mg) / BW); bins.set(k, (bins.get(k) ?? 0) + c); }
  const keys = [...bins.keys()];
  const kmax = Math.min(24, Math.max(6, ...keys.map(Math.abs)));
  const lo = -kmax * BW, hi = kmax * BW;
  const x = (v: number) => m.l + ((v - lo) / (hi - lo)) * (w - m.l - m.r);
  const ymax = Math.max(...[...bins.values()].map((c) => c / n), 0.01);
  const yTop = Math.ceil(ymax * 100 / 1) / 100 + 0.005;
  const y = (p: number) => h - m.b - (p / yTop) * (h - m.t - m.b);
  const xt = niceTicks(lo, hi, w < 520 ? 6 : 12).filter((t) => t % 3 === 0 || true);
  const yt = niceTicks(0, yTop, 4);
  const barFor = (k: number) => { const a = k > 0 ? (k - 1) * BW : k * BW, b = k > 0 ? k * BW : (k + 1) * BW; return { a, b }; };
  const all = Array.from({ length: kmax * 2 }, (_, i) => { const k = i < kmax ? i - kmax : i - kmax + 1; return k; });
  return (
    <div className="chart" ref={ref}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={ariaLabel} onPointerLeave={hide}>
        <g className="grid">{yt.map((t) => <line key={t} x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} />)}</g>
        <g className="axis">
          {yt.map((t) => <text key={t} x={m.l - 6} y={y(t) + 4} textAnchor="end">{Math.round(t * 100)}%</text>)}
          {xt.map((t) => <text key={t} x={x(t)} y={h - m.b + 14} textAnchor="middle">{t > 0 ? `+${t}` : t}</text>)}
          <text x={(m.l + w - m.r) / 2} y={h - 4} textAnchor="middle" style={{ fill: C.ink2 }}>Final margin (points)</text>
          <text x={4} y={12} className="lbl" style={{ fontSize: 10 }}>Share of games per 3-point bin</text>
        </g>
        {all.map((k) => {
          const c = bins.get(k) ?? 0; if (!c) return null;
          const { a, b } = barFor(k);
          const p = c / n;
          const label = k > 0 ? `${aName} by ${a + 1}–${b}` : `${bName} by ${-b + 1}–${-a}`;
          const open = () => show({ x: x((a + b) / 2), y: y(p), title: label, swatch: k > 0 ? C.s[0] : C.s[1], rows: [["Share of games", `${(p * 100).toFixed(1)}%`], ["Games", String(c)]] });
          return <rect key={k} x={x(a) + 0.5} y={y(p)} width={Math.max(1, x(b) - x(a) - 1)} height={y(0) - y(p)} rx={2} fill={k > 0 ? C.s[0] : C.s[1]} fillOpacity={0.88} onPointerEnter={open} onPointerMove={open} />;
        })}
        <line x1={x(0)} x2={x(0)} y1={m.t - 6} y2={h - m.b} stroke={C.ink2} />
        <text x={x(0) + 6} y={m.t - 10} style={{ fill: C.ink2 }}>{aName} win ▶</text>
        <text x={x(0) - 6} y={m.t - 10} textAnchor="end" style={{ fill: C.ink2 }}>◀ {bName} win</text>
        <line x1={x(expected)} x2={x(expected)} y1={m.t} y2={h - m.b} stroke={C.ink} strokeDasharray="5 3" strokeWidth={1.5} />
        {line != null && <g><line x1={x(line)} x2={x(line)} y1={m.t} y2={h - m.b} stroke={C.s[3]} strokeWidth={2} /><text x={x(line)} y={h - m.b - 4} textAnchor="middle" style={{ fill: C.s[3], fontWeight: 700 }}>line</text></g>}
      </svg>
      <div className="legend"><span><i style={{ background: C.s[0] }} />{aName} wins</span><span><i style={{ background: C.s[1] }} />{bName} wins</span><span><i style={{ border: `1.5px dashed ${C.ink}`, background: "transparent" }} />Expected margin</span>{line != null && <span><i style={{ background: C.s[3] }} />Spread line</span>}</div>
      <TipView tip={tip} width={w} />
    </div>
  );
}

/** Joint score map in 4-point cells: brighter = more of the simulated games ended there. */
export function ScoreGrid({ counts, n, aName, bName, ariaLabel }: { counts: Map<string, number>; n: number; aName: string; bName: string; ariaLabel: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  const w = Math.max(width, 300);
  const BS = 4;
  const cells = new Map<string, number>();
  let maxA = 0, maxB = 0;
  for (const [k, c] of counts) {
    const [a, b] = k.split("-").map(Number);
    const ia = Math.min(Math.floor(a / BS), 17), ib = Math.min(Math.floor(b / BS), 17);
    cells.set(`${ia}-${ib}`, (cells.get(`${ia}-${ib}`) ?? 0) + c);
    maxA = Math.max(maxA, ia); maxB = Math.max(maxB, ib);
  }
  const NA = Math.max(maxA, 10) + 1, NB = Math.max(maxB, 10) + 1;
  const m = { l: 40, r: 8, t: 8, b: 40 };
  const cw = (w - m.l - m.r) / NA;
  const ch = Math.min(cw, 22);
  const h = m.t + ch * NB + m.b;
  const peak = Math.max(...cells.values());
  const lbl = (i: number) => `${i * BS}`;
  return (
    <div className="chart" ref={ref}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={ariaLabel} onPointerLeave={hide}>
        {Array.from({ length: NA }, (_, i) => (i % 2 === 0 ? <text key={i} x={m.l + cw * i + cw / 2} y={h - m.b + 14} textAnchor="middle" className="lbl" style={{ fontSize: 10 }}>{lbl(i)}</text> : null))}
        {Array.from({ length: NB }, (_, j) => (j % 2 === 0 ? <text key={j} x={m.l - 6} y={m.t + ch * (NB - 1 - j) + ch / 2 + 3} textAnchor="end" className="lbl" style={{ fontSize: 10 }}>{lbl(j)}</text> : null))}
        <text x={(m.l + w - m.r) / 2} y={h - 6} textAnchor="middle" style={{ fill: C.ink2 }}>{aName} points</text>
        <text x={10} y={m.t + (ch * NB) / 2} textAnchor="middle" transform={`rotate(-90 10 ${m.t + (ch * NB) / 2})`} style={{ fill: C.ink2 }}>{bName} points</text>
        <rect x={m.l} y={m.t} width={cw * NA} height={ch * NB} fill="none" stroke={C.axis} />
        {[...cells.entries()].map(([k, c]) => {
          const [ia, ib] = k.split("-").map(Number);
          const open = () => show({ x: m.l + cw * ia + cw / 2, y: m.t + ch * (NB - 1 - ib), title: `${aName} ${ia * BS}–${ia * BS + BS - 1}, ${bName} ${ib * BS}–${ib * BS + BS - 1}${ia >= 17 || ib >= 17 ? "+" : ""}`, rows: [["Share of games", `${((c / n) * 100).toFixed(2)}%`]] });
          return <rect key={k} x={m.l + cw * ia + 0.5} y={m.t + ch * (NB - 1 - ib) + 0.5} width={cw - 1} height={ch - 1} rx={2} fill={heatColor((c / peak) * 100)} onPointerEnter={open} onPointerMove={open} />;
        })}
        <line x1={m.l} y1={m.t + ch * NB} x2={m.l + Math.min(cw * NA, ch * NB)} y2={m.t + ch * NB - Math.min(cw * NA, ch * NB)} stroke={C.muted} strokeDasharray="3 4" />
      </svg>
      <div className="legend"><span>Fewer games</span><span style={{ width: 100, height: 10, borderRadius: 3, background: `linear-gradient(90deg, ${heatColor(0)}, ${heatColor(100)})` }} /><span>More games</span><span>Dashed: tie line (above it {bName} wins, below it {aName} wins)</span></div>
      <TipView tip={tip} width={w} />
    </div>
  );
}
