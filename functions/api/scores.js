// Cloudflare Pages Function: /api/scores?league=nfl|cfb&date=YYYYMMDD[&full=1]
// Trimmed live scores from ESPN's scoreboard, cached at the edge for 10s while a game is on (and for a game about to start or already past its
// kickoff), so every visitor's poll doesn't hit ESPN but a touchdown shows within seconds. The edge keeps it for s-maxage; browsers are told
// max-age=0 so a poll always reaches the edge instead of the browser's own copy. With full=1 it returns only the finished games, with both teams' ids, names and
// final scores (the shape of src/data/finals.json), which the CFB SP+ and NFL+ against-the-spread trackers grade picks from.
const PATHS = { nfl: "nfl", cfb: "college-football" };

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const league = url.searchParams.get("league");
  const date = url.searchParams.get("date");
  if (!PATHS[league] || !/^\d{8}$/.test(date ?? ""))
    return new Response(JSON.stringify({ error: "league=nfl|cfb and date=YYYYMMDD required" }), { status: 400 });

  const full = url.searchParams.get("full") === "1";
  const cache = caches.default;
  const key = new Request(`https://fbwatch-cache/scores/${league}/${date}${full ? "/full" : ""}`);
  const hit = await cache.match(key);
  if (hit) return hit;

  const qs = `dates=${date}${league === "cfb" ? "&groups=80&limit=300" : ""}`;
  const hosts = ["https://site.api.espn.com", "https://site.web.api.espn.com"];
  let res = null;
  for (const host of hosts) {
    try {
      res = await fetch(`${host}/apis/site/v2/sports/football/${PATHS[league]}/scoreboard?${qs}`, {
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
  const data = await res.json();
  if (full) {
    const finals = (data.events ?? []).map((ev) => {
      const c = ev.competitions?.[0];
      const st = ev.status?.type ?? c?.status?.type ?? {};
      if (!c || !(st.state === "post" || st.completed)) return null;
      const a = c.competitors?.find((x) => x.homeAway === "away");
      const h = c.competitors?.find((x) => x.homeAway === "home");
      const as = Number(a?.score), hs = Number(h?.score);
      if (!a?.team?.id || !h?.team?.id || a.score === "" || h.score === "" || !Number.isFinite(as) || !Number.isFinite(hs)) return null;
      const team = (x, s) => ({ id: String(x.team.id), n: x.team.location ?? x.team.displayName ?? "", ab: x.team.abbreviation ?? "", s });
      return {
        l: league, id: String(ev.id), date: ev.date, week: ev.week?.number ?? null,
        ot: /OT/i.test(st.shortDetail ?? st.detail ?? "") ? 1 : 0, neutral: c.neutralSite ? 1 : 0,
        a: team(a, as), h: team(h, hs),
      };
    }).filter(Boolean);
    const fullResponse = new Response(JSON.stringify(finals), {
      headers: { "content-type": "application/json", "cache-control": "public, max-age=0, s-maxage=60" },
    });
    await cache.put(key, fullResponse.clone());
    return fullResponse;
  }
  const out = (data.events ?? []).map((ev) => {
    const c = ev.competitions?.[0] ?? {};
    const side = (h) => c.competitors?.find((x) => x.homeAway === h);
    const st = c.status?.type ?? {};
    const holder = c.situation?.possession;
    const ball = st.state === "in" && holder ? (side("home")?.id === holder ? "home" : side("away")?.id === holder ? "away" : null) : null;
    return {
      id: ev.id,
      state: st.state ?? "pre",
      detail: st.shortDetail ?? st.detail ?? "",
      away: Number(side("away")?.score ?? 0),
      home: Number(side("home")?.score ?? 0),
      ball,
    };
  });
  // How long the edge may keep this: seconds while anything is live or a kickoff is near/past, a couple of minutes otherwise.
  const now = Date.now();
  const soon = (data.events ?? []).some((ev, i) => out[i]?.state === "pre" && Date.parse(ev.date) - now < 20 * 60e3);
  const live = out.some((g) => g.state === "in");
  const ttl = live ? 10 : soon ? 15 : 120;
  const response = new Response(JSON.stringify(out), {
    headers: {
      "content-type": "application/json",
      "cache-control": `public, max-age=0, s-maxage=${ttl}`,
    },
  });
  await cache.put(key, response.clone());
  return response;
}
