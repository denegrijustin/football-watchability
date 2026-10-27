import { useEffect, useMemo, useState } from "react";
import { logos } from "../data";
import { fetchData } from "../data/load";
import { ChipImg } from "../logoTone";
import { fraudRows, type FraudIn } from "../fraud";
import { TeamOpen } from "../openTeam";
import { Skeleton } from "./Skeleton";
import "../fraud.css";

type Outlook = { nfl?: { built?: string; conferences: Record<string, { grid: (FraudIn & { expW?: number })[] | null }> } };
const SCALE = 2.5; // a gap of this many wins fills the half-bar

/** Who is better, and who is worse, than their record says: every NFL team, from most hidden wins to most faked ones. */
export function FraudMeter() {
  const [data, setData] = useState<Outlook | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { let on = true; fetchData<Outlook>("outlook").then((d) => on && setData(d), () => on && setError(true)); return () => { on = false; }; }, []);
  const rows = useMemo(() => {
    const grid = Object.values(data?.nfl?.conferences ?? {}).flatMap((c) => c.grid ?? []).filter((t) => t.expW != null) as FraudIn[];
    return fraudRows(grid);
  }, [data]);
  if (error) return <p role="alert" className="rs-none">The fraud meter could not load. Reload the page to try again.</p>;
  if (!data) return <Skeleton rows={6} />;
  if (!rows.length) return <p className="rs-none">The fraud meter needs the season simulation, which is built each Tuesday.</p>;
  return (
    <section className="fm" aria-label="Fraud meter">
      <div className="fm-head"><h3>The fraud meter</h3><p>How many wins each record is hiding (green, up) or faking (red, down) over the rest of the season, against a typical team with the same record.</p></div>
      <ol className="fm-list">
        {rows.map((r) => {
          const pct = Math.min(1, Math.abs(r.gap) / SCALE) * 50;
          const good = r.gap >= 0;
          const src = r.logoId ? logos[r.logoId] : undefined;
          return (
            <li key={r.id} className={`fm-row ${good ? "up" : "down"}`} data-gap={r.gap}>
              <TeamOpen className="img fm-logo" team={{ league: "NFL", name: r.name, abbr: r.abbr }}>{src ? <ChipImg src={src} size={20} /> : <span className="rs-nologo" aria-hidden="true">{r.abbr}</span>}</TeamOpen>
              <span className="fm-name"><b>{r.abbr}</b><small>{r.record} → {r.finish}</small></span>
              <span className="fm-bar" role="img" aria-label={`${r.name}: ${good ? "+" : ""}${r.gap.toFixed(1)} wins against a typical team with a ${r.record} record`}>
                <i style={good ? { left: "50%", width: `${pct}%` } : { right: "50%", width: `${pct}%` }} />
              </span>
              <span className="fm-val">{good ? "+" : "−"}{Math.abs(r.gap).toFixed(1)}</span>
            </li>
          );
        })}
      </ol>
      <p className="fm-foot"><span className="fm-good">↑ Better than their record</span><span className="fm-bad">Potential frauds ↓</span></p>
      <details className="rs-note">
        <summary>How this is worked out</summary>
        <p>A typical team with a given record is expected to win (wins + 6) ÷ (games + 12) of its remaining games, so its record counts a little and the rest is a coin flip. Each team's own number is its final win total from the 50,000-season playoff simulation, which uses the NFL+ ratings and the real schedule left. The bar is the difference. “5-0 → 12-5” is the record now and the projected finish. Rebuilt every Tuesday.</p>
      </details>
    </section>
  );
}
