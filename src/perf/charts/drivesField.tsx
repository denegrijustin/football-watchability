import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { centreIn, TipView, useTip, useWidth } from "../../spplus/charts/kit";
import { DRIVE } from "../../../scripts/perf/lib.mjs";
import { clockAtStart, mmss, quarterLabel, quarterWords, resultShort, resultText, spot, type GameDrive } from "../drivesCalc";
import { ResultGlyph } from "./drivesGlyph";

const H = 34;
const EZ = 10;
const FIELD = 120;

export interface LaneNames { team: string; opp: string; teamAbbr: string; oppAbbr: string }

/** The drive's one-line description, for screen readers and tips. */
export function driveSummary(d: GameDrive, n: LaneNames): string {
  const t = d.tuple;
  const own = d.side === "team" ? n.team : n.opp, other = d.side === "team" ? n.opp : n.team;
  const clock = clockAtStart(t);
  return `Drive ${d.no}, ${own}, ${quarterWords(d.period)}${clock ? ` at ${clock}` : ""}, started at ${spot(t[DRIVE.START_YL], own, other)}, ${t[DRIVE.PLAYS]} plays, ${t[DRIVE.YARDS]} yards, ${resultText(t).toLowerCase()}`;
}

function LaneSvg({ d, w, colors, abbrs }: { d: GameDrive; w: number; colors: { team: string; opp: string }; abbrs: { team: string; opp: string } }) {
  const u = w / FIELD;
  const X = (yd: number) => (EZ + yd) * u;
  const color = d.side === "team" ? colors.team : colors.opp;
  const x0 = X(d.x0), x1 = X(d.x1);
  const dir = d.side === "team" ? 1 : -1;
  const len = Math.abs(x1 - x0);
  const gx = len < 4 ? x1 + dir * 11 : x1;
  const lines = [];
  for (let k = 0; k <= 10; k++) lines.push(<line key={k} x1={X(k * 10)} x2={X(k * 10)} y1={0} y2={H} className={k === 5 ? "dv-mid" : k === 0 || k === 10 ? "dv-goal" : "dv-yd"} />);
  return (
    <svg className="dv-svg" width={w} height={H} viewBox={`0 0 ${w} ${H}`} aria-hidden="true" focusable="false">
      <rect width={w} height={H} className="dv-turf" />
      <rect x={0} width={EZ * u} height={H} fill={colors.team} className="dv-ez" />
      <rect x={(EZ + 100) * u} width={EZ * u} height={H} fill={colors.opp} className="dv-ez" />
      {lines}
      {len >= 1 && <rect x={Math.min(x0, x1)} y={H / 2 - 4} width={len} height={8} rx={4} fill={color} className="dv-bar" />}
      <circle cx={x0} cy={H / 2} r={4.5} fill="var(--rs-fill)" stroke={color} strokeWidth={2.4} />
      <circle cx={gx} cy={H / 2} r={9} className="dv-halo" />
      <ResultGlyph kind={d.kind} size={14} x={gx - 7} y={H / 2 - 7} />
      <title>{`${d.side === "team" ? abbrs.team : abbrs.opp} drive ${d.no}`}</title>
    </svg>
  );
}

/** The axis above the lanes: end zones named, yard numbers every ten. */
function Axis({ w, abbrs, colors }: { w: number; abbrs: { team: string; opp: string }; colors: { team: string; opp: string } }) {
  const u = w / FIELD;
  const X = (yd: number) => (EZ + yd) * u;
  return (
    <svg className="dv-axissvg" width={w} height={20} viewBox={`0 0 ${w} 20`} aria-hidden="true" focusable="false">
      <rect x={0} y={2} width={EZ * u} height={16} rx={3} fill={colors.team} opacity={0.85} />
      <rect x={(EZ + 100) * u} y={2} width={EZ * u} height={16} rx={3} fill={colors.opp} opacity={0.85} />
      <text x={EZ * u / 2} y={13.5} textAnchor="middle" className="dv-ezt">{abbrs.team.slice(0, 4)}</text>
      <text x={(EZ + 100 + EZ / 2) * u} y={13.5} textAnchor="middle" className="dv-ezt">{abbrs.opp.slice(0, 4)}</text>
      {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((yd) => <text key={yd} x={X(yd)} y={13.5} textAnchor="middle" className="dv-yn">{yd <= 50 ? yd : 100 - yd}</text>)}
    </svg>
  );
}

export function DriveLanes({ drives, names, colors, selected, onSelect, detail, idPrefix }: {
  drives: GameDrive[]; names: LaneNames; colors: { team: string; opp: string }; selected: string | null;
  onSelect: (key: string | null) => void; detail: (d: GameDrive) => ReactNode; idPrefix: string;
}) {
  const [colRef, w] = useWidth<HTMLDivElement>();
  const wrap = useRef<HTMLDivElement>(null);
  const { tip, show, hide } = useTip();
  const abbrs = { team: names.teamAbbr, opp: names.oppAbbr };

  const showTip = (d: GameDrive, e: PointerEvent<HTMLElement> | null, el: HTMLElement) => {
    const t = d.tuple;
    const own = d.side === "team" ? names.team : names.opp, other = d.side === "team" ? names.opp : names.team;
    const clock = clockAtStart(t);
    const pos = e && wrap.current ? { x: e.clientX - wrap.current.getBoundingClientRect().left, y: e.clientY - wrap.current.getBoundingClientRect().top } : centreIn(wrap.current, el);
    show({
      ...pos, title: `${quarterLabel(d.period)}${clock ? ` ${clock}` : ""} · ${own}`, swatch: d.side === "team" ? colors.team : colors.opp,
      rows: [["Started", spot(t[DRIVE.START_YL], own, other)], ["Plays · yards", `${t[DRIVE.PLAYS]} · ${t[DRIVE.YARDS]}`], ["Time", mmss(t[DRIVE.SECS])], ["Ended", resultText(t)]],
    });
  };
  const keys = (e: KeyboardEvent<HTMLElement>) => {
    const btns = [...(wrap.current?.querySelectorAll<HTMLButtonElement>(".dv-lane > button") ?? [])];
    const i = btns.indexOf(e.target as HTMLButtonElement);
    if (e.key === "ArrowDown" && i >= 0) { e.preventDefault(); btns[Math.min(btns.length - 1, i + 1)]?.focus(); }
    else if (e.key === "ArrowUp" && i >= 0) { e.preventDefault(); btns[Math.max(0, i - 1)]?.focus(); }
    else if (e.key === "Escape" && selected) {
      const lane = (e.target as HTMLElement).closest(".dv-lane");
      onSelect(null);
      lane?.querySelector<HTMLButtonElement>(":scope > button")?.focus();
    }
  };

  let lastQ = -1;
  return (
    <div className="dv-field" ref={wrap} onPointerLeave={hide}>
      <div className="dv-row dv-axis" aria-hidden="true">
        <span />
        <div ref={colRef} className="dv-col">{w > 0 && <Axis w={w} abbrs={abbrs} colors={colors} />}</div>
        <span />
      </div>
      <ol className="dv-lanes" onKeyDown={keys}>
        {w > 0 && drives.map((d) => {
          const q = Math.min(5, d.period);
          const head = q !== lastQ ? (lastQ = q, <li key={`q${q}`} className="dv-qhead" aria-hidden="true"><span>{q >= 5 ? "Overtime" : `${["1st", "2nd", "3rd", "4th"][q - 1]} quarter`}</span></li>) : null;
          const open = selected === d.key;
          return [
            head,
            <li key={d.key} className={`dv-lane${open ? " sel" : ""}`}>
              <button
                type="button" className="dv-row dv-btn" aria-expanded={open} aria-controls={open ? `${idPrefix}-${d.key.replace(":", "-")}` : undefined}
                aria-label={driveSummary(d, names)}
                onClick={() => onSelect(open ? null : d.key)}
                onPointerEnter={(e) => e.pointerType === "mouse" && showTip(d, e, e.currentTarget)}
                onPointerMove={(e) => e.pointerType === "mouse" && showTip(d, e, e.currentTarget)}
                onPointerLeave={hide}
                onFocus={(e) => e.currentTarget.matches(":focus-visible") && showTip(d, null, e.currentTarget)}
                onBlur={hide}
              >
                <span className="dv-no"><b>{d.no}</b><small>{quarterLabel(d.period)}</small></span>
                <span className="dv-col"><LaneSvg d={d} w={w} colors={colors} abbrs={abbrs} /></span>
                <span className={`dv-res rs-${d.kind}`}><ResultGlyph kind={d.kind} size={12} /><span>{resultShort(d.tuple)}</span></span>
              </button>
              {open && detail(d)}
            </li>,
          ];
        })}
      </ol>
      <TipView tip={tip} width={wrap.current?.clientWidth ?? 0} />
    </div>
  );
}
