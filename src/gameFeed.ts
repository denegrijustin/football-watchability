import { rosterPositions, trimGame } from './gameTrim.js';
const rosters = new Map<string, { expires: number; promise: Promise<Record<string, string>> }>();
async function positions(league: string, id: string): Promise<Record<string, string>> {
  const key = `${league}:${id}`, hit = rosters.get(key);
  if (hit && hit.expires > Date.now()) return hit.promise;
  const promise = (async () => {
    try {
      const response = await fetch(`/api/team-roster?league=${league}&id=${id}`);
      if (!response.ok) throw Error('Roster unavailable');
      return rosterPositions(await response.json());
    } catch { rosters.delete(key); return {}; }
  })();
  rosters.set(key, { expires: Date.now() + 12 * 3600_000, promise });
  return promise;
}
/** Old trimmed responses and fixture data remain supported alongside the unmodified ESPN feed. */
export async function decodeGame(data: any, league: string) {
  if (!data?.header?.competitions) return data;
  const ids = (data.header.competitions[0]?.competitors ?? []).map((c: any) => c.team?.id).filter(Boolean);
  const maps = await Promise.all(ids.map((id: string) => positions(league, String(id))));
  return trimGame(data, Object.assign({}, ...maps));
}
