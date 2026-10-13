// nflverse schedule/results (games.csv): one row per game with scores, closing spread/total, moneylines, rest, roof, QBs, coaches, referee.
import { readRows } from "./csv.mjs";

export const GAME_COLS = ["game_id", "season", "game_type", "week", "gameday", "weekday", "gametime", "away_team", "away_score", "home_team", "home_score", "location", "result", "total", "overtime", "espn", "away_rest", "home_rest", "away_moneyline", "home_moneyline", "spread_line", "total_line", "div_game", "roof", "surface", "temp", "wind", "away_qb_name", "home_qb_name", "away_coach", "home_coach", "referee", "stadium"];

export async function loadGames(path) {
  const rows = await readRows(path, GAME_COLS);
  return rows.map((r) => ({
    ...r,
    season: Number(r.season),
    week: Number(r.week),
    scored: r.home_score !== "" && r.away_score !== "",
    homeScore: r.home_score === "" ? null : Number(r.home_score),
    awayScore: r.away_score === "" ? null : Number(r.away_score),
    spread: r.spread_line === "" ? null : Number(r.spread_line), // home team favored by this many when positive
    totalLine: r.total_line === "" ? null : Number(r.total_line),
  }));
}
