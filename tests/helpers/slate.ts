import { readFileSync } from "node:fs";

/** The board's games as built right now. The slate holds a week of games and sheds a finished week's college games on Sunday, so tests that need a
 *  college game on the board skip themselves until the next week's schedule is in (Tuesday), the same way the ticker upset test does. */
export const slateGames = (): { league: string }[] => JSON.parse(readFileSync("src/data/slate.json", "utf8")).games;
export const hasCfbGame = () => slateGames().some((g) => g.league === "CFB");
export const NO_CFB = "no college game on this week's board (the finished week was archived); runs again once the next week's schedule is in";
