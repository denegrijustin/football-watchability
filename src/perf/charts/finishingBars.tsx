import { useRef } from "react";
import { centreIn, TipView, useTip } from "../../spplus/charts/kit";
import { emptyBreakdown, BUCKETS, NOUN, type Bucket, type FinRow } from "../finishingCalc";
import type { Denominator } from "../engine";
import { fmt } from "../ui";

/** The marks on a segment: a color and a pattern, so the four outcomes differ without color. */
export const BUCKET_CLASS: Record<Bucket, string> = { td: "fn-td", fg: "fn-fg", turnover: "fn-to", empty: "fn-em" };

export function FinishingBars({ rows, den, selected, onSelect, color }: {
  rows: FinRow[]; den: Denominator; selected: { row: string; group: string; bucket: Bucket } | null;
  onSelect: (r: FinRow, b: Bucket) => void; color: (r: FinRow) => string | undefined;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const { tip, show, hide } = useTip();
  const tipFor = (r: FinRow, b: Bucket, el: HTMLElement) => {
    const n = r.fin[b], info = BUCKETS.find((x) => x.k === b)!;
    const rowsT: [string, string][] = [[`Of ${r.fin.n} ${NOUN[den]}`, `${n} (${fmt.pct(r.fin.n ? n / r.fin.n : null, 0)})`]];
    if (b === "empty") for (const [l, c] of emptyBreakdown(r.fin.buckets.empty)) rowsT.push([l, String(c)]);
    show({ ...centreIn(wrap.current, el), title: `${r.label}: ${info.label.toLowerCase()}`, rows: rowsT });
  };
  return (
    <div className="fn-bars" ref={wrap} onPointerLeave={hide}>
      {rows.map((r) => {
        const n = r.fin.n;
        return (
          <div className="fn-row" key={`${r.group}-${r.key}`}>
            <div className="fn-lab"><b>{color(r) && <i className="fn-dot" style={{ background: color(r) }} />}{r.label}</b><small>{n} {NOUN[den]} · {r.games} game{r.games === 1 ? "" : "s"}{r.small && n > 0 ? " · small sample" : ""}</small></div>
            {n === 0 ? <div className="fn-bar fn-none">No {NOUN[den]} in these games</div> : (
              <div className="fn-bar" role="group" aria-label={`${r.label}: how ${n} ${NOUN[den]} ended`}>
                {BUCKETS.map((b) => {
                  const c = r.fin[b.k];
                  if (!c) return null;
                  const on = selected?.row === r.key && selected.group === r.group && selected.bucket === b.k;
                  return (
                    <button
                      key={b.k} type="button" className={`fn-seg ${BUCKET_CLASS[b.k]}${on ? " on" : ""}`} style={{ flexGrow: c }}
                      aria-pressed={r.drillable ? on : undefined} aria-disabled={!r.drillable || undefined}
                      aria-label={`${r.label}: ${b.label.toLowerCase()}, ${c} of ${n} (${Math.round((c / n) * 100)}%)${r.drillable ? ". Show these drives" : ""}`}
                      onClick={() => r.drillable && onSelect(r, b.k)}
                      onPointerEnter={(e) => e.pointerType === "mouse" && tipFor(r, b.k, e.currentTarget)}
                      onPointerLeave={hide}
                      onFocus={(e) => e.currentTarget.matches(":focus-visible") && tipFor(r, b.k, e.currentTarget)} onBlur={hide}
                    >
                      <span className="fn-t">{c >= n * 0.1 ? `${b.short} ${Math.round((c / n) * 100)}%` : ""}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="fn-stats">
              <span><b>{fmt.n(r.fin.pointsPerOpportunity, 2)}</b><small>points each</small></span>
              <span><b>{fmt.pct(r.fin.tdRate, 0)}</b><small>touchdowns</small></span>
            </div>
          </div>
        );
      })}
      <TipView tip={tip} width={wrap.current?.clientWidth ?? 0} />
    </div>
  );
}

export function FinishingLegend() {
  return (
    <ul className="legend fn-legend" aria-label="Bar segments">
      {BUCKETS.map((b) => <li key={b.k} title={b.plain}><i className={`fn-sw ${BUCKET_CLASS[b.k]}`} />{b.label}</li>)}
    </ul>
  );
}
