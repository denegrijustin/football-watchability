import slateData from "./slate.json";
import logoData from "./logos.json";
export type Game = (typeof slateData.games)[number];
export type Team = Game["teams"][number];
export type League = "NFL" | "CFB";
export const slate = slateData;
export const logos: Record<string, string> = logoData;
export function filterGames(league: League, conference: string, query: string) {
  return slate.games
    .filter(
      (game) =>
        game.league === league &&
        (league === "NFL" ||
          conference === "all-fbs" ||
          game.conferences.includes(conference)) &&
        `${game.matchup} ${game.broadcast} ${game.meta}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
    )
    .sort((a, b) => b.score - a.score);
}
