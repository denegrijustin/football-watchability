export const metricIds = ['scoring', 'total', 'passing', 'rushing', 'thirdDown', 'turnovers'];
const categories = value => Array.isArray(value) ? value : value?.categories ?? [];
function lookup(input, category, name) {
  const value = categories(input).find(c => c.name === category)?.stats?.find(s => s.name === name)?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
export function parseTeamStats(response, season) {
  if (response.season?.year !== season || response.season?.type !== 2) throw new Error('Wrong statistics season');
  const parse = input => {
    const games = lookup(input, 'general', 'gamesPlayed') ?? lookup(input, 'passing', 'teamGamesPlayed');
    if (!games) throw new Error('No regular-season games');
    const get = (category, name) => lookup(input, category, name);
    const perGame = (category, total, fallback) => {
      const value = get(category, total);
      return value != null ? value / games : get(category, fallback);
    };
    const passing = perGame('passing', 'netPassingYards', 'netPassingYardsPerGame');
    const rushing = perGame('rushing', 'rushingYards', 'rushingYardsPerGame');
    const attempts = get('miscellaneous', 'thirdDownAttempts'), conversions = get('miscellaneous', 'thirdDownConvs');

    return {
      games,
      values: {
        scoring: perGame('scoring', 'totalPoints', 'totalPointsPerGame'),
        total: passing != null && rushing != null ? passing + rushing : null,
        passing, rushing,
        thirdDown: attempts ? conversions != null ? 100 * conversions / attempts : get('miscellaneous', 'thirdDownConvPct') : null,
        turnovers: null,
      },
    };
  };
  const offense = parse(response.results?.stats), defense = parse(response.results?.opponent);
  offense.values.turnovers = lookup(response.results?.stats, 'miscellaneous', 'totalGiveaways');
  defense.values.turnovers = lookup(response.results?.stats, 'miscellaneous', 'totalTakeaways');
  return { offense, defense };
}
export function rankTeams(teams) {
  for (const side of ['offense', 'defense']) for (const id of metricIds) {
    const values = teams.map(t => t.raw[side].values[id]);
    // Incomplete categories show values but never a misleading league rank.
    const complete = values.every(v => v != null);
    const higher = side === 'offense' ? id !== 'turnovers' : id === 'turnovers';
    teams.forEach(team => {
      const value = team.raw[side].values[id];
      const rank = complete ? 1 + values.filter(v => higher ? v > value : v < value).length : null;
      const worst = complete && values.every(v => higher ? v >= value : v <= value);
      (team.metrics ??= []).push({ id, side, value, rank, worst });
    });
  }
  return teams.map(({ raw, metrics, ...team }) => ({ ...team, gamesPlayed: raw.offense.games,
    metrics: metricIds.map(id => ({ id, ...Object.fromEntries(['offense', 'defense'].map(side => {
      const { value, rank, worst } = metrics.find(m => m.id === id && m.side === side);
      return [side, { value, rank, worst }];
    })) })),
  }));
}
