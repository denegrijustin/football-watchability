import type { PlayRec } from "./engine";

export interface TeamBox {
  pts: number; plays: number; yds: number;
  passAtt: number; passComp: number; passYds: number;
  rushAtt: number; rushYds: number;
  sacks: number; sackYds: number;
  turnovers: number; ints: number; fumbles: number;
  firstDowns: number;
  third: [number, number]; fourth: [number, number];
  pens: number; penYds: number;
  punts: number; fg: [number, number]; tds: number;
  /** Seconds the team had the ball. */
  top: number;
}

const blank = (): TeamBox => ({
  pts: 0, plays: 0, yds: 0, passAtt: 0, passComp: 0, passYds: 0, rushAtt: 0, rushYds: 0, sacks: 0, sackYds: 0, turnovers: 0, ints: 0, fumbles: 0,
  firstDowns: 0, third: [0, 0], fourth: [0, 0], pens: 0, penYds: 0, punts: 0, fg: [0, 0], tds: 0, top: 0,
});

/** Team statistics through play index `upto` (inclusive). Offense stats belong to the team with the ball on the play. */
export function boxScore(plays: PlayRec[], upto: number): [TeamBox, TeamBox] {
  const b: [TeamBox, TeamBox] = [blank(), blank()];
  for (let i = 0; i <= upto && i < plays.length; i++) {
    const p = plays[i], t = b[p.off];
    if (p.pts > 0 && p.scorer !== null) b[p.scorer].pts += p.pts;
    if (p.td && p.scorer === p.off) t.tds++;
    if (p.kind === "rush" || p.kind === "pass" || p.kind === "sack") {
      t.plays++;
      if (p.kind === "rush") { t.rushAtt++; t.rushYds += p.yds; }
      else if (p.kind === "sack") { t.sacks++; t.sackYds += -p.yds; t.passAtt += 0; }
      else { t.passAtt++; if (p.complete) { t.passComp++; t.passYds += p.yds; } }
      if (p.first || (p.td && p.scorer === p.off)) t.firstDowns++;
      if (p.down === 3) { t.third[1]++; if (p.first || (p.td && p.scorer === p.off)) t.third[0]++; }
      if (p.down === 4) { t.fourth[1]++; if (p.first || (p.td && p.scorer === p.off)) t.fourth[0]++; }
    }
    if (p.kind === "penalty") { t.pens++; t.penYds += Math.abs(p.yds); if (p.first && p.yds > 0) b[p.off].firstDowns++; }
    if (p.turnover === "int") { t.turnovers++; t.ints++; }
    if (p.turnover === "fumble") { t.turnovers++; t.fumbles++; }
    if (p.kind === "end" && p.turnover === "downs") t.turnovers += 0;
    if (p.kind === "punt") t.punts++;
    if (p.kind === "fg") { t.fg[1]++; if (p.pts) t.fg[0]++; }
    if (p.kind !== "kickoff" && p.kind !== "xp" && p.kind !== "two" && p.kind !== "end") t.top += p.dt;
  }
  for (const t of b) { t.yds = t.passYds - t.sackYds + t.rushYds; }
  return b;
}

/** Points by quarter (the fifth column is overtime). */
export function quarterPoints(plays: PlayRec[], upto: number): [number[], number[]] {
  const out: [number[], number[]] = [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]];
  for (let i = 0; i <= upto && i < plays.length; i++) {
    const p = plays[i];
    if (p.pts > 0 && p.scorer !== null) out[p.scorer][Math.min(p.q, 5) - 1] += p.pts;
  }
  return out;
}

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
