// Cloudflare Pages Function: /api/scores?league=nfl|cfb&date=YYYYMMDD
// Trimmed live scores from ESPN's scoreboard, cached at the edge for 30s so
// every visitor's poll doesn't hit ESPN.
const PATHS = { nfl: "nfl", cfb: "college-football" };

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const league = url.searchParams.get("league");
  const date = url.searchParams.get("date");
  if (!PATHS[league] || !/^\d{8}$/.test(date ?? ""))
    return new Response(JSON.stringify({ error: "league=nfl|cfb and date=YYYYMMDD required" }), { status: 400 });

  const cache = caches.default;
  const key = new Request(`https://fbwatch-cache/scores/${league}/${date}`);
  const hit = await cache.match(key);
  if (hit) return hit;

  const espn = `https://site.api.espn.com/apis/site/v2/sports/football/${PATHS[league]}/scoreboard?dates=${date}${
    league === "cfb" ? "&groups=80&limit=300" : ""
  }`;
  const res = await fetch(espn, { headers: { "user-agent": "fbwatch.elskatemm.com live scores" } });
  if (!res.ok) return new Response(JSON.stringify([]), { status: 502, headers: { "content-type": "application/json" } });
  const data = await res.json();
  const out = (data.events ?? []).map((ev) => {
    const c = ev.competitions?.[0] ?? {};
    const side = (h) => c.competitors?.find((x) => x.homeAway === h);
    const st = c.status?.type ?? {};
    return {
      id: ev.id,
      state: st.state ?? "pre",
      detail: st.shortDetail ?? st.detail ?? "",
      away: Number(side("away")?.score ?? 0),
      home: Number(side("home")?.score ?? 0),
    };
  });
  const live = out.some((g) => g.state === "in");
  const response = new Response(JSON.stringify(out), {
    headers: {
      "content-type": "application/json",
      "cache-control": `public, max-age=${live ? 30 : 300}`,
    },
  });
  await cache.put(key, response.clone());
  return response;
}
