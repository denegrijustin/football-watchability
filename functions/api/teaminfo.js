// Cloudflare Pages Function: /api/teaminfo?league=nfl|cfb&id=<ESPN team id>&season=YYYY
// What the game simulator needs about one team, trimmed from three ESPN feeds and cached at the edge for six hours: the team's true colors,
// its roster (id, short name, position) and its season leaders (passing, rushing and receiving yards by player id).
const PATHS = { nfl: "nfl", cfb: "college-football" };
const HEADERS = {
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  accept: "application/json",
  referer: "https://www.espn.com/",
};
const get = async (url, tries = 2) => {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (res.ok) return await res.json();
    } catch {
      /* try again */
    }
  }
  return null;
};

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const league = url.searchParams.get("league");
  const id = url.searchParams.get("id");
  const season = url.searchParams.get("season") ?? String(new Date().getUTCFullYear());
  if (!PATHS[league] || !/^\d{1,6}$/.test(id ?? "") || !/^\d{4}$/.test(season))
    return new Response(JSON.stringify({ error: "league=nfl|cfb, id and season required" }), { status: 400 });

  const cache = caches.default;
  const key = new Request(`https://fbwatch-cache/teaminfo/${league}/${id}/${season}`);
  const hit = await cache.match(key);
  if (hit) return hit;

  const sport = PATHS[league];
  const [team, roster, leaders] = await Promise.all([
    get(`https://site.api.espn.com/apis/site/v2/sports/football/${sport}/teams/${id}`),
    get(`https://site.api.espn.com/apis/site/v2/sports/football/${sport}/teams/${id}/roster`),
    get(`https://sports.core.api.espn.com/v2/sports/football/leagues/${sport}/seasons/${season}/types/2/teams/${id}/leaders`),
  ]);
  if (!team && !roster && !leaders)
    return new Response(JSON.stringify({ error: "ESPN unreachable" }), { status: 502, headers: { "content-type": "application/json" } });

  const people = [];
  for (const grp of roster?.athletes ?? [])
    for (const a of grp.items ?? []) people.push({ id: String(a.id), name: a.shortName ?? a.displayName, pos: a.position?.abbreviation ?? "", exp: a.experience?.years ?? 0 });
  const cat = (name) =>
    ((leaders?.categories ?? []).find((c) => c.name === name)?.leaders ?? [])
      .map((l) => ({ id: l.athlete?.$ref?.match(/athletes\/(\d+)/)?.[1] ?? "", w: Number(l.value) || 0 }))
      .filter((x) => x.id)
      .slice(0, 10);
  const body = JSON.stringify({
    color: team?.team?.color ?? null,
    alt: team?.team?.alternateColor ?? null,
    people,
    leaders: { passingYards: cat("passingYards"), rushingYards: cat("rushingYards"), receivingYards: cat("receivingYards") },
  });
  // A half-empty answer (ESPN dropped one of the three feeds) is passed on but not kept, so the next visitor gets a fresh try.
  const complete = !!team && people.length > 0 && !!leaders && cat("passingYards").length > 0;
  const res = new Response(body, { headers: { "content-type": "application/json", "cache-control": complete ? "public, max-age=21600" : "no-store" } });
  if (complete) await cache.put(key, res.clone());
  return res;
}
