import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
const read = (name) =>
  JSON.parse(
    readFileSync(new URL(`../src/data/${name}.json`, import.meta.url), "utf8"),
  );
const slate = read("slate"),
  logos = read("logos");
const text = (value, label) =>
  assert.equal(
    typeof value === "string" && value.trim().length > 0,
    true,
    `${label}: expected nonempty text`,
  );
assert.equal(slate.schemaVersion, 1, "Unsupported slate schema");
text(slate.period, "period");
text(slate.snapshotDate, "snapshotDate");
text(slate.provenance.note, "provenance");
assert.ok(slate.games.length > 0, "Slate must contain games");
const conferences = new Set(slate.conferences.map((c) => c.id));
assert.equal(
  conferences.size,
  slate.conferences.length,
  "Duplicate conferences",
);
const ids = new Set();
for (const g of slate.games) {
  assert.ok(!ids.has(g.id), `Duplicate game ${g.id}`);
  ids.add(g.id);
  assert.ok(["NFL", "CFB"].includes(g.league));
  assert.ok(
    Number.isFinite(g.score) && g.score >= 0 && g.score <= 100,
    `${g.id}: score`,
  );
  for (const key of [
    "id",
    "matchup",
    "meta",
    "broadcast",
    "narrative",
    "delta",
  ])
    text(g[key], `${g.id}.${key}`);
  assert.ok(["elite", "vgood", "good", "watch", "bg"].includes(g.tier));
  assert.ok(g.chips.length > 0);
  g.chips.forEach((v) => text(v, "chip"));
  assert.ok(Array.isArray(g.narrativeChips));
  for (const key of ["watch", "skip"]) {
    assert.ok(
      Array.isArray(g[key]) && g[key].length > 0,
      `${g.id}: needs at least one "${key}" reason (run node scripts/write-narratives.mjs)`,
    );
    g[key].forEach((v) => text(v, `${g.id}.${key}`));
  }
  for (const key of ["icon", "title", "detail", "impact"])
    text(g.weather[key], `weather.${key}`);
  if (g.league === "CFB")
    assert.ok(g.conferences.length > 0, `${g.id}: missing conference`);
  for (const c of g.conferences)
    assert.ok(conferences.has(c), `Unknown conference ${c}`);
  assert.equal(g.teams.length, 2, `${g.id}: requires two teams`);
  for (const t of g.teams) {
    text(t.name, "team.name");
    text(t.record, "team.record");
    const logo = logos[t.logoId];
    if (typeof logo === "string" && logo.startsWith("/logos/"))
      assert.ok(
        existsSync(new URL(`../public${logo}`, import.meta.url)),
        `Logo file missing for ${t.name}: public${logo}`,
      );
    else
      assert.match(
        logo,
        /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/,
        `Logo missing for ${t.name}`,
      );
    assert.equal(t.rankings.length, 3);
    t.rankings.forEach((v) => text(v, "ranking"));
    assert.equal(t.playoffOdds.length, 3);
    t.playoffOdds.forEach((v) =>
      assert.ok(
        Number.isFinite(v) && v >= 0 && v <= 100,
        `Invalid odds for ${t.name}`,
      ),
    );
  }
  assert.equal(g.history.boxes.length, 3, `${g.id}: history fields`);
  for (const box of g.history.boxes) {
    text(box.label, "history label");
    assert.ok(box.value || box.items.length, `${g.id}: empty history`);
    box.items.forEach((v) => text(v, "history item"));
  }
  text(g.history.source, "history source");
}
console.log(
  `Validated ${slate.games.length} games, ${Object.keys(logos).length} logos and ${conferences.size} filters.`,
);
{
  const seen = new Map();
  for (const g of slate.games)
    for (const line of [g.narrative, ...g.watch, ...g.skip]) {
      assert.ok(!seen.has(line), `Repeated note in ${g.id} and ${seen.get(line)}: ${line}`);
      seen.set(line, g.id);
    }
}
// Finished games: forecast vs actual with a readout and a breakdown.
{
  const results = JSON.parse(readFileSync(new URL("../src/data/results.json", import.meta.url), "utf8"));
  const liveIds = new Set(slate.games.map((g) => g.espnId));
  for (const r of results.games) {
    const id = `${r.matchup} (${r.week})`;
    assert.ok(!liveIds.has(r.espnId), `${id}: listed as both upcoming and final`);
    assert.equal(r.teams.length, 2, `${id}: teams`);
    r.teams.forEach((t) => assert.ok(logos[t.logoId], `${id}: missing logo ${t.logoId}`));
    for (const s of [r.forecast.score, r.actual.score]) assert.ok(s >= 0 && s <= 100, `${id}: score ${s}`);
    assert.equal(r.delta, r.actual.score - r.forecast.score, `${id}: delta`);
    assert.ok(r.actual.parts.length >= 6, `${id}: actual breakdown`);
    const sum = r.actual.base + r.actual.parts.reduce((a, p) => a + p.pts, 0);
    assert.ok(Math.abs(Math.min(100, Math.max(0, sum)) - r.actual.score) <= 1, `${id}: breakdown adds to ${sum}, not ${r.actual.score}`);
    text(r.readout.headline, "readout");
  }
  console.log(`Validated ${results.games.length} finished games.`);
}
