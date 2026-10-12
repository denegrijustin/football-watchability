// Which plays of a drive were runs, passes, punts and field goals, and where each one sits on the field. Pure, so scripts and tests can import it.
export type PlayKind = "run" | "pass" | "punt" | "fg";
/** Whether a play of the drive was a run, a pass, a punt or a field goal (null for a penalty, a kickoff or anything else), from ESPN's play type and, failing that, its text. */
export function playKind(kind: string, text = ""): PlayKind | null {
  if (/Punt/i.test(kind)) return "punt";
  if (/Field Goal/i.test(kind)) return "fg";
  if (/Kickoff|Extra Point|Timeout|Penalty|End of|Two-minute|Coin|Official/i.test(kind)) return null;
  if (/pass|sack|incompletion|interception/i.test(kind)) return "pass";
  if (/rush|\brun\b/i.test(kind)) return "run";
  if (!kind) {
    if (/\bpunts?\b/i.test(text)) return "punt";
    if (/field goal/i.test(text)) return "fg";
  }
  if (/\bpass(?:es|ed)?\b|incomplete|sacked|intercept/i.test(text)) return "pass";
  if (/\bruns?\b|\brush(?:es|ed)?\b|scrambles|kneel|up the middle|\b(?:left|right) (?:end|tackle|guard)\b/i.test(text)) return "run";
  return null;
}
export type Seg = {
  from: number;
  to: number;
  kind: PlayKind | null;
  yards: number;
  incomplete: boolean;
  /** A field goal that went through. */
  good: boolean;
  score: boolean;
  turnover: boolean;
};
type DrivePlay = { yards: number; kind: string; text: string; score?: boolean; turnover?: boolean };
/**
 * The drive as one stretch per play, in field yards from the left goal line. Runs and passes follow one another from where the drive started and are
 * then set so the last one ends at the ball (which is known); a punt starts where the ball was and goes as far as it was kicked, and a field goal goes
 * from there to the goal posts.
 */
export function driveSegments(plays: DrivePlay[], anchor: { ball?: number | null; start?: number | null }, awayOffense: boolean): Seg[] {
  const dir = awayOffense ? 1 : -1;
  let pos = 0;
  const out: Seg[] = plays.map((p) => {
    const kind = playKind(p.kind, p.text);
    const from = pos;
    const isKick = kind === "punt" || kind === "fg";
    const to = isKick ? from : from + dir * p.yards;
    if (!isKick) pos = to;
    const flat = `${p.kind} ${p.text}`;
    return {
      from, to, kind, yards: p.yards,
      incomplete: kind === "pass" && p.yards === 0 && /incomplete|incompletion/i.test(flat),
      good: kind === "fg" && /\bgood\b/i.test(flat) && !/no good|missed|blocked/i.test(flat),
      score: !!p.score,
      turnover: !!p.turnover,
    };
  });
  const lastKick = out.length > 0 && (out[out.length - 1].kind === "punt" || out[out.length - 1].kind === "fg");
  const shift = !lastKick && anchor.ball != null ? anchor.ball - pos : anchor.start != null ? anchor.start : (anchor.ball ?? 50) - pos;
  for (const s of out) {
    s.from += shift;
    s.to += shift;
    if (s.kind === "punt") s.to = s.from + dir * Math.max(0, s.yards);
    if (s.kind === "fg") s.to = dir > 0 ? 106 : -6;
  }
  return out;
}
