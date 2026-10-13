import type { DivKey, Model, Team, TeamWeek } from "./types";

export type Metric = "sp" | "off" | "def" | "st";
export const METRICS: { key: Metric; label: string; long: string; lowerBetter: boolean }[] = [
  { key: "sp", label: "SP+", long: "Overall SP+ rating", lowerBetter: false },
  { key: "off", label: "Off", long: "Offensive SP+", lowerBetter: false },
  { key: "def", label: "Def", long: "Defensive SP+ (lower is better)", lowerBetter: true },
  { key: "st", label: "ST", long: "Special teams SP+", lowerBetter: false },
];
export const metricMeta = (m: Metric) => METRICS.find((x) => x.key === m)!;
export const rkKey = (m: Metric) => `${m}Rk` as "spRk" | "offRk" | "defRk" | "stRk";

export interface Row { team: Team; tw: TeamWeek }

/** Teams of one division in one week. */
export function rowsFor(model: Model, div: DivKey, week: number): Row[] {
  const out: Row[] = [];
  for (const team of model.teams) {
    if (team.division !== div) continue;
    const tw = team.weeks[week];
    if (tw) out.push({ team, tw });
  }
  return out;
}

export const resolveWeek = (model: Model, week: number | null) => (week != null && model.weeks.includes(week) ? week : model.latest);

export interface ConfRanks { sp: number | null; off: number | null; def: number | null; st: number | null; size: number }

/** Derived: each team's rank inside its conference for every rating (national ranks come from the sheet). */
export function conferenceRanks(rows: Row[]): Map<string, ConfRanks> {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const c = r.tw.conf ?? "";
    groups.set(c, [...(groups.get(c) ?? []), r]);
  }
  const out = new Map<string, ConfRanks>();
  for (const list of groups.values()) {
    const rank = (m: Metric) => {
      const lower = metricMeta(m).lowerBetter;
      const vals = list.filter((r) => r.tw[m] != null);
      const res = new Map<string, number>();
      for (const r of vals) {
        const v = r.tw[m]!;
        res.set(r.team.id, 1 + vals.filter((o) => (lower ? o.tw[m]! < v : o.tw[m]! > v)).length);
      }
      return res;
    };
    const [sp, off, def, st] = (["sp", "off", "def", "st"] as Metric[]).map(rank);
    for (const r of list) out.set(r.team.id, { sp: sp.get(r.team.id) ?? null, off: off.get(r.team.id) ?? null, def: def.get(r.team.id) ?? null, st: st.get(r.team.id) ?? null, size: list.length });
  }
  return out;
}

/** Derived: share of the division the team rates above, from its source rank (100 = best). */
export const percentile = (rk: number | null, n: number): number | null => (rk == null || n < 2 ? null : Math.round(((n - rk) / (n - 1)) * 1000) / 10);

export function linreg(pts: { x: number; y: number }[]) {
  const n = pts.length;
  if (n < 3) return null;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n, my = pts.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const p of pts) { sxx += (p.x - mx) ** 2; sxy += (p.x - mx) * (p.y - my); syy += (p.y - my) ** 2; }
  if (sxx === 0) return null;
  const slope = sxy / sxx, icpt = my - slope * mx;
  const r2 = syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  return { slope, icpt, r2 };
}

export const fmt = (v: number | null | undefined, d = 1): string => (v == null ? "—" : v.toFixed(d));
export const fmtSigned = (v: number | null | undefined, d = 1): string => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}`);
export const fmtPct = (v: number | null | undefined, d = 0): string => (v == null ? "—" : `${(v * 100).toFixed(d)}%`);
export const ord = (n: number | null | undefined): string => {
  if (n == null) return "—";
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
export const dateLabel = (iso: string | null): string => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
};
export const timeLabel = (hhmm: string | null): string => {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"} ET`;
};

/** The conference of a team in a given week, falling back to its latest. */
export const confOf = (t: Team, week: number): string | null => t.weeks[week]?.conf ?? t.weeks[t.latest]?.conf ?? null;

export function findTeam(model: Model, name: string, prefer: DivKey = "FBS"): Team | undefined {
  const c = model.byName.get(name);
  return c?.find((t) => t.division === prefer) ?? c?.[0];
}
