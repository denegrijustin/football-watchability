import type { Model, PerfRow } from "./types";
import { parseRecord } from "./cells";
import { gameIndex } from "./games";

export const sumRecords = (rows: PerfRow[], k: "ats" | "ou") => {
  let w = 0, l = 0, t = 0;
  for (const r of rows) { const p = parseRecord(r[k]); if (p) { w += p.w; l += p.l; t += p.t; } }
  return { w, l, t, text: `${w}-${l}${t ? `-${t}` : ""}`, pct: w / Math.max(w + l, 1) };
};

export interface SourceCheck { id: string; label: string; detail: string }

/** Places where the sheet disagrees with itself. Shown, never corrected. */
export function sourceChecks(model: Model): SourceCheck[] {
  const out: SourceCheck[] = [];
  const idx = gameIndex(model);
  for (const t of model.teams) {
    if (t.division !== "FBS") continue;
    const tw = t.weeks[model.latest];
    const g = idx.byTeam.get(t.name) ?? [];
    const m = /^(\d+)-(\d+)/.exec(tw?.record?.text ?? "");
    if (!m || !g.length) continue;
    const w = g.filter((x) => x.win === 1).length, l = g.filter((x) => x.win === 0).length;
    if (+m[1] !== w || +m[2] !== l) out.push({ id: `rec-${t.id}`, label: `${t.name}: record ${tw!.record!.text} in “FBS Week ${model.latest}” (row ${tw!.src.row})`, detail: `the postgame sheet's game rows add up to ${w}-${l}` });
  }
  const cur = model.perf.filter((p) => p.section === "fbs-fbs" && !p.total && /^(0-1|\d+)$/.test(p.week) && p.ats);
  const last = model.perf.filter((p) => p.section === "last-year" && !p.total && p.ats);
  const pairs: [string, PerfRow | undefined, PerfRow[]][] = [["2026", model.perf.find((p) => p.section === "fbs-fbs" && p.total), cur], ["Last year", model.perf.find((p) => p.section === "last-year" && p.total), last]];
  for (const [name, total, rows] of pairs) {
    if (!total) continue;
    for (const k of ["ats", "ou"] as const) {
      const calc = sumRecords(rows, k).text;
      if (total[k] && total[k] !== calc) out.push({ id: `perf-${name}-${k}`, label: `${name} ${k === "ats" ? "ATS" : "over/under"} total in “SP+ performance” (row ${total.row}) reads ${total[k]}`, detail: `the weekly rows above it add up to ${calc}` });
    }
  }
  return out;
}
