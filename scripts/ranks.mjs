// Conference rank on the same footing as the overall rank. The overall rank is ESPN's FPI power rating, so the
// conference rank is each team's place among its conference mates by that same rating. (Conference standings are
// a different question, answered by the record shown on the card; mixing the two put a 2-2 team "12th" in its
// conference and "7th" overall.)

/** Map of `${league}:${teamId}` -> { conf, confSize, confName } from a league's standings feed and FPI ranks. */
export function fpiConfRanks(league, standingsFeed, fpiRank) {
  const out = new Map();
  for (const c of standingsFeed?.children ?? []) {
    const name = c.abbreviation ?? c.shortName ?? c.name;
    const members = (c.standings?.entries ?? []).map((e) => ({ id: String(e.team.id), rank: fpiRank.get(String(e.team.id)) ?? null }));
    members.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
    members.forEach((m, i) => out.set(`${league}:${m.id}`, { conf: m.rank == null ? null : i + 1, confSize: members.length, confName: name }));
  }
  return out;
}
