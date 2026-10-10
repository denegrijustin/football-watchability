// Cloudflare Pages Function: /api/game?league=nfl|cfb&event=ID
// A trimmed ESPN game summary for the Game Center overlay (score, situation,
// win probability, drives, plays, team and player stats), cached at the edge
// for 15 seconds while the game is live.
import { rosterPositions, trimGame } from "../../src/gameTrim.js";

const PATHS = { nfl: "nfl", cfb: "college-football" };
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const league = url.searchParams.get("league");
  const event = url.searchParams.get("event");
  if (!PATHS[league] || !/^\d{6,12}$/.test(event ?? ""))
    return new Response(JSON.stringify({ error: "league=nfl|cfb and event=ID required" }), { status: 400 });

  const cache = caches.default;
  const key = new Request(`https://fbwatch-cache/game4/${league}/${event}`);
  const hit = await cache.match(key);
  if (hit) return hit;

  let res = null;
  for (const host of ["https://site.api.espn.com", "https://site.web.api.espn.com"]) {
    try {
      res = await fetch(`${host}/apis/site/v2/sports/football/${PATHS[league]}/summary?event=${event}`, {
        headers: { "user-agent": UA, accept: "application/json", referer: "https://www.espn.com/" },
      });
      if (res.ok) break;
    } catch {
      res = null;
    }
  }
  if (!res?.ok)
    return new Response(JSON.stringify({ error: `ESPN ${res?.status ?? "unreachable"}` }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  const summary = await res.json();
  // Player positions come from the two team rosters (cached for 12 hours).
  const positions = {};
  const rosterStatus = [];
  const teamIds = (summary.header?.competitions?.[0]?.competitors ?? []).map((c) => c.team?.id).filter(Boolean);
  await Promise.all(
    teamIds.map(async (tid) => {
      const rkey = new Request(`https://fbwatch-cache/roster2/${league}/${tid}`);
      let r = await cache.match(rkey);
      if (!r) {
        for (const host of ["https://site.api.espn.com", "https://site.web.api.espn.com"]) {
          try {
            const fresh = await fetch(`${host}/apis/site/v2/sports/football/${PATHS[league]}/teams/${tid}/roster`, {
              headers: { "user-agent": UA, accept: "application/json", referer: "https://www.espn.com/" },
            });
            rosterStatus.push(`${tid}:${fresh.status}`);
            if (!fresh.ok) continue;
            const map = rosterPositions(await fresh.json());
            rosterStatus.push(`${tid}:${Object.keys(map).length}`);
            r = new Response(JSON.stringify(map), {
              headers: { "content-type": "application/json", "cache-control": "public, max-age=43200" },
            });
            await cache.put(rkey, r.clone());
            break;
          } catch (e) {
            rosterStatus.push(`${tid}:${String(e).slice(0, 60)}`);
          }
        }
        if (!r) return;
      }
      Object.assign(positions, await r.json());
    }),
  );
  const game = trimGame(summary, positions);
  const ttl = game.status.state === "in" ? 15 : game.status.state === "post" ? 600 : 120;
  const response = new Response(JSON.stringify({ ...game, _roster: rosterStatus.join(",") || "cached" }), {
    headers: { "content-type": "application/json", "cache-control": `public, max-age=${ttl}`, "x-roster": rosterStatus.join(",") || "cached" },
  });
  await cache.put(key, response.clone());
  return response;
}
