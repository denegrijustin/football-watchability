// Broadcast crews (play-by-play, analyst, sideline) for this week's games.
//
// Awful Announcing publishes a weekly NFL and college football announcing
// schedule; its schedules RSS feed carries each article's full text. Every
// game is one paragraph:
//   <p><strong>Away at Home (8:15 p.m., Prime Video): </strong>Al Michaels
//   (play-by-play), Kirk Herbstreit (analyst), Kaylee Hartung (reporter)</p>
// ESPN's press room also keeps a college commentator schedule for every
// ESPN-family game (ABC, ESPN, ESPN2, ESPNU, SEC Network, ACC Network), posted
// earlier in the week: a table row per game with the matchup in bold and the
// crew on the next line in booth order (play-by-play, analyst(s), reporter).
// This reads the recent NFL and college articles, matches each game to the
// ESPN event by both team names (within the week), and writes
// data-raw/announcers.json keyed by ESPN event id. Crews listed as TBD are
// skipped; earlier matches are kept so a game keeps its crew through the week.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const RAW = new URL(`../${process.env.RAW_DIR ?? "data-raw"}/`, import.meta.url);
const FEED = "https://awfulannouncing.com/category/schedules/feed";
const ESPN_CFB = "https://espnpressroom.com/2026-27-espn-college-football-commentators-schedule/";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const read = (n) => (existsSync(new URL(n, RAW)) ? JSON.parse(readFileSync(new URL(n, RAW), "utf8")) : null);

const ENT = { amp: "&", quot: '"', apos: "'", nbsp: " ", lt: "<", gt: ">", rsquo: "’", lsquo: "‘", ndash: "–", mdash: "—", eacute: "é" };
export const text = (s) =>
  String(s ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();

export const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\((fla\.?|florida)\)/g, "")
    .replace(/\(ohio\)/g, "oh")
    .replace(/\bst\./g, "state")
    .replace(/&/g, "")
    .replace(/[^a-z0-9]/g, "");
// Names the schedules use that match no ESPN team field.
const ALIAS = { pitt: "pittsburgh", ole: "olemiss", umass: "massachusetts", uconn: "connecticut", appstate: "appalachianstate", southernmiss: "southernmississippi", ulmonroe: "louisianamonroe", miamiohio: "miamioh", utriograndevalley: "utrgv" };

/** "No. 3 Miami (Fla.) at No. 9 Clemson" -> ["Miami (Fla.)", "Clemson", neutralNote] */
export function splitMatchup(s) {
  const clean = s.replace(/\bNo\.\s*\d+\s+/g, "").trim();
  const m = /^(.+?)\s+(?:at|vs\.?|versus)\s+(.+?)(?:\s+in\s+(.+))?$/i.exec(clean);
  return m ? [m[1].trim(), m[2].trim(), m[3]?.trim() ?? null] : null;
}

/** "Al Michaels (play-by-play), Kirk Herbstreit (analyst)" -> [{ name, role }] */
export function parseCrew(s) {
  const out = [];
  for (const m of text(s).matchAll(/([^,()]+?)\s*\(([^)]+)\)/g)) {
    const name = m[1].replace(/^(and|&)\s+/i, "").trim();
    if (!name || /^tbd$/i.test(name)) continue;
    out.push({ name, role: m[2].trim().toLowerCase() });
  }
  return out;
}

/** Every game paragraph in an article's HTML. */
export function parseArticle(html) {
  const games = [];
  for (const m of html.matchAll(/<p>\s*<(strong|b)>([\s\S]*?)<\/\1>([\s\S]*?)<\/p>/g)) {
    const head = text(m[2]).replace(/:\s*$/, "");
    const hm = /^(.+?)\s*\(([^()]*?),\s*([^()]+)\)\s*$/.exec(head);
    if (!hm) continue;
    const teams = splitMatchup(hm[1]);
    const crew = parseCrew(m[3]);
    if (!teams || !crew.length) continue;
    games.push({ away: teams[0], home: teams[1], site: teams[2], time: hm[2].trim(), network: hm[3].trim(), crew });
  }
  return games;
}

/** ESPN press room table rows: { date: "Sat, Oct 3", away, home, network, crew }. */
export function parseEspnSchedule(html) {
  const games = [];
  let date = null;
  for (const row of html.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    if (cells.length < 4) continue;
    const d = text(cells[0]);
    if (/^[A-Z][a-z]{2}, [A-Z][a-z]{2,4}\.? \d{1,2}$/.test(d)) date = d;
    const [head, ...rest] = cells[2].split(/<br\s*\/?>/i);
    const teams = splitMatchup(text(head).replace(/\*/g, ""));
    const names = text(rest.join(" ")).split(/\s*,\s*/).filter((n) => n && !/^tbd$/i.test(n));
    if (!date || !teams || names.length < 2) continue;
    const crew = names.map((name, i) => ({
      name,
      role: i === 0 ? "play-by-play" : names.length >= 3 && i === names.length - 1 ? "reporter" : "analyst",
    }));
    games.push({ date, away: teams[0], home: teams[1], network: text(cells[3]), crew });
  }
  return games;
}

async function page(url) {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA } });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

async function feed() {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(FEED, { headers: { "user-agent": UA } });
      if (res.ok) return await res.text();
      console.error(`feed: HTTP ${res.status}`);
    } catch (e) {
      console.error(`feed: ${e}`);
    }
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  return null;
}

async function main() {
  const prev = read("announcers.json") ?? { games: {} };
  const xml = (await feed()) ?? "";
  if (!xml) console.log("announcers: Awful Announcing feed unavailable");
  const events = [];
  for (const [league, file] of [["NFL", "nfl-scoreboard.json"], ["CFB", "cfb-scoreboard.json"]]) {
    for (const ev of read(file)?.events ?? []) {
      const comps = ev.competitions?.[0]?.competitors ?? [];
      const keys = (c) =>
        new Set(["location", "displayName", "shortDisplayName", "abbreviation", "name"].map((k) => norm(c.team?.[k])).filter(Boolean));
      events.push({
        id: ev.id,
        league,
        date: Date.parse(ev.date),
        away: keys(comps.find((c) => c.homeAway === "away") ?? {}),
        home: keys(comps.find((c) => c.homeAway === "home") ?? {}),
      });
    }
  }
  const has = (set, name) => {
    const n = norm(name);
    return set.has(n) || set.has(ALIAS[n] ?? "");
  };

  const games = { ...(prev.games ?? {}) };
  let parsed = 0,
    matched = 0;
  const unmatched = [];
  const sameGame = (e, g) => (has(e.away, g.away) && has(e.home, g.home)) || (has(e.away, g.home) && has(e.home, g.away));

  // ESPN press room: college games on ESPN networks. Awful Announcing (below)
  // replaces these when it lists the same game, since it labels each role.
  const espn = await page(ESPN_CFB);
  let espnMatched = 0;
  const year = new Date().getUTCFullYear();
  for (const g of espn ? parseEspnSchedule(espn) : []) {
    const day = Date.parse(`${g.date.replace(/^\w+,\s*/, "").replace(".", "")} ${year} 17:00:00 GMT`);
    const ev = events.find((e) => e.league === "CFB" && Math.abs(e.date - day) < 20 * 3600e3 && sameGame(e, g));
    if (!ev) continue;
    espnMatched++;
    const old = games[ev.id];
    if (old && old.source !== ESPN_CFB) continue;
    games[ev.id] = { league: "CFB", network: g.network, crew: g.crew, source: ESPN_CFB, title: "ESPN college football commentator schedule", published: new Date().toISOString() };
  }
  console.log(`ESPN press room: ${espnMatched} college games matched`);
  for (const item of xml.match(/<item>[\s\S]*?<\/item>/g) ?? []) {
    const title = text(/<title>([\s\S]*?)<\/title>/.exec(item)?.[1]);
    const link = /<link>([\s\S]*?)<\/link>/.exec(item)?.[1]?.trim() ?? "";
    const pub = Date.parse(/<pubDate>([\s\S]*?)<\/pubDate>/.exec(item)?.[1] ?? "");
    if (!/announcing schedule/i.test(title)) continue;
    const league = /\/nfl\//.test(link) || /\bNFL\b/.test(title) ? "NFL" : /college-football|college football/i.test(link + title) ? "CFB" : null;
    if (!league || !Number.isFinite(pub) || Date.now() - pub > 12 * 86400e3) continue;
    const body = /<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/.exec(item)?.[1] ?? "";
    for (const g of parseArticle(body)) {
      parsed++;
      // The game the article lists: same league, both teams (either order, for
      // neutral sites), kicking off within 9 days after the article.
      const ev = events.find(
        (e) =>
          e.league === league &&
          e.date >= pub - 86400e3 &&
          e.date <= pub + 9 * 86400e3 &&
          sameGame(e, g),
      );
      if (!ev) {
        unmatched.push(`${league}: ${g.away} at ${g.home}`);
        continue;
      }
      matched++;
      games[ev.id] = { league, network: g.network, crew: g.crew, source: link, title, published: new Date(pub).toISOString() };
    }
  }
  // Drop games more than three weeks old.
  const ids = new Set(events.map((e) => e.id));
  for (const [id, g] of Object.entries(games)) if (!ids.has(id) && Date.now() - Date.parse(g.published) > 21 * 86400e3) delete games[id];
  writeFileSync(new URL("announcers.json", RAW), JSON.stringify({ fetchedAt: new Date().toISOString(), games }, null, 1));
  console.log(`announcers: ${parsed} games in recent schedules, ${matched} matched to this week's slate, ${Object.keys(games).length} kept`);
  if (unmatched.length) console.log(`not on this slate (or unmatched): ${unmatched.slice(0, 40).join("; ")}`);
}

if (import.meta.url === `file://${process.argv[1]}`)
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
