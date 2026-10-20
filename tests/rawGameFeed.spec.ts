import { expect, test } from './fixtures';
import { decodeGame } from '../src/gameFeed';
import { trimGame } from '../src/gameTrim.js';
import { espnProxy } from '../functions/_lib/espnProxy.js';
import { onRequestGet as roster } from '../functions/api/team-roster.js';

test('browser-side decoding preserves the entire trimmed game and reuses player positions', async () => {
  const realFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = (async () => { requests++; return Response.json({ athletes: [{ id: '7', position: { abbreviation: 'QB' } }] }); }) as typeof fetch;
  const raw = { header: { id: 'test', competitions: [{ competitors: [{ team: { id: 'cpu-test-team', abbreviation: 'A' }, homeAway: 'away', score: 7 }], status: { type: { state: 'in' }, period: 2, displayClock: '5:00' } }] }, drives: { previous: [] }, boxscore: { players: [] }, winprobability: [{ homeWinPercentage: .6, playId: 'p1' }] };
  try {
    const expected = trimGame(raw, { '7': 'QB' });
    expect(await decodeGame(raw, 'nfl')).toEqual(expected);
    expect(await decodeGame(raw, 'nfl')).toEqual(expected);
    expect(requests).toBe(1);
    expect(await decodeGame(expected, 'nfl')).toBe(expected);
  } finally { globalThis.fetch = realFetch; }
});

test('the raw proxy preserves every byte and caches without transforming the upstream data', async () => {
  const globals = globalThis as any, fetchBefore = globals.fetch, cachesBefore = globals.caches;
  let requests = 0;
  const store = new Map<string, Response>();
  const body = '{\n "header": {"competitions": []}, "allDetails": [1,2,3]\n}';
  globals.caches = { default: { match: async (r: Request) => store.get(r.url)?.clone(), put: async (r: Request, data: Response) => { store.set(r.url, data); } } };
  globals.fetch = async () => { requests++; return new Response(body, { headers: { 'content-type': 'application/json' } }); };
  try {
    const first = await espnProxy('nfl', 'summary?event=1234567', 4);
    expect(await first.text()).toBe(body);
    expect(first.headers.get('cache-control')).toContain('s-maxage=4');
    expect(await (await espnProxy('nfl', 'summary?event=1234567', 4)).text()).toBe(body);
    expect(requests).toBe(1);
    expect((await roster({ request: new Request('https://x/api/team-roster?league=nfl&id=../secret') })).status).toBe(400);
    expect(requests).toBe(1);
  } finally { globals.fetch = fetchBefore; if (cachesBefore === undefined) delete globals.caches; else globals.caches = cachesBefore; }
});
