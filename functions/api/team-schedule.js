// Cloudflare Pages Function: /api/team-schedule?league=nfl|cfb&name=<team name>&abbr=<NFL abbreviation>
// One team's whole season from ESPN, trimmed to what the Full Schedule on a team page draws: the date, home or away or neutral, the opponent (name, logo,
// rank), the result and score for a finished game, and the time and network for one still to play. The team is found by name in ESPN's team list (cached a day).
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
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const json = (body, status = 200, cache = "no-store") => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": cache } });

async function findTeam(sport, name, abbr) {
  const list = await get(`https://site.api.espn.com/apis/site/v2/sports/football/${sport}/teams?limit=1000`);
  const teams = (list?.sports?.[0]?.leagues?.[0]?.teams ?? []).map((t) => t.team);
  const n = norm(name);
  return (
    teams.find((t) => abbr && t.abbreviation === abbr) ??
    teams.find((t) => norm(t.displayName) === n || norm(t.location) === n || norm(t.shortDisplayName) === n) ??
    teams.find((t) => n && (norm(t.displayName).startsWith(n) || n.startsWith(norm(t.location)))) ??
    null
  );
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const league = url.searchParams.get("league");
  const name = url.searchParams.get("name") ?? "";
  const abbr = url.searchParams.get("abbr") ?? "";
  if (!PATHS[league] || (!name && !abbr)) return json({ error: "league=nfl|cfb and name required" }, 400);

  const cache = caches.default;
  const key = new Request(`https://fbwatch-cache/team-schedule/${league}/${encodeURIComponent(name)}/${abbr}`);
  const hit = await cache.match(key);
  if (hit) return hit;

  const sport = PATHS[league];
  const team = await findTeam(sport, name, abbr);
  if (!team) return json({ error: "team not found" }, 404);
  const sched = await get(`https://site.api.espn.com/apis/site/v2/sports/football/${sport}/teams/${team.id}/schedule`);
  if (!sched) return json({ error: "ESPN unreachable" }, 502);

  const games = (sched.events ?? []).map((e) => {
    const c = e.competitions?.[0];
    const me = c?.competitors?.find((x) => String(x.team?.id) === String(team.id));
    const opp = c?.competitors?.find((x) => String(x.team?.id) !== String(team.id));
    if (!c || !me || !opp) return null;
    const done = !!c.status?.type?.completed;
    const pts = (x) => (x?.score?.displayValue != null ? Number(x.score.displayValue) : null);
    return {
      id: String(e.id),
      date: e.date,
      week: e.week?.number ?? null,
      venue: c.neutralSite ? "N" : me.homeAway === "home" ? "vs" : "at",
      opp: { id: String(opp.team.id), name: opp.team.location ?? opp.team.displayName, full: opp.team.displayName, abbr: opp.team.abbreviation, logo: opp.team.logos?.find((l) => l.rel?.includes("default"))?.href ?? opp.team.logos?.[0]?.href ?? null, rank: opp.curatedRank?.current && opp.curatedRank.current < 99 ? opp.curatedRank.current : null },
      done,
      live: c.status?.type?.state === "in",
      result: done ? (me.winner ? "W" : opp.winner ? "L" : "T") : null,
      pts: done || c.status?.type?.state === "in" ? pts(me) : null,
      oppPts: done || c.status?.type?.state === "in" ? pts(opp) : null,
      timeValid: !!c.timeValid,
      network: c.broadcasts?.[0]?.media?.shortName ?? null,
      detail: c.status?.type?.shortDetail ?? null,
    };
  }).filter(Boolean);
  const body = { team: { id: String(team.id), name: team.location ?? team.displayName, abbr: team.abbreviation }, games };
  const res = json(body, 200, "public, max-age=1800");
  await cache.put(key, res.clone());
  return res;
}
