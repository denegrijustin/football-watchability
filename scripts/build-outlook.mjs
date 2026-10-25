// Builds src/data/outlook.json: the college composite ranking, the projected College Football
// Playoff field and bowl picture (rebuilt each Sunday 8am Central), and the projected NFL playoff
// field (rebuilt each Tuesday 8am Central). Runs inside the scheduled refresh; any other run keeps
// the saved snapshot, and a feed that is missing or empty never replaces one that exists.
//   RAW_DIR   where cfb-fpi.json / nfl-fpi.json live (default data-raw)
//   OUT_FILE  the snapshot (default src/data/outlook.json)
//   NOW       pretend it is this ISO time; FORCE=1 rebuilds both parts regardless of the cycle
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { FORMAT, NFL_FIELD, NFL_TRACKER_TIERS, TRACKER_TIERS, nflTier, trackerTier, cfbBowls, cfbComposite, cfbPlayoff, cycleKey, hashSeed, nflPlayoff, parseConfRecords, parseFpi, simulateCfb, simulateNfl } from "./outlook-lib.mjs";

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

// Playoff leverage: each team's playoff odds now, and after winning and after losing its game in the next week to be played.
// A team that has already played that week (a Thursday game) is left out; a team with no game that week is on a bye.
const playedIn = (finalsFeed, week) => new Set((finalsFeed?.games ?? []).filter((g) => !g.postseason && Number(g.week) === week).flatMap((g) => [g.home, g.away]));
const firstWeek = (games) => Math.min(...games.map((g) => Number(g.week)).filter(Number.isFinite));
function leverageOut(teams, sim, logo, extra = () => ({}), keep = () => true) {
  const lv = sim?.leverage;
  if (!lv || !Number.isFinite(lv.week)) return null;
  const rows = [];
  const byId = new Map();
  for (const t of teams) {
    const r = lv.byId.get(t.id);
    if (!r) continue;
    const cur = sim.byId.get(t.id)?.pPlayoffs ?? 0;
    const row = { ...logo({ id: t.id, name: t.name, abbr: t.abbr }), ...extra(t), cur, ...(r.bye ? { bye: true } : { ifWin: r.ifWin, ifLoss: r.ifLoss }) };
    byId.set(t.id, row);
    if (keep(row)) rows.push(row);
  }
  const swing = (t) => (t && t.ifWin != null && t.ifLoss != null ? t.ifWin - t.ifLoss : 0);
  const games = lv.games
    .map((g) => ({ date: g.date, away: byId.get(g.away), home: byId.get(g.home) }))
    .filter((g) => g.away && g.home && g.away.ifWin != null && g.home.ifWin != null)
    .map((g) => ({ date: g.date, away: g.away, home: g.home, total: Math.round((swing(g.away) + swing(g.home)) * 10) / 10 }));
  return { week: lv.week, rows: rows.sort((x, y) => y.cur - x.cur), games: games.sort((x, y) => String(x.date).localeCompare(String(y.date))) };
}

/** The playoff tracker: every team in the tier its simulated odds put it in (see trackerTier). A team still in the hunt carries its odds; an eliminated one is just its name and logo. */
function trackerOut(teams, sim, logo, tiers, { spots, nfl = false, keep = () => true }) {
  const by = new Map(tiers.map((t) => [t.key, []]));
  for (const t of teams.filter(keep)) {
    const r = sim.byId.get(t.id);
    if (!r) continue;
    const row = { pPlayoffs: r.pPlayoffs, pByLoss: r.pByLoss, pIfWin: r.pIfWin, pIfNot: r.pIfNot, pTitle: nfl ? r.pDiv : r.pConfTitle };
    const key = nfl ? nflTier(row.pPlayoffs) : trackerTier(row, { g6: !t.independent && ["American", "C-USA", "MAC", "Mountain West", "Sun Belt", "Pac-12"].includes(t.conf) });
    const base = logo({ id: t.id, name: t.name, abbr: t.abbr });
    by.get(key).push(key === "out" ? { ...base, p: row.pPlayoffs } : { ...base, conf: t.independent ? "Ind" : t.conf, record: `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""}`, p: row.pPlayoffs, q: row.pByLoss.slice(0, 3), win: row.pIfWin, not: row.pIfNot });
  }
  for (const list of by.values()) list.sort((x, y) => y.p - x.p);
  const inRace = [...by].filter(([k]) => k !== "out").reduce((n, [, v]) => n + v.length, 0);
  return { spots, inRace, tiers: tiers.map((t) => ({ key: t.key, label: t.label, note: t.note, teams: by.get(t.key) })) };
}

function stamp(feedName, key) {
  const f = feed(feedName);
  return { cycle: key, built: now.toISOString().slice(0, 10), fpiUpdated: f?.lastUpdated ?? null };
}

// ---------- college: Sundays ----------
const cfbKey = cycleKey(now, 0);
const cfbSchedule = freshSchedule("cfb-schedule.json");
// A snapshot saved without leverage (built before it existed, or overwritten by an older build) is rebuilt too, so the Leverage view cannot stay empty until the next cycle.
if (force || saved.cfb?.cycle !== cfbKey || (!saved.cfb?.sim && cfbSchedule) || (!saved.cfb?.leverage && cfbSchedule?.games?.length) || (!saved.cfb?.tracker && cfbSchedule?.games?.length)) {
  const teams = parseFpi(feed("cfb-fpi.json"));
  if (teams.length < 100) console.log(`College outlook kept: only ${teams.length} teams in the FPI feed.`);
  else {
    const { rows, sources } = cfbComposite(teams);
    const logo = withLogo("CFB");
    const dress = (t) => logo(t);
    const playoff = cfbPlayoff(rows);
    const lvWeek = cfbSchedule ? firstWeek(cfbSchedule.games) : NaN;
    const sim = cfbSchedule ? simulateCfb(teams, cfbSchedule.games, parseConfRecords(feed("cfb-standings.json")), { seed: hashSeed(cfbKey), sims: 20000, playedWeek: playedIn(feed("cfb-finals.json"), lvWeek) }) : null;
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
      tracker: sim ? trackerOut(teams, sim, logo, TRACKER_TIERS, { spots: FORMAT.teams }) : null,
      // Teams still in the hunt (a real chance now, or after a win), for the leverage chart; the game table keeps the 30 biggest swings.
      leverage: (() => {
        const lv = leverageOut(teams, sim, logo, (t) => ({ conf: t.independent ? "Ind" : t.conf, record: `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""}` }), (r) => r.cur >= 1 || (r.ifWin ?? 0) >= 3);
        return lv && { ...lv, games: lv.games.filter((g) => g.total >= 1).sort((x, y) => y.total - x.total).slice(0, 30).sort((x, y) => String(x.date).localeCompare(String(y.date))) };
      })(),
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
if (force || saved.nfl?.cycle !== nflKey || (!saved.nfl?.sim && schedule?.games?.length) || (!saved.nfl?.leverage && schedule?.games?.length) || (!saved.nfl?.conferences?.AFC?.tracker && schedule?.games?.length)) {
  const teams = parseFpi(feed("nfl-fpi.json"));
  if (teams.length < 30) console.log(`NFL outlook kept: only ${teams.length} teams in the FPI feed.`);
  else {
    const logo = withLogo("NFL");
    const po = nflPlayoff(teams);
    const lvWeek = schedule?.games?.length ? firstWeek(schedule.games) : NaN;
    const sim = schedule?.games?.length ? simulateNfl(teams, schedule.games, { seed: hashSeed(nflKey), sims: 50000, playedWeek: playedIn(feed("nfl-finals.json"), lvWeek) }) : null;
    if (schedule?.games?.length && !sim) console.log("NFL seed simulation skipped: the schedule does not cover the rest of the season.");
    const rating = (t) => ({ ...t, ...logo(t) });
    const prev = saved.nfl;
    if (!sim && prev?.sim && prev.cycle === nflKey) console.log("NFL outlook kept: this run has no simulation and the saved snapshot for the week has one.");
    else out.nfl = {
      ...stamp("nfl-fpi.json", nflKey),
      rules: NFL_FIELD,
      sim: sim ? { sims: sim.sims, games: schedule.games.length } : null,
      leverage: leverageOut(teams, sim, logo, (t) => ({ conf: t.conf, record: `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""}` })),
      conferences: Object.fromEntries(
        Object.entries(po).map(([c, v]) => [
          c,
          {
            field: v.field.map(logo),
            out: v.out.map(logo),
            tracker: sim ? trackerOut(teams, sim, logo, NFL_TRACKER_TIERS, { spots: NFL_FIELD.perConference, nfl: true, keep: (t) => t.conf === c }) : null,
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
