import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseTeamStats, rankTeams } from '../scripts/matchup-stats.mjs';
const fixture = JSON.parse(readFileSync('tests/fixtures/matchup-iowa.json', 'utf8'));
test('ESPN statistics use net yards, conversions and actual giveaways/takeaways', () => {
  const stats = parseTeamStats(fixture, 2026);
  expect(stats.offense.values.scoring).toBe(29);
  expect(stats.defense.values.scoring).toBe(12.6);
  expect(stats.offense.values.total).toBeCloseTo(390.8);
  expect(stats.offense.values.thirdDown).toBeCloseTo(100 * 25 / 62);
  expect(stats.offense.values.turnovers).toBe(3);
  expect(stats.defense.values.turnovers).toBe(4);
  expect(() => parseTeamStats(fixture, 2025)).toThrow('Wrong statistics season');
});
test('ranks share ties, reverse for defense/giveaways, and preserve unknowns', () => {
  const values = value => ({ games: 4, values: { scoring: value, total: value, passing: value, rushing: value, thirdDown: value, turnovers: value } });
  const ranked = rankTeams([10, 10, 20].map((v, i) => ({ id: String(i), raw: { offense: values(v), defense: values(v) } })));
  expect(ranked.map(t => t.metrics[0].offense.rank)).toEqual([2, 2, 1]);
  expect(ranked.map(t => t.metrics[0].defense.rank)).toEqual([1, 1, 3]);
  expect(ranked.map(t => t.metrics[5].offense.rank)).toEqual([1, 1, 3]);
  expect(ranked.map(t => t.metrics[5].defense.rank)).toEqual([2, 2, 1]);
  const incomplete = rankTeams([{ id: 'a', raw: { offense: values(null), defense: values(10) } }, { id: 'b', raw: { offense: values(20), defense: values(20) } }]);
  expect(incomplete[1].metrics[0].offense.rank).toBeNull();
});
