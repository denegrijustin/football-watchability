// Builds src/data/perf-cfb.json: per team-game offense counts, drives and big plays for the college performance tabs, from ESPN's play-by-play
// (site API `summary?event=<id>`, one request per finished FBS game in src/data/finals.json). The per-play rules live in cfb-parse.mjs and
// lib.mjs; the output has exactly the shape of perf-nfl.json (see build-nfl.mjs). Any failure keeps the saved file and exits 0.
//   node scripts/perf/build-cfb.mjs
// Environment: PERF_CFB_BUDGET_MS (default 480000, wall-clock limit for fetching: it stops cleanly and the next run continues),
//   PERF_OUT (output name, default perf-cfb), PERF_CFB_CACHE_DIR (dev only: read <id>.json summaries from a folder instead of ESPN),
//   PERF_CFB_CONCURRENCY (default 4).
//
// Incremental and resumable: a finished game is fetched once; it is fetched again while its last fetch is less than 24 hours after kickoff
// (ESPN corrects plays after the final), when the final score in finals.json no longer matches, and, for games ESPN had no drives for yet,
// every 6 hours for a week. Each game's `fetchedAt` is stored in games[]. Unfetched games stay in games[] with plays:false (they are the
// coverage.missing list), so a first run that hits the time budget just leaves the rest for the next run.
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { createHash } from "node:crypto";
import { SCHEMA, EXPLOSIVE, GARBAGE_GAP, DEFINITIONS, V } from "./lib.mjs";
import { parseSummary, HAS_FUMBLES } from "./cfb-parse.mjs";

const root = new URL("../../", import.meta.url);
const outName = process.env.PERF_OUT || "perf-cfb";
const OUT = new URL(`src/data/${outName}.json`, root);
const BUDGET_MS = Number(process.env.PERF_CFB_BUDGET_MS) || 8 * 60 * 1000;
const CONCURRENCY = Math.max(1, Number(process.env.PERF_CFB_CONCURRENCY) || 4);
const CACHE_DIR = process.env.PERF_CFB_CACHE_DIR || "";
const ESPN = "https://site.api.espn.com/apis";
const UA = "Mozilla/5.0 fbwatch-perf";
const HOUR = 3600e3;
const started = Date.now();
let requests = 0, retries = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (u) => JSON.parse(readFileSync(u, "utf8"));

/** GET json with a 20 s timeout and up to 3 retries (exponential backoff; 429/5xx/network honour Retry-After). 404 resolves to null. */
async function getJson(url) {
  let lastErr;
  for (let attempt = 0; attempt <= 3; attempt++) {
    if (attempt) { retries++; await sleep(Math.min(30000, 1000 * 2 ** (attempt - 1)) + Math.random() * 300); }
    try {
      requests++;
      const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(20000) });
      if (res.ok) return await res.json();
      if (res.status === 404) return null;
      lastErr = new Error(`HTTP ${res.status}`);
      if (res.status === 429 || res.status >= 500) {
        const ra = Number(res.headers.get("retry-after"));
        if (Number.isFinite(ra) && ra > 0) await sleep(Math.min(30000, ra * 1000));
        continue;
      }
      throw lastErr; // other 4xx: retrying will not help
    } catch (e) {
      lastErr = e;
      if (/HTTP 4\d\d/.test(String(e.message)) && !/429/.test(String(e.message))) break;
    }
  }
  throw lastErr ?? new Error("fetch failed");
}

async function loadSummary(id) {
  if (CACHE_DIR) { const f = `${CACHE_DIR}/${id}.json`; return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null; }
  return getJson(`${ESPN}/site/v2/sports/football/college-football/summary?event=${id}`);
}

// --- team metadata -----------------------------------------------------------------------------------------------------------------
const CONF_LABEL = { CUSA: "C-USA", "FBS Indep.": "Independent" };
async function fetchTeamMeta() {
  const meta = { fbs: new Map(), info: new Map() };
  try {
    const st = await getJson(`${ESPN}/v2/sports/football/college-football/standings?group=80&level=3`);
    const walk = (node, conf) => {
      for (const e of node?.standings?.entries ?? []) if (e?.team?.id) meta.fbs.set(String(e.team.id), conf);
      for (const c of node?.children ?? []) walk(c, node?.isConference ? (CONF_LABEL[node.shortName] ?? node.shortName) : conf);
    };
    for (const c of st?.children ?? []) walk(c, CONF_LABEL[c.shortName] ?? c.shortName ?? "");
  } catch (e) { console.warn(`perf-cfb: FBS list unavailable (${e.message})`); }
  try {
    const tl = await getJson(`${ESPN}/site/v2/sports/football/college-football/teams?limit=1000`);
    for (const x of tl?.sports?.[0]?.leagues?.[0]?.teams ?? []) { const t = x.team; if (t?.id) meta.info.set(String(t.id), { name: t.location ?? t.displayName, abbr: t.abbreviation, color: t.color }); }
  } catch (e) { console.warn(`perf-cfb: team list unavailable (${e.message})`); }
  return meta;
}

// --- main --------------------------------------------------------------------------------------------------------------------------
async function build() {
  const finalsFile = readJson(new URL("src/data/finals.json", root));
  const season = Number(finalsFile.season) || new Date().getUTCFullYear();
  const finals = finalsFile.games.filter((g) => g.l === "cfb");
  let prev = existsSync(OUT) ? readJson(OUT) : null;
  if (prev && (prev.season !== season || prev.schema !== SCHEMA)) prev = null;
  const prevGame = new Map((prev?.games ?? []).map((g) => [g.id, g]));
  const prevRows = new Map(); // game id -> rows
  for (const r of prev?.rows ?? []) { const a = prevRows.get(r.g) ?? []; a.push(r); prevRows.set(r.g, a); }

  const now = Date.now();
  const due = (f) => {
    const p = prevGame.get(f.id);
    if (!p || !p.fetchedAt) return true;
    const fetched = Date.parse(p.fetchedAt), kick = Date.parse(f.date);
    if (p.hs !== f.h.s || p.as !== f.a.s) return true;
    if (fetched < kick + 24 * HOUR) return true; // ESPN corrects plays for a day after the game
    if (!p.plays && now - fetched > 6 * HOUR && now - kick < 7 * 24 * HOUR) return true; // no drives yet: look again
    return false;
  };
  // New games first (oldest first so a budget cut leaves the newest for last), then re-checks.
  const isNew = (f) => !prevGame.has(f.id);
  const todo = finals.filter(due).sort((a, b) => Number(isNew(b)) - Number(isNew(a)) || a.date.localeCompare(b.date));

  const results = new Map(); // game id -> { fetchedAt, parsed|null }
  let failed = 0, idx = 0;
  const worker = async () => {
    while (idx < todo.length) {
      if (!CACHE_DIR && Date.now() - started > BUDGET_MS) return;
      const f = todo[idx++];
      try {
        const sum = await loadSummary(f.id);
        results.set(f.id, { fetchedAt: new Date().toISOString(), parsed: sum ? parseSummary(sum) : null });
      } catch (e) {
        failed++;
        if (failed <= 5) console.warn(`perf-cfb: game ${f.id} failed (${e instanceof Error ? e.message : e})`);
      }
      if (!CACHE_DIR) await sleep(120 + Math.random() * 180);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const pending = todo.length - results.size - failed;
  if (todo.length && !results.size && failed) throw new Error(`no summaries could be fetched (${failed} failed)`);

  const meta = CACHE_DIR ? { fbs: new Map(), info: new Map() } : await fetchTeamMeta();

  // Assemble games and rows.
  const games = [], rows = [];
  const partial = [];
  let totalSkipped = { missing: 0, unclassified: 0, nullified: 0, duplicate: 0 };
  for (const f of finals) {
    const old = prevGame.get(f.id);
    const res = results.get(f.id);
    const home = f.h.id, away = f.a.id;
    const g = { id: f.id, espn: f.id, w: f.week ?? 0, date: f.date, home, away, hs: f.h.s, as: f.a.s, ot: !!f.ot, neutral: !!f.neutral, plays: false, fetchedAt: old?.fetchedAt ?? null };
    let gameRows = null;
    if (res) {
      g.fetchedAt = res.fetchedAt;
      const p = res.parsed;
      if (p && p.teams[home] && p.teams[away]) {
        g.plays = true;
        const sk = p.skipped;
        if (sk.missing || sk.unclassified || sk.nullified || sk.duplicate) g.sk = [sk.missing, sk.unclassified, sk.nullified, sk.duplicate];
        if (p.diag.finalHome != null && (p.diag.finalHome !== f.h.s || p.diag.finalAway !== f.a.s)) g.scoreMismatch = true;
        gameRows = [home, away].map((t) => {
          const x = p.teams[t];
          const mine = t === home;
          return { t, o: mine ? away : home, g: f.id, w: g.w, h: f.neutral ? 2 : mine ? 1 : 0, c: x.c, x: x.x, d: x.d, k: x.k, fu: x.fu, pf: mine ? f.h.s : f.a.s, pa: mine ? f.a.s : f.h.s };
        });
      }
    } else if (old) {
      g.plays = !!old.plays;
      if (old.sk) g.sk = old.sk;
      if (old.scoreMismatch) g.scoreMismatch = true;
      gameRows = prevRows.get(f.id) ?? null;
      if (gameRows) gameRows = gameRows.map((r) => ({ ...r, w: g.w, pf: r.t === home ? f.h.s : f.a.s, pa: r.t === home ? f.a.s : f.h.s }));
      if (!gameRows) g.plays = false;
    }
    if (g.sk) for (const [i, k] of ["missing", "unclassified", "nullified", "duplicate"].entries()) totalSkipped[k] += g.sk[i];
    if (g.plays && gameRows) {
      rows.push(...gameRows);
      const n = gameRows.reduce((s, r) => s + r.c[V.PN] + r.c[V.RN] + r.x[V.PN] + r.x[V.RN], 0);
      const nd = gameRows.reduce((s, r) => s + r.d.length, 0);
      if (n < 80 || nd < 16 || g.scoreMismatch) partial.push(g.id);
    }
    games.push(g);
  }
  rows.sort((a, b) => a.w - b.w || a.g.localeCompare(b.g) || a.t.localeCompare(b.t));
  games.sort((a, b) => a.w - b.w || a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  // Teams: every team in a game. FBS flag and conference from ESPN's FBS standings; FCS and other opponents are kept with fbs:false.
  const prevTeams = prev?.teams ?? {};
  const teamIds = new Set(); for (const f of finals) { teamIds.add(f.h.id); teamIds.add(f.a.id); }
  const fbsKnown = meta.fbs.size > 0;
  const names = new Map(); for (const f of finals) { names.set(f.h.id, f.h); names.set(f.a.id, f.a); }
  const teams = {};
  for (const id of [...teamIds].sort((a, b) => Number(a) - Number(b))) {
    const info = meta.info.get(id), old = prevTeams[id], fin = names.get(id);
    teams[id] = {
      name: info?.name ?? old?.name ?? fin?.n ?? id,
      abbr: info?.abbr ?? old?.abbr ?? fin?.ab ?? "",
      conf: fbsKnown ? (meta.fbs.get(id) ?? "") : (old?.conf ?? ""),
      color: info?.color ? `#${info.color}` : (old?.color ?? "#6b7280"),
      fbs: fbsKnown ? meta.fbs.has(id) : !!old?.fbs,
    };
  }

  const withPlays = games.filter((g) => g.plays).length;
  const totalPlays = rows.reduce((s, r) => s + r.c[V.PN] + r.c[V.RN] + r.x[V.PN] + r.x[V.RN], 0);
  const lastFetch = games.reduce((m, g) => (g.fetchedAt && g.fetchedAt > m ? g.fetchedAt : m), "");
  const body = {
    schema: SCHEMA, league: "cfb", season,
    source: { name: "ESPN play-by-play (site API)", url: "https://site.api.espn.com", license: "ESPN public API, unofficial; used for derived team statistics", fileModified: lastFetch || new Date().toISOString() },
    latestWeek: games.reduce((m, g) => Math.max(m, g.w), 0),
    config: { explosive: EXPLOSIVE, garbageGap: GARBAGE_GAP, hasEpa: false, hasFumbles: HAS_FUMBLES, fcsExcluded: false, populationNote: "FBS teams only for percentiles" },
    coverage: { games: games.length, gamesWithPlays: withPlays, missing: games.filter((g) => !g.plays).map((g) => g.id), plays: totalPlays, partial, skippedPlays: totalSkipped },
    definitions: DEFINITIONS,
    teams, games, rows,
  };
  // The hash ignores bookkeeping that changes without the numbers changing (fetch times, file time).
  const hashed = { ...body, source: { ...body.source, fileModified: null }, games: games.map(({ fetchedAt, ...g }) => g) };
  const contentHash = createHash("sha1").update(JSON.stringify(hashed)).digest("hex").slice(0, 12);
  return { next: { ...body, contentHash }, prev, stats: { todo: todo.length, fetched: results.size, failed, pending } };
}

const statusFile = new URL("src/data/perf-status.json", root);
const readStatus = () => (existsSync(statusFile) ? readJson(statusFile) : {});
const writeAtomic = (u, text) => { const tmp = new URL(`${u.pathname.split("/").pop()}.tmp`, u); writeFileSync(tmp, text); renameSync(tmp, u); };

try {
  const { next, prev, stats } = await build();
  const unchanged = prev && prev.contentHash === next.contentHash;
  // dataUpdatedAt moves only when the numbers did; "last checked" lives in perf-status.json.
  next.dataUpdatedAt = unchanged ? prev.dataUpdatedAt : new Date().toISOString();
  const text = JSON.stringify(next);
  if (!prev || JSON.stringify(prev) !== text) writeAtomic(OUT, text);
  console.log(`perf-cfb: ${unchanged ? "numbers unchanged" : "wrote"} ${next.season} (${next.coverage.gamesWithPlays}/${next.coverage.games} games with plays, ${next.coverage.plays} plays, ${(text.length / 1024).toFixed(0)} KB); ` +
    `fetched ${stats.fetched}/${stats.todo} due games, ${stats.failed} failed, ${stats.pending} left for the next run; ${requests} requests (${retries} retries) in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  const status = readStatus();
  status[outName] = { checkedAt: new Date().toISOString(), ok: true, dataUpdatedAt: next.dataUpdatedAt, ...(stats.pending || stats.failed ? { pending: stats.pending + stats.failed } : {}) };
  writeFileSync(statusFile, JSON.stringify(status));
} catch (e) {
  console.warn(`perf-cfb: keeping the saved file (${e instanceof Error ? e.message : e})`);
  const status = readStatus();
  status[outName] = { ...(status[outName] ?? {}), checkedAt: new Date().toISOString(), ok: false, error: String(e instanceof Error ? e.message : e).slice(0, 200) };
  writeFileSync(statusFile, JSON.stringify(status));
}
