import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { onRequestGet as scoresHandler } from "../functions/api/scores.js";

const slate = JSON.parse(readFileSync("src/data/slate.json", "utf8"));

/** Run the scores function against a stand-in ESPN and report the Cache-Control it answers with. */
async function scoresCacheControl(events: { id: string; date: string; state: string }[]) {
  const g = globalThis as unknown as { caches: unknown; fetch: typeof fetch };
  const realFetch = g.fetch;
  g.caches = { default: { match: async () => undefined, put: async () => {} } };
  g.fetch = (async () =>
    new Response(JSON.stringify({ events: events.map((e) => ({ id: e.id, date: e.date, competitions: [{ status: { type: { state: e.state, shortDetail: "x" } }, competitors: [{ homeAway: "home", id: "1", score: "3" }, { homeAway: "away", id: "2", score: "7" }] }] })) }), { headers: { "content-type": "application/json" } })) as typeof fetch;
  try {
    const res = await scoresHandler({ request: new Request("https://x/api/scores?league=cfb&date=20261017") });
    return res.headers.get("cache-control");
  } finally {
    g.fetch = realFetch;
  }
}

test("the scores feed is kept for seconds, not minutes, when a game is on or about to start, and browsers never hold their own copy", async () => {
  const soon = new Date(Date.now() + 5 * 60e3).toISOString();
  const later = new Date(Date.now() + 6 * 3600e3).toISOString();
  expect(await scoresCacheControl([{ id: "1", date: later, state: "in" }])).toBe("public, max-age=0, s-maxage=10"); // a touchdown shows within about ten seconds
  expect(await scoresCacheControl([{ id: "1", date: soon, state: "pre" }])).toBe("public, max-age=0, s-maxage=15"); // so a kickoff is not stuck behind a "not started" copy
  expect(await scoresCacheControl([{ id: "1", date: new Date(Date.now() - 60e3).toISOString(), state: "pre" }])).toBe("public, max-age=0, s-maxage=15"); // kickoff has passed, the feed has not caught up
  expect(await scoresCacheControl([{ id: "1", date: later, state: "pre" }])).toBe("public, max-age=0, s-maxage=120");
});

test("while a game is live the board asks for scores every 15 seconds, and a score the game summary saw first shows at once", async ({ page }) => {
  const g = slate.games.find((x: any) => x.league === "NFL");
  const [a, h] = g.teams;
  await page.clock.install({ time: new Date(g.date).getTime() + 90 * 60e3 });
  let asked = 0;
  await page.route("**/api/scores**", (r) => {
    asked++;
    return r.fulfill({ json: slate.games.map((x: any) => ({ id: x.espnId, state: x.espnId === g.espnId ? "in" : "pre", detail: "5:12 - 3rd", away: 14, home: 17 })) });
  });
  await page.route("**/api/flow**", (r) => r.fulfill({ json: { wp: [] } }));
  // The game summary is ahead of the scoreboard: the away team has already scored.
  await page.route("**/api/game**", (r) => r.fulfill({ json: { id: g.espnId, status: { state: "in", detail: "4:50 - 3rd", period: 3, clock: "4:50" },
    teams: [{ id: a.espnId, abbr: a.abbr, name: a.name, homeAway: "away", score: 21, linescores: [], possession: false }, { id: h.espnId, abbr: h.abbr, name: h.name, homeAway: "home", score: 17, linescores: [], possession: true }],
    situation: { text: "1st & 10", possession: h.espnId, toGo: 60, redZone: false, lastPlay: "x" }, drives: [], curPlays: [], plays: [], wp: [], allOffense: [], scoring: [], teamStats: {}, players: {} } }));
  await page.goto("/?league=NFL");
  await expect.poll(() => asked).toBeGreaterThan(0);
  const first = asked;
  await page.clock.runFor(31_000);
  expect(asked - first).toBeGreaterThanOrEqual(2); // 15-second cadence, not the old minute
  // The card's own live field fetches the summary; its 21 reaches the score without waiting for the scoreboard.
  const card = page.locator(".board-section .game-card", { hasText: a.name }).first();
  await expect(card.locator(".team-score").first()).toHaveText("21");
});
