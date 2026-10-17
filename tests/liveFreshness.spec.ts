import { expect, test } from "./fixtures";
import { readFileSync } from "node:fs";
import { onRequestGet as scoresHandler } from "../functions/api/scores.js";
import { onRequestGet as liveHandler } from "../functions/api/live.js";

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

test("/api/live is an event stream that sends the scores as they change, and /api/scores honours fresh= by refetching a copy that is too old", async () => {
  const g = globalThis as unknown as { caches: unknown; fetch: typeof fetch };
  const realFetch = g.fetch;
  const store = new Map<string, Response>();
  g.caches = { default: { match: async (k: Request) => store.get(k.url)?.clone(), put: async (k: Request, r: Response) => void store.set(k.url, r) } };
  let away = 7, asked = 0;
  g.fetch = (async () => {
    asked++;
    return new Response(JSON.stringify({ events: [{ id: "9", date: new Date().toISOString(), competitions: [{ status: { type: { state: "in", shortDetail: "5:12 - 3rd" } }, competitors: [{ homeAway: "home", id: "1", score: "3" }, { homeAway: "away", id: "2", score: String(away) }] }] }] }), { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const res = await liveHandler({ request: new Request("https://x/api/live?league=cfb&date=20261017") } as never);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let text = "";
    const read = async () => { text += dec.decode((await reader.read()).value); };
    await read(); // retry:
    await read(); // the first scores
    expect(text).toContain("event: scores");
    expect(text).toContain('"away":7');
    expect(asked).toBe(1);
    // a touchdown: the next look (a copy older than 4 seconds is refetched) sends it
    away = 14;
    for (const k of store.keys()) store.set(k, new Response(await store.get(k)!.text(), { headers: { "content-type": "application/json", "x-fetched": String(Date.now() - 6000) } }));
    await read();
    await read();
    expect(text).toContain('"away":14');
    await reader.cancel();
  } finally {
    g.fetch = realFetch;
  }
});

test("a score pushed on the event stream reaches the board at once, ahead of the next poll", async ({ page }) => {
  const g = slate.games.find((x: any) => x.league === "NFL");
  const [a] = g.teams;
  await page.clock.install({ time: new Date(g.date).getTime() + 90 * 60e3 });
  const board = (away: number) => slate.games.map((x: any) => ({ id: x.espnId, state: x.espnId === g.espnId ? "in" : "pre", detail: "5:12 - 3rd", away, home: 17, ball: null }));
  await page.route("**/api/scores**", (r) => r.fulfill({ json: board(14) }));
  await page.route("**/api/flow**", (r) => r.fulfill({ json: { wp: [] } }));
  await page.route("**/api/live?**", (r) => r.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body: `retry: 60000\n\nevent: scores\ndata: ${JSON.stringify(board(21))}\n\n` }));
  await page.goto("/?league=NFL");
  const card = page.locator(".board-section .game-card", { hasText: a.name }).first();
  await expect(card.locator(".team-score").first()).toHaveText("21"); // the poll says 14, the stream says 21
});

test("the header says how fresh the live scores are, and the Game Center shows whichever of the scoreboard and the summary has more points", async ({ page }) => {
  const g = slate.games.find((x: any) => x.league === "NFL");
  const [a, h] = g.teams;
  await page.clock.install({ time: new Date(g.date).getTime() + 90 * 60e3 });
  // The scoreboard has the touchdown (21); the summary, which runs 10 to 20 seconds behind it, still says 14.
  await page.route("**/api/scores**", (r) => r.fulfill({ json: slate.games.map((x: any) => ({ id: x.espnId, state: x.espnId === g.espnId ? "in" : "pre", detail: "5:12 - 3rd", away: 21, home: 17, ball: null })) }));
  await page.route("**/api/flow**", (r) => r.fulfill({ json: { wp: [] } }));
  await page.route("**/api/game**", (r) => r.fulfill({ json: { id: g.espnId, status: { state: "in", detail: "5:30 - 3rd", period: 3, clock: "5:30" },
    teams: [{ id: a.espnId, abbr: a.abbr, name: a.name, homeAway: "away", score: 14, linescores: [], possession: false }, { id: h.espnId, abbr: h.abbr, name: h.name, homeAway: "home", score: 17, linescores: [], possession: true }],
    situation: { text: "1st & 10", possession: h.espnId, toGo: 60, redZone: false, lastPlay: "x" }, drives: [], curPlays: [], plays: [], wp: [], allOffense: [], scoring: [], teamStats: {}, players: {} } }));
  await page.goto("/?league=NFL");
  await expect(page.locator(".live-fresh")).toContainText("live ·");
  await page.clock.runFor(20_000);
  await expect(page.locator(".live-fresh")).toContainText(/\d+s ago|just now/);
  await page.clock.resume();
  await page.locator(".board-section .game-card", { hasText: a.name }).first().locator(".cc-gc").click();
  await expect(page.locator("dialog.gc .gc-head")).toContainText("21");
});
