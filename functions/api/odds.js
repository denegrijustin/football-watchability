// Cloudflare Pages Function: /api/odds?league=nfl|cfb
// The betting lines (spread and total) for the current week's games, from ESPN's scoreboard, trimmed to what the board needs. The edge keeps each
// league's copy for ten minutes, so however many people press Refresh or leave a page open, ESPN is asked at most six times an hour per league.
// `spread` is the home team's: negative when the home team is favored. `at` is when ESPN was read.
import { stamped } from "../../src/serverFeeds.js";

const PATHS = { nfl: "nfl", cfb: "college-football" };
const TTL = 600;

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const league = url.searchParams.get("league");
  if (!PATHS[league]) return new Response(JSON.stringify({ error: "league=nfl|cfb required" }), { status: 400, headers: { "content-type": "application/json" } });

  const cache = caches.default;
  const key = new Request(`https://fbwatch-cache/odds/${league}`);
  const hit = await cache.match(key);
  if (hit) return hit;

  const qs = league === "cfb" ? "?groups=80&limit=300" : "";
  let res = null;
  for (const host of ["https://site.api.espn.com", "https://site.web.api.espn.com"]) {
    try {
      res = await fetch(`${host}/apis/site/v2/sports/football/${PATHS[league]}/scoreboard${qs}`, {
        headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36", accept: "application/json", referer: "https://www.espn.com/" },
      });
      if (res.ok) break;
    } catch {
      res = null;
    }
  }
  if (!res?.ok) return new Response(JSON.stringify({ error: `ESPN ${res?.status ?? "unreachable"}` }), { status: 502, headers: { "content-type": "application/json" } });
  const data = await res.json();
  const games = [];
  for (const ev of data.events ?? []) {
    const c = ev.competitions?.[0];
    const o = c?.odds?.[0];
    if (!c || !o || o.spread == null) continue;
    const home = c.competitors?.find((x) => x.homeAway === "home"), away = c.competitors?.find((x) => x.homeAway === "away");
    if (!home?.team?.id || !away?.team?.id) continue;
    const t = (x) => ({ id: String(x.team.id), abbr: x.team.abbreviation ?? "", name: x.team.displayName ?? "" });
    games.push({
      id: String(ev.id), date: ev.date, state: c.status?.type?.state ?? ev.status?.type?.state ?? "pre",
      home: t(home), away: t(away), spread: Number(o.spread), total: o.overUnder != null ? Number(o.overUnder) : null, provider: o.provider?.name ?? null,
    });
  }
  const response = new Response(JSON.stringify({ at: Date.now(), league, week: data.week?.number ?? null, games }), {
    headers: stamped({ "content-type": "application/json", "cache-control": `public, max-age=0, s-maxage=${TTL}` }),
  });
  await cache.put(key, response.clone());
  return response;
}
