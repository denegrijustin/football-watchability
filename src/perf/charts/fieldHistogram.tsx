import { useRef } from "react";
import { centreIn, niceTicks, TipView, useTip, useWidth } from "../../spplus/charts/kit";
import { FIELD_BANDS, BIN, NBINS, binBand, binLabel } from "../fieldCalc";
import { poss } from "../drivesCalc";

const H = 190, TOP = 22, BOT = 28, L = 30, R = 6;
const SHORT = ["Backed up", "Typical", "Midfield", "Short field", "Very short"];

/** A histogram of where drives began, drawn along the field: own goal line on the left, the opponent's on the right. Tap a bar to pick its band. */
export function FieldHistogram({ hist, bench, benchName, color, band, onBand, teamName }: {
  hist: number[]; bench: number[] | null; benchName: string | null; color: string; band: number | null; onBand: (b: number | null) => void; teamName: string;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const wrap = useRef<HTMLDivElement>(null);
  const { tip, show, hide } = useTip();
  const total = hist.reduce((a, b) => a + b, 0), bTotal = bench?.reduce((a, b) => a + b, 0) ?? 0;
  const expected = bench && bTotal ? bench.map((n) => (n / bTotal) * total) : null;
  const max = Math.max(1, ...hist, ...(expected ?? []));
  const ticks = niceTicks(0, max, 4);
  const top = Math.max(...ticks, max);
  const pw = Math.max(0, w - L - R), sw = pw / NBINS;
  const y = (v: number) => TOP + (H - TOP - BOT) * (1 - v / top);
  const base = y(0);
  return (
    <div className="fl-hist" ref={ref}>
      <div ref={wrap} className="fl-wrap" onPointerLeave={hide}>
        {w > 0 && (
          <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="group" aria-label={`Where ${poss(teamName)} drives started, in 5-yard groups. Tap a bar to select its field-position band.`}>
            {FIELD_BANDS.map((b, bi) => (
              <g key={b.label}>
                <rect x={L + bi * 4 * sw} y={TOP} width={4 * sw} height={base - TOP} className={`fl-band${band === bi ? " on" : ""}${bi % 2 ? " alt" : ""}`} />
                <text x={L + (bi * 4 + 2) * sw} y={13} textAnchor="middle" className="fl-bt">{SHORT[bi]}</text>
              </g>
            ))}
            {ticks.map((t) => (
              <g key={t}><line x1={L} x2={L + pw} y1={y(t)} y2={y(t)} className="fl-grid" /><text x={L - 5} y={y(t) + 3} textAnchor="end" className="fl-yt">{t}</text></g>
            ))}
            {Array.from({ length: NBINS }, (_, j) => {
              const i = NBINS - 1 - j, n = hist[i], bi = binBand(i);
              const x = L + j * sw;
              const label = `${binLabel(i)}: ${n} drive${n === 1 ? "" : "s"}${total ? ` (${Math.round((n / total) * 100)}%)` : ""}. ${FIELD_BANDS[bi].label} band.`;
              const on = band === bi;
              return (
                <g
                  key={j} role="button" tabIndex={0} aria-pressed={on} aria-label={label} className="fl-bin"
                  onClick={() => onBand(on ? null : bi)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onBand(on ? null : bi); } }}
                  onPointerEnter={(e) => e.pointerType === "mouse" && show({ ...centreIn(wrap.current, e.currentTarget as unknown as Element), title: binLabel(i), rows: [["Drives", String(n)], ["Share", total ? `${((n / total) * 100).toFixed(0)}%` : "—"], ...(expected && benchName ? ([[benchName, `${(expected[i]).toFixed(1)} expected`]] as [string, string][]) : [])] })}
                  onPointerLeave={hide}
                  onFocus={(e) => e.currentTarget.matches(":focus-visible") && show({ ...centreIn(wrap.current, e.currentTarget as unknown as Element), title: binLabel(i), rows: [["Drives", String(n)]] })}
                  onBlur={hide}
                >
                  <rect x={x} y={TOP} width={sw} height={base - TOP} fill="transparent" />
                  {n > 0 && <rect x={x + 1} y={y(n)} width={Math.max(1, sw - 2)} height={base - y(n)} rx={2} fill={color} opacity={band == null || on ? 1 : 0.55} />}
                  {expected && <line x1={x + 0.5} x2={x + sw - 0.5} y1={y(expected[i])} y2={y(expected[i])} className="fl-exp" />}
                </g>
              );
            })}
            <line x1={L} x2={L + pw} y1={base} y2={base} className="fl-axis" />
            {[[20, "Own 20"], [40, "Own 40"], [50, "50"], [60, "Opp 40"], [80, "Opp 20"]].map(([yd, l]) => (
              <g key={l}><line x1={L + (+yd / BIN) * sw} x2={L + (+yd / BIN) * sw} y1={base} y2={base + 4} className="fl-axis" /><text x={L + (+yd / BIN) * sw} y={base + 16} textAnchor="middle" className="fl-xt">{l}</text></g>
            ))}
            <text x={L} y={H - 2} className="fl-xt">← own goal line</text>
            <text x={L + pw} y={H - 2} textAnchor="end" className="fl-xt">opponent's goal line →</text>
          </svg>
        )}
        <TipView tip={tip} width={w} />
      </div>
      <div className="legend fl-hl">
        <span><i style={{ background: color }} />{poss(teamName)} drives</span>
        {expected && benchName && <span><i className="fl-expsw" />What {benchName} would have, scaled to the same number of drives</span>}
      </div>
    </div>
  );
}
