import { readFileSync } from "node:fs";

/** The board's games as built right now. The slate holds a week of games and sheds a finished week's college games on Sunday (a game or two can be left), so tests that need
 *  college games on the board skip themselves until the next week's schedule is in (Tuesday), the same way the ticker upset test does. */
export const slateGames = (): { league: string }[] => JSON.parse(readFileSync("src/data/slate.json", "utf8")).games;
/** A college week: more than the one or two Sunday games that are left after the Saturday slate is archived (the checks on picks, parlays, rivalry badges and crossover statistics need a real board). */
export const hasCfbGame = () => slateGames().filter((g) => g.league === "CFB").length >= 3;
export const NO_CFB = "no college game on this week's board (the finished week was archived); runs again once the next week's schedule is in";
