import { DataError } from "./load";

// Light checks on the downloaded JSON, so a truncated, mangled or wrong file ends in a controlled error instead of a render crash somewhere
// deep in the board. They check the structure the app indexes into, not every field.
const bad = (what: string): never => {
  throw new DataError("invalid", `${what} has an unexpected shape`);
};
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isDate = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v));

/** The week's slate: an object with a list of games, each with an id, a date, a league and two teams. */
export function assertSlate(j: unknown): void {
  if (!isObj(j) || !Array.isArray(j.games) || typeof j.period !== "string") bad("The slate");
  for (const g of (j as { games: unknown[] }).games) {
    if (!isObj(g) || typeof g.id !== "string" || !isDate(g.date) || (g.league !== "NFL" && g.league !== "CFB")) bad("A slate game");
    const t = (g as { teams?: unknown }).teams;
    if (!Array.isArray(t) || t.length < 2 || !t.every((x) => isObj(x) && typeof x.name === "string")) bad("A slate game's teams");
  }
}

/** The archive of finished games: an object with a list of games, each with an id, a date, a week, a league, its teams and a final score. */
export function assertResults(j: unknown): void {
  if (!isObj(j) || !Array.isArray(j.games)) bad("The results");
  for (const x of (j as { games: unknown[] }).games) {
    const g = isObj(x) ? x : bad("A result");
    if (typeof g.espnId !== "string" || !isDate(g.date) || typeof g.week !== "string" || (g.league !== "NFL" && g.league !== "CFB")) bad("A result");
    const actual = g.actual;
    if (!Array.isArray(g.teams) || !isObj(actual) || typeof actual.score !== "number") bad("A result's teams or score");
  }
}

/** The independent TV checks: an object keyed by game id (each entry is checked again where it is used, and ignored if it does not fit). */
export function assertBroadcastChecks(j: unknown): void {
  if (!isObj(j)) bad("The broadcast checks");
}
