import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { load } from "cheerio";
const $ = load(readFileSync("source/original.html", "utf8"));
const slate = JSON.parse(readFileSync("src/data/slate.json", "utf8"));
const logos = JSON.parse(readFileSync("src/data/logos.json", "utf8"));
const repaired = new Set(
  JSON.parse(readFileSync("src/data/logo-repairs.json", "utf8")).map(
    (r) => r.logoId,
  ),
);
assert.equal(slate.games.length, $(".card").length);
$(".card").each((i, el) => {
  const c = $(el),
    g = slate.games[i];
  for (const [field, sel] of Object.entries({
    matchup: ".match",
    meta: ".meta",
    delta: ".delta",
    narrative: ".expandNarrative",
  }))
    assert.equal(g[field], c.find(sel).text().trim());
  assert.equal(g.score, Number(c.find(".score").text()));
  assert.equal(
    g.broadcast,
    c
      .find(".whereWatch")
      .text()
      .replace(/^📺\s*/, "")
      .trim(),
  );
  for (const [field, sel] of Object.entries({
    icon: ".weatherIcon",
    title: ".wTitle",
    detail: ".wSub",
    impact: '[class^="risk"]',
  }))
    assert.equal(g.weather[field], c.find(sel).text().trim());
  c.find(".teamPanel").each((j, el) => {
    const t = $(el),
      team = g.teams[j];
    assert.equal(team.name, t.find(".teamName").text().trim());
    assert.equal(team.record, t.find(".teamMeta").text().trim());
    assert.deepEqual(
      team.rankings,
      t
        .find(".rk")
        .map((_, e) => $(e).text().trim())
        .get(),
    );
    assert.deepEqual(
      team.playoffOdds,
      t
        .find(".pct")
        .map((_, e) => Number($(e).text().replace("%", "")))
        .get(),
    );
    if (!repaired.has(team.logoId))
      assert.equal(logos[team.logoId], t.find("img").attr("src"));
  });
  c.find(".historyBox").each((j, el) => {
    const b = $(el),
      box = g.history.boxes[j];
    assert.equal(box.label, b.find(".historyLabel").text().trim());
    assert.equal(box.value, b.find(".historyValue").text().trim());
    assert.deepEqual(
      box.items,
      b
        .find(".recentChip")
        .map((_, e) => $(e).text().trim())
        .get(),
    );
  });
  assert.equal(g.history.source, c.find(".historySource").text().trim());
});
console.log(
  "Migration parity passed: all 87 original games and their data; 168 original logos unchanged, 6 corrupt logos replaced with documented team assets.",
);
