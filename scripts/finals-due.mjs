// Prints "due=yes" when a game on the live board has probably just ended
// (kicked off at least 3 hours ago) and isn't archived yet, so the hourly check in
// refresh.yml only rebuilds when there's a final to pick up.
// Keep retrying overdue games after a failed refresh; a nine-hour cutoff
// would silently abandon them until the next daily refresh.
import { existsSync, readFileSync } from "node:fs";
import { LEAGUES, SITE, etYmd, getJson, parseFinal } from "./finals-lib.mjs";
const src = (n) => JSON.parse(readFileSync(new URL(`../src/data/${n}`, import.meta.url), "utf8"));
const archived = new Set(src("results.json").games.map((r) => r.espnId));
const now = Date.now();
const due = src("slate.json").games.filter((g) => {
  const t = Date.parse(g.date);
  return !archived.has(g.espnId) && now - t >= 3 * 3600e3;
});
// College conference games post a game-day availability report about two
// hours before kickoff (90 minutes in the Big 12): rebuild once, 45–105
// minutes out, so the card shows it.
const gameDay = src("slate.json").games.filter((g) => {
  const t = Date.parse(g.date);
  return g.availability && t - now >= 45 * 60e3 && t - now <= 105 * 60e3;
});
// Any game that ESPN shows as final since the last refresh: the CFB SP+ and NFL+ trackers cover every FBS and NFL game, not just
// the ones on the board, so a final anywhere in either league is worth a rebuild. (FINALS_DUE_ESPN=off skips the check.)
const finalsFile = new URL("../src/data/finals.json", import.meta.url);
const known = new Set((existsSync(finalsFile) ? JSON.parse(readFileSync(finalsFile, "utf8")).games : []).map((g) => `${g.l}:${g.id}`));
const newFinals = [];
if (process.env.FINALS_DUE_ESPN !== "off") {
  for (const [league, L] of Object.entries(LEAGUES)) {
    for (const back of [0, 1]) {
      const body = await getJson(`${SITE}/${L.path}/scoreboard?dates=${etYmd(new Date(Date.now() - back * 864e5))}${L.extra}`, { attempts: 1, timeoutMs: 6000 });
      for (const e of body?.events ?? []) {
        const g = parseFinal(league, e);
        if (g && !known.has(`${g.l}:${g.id}`)) newFinals.push(`${g.a.n} ${g.a.s}, ${g.h.n} ${g.h.s}`);
      }
    }
  }
}
console.log(`due=${due.length || gameDay.length || newFinals.length ? "yes" : "no"}`);
if (newFinals.length) console.error(`New finals not in finals.json: ${newFinals.slice(0, 12).join("; ")}${newFinals.length > 12 ? ` and ${newFinals.length - 12} more` : ""}`);
console.error(due.map((g) => g.matchup).join("\n") || "No games waiting on a final.");
if (gameDay.length) console.error(`Game-day availability reports: ${gameDay.map((g) => g.matchup).join(", ")}`);
