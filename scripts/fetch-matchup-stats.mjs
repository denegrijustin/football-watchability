import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { parseTeamStats, rankTeams } from './matchup-stats.mjs';
const file = new URL('../src/data/matchup-stats.json', import.meta.url);
const season = Number(process.env.SEASON ?? new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }).slice(0, 4));
let saved = { leagues: {} };
try { saved = JSON.parse(readFileSync(file, 'utf8')); } catch {}
async function get(url) {
  let error;
  for (let attempt = 0; attempt < 2; attempt++) try {
    const response = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (e) { error = e; }
  throw error;
}
for (const [league, path] of [['NFL', 'nfl'], ['CFB', 'college-football']]) try {
  const poolUrl = league === 'NFL'
    ? `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams?limit=100`
    : `https://site.web.api.espn.com/apis/fitt/v3/sports/football/college-football/powerindex?region=us&lang=en&limit=300&season=${season}`;
  const pool = await get(poolUrl);
  if (league === 'CFB' && (pool.requestedSeason?.year !== season || pool.pagination?.pages !== 1)) throw new Error('Incomplete FBS pool');
  const teams = (league === 'NFL' ? pool.sports[0].leagues[0].teams : pool.teams).map(entry => {
    const t = entry.team;
    return { id: String(t.id), name: t.displayName, abbreviation: t.abbreviation };
  });
  if (teams.length !== (league === 'NFL' ? 32 : pool.pagination.count)) throw new Error('Incomplete league pool');
  let cursor = 0;
  const fetched = [], failures = [];
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (cursor < teams.length) {
      const team = teams[cursor++];
      try {
        const data = await get(`https://site.api.espn.com/apis/site/v2/sports/football/${path}/teams/${team.id}/statistics?season=${season}&seasontype=2`);
        fetched.push({ ...team, raw: parseTeamStats(data, season) });
      } catch (e) { failures.push(`${team.id}: ${e.message}`); }
    }
  }));
  if (failures.length) throw new Error(`${failures.length} missing teams; ${failures.slice(0, 3).join('; ')}`);
  saved.leagues[league] = { season, rankedTeams: teams.length, updatedAt: new Date().toISOString(), source: 'ESPN regular-season team statistics',
    sourceUrl: `https://www.espn.com/${path}/stats/team`, teams: Object.fromEntries(rankTeams(fetched).map(t => [t.id, t])) };
  console.log(`${league}: ${teams.length} teams, six offense/defense categories ranked`);
} catch (e) {
  console.error(`${league}: ${e.message}; keeping saved snapshot`);
}
if (!Object.keys(saved.leagues).length) throw new Error('No matchup statistics available');
const temporary = new URL('../src/data/matchup-stats.json.tmp', import.meta.url);
writeFileSync(temporary, JSON.stringify(saved));
renameSync(temporary, file);
