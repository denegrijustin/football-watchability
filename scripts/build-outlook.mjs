// Builds src/data/outlook.json: the college composite ranking, the projected College Football
// Playoff field and bowl picture (rebuilt each Sunday 8am Central), and the projected NFL playoff
// field (rebuilt each Tuesday 8am Central). Runs inside the scheduled refresh; any other run keeps
// the saved snapshot, and a feed that is missing or empty never replaces one that exists.
//   RAW_DIR   where cfb-fpi.json / nfl-fpi.json live (default data-raw)
//   OUT_FILE  the snapshot (default src/data/outlook.json)
//   NOW       pretend it is this ISO time; FORCE=1 rebuilds both parts regardless of the cycle
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { COMPOSITE_SIZE, FORMAT, NFL_FIELD, cfbBowls, cfbComposite, cfbPlayoff, cycleKey, nflPlayoff, parseFpi } from "./outlook-lib.mjs";

const root = new URL("../", import.meta.url);
const RAW = process.env.RAW_DIR ?? "data-raw";
const OUT = process.env.OUT_FILE ?? new URL("src/data/outlook.json", root).pathname;
const now = process.env.NOW ? new Date(process.env.NOW) : new Date();
const force = process.env.FORCE === "1";
const read = (u) => JSON.parse(readFileSync(u, "utf8"));
const rawFile = (n) => (RAW.startsWith("/") ? `${RAW}/${n}` : new URL(`${RAW}/${n}`, root).pathname);
const feed = (n) => (existsSync(rawFile(n)) ? read(rawFile(n)) : null);

const saved = existsSync(OUT) ? read(OUT) : {};
const out = { ...saved };

// league:espn team id -> local logo id, for the teams the site already has a logo for
// (ids overlap between leagues, so the NFL is told apart by team name, as build-slate does)
const logoFile = new URL("src/data/logo-sources.json", root);
const nflNames = new Set(parseFpi(feed("nfl-fpi.json")).map((t) => t.name));
const logoOf = new Map();
if (existsSync(logoFile))
  for (const l of read(logoFile).logos ?? []) logoOf.set(`${l.league ?? (nflNames.has(l.team) ? "NFL" : "CFB")}:${l.espnId}`, l.logoId);
const withLogo = (league) => (t) => ({ ...t, logoId: logoOf.get(`${league}:${t.id}`) ?? null });

function stamp(feedName, key) {
  const f = feed(feedName);
  return { cycle: key, built: now.toISOString().slice(0, 10), fpiUpdated: f?.lastUpdated ?? null };
}

// ---------- college: Sundays ----------
const cfbKey = cycleKey(now, 0);
if (force || saved.cfb?.cycle !== cfbKey) {
  const teams = parseFpi(feed("cfb-fpi.json"));
  if (teams.length < 100) console.log(`College outlook kept: only ${teams.length} teams in the FPI feed.`);
  else {
    const { rows, sources } = cfbComposite(teams);
    const logo = withLogo("CFB");
    const dress = (t) => logo(t);
    const playoff = cfbPlayoff(rows);
    out.cfb = {
      ...stamp("cfb-fpi.json", cfbKey),
      sources,
      composite: rows.slice(0, COMPOSITE_SIZE).map((t) => ({
        ...dress({ id: t.id, name: t.name, abbr: t.abbr }),
        rank: t.rank,
        conf: t.independent ? "Ind" : t.conf,
        record: `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""}`,
        ap: t.polls.ap ?? null,
        coaches: t.polls.coaches ?? null,
        cfp: t.polls.cfp ?? null,
        fpiRank: t.fpiRank,
        composite: t.composite,
      })),
      playoff: { ...playoff, field: playoff.field.map(dress), out: playoff.out.map(dress), rules: FORMAT },
      bowls: (({ eligible, conferences }) => ({
        eligible,
        conferences: conferences.map((g) => ({ ...g, eligible: g.eligible.map(dress), bubble: g.bubble.map(dress) })),
      }))(cfbBowls(rows)),
    };
    console.log(`College outlook rebuilt for the week of ${cfbKey}: ${rows.length} teams, polls used: ${sources.join(", ")}.`);
  }
} else console.log(`College outlook is current (week of ${cfbKey}).`);

// ---------- NFL: Tuesdays ----------
const nflKey = cycleKey(now, 2);
if (force || saved.nfl?.cycle !== nflKey) {
  const teams = parseFpi(feed("nfl-fpi.json"));
  if (teams.length < 30) console.log(`NFL outlook kept: only ${teams.length} teams in the FPI feed.`);
  else {
    const logo = withLogo("NFL");
    const po = nflPlayoff(teams);
    out.nfl = {
      ...stamp("nfl-fpi.json", nflKey),
      rules: NFL_FIELD,
      conferences: Object.fromEntries(
        Object.entries(po).map(([c, v]) => [c, { field: v.field.map(logo), out: v.out.map(logo) }]),
      ),
    };
    console.log(`NFL outlook rebuilt for the week of ${nflKey}.`);
  }
} else console.log(`NFL outlook is current (week of ${nflKey}).`);

writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
