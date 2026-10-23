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

/**
 * How strongly the data backs a pick, from the chance it covers (0 to 1). Anything near a coin flip is a slight lean at best: the line already holds most of
 * what the ratings know, so the tiers are deliberately modest.
 */
export type Strength = "strong" | "lean" | "slight";
export const strengthOf = (cover: number | null | undefined): Strength | null => (cover == null ? null : cover >= 0.6 ? "strong" : cover >= 0.55 ? "lean" : "slight");
export const STRENGTH_LABEL: Record<Strength, string> = { strong: "Big edge", lean: "Edge", slight: "Slight edge" };

/** The chance a pick covers, in words: where it sits between a coin flip (50%) and the 52.4% that breaks even at −110. */
export function chanceVerdict(cover: number): { label: string; text: string } {
  const n = Math.round(cover * 100);
  const label = cover < 0.5 ? "Below a coin flip" : cover < 0.524 ? "About a coin flip" : cover < 0.55 ? "Thin edge" : cover < 0.6 ? "Modest edge" : "Strong edge";
  return { label, text: `${n}% means about ${n} of every 100 picks like this cover. 50% is a coin flip and 52.4% just breaks even at −110, so ${cover < 0.524 ? "this one is not yet better than guessing" : cover < 0.55 ? "this is a small edge, not a lock" : cover < 0.6 ? "this is a real but modest edge" : "this is a clear lean"}.` };
}

/** What has to happen for the pick to cover, in plain words. `line` is the margin the pick has to win by (negative for an underdog getting points). */
export function coverRule(name: string, line: number): string {
  if (line === 0) return `Covers if ${name} wins (a tie is a push).`;
  if (line > 0) return `Covers if ${name} wins by more than ${line}${Number.isInteger(line) ? ` (exactly ${line} is a push)` : ""}.`;
  const pts = -line;
  return `Covers if ${name} wins, or loses by less than ${pts}${Number.isInteger(pts) ? ` (losing by exactly ${pts} is a push)` : ""}.`;
}

/** The ratings' own margin for the pick's side: the line plus the gap (the pick is the side the ratings like better than the line). */
export const ratingsMargin = (line: number, gap: number) => Math.round((line + gap) * 10) / 10;

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
