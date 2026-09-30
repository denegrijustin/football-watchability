// College availability reports for conference games (SEC, ACC, Big Ten, Big 12).
//
// The four conferences publish mandatory player availability reports through
// HD Intelligence, whose public report embed (the one on secsports.com,
// theacc.com, big12sports.com and bigten.org) reads /api/get-publish-public.
// Each game lists every player with a status: Available, Probable,
// Questionable, Doubtful, Out, Out - (1st Half), or on game day Game Time
// Decision. Reports run Initial (three nights out), Update 1, Update 2 and
// Game Day (about two hours before kickoff, 90 minutes in the Big 12).
// Conferences don't disclose the injury itself.
//
// Writes data-raw/availability.json keyed by ESPN event id, with ESPN
// headshots matched from the team rosters. Non-conference and Group of Five
// games have no report.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const RAW = new URL(`../${process.env.RAW_DIR ?? "data-raw"}/`, import.meta.url);
const OUT = new URL("availability.json", RAW);
const HDI = "https://app.hdintelligence.com/api/get-publish-public";
const CONFS = { SEC: "SEC", ACC: "ACC", B10: "Big Ten", B12: "Big 12" };
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (n) => (existsSync(new URL(n, RAW)) ? JSON.parse(readFileSync(new URL(n, RAW), "utf8")) : null);

export const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/\bst\./g, "state")
    .replace(/&/g, "")
    .replace(/[^a-z0-9]/g, "");

/** "WR #15 Shamarius \"Snook\" Peterkin" -> { pos, jersey, name } */
export function parsePlayer(s) {
  const m = /^(\S+)\s+#(\d+)\s+(.+)$/.exec(String(s ?? "").trim());
  if (!m) return { pos: null, jersey: null, name: String(s ?? "").trim() };
  return { pos: m[1], jersey: m[2], name: m[3].replace(/\s+"[^"]+"\s+/, " ").trim() };
}

async function post(conf) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(HDI, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": UA, origin: "https://app.hdintelligence.com" },
        body: JSON.stringify({ sport: "Football", organization: conf, conference: conf }),
      });
      if (res.ok) return await res.json();
      console.error(`${conf}: HTTP ${res.status}`);
    } catch (e) {
      console.error(`${conf}: ${e}`);
    }
    await sleep(1500 * (attempt + 1));
  }
  return null;
}

async function espn(url) {
  try {
    const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 fbwatch-slate-builder" } });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function main() {
  const prev = read("availability.json") ?? { games: {} };
  const board = read("cfb-scoreboard.json") ?? { events: [] };
  // ESPN events by the normalized names of both teams.
  const events = board.events.map((ev) => {
    const comps = ev.competitions?.[0]?.competitors ?? [];
    return {
      id: ev.id,
      date: ev.date,
      teams: comps.map((c) => ({
        id: c.team?.id,
        keys: new Set(
          ["location", "displayName", "shortDisplayName", "abbreviation", "name"].map((k) => norm(c.team?.[k])).filter(Boolean),
        ),
      })),
    };
  });
  const matchTeam = (ev, t) => ev.teams.find((x) => x.keys.has(norm(t.teamDisplayName)) || x.keys.has(norm(t.teamName)));

  const games = {};
  let found = 0;
  for (const conf of Object.keys(CONFS)) {
    const data = await post(conf);
    if (!data) continue;
    for (const [key, g] of Object.entries(data)) {
      const [a, b] = g.games ?? [];
      if (!a || !b) continue;
      const day = Date.parse(`${g.footer?.date}T12:00:00Z`);
      const ev = events.find(
        (e) => matchTeam(e, a) && matchTeam(e, b) && matchTeam(e, a) !== matchTeam(e, b) && Math.abs(Date.parse(e.date) - day) < 2 * 86400e3,
      );
      if (!ev) continue;
      found++;
      const report = {
        conf,
        confName: CONFS[conf],
        hdiId: key,
        type: g.ReportType ?? null,
        published: g.publishDate ? `${g.publishDate}T${g.postedTime ?? "00:00:00"}` : null,
        publishedDay: g.publishDayOfWeek ?? null,
        tz: g.conferenceTimeZone ?? null,
        fetchedAt: new Date().toISOString(),
        teams: [a, b].map((t) => ({
          espnId: matchTeam(ev, t).id,
          name: t.teamDisplayName ?? t.teamName,
          players: (t.rows ?? [])
            .filter((r) => r.status && r.status !== "Available")
            .map((r) => ({ ...parsePlayer(r.name), status: r.status })),
          listed: (t.rows ?? []).length,
        })),
      };
      // A pending placeholder never replaces a published report.
      const old = prev.games?.[ev.id];
      if (!report.teams.some((t) => t.listed) && old?.teams?.some((t) => t.listed)) games[ev.id] = old;
      else games[ev.id] = report;
    }
    await sleep(500);
  }

  // Headshots from ESPN rosters, matched on jersey + last name.
  const rosters = new Map();
  for (const rep of Object.values(games)) {
    for (const t of rep.teams) {
      if (!t.players.length || t.players.every((p) => p.headshot !== undefined)) continue;
      if (!rosters.has(t.espnId)) {
        const r = await espn(`https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/${t.espnId}/roster`);
        const list = (r?.athletes ?? []).flatMap((g) => (Array.isArray(g.items) ? g.items : [g]));
        rosters.set(t.espnId, list);
        await sleep(150);
      }
      const list = rosters.get(t.espnId);
      const last = (s) => norm(String(s).split(" ").filter((w) => !/^(jr\.?|sr\.?|ii|iii|iv)$/i.test(w)).pop());
      for (const p of t.players) {
        const hit =
          list.find((a) => a.jersey === p.jersey && last(a.displayName ?? a.fullName ?? "") === last(p.name)) ??
          list.find((a) => norm(a.displayName) === norm(p.name));
        p.headshot = hit?.headshot?.href ?? null;
        if (hit?.displayName) p.espnName = hit.displayName;
      }
    }
  }

  // Keep earlier reports for games no longer listed (last 10 days), so a
  // finished game's final report stays attached through the archive.
  const cutoff = Date.now() - 10 * 86400e3;
  for (const [id, rep] of Object.entries(prev.games ?? {})) {
    if (games[id]) continue;
    const ev = events.find((e) => e.id === id);
    if (ev || Date.parse(rep.fetchedAt ?? 0) > cutoff) games[id] = rep;
  }
  writeFileSync(OUT, JSON.stringify({ fetchedAt: new Date().toISOString(), games }, null, 1));
  const listed = Object.values(games).reduce((n, g) => n + g.teams.reduce((m, t) => m + t.players.length, 0), 0);
  console.log(`availability: ${found} conference reports matched, ${Object.keys(games).length} kept, ${listed} players not fully available`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
