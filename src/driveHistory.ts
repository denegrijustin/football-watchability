// The plays of the drive in progress, as boxes along the field: blue for a pass, red for a run, yellow for a penalty. A punt, a kick, a score, a
// turnover or a change of possession ends the drive, and the next play starts a clean one. Pure, so tests can import it.
import { playKind } from "./driveKinds";

export type HistInput = { id?: string; team: string; text: string; kind: string; yards: number; toGo?: number | null; score?: boolean; turnover?: boolean };
export type HistBox = { type: "pass" | "run" | "penalty"; /** yards from the left goal line */ from: number; to: number; yards: number; /** The play earned a first down. */ firstDown: boolean };

const isPenalty = (p: HistInput) => /penalty/i.test(p.kind) || /^\s*penalty\b/i.test(p.text);
/** A play after which the next snap belongs to a new drive. */
export const endsDrive = (p: HistInput) =>
  !!p.score || !!p.turnover || /punt|field goal|kickoff|extra point|interception|safety/i.test(p.kind) || /intercept|turnover on downs|\bpunts\b|safety\b/i.test(p.text);
const skippable = (p: HistInput) => /timeout|end of|two-minute|coin|official|^\s*$/i.test(p.kind) && !isPenalty(p);

function box(p: HistInput, dir: 1 | -1): HistBox | null {
  const type = isPenalty(p) ? "penalty" : /\bsack/i.test(`${p.kind} ${p.text}`) ? "pass" : playKind(p.kind, p.text) === "pass" ? "pass" : playKind(p.kind, p.text) === "run" ? "run" : null;
  if (!type || p.toGo == null || !Number.isFinite(p.toGo)) return null;
  const from = dir > 0 ? 100 - p.toGo : p.toGo;
  const yards = p.yards || 0;
  const to = Math.max(0, Math.min(100, from + dir * yards));
  return { type, from, to, yards, firstDown: type !== "penalty" && /\b(?:1st|first) down\b/i.test(p.text) };
}

/** The plays of the drive that `shown` belongs to (the shown play included), oldest first, as indices into `plays`. */
function driveIndices(plays: HistInput[], shown: number): number[] {
  const cur = plays[shown];
  if (!cur) return [];
  const idx: number[] = [shown];
  for (let j = shown - 1; j >= 0 && idx.length < 40; j--) {
    const p = plays[j];
    if (skippable(p)) continue;
    if (isPenalty(p)) { idx.unshift(j); continue; }
    if (endsDrive(p) || p.team !== cur.team) break;
    idx.unshift(j);
  }
  // Flags thrown after the shown play (it is not necessarily the newest entry).
  for (let k = shown + 1; k < plays.length; k++) {
    if (skippable(plays[k])) continue;
    if (!isPenalty(plays[k])) break;
    idx.push(k);
  }
  return idx;
}

/**
 * The drive's earlier plays, oldest first, leaving out the play at `shown` (that one is on the field as the animation). Empty when the shown play
 * ended the drive.
 */
export function driveHistory(plays: HistInput[], shown: number, awayId: string | undefined): HistBox[] {
  const cur = plays[shown];
  if (!cur || endsDrive(cur)) return [];
  const dir: 1 | -1 = cur.team === awayId ? 1 : -1;
  const out: HistBox[] = [];
  for (const i of driveIndices(plays, shown)) {
    if (i === shown) continue;
    const b = box(plays[i], dir);
    if (b) out.push(b);
  }
  return out.slice(-16);
}

export type DriveStats = {
  runPlays: number; runYards: number; passPlays: number; passYards: number;
  penaltiesFor: { n: number; yards: number }; penaltiesAgainst: { n: number; yards: number };
  totalPlays: number; totalYards: number;
};

/**
 * What the drive that `shown` belongs to has done so far (the shown play included): runs and passes with their yards, the penalties for the offense
 * (called on the defense) and against it, and the totals. Penalties are not plays or yards from scrimmage; punts and kicks are not counted.
 */
export function driveStats(plays: HistInput[], shown: number, offAbbr: string | undefined): DriveStats {
  const st: DriveStats = { runPlays: 0, runYards: 0, passPlays: 0, passYards: 0, penaltiesFor: { n: 0, yards: 0 }, penaltiesAgainst: { n: 0, yards: 0 }, totalPlays: 0, totalYards: 0 };
  for (const i of driveIndices(plays, shown)) {
    const p = plays[i];
    if (isPenalty(p)) {
      if (/declined|offsetting/i.test(p.text)) continue;
      const on = /penalty on ([A-Za-z0-9]{2,5})/i.exec(p.text)?.[1]?.toUpperCase();
      const yards = Number(/(\d+)[- ]yards?/i.exec(p.text)?.[1] ?? Math.abs(p.yards || 0));
      const against = on && offAbbr ? on === offAbbr.toUpperCase() : true;
      const side = against ? st.penaltiesAgainst : st.penaltiesFor;
      side.n++;
      side.yards += yards;
      continue;
    }
    const flat = `${p.kind} ${p.text}`;
    const k = /\bsack/i.test(flat) ? "pass" : playKind(p.kind, p.text);
    if (k === "pass") { st.passPlays++; st.passYards += p.yards || 0; }
    else if (k === "run") { st.runPlays++; st.runYards += p.yards || 0; }
  }
  st.totalPlays = st.runPlays + st.passPlays;
  st.totalYards = st.runYards + st.passYards;
  return st;
}
