// Finished games from ESPN's scoreboard, kept small, so the CFB SP+ and NFL+ tabs can grade a pick the moment its game ends
// instead of waiting for the sheet or nflverse to catch up. Shared by fetch-finals.mjs and finals-due.mjs.
export const LEAGUES = {
  nfl: { path: "nfl", weeks: 18, extra: "" },
  cfb: { path: "college-football", weeks: 16, extra: "&groups=80&limit=300" }, // FBS games, including ones against FCS teams
};
export const SITE = process.env.ESPN_BASE ?? "https://site.api.espn.com/apis/site/v2/sports/football";

/** One finished game, or null when the event is not final (or has no usable score). Team ids are ESPN's. */
export function parseFinal(league, e) {
  const c = e?.competitions?.[0];
  const st = e?.status?.type ?? c?.status?.type;
  if (!c || !(st?.state === "post" || st?.completed)) return null;
  const side = (ha) => c.competitors?.find((x) => x.homeAway === ha);
  const [a, h] = [side("away"), side("home")];
  const [as, hs] = [Number(a?.score), Number(h?.score)];
  if (!a?.team?.id || !h?.team?.id || a?.score === "" || h?.score === "" || !Number.isFinite(as) || !Number.isFinite(hs)) return null;
  const team = (x, s) => ({ id: String(x.team.id), n: x.team.location ?? x.team.displayName ?? "", ab: x.team.abbreviation ?? "", s });
  return {
    l: league, id: String(e.id), date: e.date, week: e.week?.number ?? null,
    ot: /OT/i.test(st?.shortDetail ?? st?.detail ?? "") ? 1 : 0, neutral: c.neutralSite ? 1 : 0,
    a: team(a, as), h: team(h, hs),
  };
}

/** Newest copy of each game wins; sorted by date so the file diffs cleanly. */
export function mergeFinals(previous, fresh) {
  const byId = new Map();
  for (const g of [...previous, ...fresh]) byId.set(`${g.l}:${g.id}`, g);
  return [...byId.values()].sort((x, y) => x.date.localeCompare(y.date) || x.id.localeCompare(y.id));
}

/** ESPN's season year for a date: the NFL and college seasons that start in August belong to that year until the following summer. */
export const seasonOf = (d = new Date()) => (d.getUTCMonth() < 6 ? d.getUTCFullYear() - 1 : d.getUTCFullYear());
export const etYmd = (d) => d.toLocaleDateString("en-CA", { timeZone: "America/New_York" }).replace(/-/g, "");

export async function getJson(url, { fetchFn = fetch, attempts = 3, timeoutMs = 15000 } = {}) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetchFn(url, { headers: { "user-agent": "Mozilla/5.0 fbwatch-finals" }, signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) return await res.json();
      if (res.status === 404) return null;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 300 * (i + 1)));
  }
  return null;
}
