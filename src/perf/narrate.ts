// Plain-language summaries written from the filtered numbers by fixed rules (no model, no guesses): a team is called a strength at the
// 70th percentile or better and a weakness at the 30th or worse, and every sentence says how many games it rests on.
import type { MetricResult } from "./engine";

const STRONG: Record<string, string> = {
  passOff: "moves the ball well through the air", rushOff: "runs the ball effectively", passDef: "defends the pass well", rushDef: "stops the run well",
  success: "keeps its offense on schedule", scoring: "turns its drives into points",
};
const WEAK: Record<string, string> = {
  passOff: "has struggled to throw effectively", rushOff: "has struggled to run the ball", passDef: "has had trouble stopping the pass", rushDef: "has had trouble stopping the run",
  success: "has a low share of successful plays", scoring: "has struggled to turn drives into points",
};
const join = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export const STRENGTH_AT = 70;
export const WEAKNESS_AT = 30;

/** One sentence about what a team does well and where it struggles, from its six profile percentiles. */
export function profileSentence(name: string, results: MetricResult[], games: number): string {
  const ok = results.filter((r) => r.pct != null);
  if (!ok.length || games === 0) return `There are no games to summarize for ${name} yet.`;
  const strong = ok.filter((r) => (r.pct as number) >= STRENGTH_AT).sort((a, b) => (b.pct as number) - (a.pct as number)).slice(0, 2);
  const weak = ok.filter((r) => (r.pct as number) <= WEAKNESS_AT).sort((a, b) => (a.pct as number) - (b.pct as number)).slice(0, 2);
  let s: string;
  if (strong.length && weak.length) s = `${name} ${join(strong.map((r) => STRONG[r.def.id]))}, but ${join(weak.map((r) => WEAK[r.def.id]))}.`;
  else if (strong.length) s = `${name} ${join(strong.map((r) => STRONG[r.def.id]))}, with no clear weakness in these six measures.`;
  else if (weak.length) s = `${name} ${join(weak.map((r) => WEAK[r.def.id]))}, with no clear strength in these six measures.`;
  else s = `${name} is close to average across these six measures.`;
  if (games <= 3) s += ` That rests on only ${games} game${games === 1 ? "" : "s"}, so treat it as an early read.`;
  return s;
}

/** How two teams' profiles differ most, from the biggest percentile gaps (3 at most), as plain sentences. */
export function gapSentences(aName: string, bName: string, a: MetricResult[], b: MetricResult[], minGap = 20): string[] {
  const rows = a.map((r, i) => ({ id: r.def.id, label: r.def.label.toLowerCase(), gap: r.pct != null && b[i].pct != null ? r.pct - (b[i].pct as number) : null, a: r.pct, b: b[i].pct }))
    .filter((r): r is typeof r & { gap: number; a: number; b: number } => r.gap != null && Math.abs(r.gap) >= minGap)
    .sort((x, y) => Math.abs(y.gap) - Math.abs(x.gap))
    .slice(0, 3);
  return rows.map((r) => `${r.gap > 0 ? aName : bName} rates better in ${r.label} (${r.a}th vs ${r.b}th percentile).`);
}
