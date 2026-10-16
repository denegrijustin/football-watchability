// Every team's colors and key players, for the game simulator: src/data/team-players.json.
//
// From ESPN's public feeds, collected here (on the refresh machine) instead of by each visitor's browser: ESPN answers the season-leaders feed for
// GitHub's runners but not for Cloudflare's servers, so fetching it live left the simulator guessing players from roster order.
//
// Per team: brand color and alternate, quarterbacks on the roster (with years of experience), and the season's rushing and receiving leaders by yards
// (names as ESPN prints them, "K. Walker III"). Teams that fail keep what was saved; a run that gets under 80% of a league keeps the whole file.
import { readFileSync, writeFileSync, renameSync } from 'node:fs';

const file = new URL('../src/data/team-players.json', import.meta.url);
const stats = JSON.parse(readFileSync(new URL('../src/data/matchup-stats.json', import.meta.url), 'utf8'));
const season = Number(process.env.SEASON ?? stats.leagues?.NFL?.season ?? new Date().getFullYear());
let saved = { version: 1, nfl: {}, cfb: {} };
try { saved = JSON.parse(readFileSync(file, 'utf8')); } catch {}

async function get(url) {
  let error;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) { error = e; await new Promise((r) => setTimeout(r, 400 * (attempt + 1))); }
  }
  throw error;
}
const hex = (c) => (/^[0-9a-f]{6}$/i.test(c ?? '') ? `#${c.toLowerCase()}` : null);
const idOf = (ref) => ref?.match(/athletes\/(\d+)/)?.[1];

async function team(path, id) {
  const [info, roster, leaders] = await Promise.all([
    get(`https://site.api.espn.com/apis/site/v2/sports/football/${path}/teams/${id}`).catch(() => null),
    get(`https://site.api.espn.com/apis/site/v2/sports/football/${path}/teams/${id}/roster`),
    get(`https://sports.core.api.espn.com/v2/sports/football/leagues/${path}/seasons/${season}/types/2/teams/${id}/leaders`).catch(() => null),
  ]);
  const people = new Map();
  for (const g of roster.athletes ?? []) for (const a of g.items ?? []) people.set(String(a.id), { name: a.shortName ?? a.displayName, pos: a.position?.abbreviation ?? '', exp: a.experience?.years ?? 0 });
  if (!people.size) throw new Error('empty roster');
  const cat = (name) => ((leaders?.categories ?? []).find((c) => c.name === name)?.leaders ?? [])
    .map((l) => ({ id: idOf(l.athlete?.$ref), w: Number(l.value) || 0 })).filter((x) => x.id && people.has(x.id));
  const qbs = [...people.values()].filter((p) => p.pos === 'QB').sort((a, b) => b.exp - a.exp);
  const pass = cat('passingYards')[0];
  // Ball carriers and targets are backs, receivers and tight ends: ESPN also lists punters, kickers and linemen who ran or caught one.
  const skill = new Set(['RB', 'FB', 'WR', 'TE']);
  const rush = cat('rushingYards').filter((x) => skill.has(people.get(x.id).pos)).slice(0, 4);
  const rec = cat('receivingYards').filter((x) => skill.has(people.get(x.id).pos)).slice(0, 7);
  return {
    c: hex(info?.team?.color), a: hex(info?.team?.alternateColor),
    qb: pass ? people.get(pass.id).name : qbs[0]?.name ?? null,
    qbs: qbs.map((q) => [q.name, q.exp]),
    rush: rush.map((x) => [people.get(x.id).name, Math.max(x.w, 20)]),
    rec: rec.map((x) => { const p = people.get(x.id); return [p.name, Math.max(x.w, 20), p.pos === 'TE' ? 'TE' : p.pos === 'RB' || p.pos === 'FB' ? 'RB' : 'WR']; }),
    leaders: !!pass,
  };
}

const out = { version: 1, season, updatedAt: new Date().toISOString(), nfl: { ...saved.nfl }, cfb: { ...saved.cfb } };
let kept = false;
for (const [key, league, path] of [['nfl', 'NFL', 'nfl'], ['cfb', 'CFB', 'college-football']]) {
  const ids = Object.keys(stats.leagues?.[league]?.teams ?? {});
  let cursor = 0, ok = 0;
  const failures = [];
  const fresh = {};
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      try { fresh[id] = await team(path, id); ok++; } catch (e) { failures.push(`${id}: ${e.message}`); }
    }
  }));
  console.log(`${league}: ${ok}/${ids.length} teams${failures.length ? `; failed ${failures.slice(0, 5).join(', ')}` : ''}`);
  if (ids.length && ok / ids.length < 0.8) { console.log(`${league}: too few teams, keeping the saved ones`); kept = true; continue; }
  Object.assign(out[key], fresh);
}
if (kept && !Object.keys(saved.nfl).length && !Object.keys(saved.cfb).length) throw new Error('nothing saved and nothing fetched');
writeFileSync(new URL('../src/data/team-players.json.tmp', import.meta.url), JSON.stringify(out));
renameSync(new URL('../src/data/team-players.json.tmp', import.meta.url), file);
console.log(`wrote src/data/team-players.json (${Object.keys(out.nfl).length} NFL, ${Object.keys(out.cfb).length} college teams)`);
