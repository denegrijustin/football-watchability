import snapshot from './matchup-stats.json';
import type { MatchupData, MatchupTeam } from '../components/MatchupComparison';
import { logos, type Game } from './index';
type LeagueStats = { season: number; rankedTeams: number; updatedAt: string; source: string; sourceUrl: string; teams: Record<string, MatchupTeam> };
const leagues = snapshot.leagues as unknown as Partial<Record<MatchupData['league'], LeagueStats>>;
export function matchupForGame(game: Game): MatchupData | undefined {
  const league = leagues[game.league as MatchupData['league']];
  if (!league || league.season !== new Date(game.date).getUTCFullYear()) return undefined;
  const [away, home] = game.teams as { espnId?: string }[];
  const a = away.espnId && league.teams[away.espnId], b = home.espnId && league.teams[home.espnId];
  if (!a || !b) return undefined;
  return { league: game.league as MatchupData['league'], season: league.season, rankedTeams: league.rankedTeams,
    source: league.source, sourceUrl: league.sourceUrl, updatedAt: league.updatedAt, teams: [{ ...a, logo: logos[game.teams[0].logoId] }, { ...b, logo: logos[game.teams[1].logoId] }] };
}
