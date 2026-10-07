// Rank labels for the cards. Kept free of the site's JSON data so scripts and tests can import it.
export type Ranks = {
  conf: number | null;
  confSize: number | null;
  confName: string | null;
  overall: number | null;
  overallOf: number;
  /** "fpi": the conference rank is the team's place among its conference by FPI. Absent on older archived games, where it was the standings order. */
  confBasis?: "fpi";
} | null;
const ord = (n: number) => `${n}${[, "st", "nd", "rd"][(n % 100 >> 3) ^ 1 && n % 10] || "th"}`;
const SHORT_CONF: Record<string, string> = { "Mountain West": "MW", "Sun Belt": "Sun Belt", American: "AAC", "Conference USA": "C-USA" };
/** "SEC #3 · #7 overall" */
export function rankLine(r: Ranks | undefined, compact = false) {
  if (!r) return "";
  const name = r.confName ? SHORT_CONF[r.confName] ?? r.confName : "";
  const conf = r.conf && name ? `${name} #${r.conf}` : "";
  const all = r.overall ? (compact ? `#${r.overall}` : `#${r.overall} overall`) : "";
  return [conf, all].filter(Boolean).join(" · ");
}
/** Tooltip: "3rd of 16 in the SEC by ESPN FPI · 7th of 138 overall (ESPN FPI)" */
export function rankTitle(r: Ranks | undefined) {
  if (!r) return undefined;
  const bits = [];
  if (r.conf && r.confName) bits.push(`${ord(r.conf)} of ${r.confSize} in the ${r.confName}${r.confBasis === "fpi" ? " by ESPN FPI" : " standings"}`);
  if (r.overall) bits.push(`${ord(r.overall)} of ${r.overallOf} overall (ESPN FPI)`);
  return bits.join(" · ") || undefined;
}
