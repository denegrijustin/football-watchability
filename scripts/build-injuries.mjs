// Builds src/data/injuries.json: the league-wide injury report with the type of injury, how serious it is, when the player is likely back, and how much
// his absence matters (from how much the team used him in the games he played, or last season's games when there are not enough this season).
//
// NFL: ESPN's injury feed for every team (status, injury, ESPN's projected return date, team notes) joined to nflverse snap counts and player stats.
// College: the game-week availability already on the board (src/data/slate.json); conferences do not say what the injury is, and only team leaders
//   have stats, so college impact is limited to those.
// Any failure keeps the saved file and exits 0.
//   node scripts/build-injuries.mjs
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { readRows } from "./nflverse/csv.mjs";
import { download, RELEASES } from "./nflverse/util.mjs";
import { groupOf, impactScore, impactTier, isOffense, nameKey, percentile, returnInfo, severityOf, topPct } from "./injuries-lib.mjs";

const root = new URL("../", import.meta.url);
const OUT = new URL("src/data/injuries.json", root);
const cache = new URL(".cache/nflverse/", root).pathname;
const readJson = (p) => JSON.parse(readFileSync(new URL(p, root), "utf8"));
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries";
const SHOWN = new Set(["Out", "Injured Reserve", "Doubtful", "Questionable", "Out for season", "Probable"]);
const r1 = (x) => Math.round(x * 10) / 10;

async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 fbwatch-injuries" }, signal: AbortSignal.timeout(60_000) });
      if (res.ok) return await res.json();
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  return null;
}

// ---------- nflverse: what each player did in the games he played ----------
async function loadSeason(year) {
  const hours = 6 * 3_600_000;
  const stats = await readRows(await download(`${RELEASES}/stats_player/stats_player_week_${year}.csv`, `${cache}stats_${year}.csv`, { maxAgeMs: hours }), [
    "player_display_name", "position", "team", "week", "season_type", "passing_yards", "passing_epa", "rushing_yards", "rushing_epa", "receiving_yards", "receiving_epa",
    "def_tackles_solo", "def_tackle_assists", "def_tackles_for_loss", "def_sacks", "def_interceptions", "def_fumbles_forced", "def_pass_defended", "fg_made", "attempts", "carries", "targets",
  ]);
  const snaps = await readRows(await download(`${RELEASES}/snap_counts/snap_counts_${year}.csv`, `${cache}snaps_${year}.csv`, { maxAgeMs: hours }), [
    "player", "position", "team", "week", "game_type", "offense_snaps", "offense_pct", "defense_snaps", "defense_pct", "st_snaps",
  ]);
  const num = (x) => (x === "" ? 0 : Number(x) || 0);
  const players = new Map(); // nameKey -> { name, group, team, weeks: Map(week -> {off, def, st, offPct, defPct}), stat: Map(week -> row) }
  const teamYards = new Map(); // `${team}|${week}` -> pass + rush yards
  for (const r of snaps) {
    if (r.game_type !== "REG") continue;
    const k = nameKey(r.player), g = groupOf(r.position);
    if (!k || !g) continue;
    const p = players.get(k) ?? { name: r.player, group: g, team: r.team, weeks: new Map(), stat: new Map() };
    p.team = r.team;
    p.weeks.set(Number(r.week), { team: r.team, off: num(r.offense_snaps), def: num(r.defense_snaps), st: num(r.st_snaps), offPct: num(r.offense_pct), defPct: num(r.defense_pct) });
    players.set(k, p);
  }
  for (const r of stats) {
    if (r.season_type !== "REG") continue;
    const w = Number(r.week);
    const key = `${r.team}|${w}`;
    teamYards.set(key, (teamYards.get(key) ?? 0) + num(r.passing_yards) + num(r.rushing_yards));
    const p = players.get(nameKey(r.player_display_name));
    if (p) p.stat.set(w, r);
  }
  const prodOf = (p, rows) => {
    let s = 0;
    for (const r of rows) {
      if (p.group === "QB") s += num(r.passing_epa) + num(r.rushing_epa);
      else if (p.group === "RB" || p.group === "WR" || p.group === "TE") s += num(r.rushing_epa) + num(r.receiving_epa);
      else if (p.group === "ST") s += num(r.fg_made);
      else if (p.group !== "OL") s += num(r.def_tackles_solo) + 0.5 * num(r.def_tackle_assists) + num(r.def_tackles_for_loss) + 3 * num(r.def_sacks) + 3 * num(r.def_interceptions) + 2 * num(r.def_fumbles_forced) + num(r.def_pass_defended);
    }
    return s;
  };
  const out = new Map();
  for (const [k, p] of players) {
    const played = [...p.weeks.entries()].filter(([, w]) => w.off + w.def + w.st > 0);
    const gp = played.filter(([, w]) => (isOffense(p.group) ? w.off : p.group === "ST" ? w.st : w.def) > 0);
    const games = gp.length;
    if (!games) continue;
    const pcts = gp.map(([, w]) => (isOffense(p.group) ? w.offPct : p.group === "ST" ? 1 : w.defPct));
    const usage = pcts.reduce((a, b) => a + b, 0) / pcts.length;
    const rows = gp.map(([w]) => p.stat.get(w)).filter(Boolean);
    const prod = rows.length ? prodOf(p, rows) / games : null;
    let share = null;
    if (p.group === "QB" || p.group === "RB" || p.group === "WR" || p.group === "TE") {
      const mine = rows.reduce((a, r) => a + (p.group === "QB" ? num(r.passing_yards) + num(r.rushing_yards) : num(r.rushing_yards) + num(r.receiving_yards)), 0);
      const team = gp.reduce((a, [w, x]) => a + (teamYards.get(`${x.team}|${w}`) ?? 0), 0);
      share = team > 0 ? mine / team : null;
    }
    out.set(k, { name: p.name, group: p.group, team: p.team, games, usage, prod, share, weeks: new Set(gp.map(([w]) => w)), teamOf: Object.fromEntries(gp.map(([w, x]) => [w, x.team])) });
  }
  return out;
}

const peersOf = (season, group) => [...season.values()].filter((p) => p.group === group && p.games >= 3 && p.prod != null).map((p) => p.prod);
const METRIC = { QB: "EPA per game", RB: "EPA per game", WR: "EPA per game", TE: "EPA per game", DL: "tackles, sacks and takeaways per game", LB: "tackles, sacks and takeaways per game", DB: "tackles, sacks and takeaways per game", ST: "field goals per game" };
const PLURAL = { QB: "QBs", RB: "RBs", WR: "WRs", TE: "TEs", OL: "linemen", DL: "defensive linemen", LB: "linebackers", DB: "defensive backs", ST: "specialists" };

function impactFor(key, seasons, split) {
  const { cur, prev } = seasons;
  const c = cur.get(key), p = prev.get(key);
  let pick = null;
  if (c && c.games >= 3) pick = { s: c, year: seasons.year, peers: cur };
  else if (p && p.games >= 4) pick = { s: p, year: seasons.year - 1, peers: prev, fallback: true, thisYear: c?.games ?? 0 };
  else if (c) pick = { s: c, year: seasons.year, peers: cur, thin: true };
  else if (p) pick = { s: p, year: seasons.year - 1, peers: prev, fallback: true, thin: true, thisYear: 0 };
  if (!pick) return { score: null, tier: "Unknown", basis: "No prior NFL games found", reason: "No snaps or stats in this or last season (a rookie or a player new to the league)." };
  const { s } = pick;
  const rank = s.prod == null || s.group === "OL" ? null : percentile(peersOf(pick.peers, s.group), s.prod);
  const score = impactScore({ group: s.group, usage: s.usage, prod: rank });
  const bits = [`${Math.round(s.usage * 100)}% of ${isOffense(s.group) ? "offensive" : s.group === "ST" ? "special-teams" : "defensive"} snaps`];
  if (s.share != null && s.share > 0.02) bits.push(`${Math.round(s.share * 100)}% of the team's yards`);
  if (rank != null) bits.push(`${rank >= 0.5 ? `top ${topPct(rank)}%` : `bottom ${Math.max(1, Math.round(rank * 100))}%`} of ${PLURAL[s.group]} in ${METRIC[s.group]}`);
  else if (s.group === "OL") bits.push("lines have no individual stats, so snaps decide it");
  const basis = pick.fallback ? `${pick.year} season, ${s.games} games${pick.thisYear ? ` (only ${pick.thisYear} this season)` : " (no games this season yet)"}` : `${pick.year} season, ${s.games} game${s.games === 1 ? "" : "s"}${pick.thin ? " (small sample)" : ""}`;
  const out = { score, tier: impactTier(score), basis, reason: `${bits.join("; ")}.`, usage: r1(s.usage * 100) };
  if (s.share != null) out.share = r1(s.share * 100);
  if (rank != null) out.rank = r1(rank * 100);
  if (split && !pick.fallback) out.split = split;
  return out;
}

/** The team's scoring in this season's games with him and without him (only when each side has at least two games). */
function withWithout(player, teamGames, abbr) {
  if (!player || !teamGames.length) return null;
  const mine = teamGames.filter((g) => g.team === abbr);
  const withHim = mine.filter((g) => player.weeks.has(g.week)), without = mine.filter((g) => !player.weeks.has(g.week) && g.week > Math.min(...player.weeks));
  if (withHim.length < 2 || without.length < 2) return null;
  const avg = (a, f) => r1(a.reduce((s, g) => s + g[f], 0) / a.length);
  return { with: { n: withHim.length, pf: avg(withHim, "pf"), pa: avg(withHim, "pa") }, without: { n: without.length, pf: avg(without, "pf"), pa: avg(without, "pa") } };
}

async function buildNfl(nfl) {
  const feed = await getJson(ESPN);
  if (!feed?.injuries?.length) throw new Error("ESPN injuries feed unavailable");
  const season = nfl.season;
  const cur = await loadSeason(season), prev = await loadSeason(season - 1).catch(() => new Map());
  const teams = Object.fromEntries(Object.entries(nfl.teams).map(([a, t]) => [t.name, a]));
  const reg = nfl.games.filter((g) => g.type === "REG");
  const maxWeek = reg.reduce((m, g) => Math.max(m, g.week), 0);
  const weeksLeft = Math.max(1, maxWeek - nfl.lastPlayedWeek);
  const teamGames = reg.filter((g) => g.aS != null && g.hS != null).flatMap((g) => [{ team: g.home, week: g.week, pf: g.hS, pa: g.aS }, { team: g.away, week: g.week, pf: g.aS, pa: g.hS }]);
  const today = new Date().toISOString().slice(0, 10);
  const nextOf = (abbr) => {
    const g = reg.filter((x) => x.aS == null && (x.home === abbr || x.away === abbr) && x.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
    return g ? { opp: g.home === abbr ? g.away : g.home, home: g.home === abbr, date: g.date, week: g.week } : null;
  };
  const players = [];
  const seasons = { cur, prev, year: season };
  for (const t of feed.injuries) {
    const abbr = teams[t.displayName];
    if (!abbr) continue;
    for (const i of t.injuries ?? []) {
      const a = i.athlete ?? {};
      const status = i.status;
      if (!SHOWN.has(status) || !a.displayName) continue;
      const d = i.details ?? {};
      const note = [i.shortComment, i.longComment].filter(Boolean).join(" ");
      const group = groupOf(a.position?.abbreviation);
      const ret = returnInfo({ status, returnDate: d.returnDate, type: d.type, detail: d.detail, note, weeksLeft });
      const key = nameKey(a.displayName);
      const impact = impactFor(key, seasons, withWithout(cur.get(key), teamGames, abbr));
      players.push({
        id: String(a.id ?? i.id),
        name: a.displayName,
        pos: a.position?.abbreviation ?? null,
        group,
        team: abbr,
        teamName: nfl.teams[abbr].name,
        jersey: a.jersey ?? null,
        headshot: a.headshot?.href ?? null,
        status,
        reported: i.date ?? null,
        injury: { type: d.type ?? null, location: d.location && d.location !== d.type ? d.location : null, side: d.side && d.side !== "Not Specified" ? d.side : null, detail: d.detail && d.detail !== "Not Specified" ? d.detail : null },
        ret: { label: ret.label, date: ret.date, weeks: ret.weeks, source: ret.source, season: ret.season },
        severity: severityOf({ status, ret }),
        impact,
        note: i.shortComment ? String(i.shortComment).slice(0, 220) : null,
        next: nextOf(abbr),
      });
    }
  }
  console.log(`NFL: ${players.length} injured players; impact from ${season} for ${players.filter((p) => p.impact.basis.startsWith(String(season))).length}, from ${season - 1} for ${players.filter((p) => p.impact.basis.startsWith(String(season - 1))).length}, unknown for ${players.filter((p) => p.impact.score == null).length}.`);
  return { asOf: feed.timestamp ?? new Date().toISOString(), season, weeksLeft, players };
}

// ---------- college: this week's availability from the board ----------
const CFB_STATUS = { "Out for season": 0, Out: 1, Doubtful: 2, Questionable: 3, Probable: 4 };
function buildCfb() {
  const slate = readJson("src/data/slate.json");
  const tp = existsSync(new URL("src/data/team-players.json", root)) ? readJson("src/data/team-players.json").cfb ?? {} : {};
  const seen = new Set();
  const players = [];
  const initial = (n) => { const w = String(n).replace(/[.'’]/g, "").split(/\s+/); return `${(w[0] ?? "")[0] ?? ""}${nameKey(w.slice(1).join(" "))}`; };
  for (const g of slate.games.filter((x) => x.league === "CFB")) {
    for (const t of g.teams) {
      const lead = tp[t.espnId];
      const total = lead ? [...(lead.rush ?? []), ...(lead.rec ?? [])].reduce((a, r) => a + (r[1] || 0), 0) : 0;
      for (const i of t.injuries ?? []) {
        const k = `${t.espnId}|${i.name}`;
        if (seen.has(k) || !(i.status in CFB_STATUS)) continue;
        seen.add(k);
        const ret = i.status === "Out for season" ? { label: "Out for the season", date: null, weeks: [12, 12], source: "reported", season: true }
          : i.status === "Out" ? { label: "Out for this game; return not disclosed", date: null, weeks: [1, 1], source: "estimate", season: false }
          : { label: "Game-time decision", date: null, weeks: [0, 1], source: "estimate", season: false };
        let impact = { score: null, tier: "Unknown", basis: "College player stats cover only team leaders", reason: "Not among the team's rushing, receiving or passing leaders, so there is no usage to measure." };
        if (lead) {
          const me = initial(i.name);
          const yds = [...(lead.rush ?? []), ...(lead.rec ?? [])].filter((r) => initial(r[0].replace(/^(\w)\.\s*/, "$1 ")) === me || nameKey(r[0]) === nameKey(i.name)).reduce((a, r) => a + (r[1] || 0), 0);
          const qb = (lead.qbs ?? []).find((q) => initial(q[0].replace(/^(\w)\.\s*/, "$1 ")) === me);
          if (qb && qb === lead.qbs[0]) impact = { score: 90, tier: "High", basis: `${slate.season ?? "this"} season, team leaders`, reason: `The team's main quarterback (${qb[1]} games this season).` };
          else if (yds > 0 && total > 0) {
            const share = yds / total, score = Math.min(100, Math.round(share * 260));
            impact = { score, tier: impactTier(score), basis: "this season, team leaders", reason: `${Math.round(share * 100)}% of the team's leading rushing and receiving yards (${yds}).`, share: r1(share * 100) };
          }
        }
        // A season-long absence of a player with no stats to size it is not worth a row: it would bury the ones that matter.
        if (i.status === "Out for season" && impact.score == null) continue;
        if (i.status === "Probable") continue;
        players.push({ id: k, name: i.name, pos: i.pos, group: groupOf(i.pos), team: t.abbr ?? t.name, teamName: t.name, logoId: t.logoId, jersey: i.jersey, headshot: i.headshot, status: i.status, reported: null, injury: { type: i.type, location: null, side: null, detail: i.detail }, ret, severity: i.status === "Out for season" ? "Season-ending" : i.status === "Out" ? "Short-term" : "Game-time", impact, note: null, next: { opp: (g.teams.find((x) => x !== t)?.abbr) ?? null, home: g.teams[1] === t, date: String(g.date).slice(0, 10), week: null } });
      }
    }
  }
  console.log(`College: ${players.length} players listed for this week's games.`);
  return { asOf: new Date().toISOString(), players };
}

async function main() {
  const saved = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : null;
  const nfl = readJson("src/data/nfl.json");
  const out = { version: 1, updatedAt: new Date().toISOString(), nfl: saved?.nfl ?? null, cfb: saved?.cfb ?? null };
  try { out.nfl = await buildNfl(nfl); } catch (e) { console.warn(`NFL injuries kept as saved: ${e.message}`); }
  try { out.cfb = buildCfb(); } catch (e) { console.warn(`College injuries kept as saved: ${e.message}`); }
  if (!out.nfl && !out.cfb) { console.warn("No injury data."); return; }
  const tmp = new URL("src/data/injuries.json.tmp", root);
  writeFileSync(tmp, JSON.stringify(out));
  renameSync(tmp, OUT);
}
main().catch((e) => { console.warn(`injuries: ${e.message}; keeping the saved file`); });
