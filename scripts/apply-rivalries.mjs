// Adds the rivalry to the games already in src/data/slate.json (the rivalry score part, its watch line, and the rivalry/trophy field the cards read),
// the same way build-slate.mjs and write-narratives.mjs do for a fresh week. Safe to run again: a game that already has the part is left as it is.
//   node scripts/apply-rivalries.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { rivalryFor, rivalryLine, rivalryNote, rivalryPoints, RIVALRY_MAX, seriesOf } from "./rivalry.mjs";
import { tierFor } from "./score.mjs";

const root = new URL("../", import.meta.url);
const SLATE = new URL("src/data/slate.json", root);
const slate = JSON.parse(readFileSync(SLATE, "utf8"));
const nfl = JSON.parse(readFileSync(new URL("src/data/nfl.json", root), "utf8"));

let added = 0;
for (const g of slate.games) {
  const [a, h] = g.teams;
  const series = seriesOf(g.history, [a.name, h.name]);
  const sameGroup = g.league === "NFL" ? !!nfl.teams[a.abbr]?.div && nfl.teams[a.abbr].div === nfl.teams[h.abbr]?.div : !!a.ranks?.confName && a.ranks.confName === h.ranks?.confName;
  const r = rivalryFor({ league: g.league, ids: [a.logoId, h.logoId], sameGroup, series });
  if (!r) { delete g.rivalry; continue; }
  g.rivalry = r;
  if (g.breakdown.parts.some((p) => p.id === "rivalry")) continue;
  const pts = rivalryPoints(r);
  g.breakdown.parts.push({ id: "rivalry", label: "Rivalry", max: RIVALRY_MAX, pts, note: rivalryNote(r, series) });
  g.score = Math.min(100, Math.round(g.score + pts));
  g.tier = tierFor(g.score)[0];
  const line = rivalryLine(r, series);
  if (!g.watch.includes(line)) g.watch = [line, ...g.watch].slice(0, 3);
  added++;
}
writeFileSync(SLATE, JSON.stringify(slate, null, 2) + "\n");
console.log(`Rivalry added to ${added} games (${slate.games.filter((g) => g.rivalry).length} of ${slate.games.length} are rivalries).`);
