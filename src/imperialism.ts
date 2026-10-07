/**
 * Imperialism Map: pure helpers and data types.
 *
 * No JSON / DOM / d3 imports on purpose, so everything here can be unit-tested in plain Node.
 * Types mirror scripts/imperialism/SCHEMA.md (the binding contract with the Python engine).
 */

export type ImpLeague = "CFB" | "NFL";

export interface ImpTeam {
  id: string;
  name: string;
  abbr: string;
  color: string; // "#rrggbb"
  altColor: string;
  logo: string | null;
  logoId: string | null;
  conf: string | null;
  division: string | null;
  stadium?: string;
  lat?: number;
  lon?: number;
}

export interface ImpWeekMeta {
  n: number;
  label: string;
}

/** One game that moved land. `transferred` holds county indexes (positions in `ImperialismData.counties`). */
export interface LedgerEntry {
  week: number;
  game: string;
  date: string;
  winner: string;
  loser: string;
  score: string;
  transferred: number[];
}

export interface LayerWeek extends ImpWeekMeta {
  holdings: Record<string, number>;
  landless: string[];
}

/** An independent logic space (national, full NFL, AFC, NFC). */
export interface Layer {
  id: string;
  label: string;
  league: ImpLeague;
  teams: string[];
  home: string[];
  ledger: LedgerEntry[];
  weeks: LayerWeek[];
  current: string[];
}

export interface ConfCount {
  native: number;
  captured: number;
  held: number;
}

export interface ConferenceWeek extends ImpWeekMeta {
  byConf: Record<string, ConfCount>;
}

/** College-only view of the national run: same ledger/state, different colouring. */
export interface ConferenceLayer {
  id: string;
  label: string;
  league: "CFB";
  base: string;
  native: string[];
  weeks: ConferenceWeek[];
}

export interface ImperialismData {
  version: number;
  season: number;
  generatedAt: string;
  counties: string[];
  teams: Record<ImpLeague, ImpTeam[]>;
  weeks: Record<ImpLeague, ImpWeekMeta[]>;
  maps: {
    CFB: { national: Layer; conference: ConferenceLayer };
    NFL: { full: Layer; AFC: Layer; NFC: Layer };
  };
}

/* ------------------------------------------------------------------ replay */

/** Apply ledger entries [from, to) onto `owners` in place. */
function applyLedger(layer: Pick<Layer, "ledger">, owners: string[], from: number, to: number): void {
  for (let k = from; k < to; k++) {
    const t = layer.ledger[k];
    for (const c of t.transferred) owners[c] = t.winner;
  }
}

/** Number of ledger entries whose week is <= `week` (ledger is chronological, so weeks are non-decreasing). */
export function ledgerEnd(ledger: readonly { week: number }[], week: number): number {
  // Binary search for the first entry with week > `week`.
  let lo = 0;
  let hi = ledger.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ledger[mid].week <= week) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Owner team id of every county after all games of week <= `week` (fresh array, full replay). */
export function ownersAt(layer: Pick<Layer, "home" | "ledger">, week: number): string[] {
  const owners = layer.home.slice();
  applyLedger(layer, owners, 0, ledgerEnd(layer.ledger, week));
  return owners;
}

export interface WeekCache {
  /** Owners at the end of `week`. The returned array is shared: do NOT mutate it. */
  at(week: number): string[];
  /** Ledger entries applied for `week`. */
  end(week: number): number;
}

/**
 * Incremental replay cache. Arrays are keyed by "number of ledger entries applied", so weeks with no games
 * share an array, and a new array is built by copying the nearest cached lower state and replaying the delta.
 * Scrubbing the slider is therefore O(counties + delta) the first time and O(1) afterwards.
 */
export function buildWeekCache(layer: Pick<Layer, "home" | "ledger" | "current">): WeekCache {
  const byEnd = new Map<number, string[]>();
  byEnd.set(0, layer.home);
  const total = layer.ledger.length;
  if (layer.current && layer.current.length === layer.home.length) byEnd.set(total, layer.current);
  return {
    end: (week) => ledgerEnd(layer.ledger, week),
    at(week) {
      const k = ledgerEnd(layer.ledger, week);
      const hit = byEnd.get(k);
      if (hit) return hit;
      let base = 0;
      for (const key of byEnd.keys()) if (key <= k && key > base) base = key;
      const owners = byEnd.get(base)!.slice();
      applyLedger(layer, owners, base, k);
      byEnd.set(k, owners);
      return owners;
    },
  };
}

/* ----------------------------------------------------------- conquest path */

export interface PathStep {
  week: number;
  kind: "home" | "conquest";
  /** Owner after this step. */
  owner: string;
  winner?: string;
  loser?: string;
  score?: string;
  game?: string;
}

/**
 * Chronological ownership history of one county up to and including `week`:
 * "Week 0: <home> (home)" followed by every ledger entry that moved it.
 */
export function conquestPath(layer: Pick<Layer, "home" | "ledger">, county: number, week: number): PathStep[] {
  const steps: PathStep[] = [{ week: 0, kind: "home", owner: layer.home[county] }];
  const end = ledgerEnd(layer.ledger, week);
  for (let k = 0; k < end; k++) {
    const t = layer.ledger[k];
    if (t.transferred.includes(county)) {
      steps.push({ week: t.week, kind: "conquest", owner: t.winner, winner: t.winner, loser: t.loser, score: t.score, game: t.game });
    }
  }
  return steps;
}

/* --------------------------------------------------------------- standings */

export interface StandingRow {
  team: string;
  count: number;
  /** Share of all counties, 0..100. */
  pct: number;
}

export interface Standings {
  ranked: StandingRow[];
  /** Layer teams holding nothing. */
  landless: string[];
}

/** Teams ranked by counties held (ties broken by id for determinism); landless = layer teams with 0. */
export function standings(layer: Pick<Layer, "teams">, owners: readonly string[]): Standings {
  const counts = new Map<string, number>();
  for (const o of owners) counts.set(o, (counts.get(o) ?? 0) + 1);
  const total = owners.length || 1;
  const ranked = [...counts.entries()]
    .map(([team, count]) => ({ team, count, pct: (count / total) * 100 }))
    .sort((a, b) => b.count - a.count || (a.team < b.team ? -1 : 1));
  const landless = layer.teams.filter((t) => !counts.has(t));
  return { ranked, landless };
}

/* -------------------------------------------------------------- conference */

export type ConferenceStatus = "native" | "captured";

/** A county is native-held when its owner's conference equals its native conference, else captured. */
export function conferenceStatus(nativeConf: string, ownerConf: string | null | undefined): ConferenceStatus {
  return ownerConf === nativeConf ? "native" : "captured";
}

/** Recompute per-conference counts locally (fallback when `weeks[w].byConf` is unavailable). */
export function conferenceCounts(
  native: readonly string[],
  owners: readonly string[],
  confOf: (teamId: string) => string | null | undefined,
): Record<string, ConfCount> {
  const out: Record<string, ConfCount> = {};
  for (let i = 0; i < native.length; i++) {
    const c = (out[native[i]] ??= { native: 0, captured: 0, held: 0 });
    c.native++;
    if (conferenceStatus(native[i], confOf(owners[i])) === "captured") c.captured++;
    else c.held++;
  }
  return out;
}

/* ---------------------------------------------------------------- geometry */

/**
 * Largest contiguous mass (connected component under `adjacency`) of counties owned by `team`.
 * `adjacency[i]` lists neighbouring county indexes (same index space as `ownersByCounty`).
 * Returns the county indexes of that component ([] if the team owns nothing); ties keep the first found.
 */
export function largestMass(ownersByCounty: readonly string[], adjacency: readonly (readonly number[])[], team: string): number[] {
  const seen = new Uint8Array(ownersByCounty.length);
  let best: number[] = [];
  for (let s = 0; s < ownersByCounty.length; s++) {
    if (seen[s] || ownersByCounty[s] !== team) continue;
    const comp: number[] = [];
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const c = stack.pop()!;
      comp.push(c);
      for (const n of adjacency[c] ?? []) {
        if (!seen[n] && ownersByCounty[n] === team) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    if (comp.length > best.length) best = comp;
  }
  return best;
}
