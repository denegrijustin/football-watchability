// Live grading of a pick against the spread, from the score as it stands. Pure, so tests can import it.

export type LiveLike = { state: "pre" | "in" | "post"; detail: string; away: number; home: number };
export type CoverStatus = "covering" | "missing" | "push";

/**
 * Where a pick stands. `line` is the margin the pick's side has to win by: 3.5 for a favorite laying 3.5 points, -7 for an underdog getting 7.
 * `coverBy` is the pick's margin minus the line, positive when it is covering (the same number the graded table calls "covered by").
 */
export function pickStanding(live: LiveLike | undefined, pickIsHome: boolean, line: number) {
  if (!live || live.state === "pre") return { phase: "pre" as const };
  const margin = pickIsHome ? live.home - live.away : live.away - live.home;
  const coverBy = Math.round((margin - line) * 10) / 10;
  const status: CoverStatus = coverBy > 0 ? "covering" : coverBy < 0 ? "missing" : "push";
  return { phase: live.state === "post" ? ("post" as const) : ("in" as const), margin, coverBy, status };
}

/** The line as written from the pick's side: "−3.5" for a favorite, "+7" for an underdog, "PK" for a pick'em. */
export const lineText = (line: number) => (line === 0 ? "PK" : `${line < 0 ? "+" : "−"}${Math.abs(line)}`);

/** What the pick needs, in words, for the status chip. */
export function standingText(s: ReturnType<typeof pickStanding>): string {
  if (s.phase === "pre") return "Not started";
  const by = Math.abs(s.coverBy ?? 0);
  const final = s.phase === "post";
  if (s.status === "covering") return final ? `Covered by ${by}` : `Covering by ${by}`;
  if (s.status === "missing") return final ? `Missed by ${by}` : `Not covering · needs ${by} more`;
  return final ? "Push" : "Push right now";
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
type SlateTeam = { name: string; espnId?: string | null };
type SlateGame = { espnId: string; league: string; date?: string; teams: SlateTeam[] };

/**
 * The board game for a sheet matchup: by ESPN id when the sheet's name is known for it (`espn` maps ids to sheet names), else by the name (the
 * sheet says "Kansas State", the board "Kansas State Wildcats"). Both teams have to match, and the date has to be within a day. `swapped` says the board
 * lists the home team first where the sheet lists the away team (a neutral site).
 */
export function findBoardGame(games: SlateGame[], espn: Record<string, string>, away: string, home: string, dateIso: string | null): { game: SlateGame; swapped: boolean } | null {
  const is = (t: SlateTeam, sheet: string) => {
    if (t.espnId && espn[t.espnId] === sheet) return true;
    const a = norm(t.name), b = norm(sheet);
    return a === b || a.startsWith(`${b} `);
  };
  const day = dateIso ? Date.parse(dateIso.slice(0, 10)) : NaN;
  for (const g of games) {
    if (g.league !== "CFB" || g.teams.length < 2) continue;
    const straight = is(g.teams[0], away) && is(g.teams[1], home);
    // A neutral-site game can list the teams the other way round on the sheet.
    const swapped = !straight && is(g.teams[0], home) && is(g.teams[1], away);
    if (!straight && !swapped) continue;
    const gd = Date.parse((g.date ?? "").slice(0, 10));
    if (Number.isFinite(day) && Number.isFinite(gd) && Math.abs(gd - day) > 36 * 3600e3) continue;
    return { game: g, swapped };
  }
  return null;
}
