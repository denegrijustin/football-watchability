// Which plays of a drive were runs and which were passes, and where each one sits on the field. Pure, so scripts and tests can import it.
/** Whether a play of the drive was a run or a pass (null for a penalty, a kick or anything else), from ESPN's play type and, failing that, its text. */
export function playKind(kind: string, text = ""): "run" | "pass" | null {
  if (/Punt|Kickoff|Field Goal|Extra Point|Timeout|Penalty|End of|Two-minute/i.test(kind)) return null;
  if (/pass|sack|incompletion|interception/i.test(kind)) return "pass";
  if (/rush|\brun\b/i.test(kind)) return "run";
  if (/\bpass(?:es|ed)?\b|incomplete|sacked|intercept/i.test(text)) return "pass";
  if (/\bruns?\b|\brush(?:es|ed)?\b|scrambles|kneel|up the middle|\b(?:left|right) (?:end|tackle|guard)\b/i.test(text)) return "run";
  return null;
}
export type Seg = { from: number; to: number; kind: "run" | "pass" | null; yards: number; incomplete: boolean };
/**
 * The drive as one stretch per play, in field yards from the left goal line. They are laid back from where the ball is now (which is
 * known) by each play's yardage, so the last one always ends at the ball.
 */
export function driveSegments(plays: { yards: number; kind: string; text: string }[], ball: number, awayOffense: boolean): Seg[] {
  const dir = awayOffense ? 1 : -1;
  let end = ball;
  const out: Seg[] = [];
  for (let i = plays.length - 1; i >= 0; i--) {
    const p = plays[i];
    const from = end - dir * p.yards;
    const kind = playKind(p.kind, p.text);
    out.unshift({ from, to: end, kind, yards: p.yards, incomplete: kind === "pass" && p.yards === 0 && /incomplete|incompletion/i.test(`${p.kind} ${p.text}`) });
    end = from;
  }
  return out;
}
