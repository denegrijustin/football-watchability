import { useMemo, useState } from "react";
import { PickResultRow } from "./ParlayRecord";
import type { GradedPick } from "../pickRecord";

const SHOWN = 10;

/** The graded picks, a week at a time (latest first), each with what was picked and why it covered or missed. */
export function PickResults({ picks, label }: { picks: GradedPick[]; label: string }) {
  const weeks = useMemo(() => [...new Set(picks.map((p) => p.week))].sort((a, b) => b - a), [picks]);
  const [wk, setWk] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  if (!weeks.length) return null;
  const week = wk ?? weeks[0];
  const list = picks.filter((p) => p.week === week).sort((a, b) => b.edge - a.edge);
  const w = list.filter((p) => p.result === "win").length, l = list.filter((p) => p.result === "loss").length, ps = list.length - w - l;
  return (
    <details className="pr-results" open>
      <summary>How the picks did · {label}</summary>
      <div className="pr-rhead">
        <label>Week <select value={week} onChange={(e) => { setWk(Number(e.target.value)); setAll(false); }} aria-label="Week of graded picks">{weeks.map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        <b>{w}-{l}{ps ? `-${ps}` : ""} against the spread</b>
      </div>
      <ul className="pr-picks">{(all ? list : list.slice(0, SHOWN)).map((p) => <PickResultRow key={p.id} p={p} />)}</ul>
      {list.length > SHOWN && <button type="button" className="btn small ghost" onClick={() => setAll(!all)}>{all ? "Show the strongest picks only" : `Show all ${list.length} picks`}</button>}
    </details>
  );
}
