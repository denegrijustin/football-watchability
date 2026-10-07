// Builds src/data/outlook.json: the college composite ranking, the projected College Football
// Playoff field and bowl picture (rebuilt each Sunday 8am Central), and the projected NFL playoff
// field (rebuilt each Tuesday 8am Central). Runs inside the scheduled refresh; any other run keeps
// the saved snapshot, and a feed that is missing or empty never replaces one that exists.
//   RAW_DIR   where cfb-fpi.json / nfl-fpi.json live (default data-raw)
//   OUT_FILE  the snapshot (default src/data/outlook.json)
//   NOW       pretend it is this ISO time; FORCE=1 rebuilds both parts regardless of the cycle
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { FORMAT, NFL_FIELD, cfbBowls, cfbComposite, cfbPlayoff, cycleKey, hashSeed, nflPlayoff, parseConfRecords, parseFpi, simulateCfb, simulateNfl } from "./outlook-lib.mjs";

const root = new URL("../", import.meta.url);
const RAW = process.env.RAW_DIR ?? "data-raw";
const OUT = process.env.OUT_FILE ?? new URL("src/data/outlook.json", root).pathname;
const now = process.env.NOW ? new Date(process.env.NOW) : new Date();
const force = process.env.FORCE === "1";
const read = (u) => JSON.parse(readFileSync(u, "utf8"));
const rawFile = (n) => (RAW.startsWith("/") ? `${RAW}/${n}` : new URL(`${RAW}/${n}`, root).pathname);
const feed = (n) => (existsSync(rawFile(n)) ? read(rawFile(n)) : null);

// A saved schedule older than a week is ignored rather than simulated from.
const freshSchedule = (n) => {
  const f = feed(n);
  return f?.games?.length && now.getTime() - Date.parse(f.fetchedAt ?? 0) < 8 * 86400e3 ? f : null;
};
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
const cfbSchedule = freshSchedule("cfb-schedule.json");
if (force || saved.cfb?.cycle !== cfbKey || (!saved.cfb?.sim && cfbSchedule)) {
  const teams = parseFpi(feed("cfb-fpi.json"));
  if (teams.length < 100) console.log(`College outlook kept: only ${teams.length} teams in the FPI feed.`);
  else {
    const { rows, sources } = cfbComposite(teams);
    const logo = withLogo("CFB");
    const dress = (t) => logo(t);
    const playoff = cfbPlayoff(rows);
    const sim = cfbSchedule ? simulateCfb(teams, cfbSchedule.games, parseConfRecords(feed("cfb-standings.json")), { seed: hashSeed(cfbKey) }) : null;
    if (cfbSchedule && !sim) console.log("College seed simulation skipped: too few games left in the schedule.");
    const seen = new Map();
    const confRanks = new Map(rows.map((t) => [t.id, (seen.set(t.conf, (seen.get(t.conf) ?? 0) + 1), seen.get(t.conf))]));
    out.cfb = {
      ...stamp("cfb-fpi.json", cfbKey),
      sources,
      composite: rows.map((t) => ({
        ...dress({ id: t.id, name: t.name, abbr: t.abbr }),
        rank: t.rank,
        conf: t.independent ? "Ind" : t.conf,
        record: `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""}`,
        ap: t.polls.ap ?? null,
        coaches: t.polls.coaches ?? null,
        cfp: t.polls.cfp ?? null,
        fpiRank: t.fpiRank,
        composite: t.composite,
        pConf: t.pConf,
        confRank: confRanks.get(t.id),
      })),
      sim: sim ? { sims: sim.sims, games: cfbSchedule.games.length } : null,
      // Teams with at least a one-in-200 chance, most likely first: every other team is effectively out.
      grid: sim
        ? rows
            .map((t) => ({ ...dress({ id: t.id, name: t.name, abbr: t.abbr }), conf: t.independent ? "Ind" : t.conf, record: `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""}`, rank: t.rank, ...sim.byId.get(t.id) }))
            .filter((t) => t.pPlayoffs >= 0.5)
            .sort((x, y) => y.pPlayoffs - x.pPlayoffs || y.pBye - x.pBye || x.rank - y.rank)
        : null,
      playoff: { ...playoff, field: playoff.field.map(dress), out: playoff.out.map(dress), rules: FORMAT },
      bowls: (({ eligible, conferences }) => ({
        eligible,
        conferences: conferences.map((g) => ({ ...g, eligible: g.eligible.map(dress), bubble: g.bubble.map(dress) })),
      }))(cfbBowls(rows)),
    };
    console.log(`College outlook rebuilt for the week of ${cfbKey}: ${rows.length} teams, polls used: ${sources.join(", ")}${sim ? `, ${sim.sims} simulated seasons` : ", no simulation"}.`);
  }
} else console.log(`College outlook is current (week of ${cfbKey}).`);

// ---------- NFL: Tuesdays ----------
// The seed simulation needs the rest of the schedule (fetch-nfl-schedule.mjs). A snapshot built without it is
// rebuilt as soon as a schedule exists, rather than waiting for the next Tuesday.
const nflKey = cycleKey(now, 2);
const schedule = freshSchedule("nfl-schedule.json");
if (force || saved.nfl?.cycle !== nflKey || (!saved.nfl?.sim && schedule?.games?.length)) {
  const teams = parseFpi(feed("nfl-fpi.json"));
  if (teams.length < 30) console.log(`NFL outlook kept: only ${teams.length} teams in the FPI feed.`);
  else {
    const logo = withLogo("NFL");
    const po = nflPlayoff(teams);
    const sim = schedule?.games?.length ? simulateNfl(teams, schedule.games, { seed: hashSeed(nflKey) }) : null;
    if (schedule?.games?.length && !sim) console.log("NFL seed simulation skipped: the schedule does not cover the rest of the season.");
    const rating = (t) => ({ ...t, ...logo(t) });
    out.nfl = {
      ...stamp("nfl-fpi.json", nflKey),
      rules: NFL_FIELD,
      sim: sim ? { sims: sim.sims, games: schedule.games.length } : null,
      conferences: Object.fromEntries(
        Object.entries(po).map(([c, v]) => [
          c,
          {
            field: v.field.map(logo),
            out: v.out.map(logo),
            grid: sim
              ? teams
                  .filter((t) => t.conf === c)
                  .map((t) => ({
                    ...rating({ id: t.id, name: t.name, abbr: t.abbr }),
                    division: t.division,
                    record: `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""}`,
                    ...sim.byId.get(t.id),
                  }))
                  .sort((x, y) => y.pPlayoffs - x.pPlayoffs || y.pSeed[0] - x.pSeed[0] || y.expW - x.expW)
              : null,
          },
        ]),
      ),
    };
    console.log(`NFL outlook rebuilt for the week of ${nflKey}${sim ? ` with ${sim.sims} simulated seasons` : " (no simulation)"}.`);
  }
} else console.log(`NFL outlook is current (week of ${nflKey}).`);

writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
