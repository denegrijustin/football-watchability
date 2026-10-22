// Cross-checks scripts/perf/cfb-parse.mjs against ESPN's own totals for sampled games, so a parsing regression shows up as a number.
//   node scripts/perf/validate-cfb.mjs [--n 10] [--seed 1] [--dir path/to/cached/summaries] [--all]
// With --dir it reads <id>.json summaries from that directory (no network); otherwise it fetches the sampled games from ESPN.
// Per team-game it checks (1) points: offensive TD (6-8) + FG (3) + defensive/special-teams/safety points credited to the team == final
// score, and (2) volume against the box score: rushing attempts (ESPN counts sacks and kneel-downs as rushes), pass attempts (ESPN counts
// spikes, not sacks) and fumbles lost. Exit code is 0 either way; the point is the printed rates.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { parseSummary } from "./cfb-parse.mjs";
import { V } from "./lib.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const N = Number(opt("n", 10)), dir = opt("dir", null), all = args.includes("--all");
let seed = Number(opt("seed", 1));
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

const finals = JSON.parse(readFileSync(new URL("../../src/data/finals.json", import.meta.url), "utf8")).games.filter((g) => g.l === "cfb");
let ids = finals.map((g) => g.id);
if (dir) ids = ids.filter((id) => existsSync(`${dir}/${id}.json`));
if (!all) { const pool = [...ids]; ids = []; while (ids.length < N && pool.length) ids.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]); }

async function load(id) {
  if (dir) return JSON.parse(readFileSync(`${dir}/${id}.json`, "utf8"));
  const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary?event=${id}`, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
const stat = (team, name) => team?.statistics?.find((s) => s.name === name)?.displayValue;
const playerTot = (sum, id, cat) => sum.boxscore?.players?.find((p) => String(p.team.id) === id)?.statistics?.find((s) => s.name === cat);

const other = (t, r) => (t === r.home ? r.away : r.home);
const tally = { gameInt: 0, gameIntOk: 0, gameFum: 0, gameFumOk: 0, gameFumClose: 0, teamGames: 0, pts: 0, ptsLoose: 0, rush: 0, pass: 0, lost: 0, fumTot: 0, games: 0, noDrives: 0 };
const bad = { pts: [], rush: [], pass: [], lost: [], fumTot: [], fumGame: [], ints: [] };
for (const id of ids) {
  let sum;
  try { sum = await load(id); } catch (e) { console.log(id, "fetch failed", e.message); continue; }
  const r = parseSummary(sum);
  if (!r) { tally.noDrives++; continue; }
  tally.games++;
  // Fumble totals can only be checked per game: special-teams fumbles (returns) are in ESPN's team totals but not in our scrimmage counts.
  let boxFum = 0, haveFum = true;
  for (const tid of [r.home, r.away]) { const f = playerTot(sum, tid, "fumbles"); if (f) boxFum += Number(f.totals?.[0]); else haveFum = false; }
  if (haveFum) {
    const mine = [r.home, r.away].reduce((n, t) => n + r.diag[t].fumbles, 0) + r.diag.otherFumblePlays;
    tally.gameFum++; if (mine === boxFum) tally.gameFumOk++; if (Math.abs(mine - boxFum) <= 1) tally.gameFumClose++; else bad.fumGame.push(`${id}: scrimmage ${mine - r.diag.otherFumblePlays} + other plays mentioning a fumble ${r.diag.otherFumblePlays} = ${mine} vs box ${boxFum}`);
  }
  const intMine = {}, intBoxBy = {};
  const final = { [r.home]: r.diag.finalHome, [r.away]: r.diag.finalAway };
  for (const tid of [r.home, r.away]) {
    tally.teamGames++;
    const p = r.diag.pts[tid], dg = r.diag[tid];
    const got = p.off + p.def + p.st;
    if (got === final[tid]) tally.pts++; else bad.pts.push(`${id}/${tid}: computed ${got} (off ${p.off} def ${p.def} st ${p.st}) vs final ${final[tid]}`);
    if (got + p.loose === final[tid]) tally.ptsLoose++;
    const box = sum.boxscore?.teams?.find((t) => String(t.team.id) === tid);
    const rushBox = Number(stat(box, "rushingAttempts"));
    const rushMine = dg.rush + dg.sack + dg.kneel;
    if (Number.isFinite(rushBox)) { if (rushBox === rushMine) tally.rush++; else bad.rush.push(`${id}/${tid}: mine ${dg.rush}+${dg.sack} sacks+${dg.kneel} kneels=${rushMine} vs box ${rushBox}`); }
    const att = Number(/\/(\d+)/.exec(stat(box, "completionAttempts") ?? "")?.[1]);
    const passMine = dg.pass - dg.sack + dg.spike;
    if (Number.isFinite(att)) { if (att === passMine) tally.pass++; else bad.pass.push(`${id}/${tid}: mine ${dg.pass - dg.sack}+${dg.spike} spikes=${passMine} vs box ${att}`); }
    const intBox = Number(stat(box, "interceptions"));
    // ESPN's team "interceptions" is thrown by that team in some payloads and caught in others; accept either orientation per game below.
    intMine[tid] = r.teams[tid].c[V.PINT] + r.teams[tid].x[V.PINT]; intBoxBy[tid] = intBox;
    const lostBox = Number(stat(box, "fumblesLost"));
    const lostMine = dg.fumLost + dg.fumLostSt;
    if (Number.isFinite(lostBox)) { if (lostBox === lostMine) tally.lost++; else bad.lost.push(`${id}/${tid}: mine ${dg.fumLost}+${dg.fumLostSt} st=${lostMine} vs box ${lostBox}`); }
  }
  tally.gameInt++;
  const thrown = (t) => intMine[t] === intBoxBy[t], caught = (t) => intMine[t] === intBoxBy[other(t, r)];
  if ([r.home, r.away].every(thrown) || [r.home, r.away].every(caught)) tally.gameIntOk++; else bad.ints.push(`${id}: mine thrown ${JSON.stringify(intMine)} vs box ${JSON.stringify(intBoxBy)}`);
}
const pct = (n) => `${n}/${tally.teamGames} (${((100 * n) / Math.max(1, tally.teamGames)).toFixed(1)}%)`;
console.log(`games parsed ${tally.games} (no drives: ${tally.noDrives}); team-games ${tally.teamGames}`);
console.log(`points reconcile exactly: ${pct(tally.pts)}; counting unexplained score changes too: ${pct(tally.ptsLoose)}`);
console.log(`rushing attempts (+sacks, +kneels) match box: ${pct(tally.rush)}`);
console.log(`pass attempts (-sacks, +spikes) match box: ${pct(tally.pass)}`);
console.log(`fumbles lost (scrimmage + special teams) match box: ${pct(tally.lost)}`);
console.log(`interceptions thrown per game match box (both teams): ${tally.gameIntOk}/${tally.gameInt}`);
console.log(`fumbles total, per game (scrimmage + other plays that mention a fumble) vs box: exact ${tally.gameFumOk}/${tally.gameFum}, within 1: ${tally.gameFumClose}/${tally.gameFum}`);
for (const [k, list] of Object.entries(bad)) if (list.length) console.log(`\nmismatches: ${k} (${list.length})\n  ${list.slice(0, 12).join("\n  ")}`);
