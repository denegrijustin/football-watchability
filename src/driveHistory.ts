// The plays of the drive in progress, as boxes along the field: blue for a pass, red for a run, yellow for a penalty. A punt, a kick, a score, a
// turnover or a change of possession ends the drive, and the next play starts a clean one. Pure, so tests can import it.
import { playKind } from "./driveKinds";

export type HistInput = { id?: string; team: string; text: string; kind: string; yards: number; toGo?: number | null; score?: boolean; turnover?: boolean };
export type HistBox = { type: "pass" | "run" | "penalty"; /** yards from the left goal line */ from: number; to: number; yards: number };

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
  return { type, from, to, yards };
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
  for (let j = shown - 1; j >= 0 && out.length < 16; j--) {
    const p = plays[j];
    if (skippable(p)) continue;
    if (isPenalty(p)) {
      const b = box(p, dir);
      if (b) out.unshift(b);
      continue;
    }
    if (endsDrive(p) || p.team !== cur.team) break;
    const b = box(p, dir);
    if (b) out.unshift(b);
  }
  // Flags thrown after the shown play (it is not necessarily the newest entry).
  for (let k = shown + 1; k < plays.length; k++) {
    if (skippable(plays[k])) continue;
    if (!isPenalty(plays[k])) break;
    const b = box(plays[k], dir);
    if (b) out.push(b);
  }
  return out;
}
