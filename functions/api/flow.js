// Cloudflare Pages Function: /api/flow?league=nfl|cfb&id=<espn event id>
// A game's home win-probability line so far, as [home %, period] pairs, for the
// live insanity meter. Cached at the edge for 30s so every visitor's poll
// doesn't hit ESPN.
const PATHS = { nfl: "nfl", cfb: "college-football" };

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const league = url.searchParams.get("league");
  const id = url.searchParams.get("id");
  if (!PATHS[league] || !/^\d{1,12}$/.test(id ?? ""))
    return new Response(JSON.stringify({ error: "league=nfl|cfb and numeric id required" }), { status: 400 });

  const cache = caches.default;
  const key = new Request(`https://fbwatch-cache/flow/${league}/${id}`);
  const hit = await cache.match(key);
  if (hit) return hit;

  let res = null;
  for (const host of ["https://site.api.espn.com", "https://site.web.api.espn.com"]) {
    try {
      res = await fetch(`${host}/apis/site/v2/sports/football/${PATHS[league]}/summary?event=${id}`, {
        headers: {
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          accept: "application/json",
          referer: "https://www.espn.com/",
        },
      });
      if (res.ok) break;
    } catch {
      res = null;
    }
  }
  // The browser falls back to ESPN directly when this fails.
  if (!res?.ok)
    return new Response(JSON.stringify({ error: `ESPN ${res?.status ?? "unreachable"}` }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  const sum = await res.json();
  const periodByPlay = new Map();
  const drives = [...(sum.drives?.previous ?? []), ...(sum.drives?.current ? [sum.drives.current] : [])];
  for (const d of drives) for (const p of d.plays ?? []) periodByPlay.set(p.id, p.period?.number ?? null);
  const wp = (sum.winprobability ?? []).map((w) => [
    Math.round((w.homeWinPercentage ?? 0) * 1000) / 10,
    periodByPlay.get(w.playId) ?? null,
  ]);
  const response = new Response(JSON.stringify({ wp }), {
    headers: { "content-type": "application/json", "cache-control": "public, max-age=30" },
  });
  await cache.put(key, response.clone());
  return response;
}
