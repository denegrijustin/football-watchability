import { expect, test } from "./fixtures";
import { readFileSync } from "node:fs";
import { allOffers, findTrades, toLeague, tradeValue, tradesForRoster, whyNoTrade, type League, type Player, type TradeData } from "../src/trade/engine";
import { ageFactor, marketShare, pickPoints, rookieApy, STARTERS } from "../scripts/trade/lib.mjs";

const data: TradeData = JSON.parse(readFileSync("src/data/trade-players.json", "utf8"));
const league = toLeague(data);

test("the data holds every club's roster, with a rating, an age and a contract for each player", () => {
  expect(Object.keys(data.teams)).toHaveLength(32);
  expect(league.players.length).toBeGreaterThan(1500);
  expect(new Set(league.players.map((p) => p.id)).size).toBe(league.players.length);
  for (const p of league.players) {
    expect(p.rating, p.name).toBeGreaterThanOrEqual(40);
    expect(p.rating, p.name).toBeLessThanOrEqual(99);
    expect(p.age, p.name).toBeGreaterThanOrEqual(20);
    expect(p.apy, p.name).toBeGreaterThan(0);
    expect(["k", "r", "e", "o"]).toContain(p.src);
  }
  for (const [t, v] of Object.entries(data.teams)) expect(v.n, t).toBeGreaterThan(40);
});

test("the value tables behave: a pick, a market contract and a rookie deal fall with the draft slot or rating, and age lowers value after the prime", () => {
  for (let i = 2; i <= 260; i++) expect(pickPoints(i)).toBeLessThanOrEqual(pickPoints(i - 1));
  expect(pickPoints(1)).toBe(3000);
  for (const g of Object.keys(STARTERS)) for (let r = 61; r <= 99; r++) expect(marketShare(g, r), `${g} ${r}`).toBeGreaterThanOrEqual(marketShare(g, r - 1));
  for (let i = 2; i <= 260; i++) expect(rookieApy(i)).toBeLessThanOrEqual(rookieApy(i - 1) + 1);
  expect(ageFactor("WR", 25)).toBe(1);
  expect(ageFactor("WR", 34)).toBeLessThan(ageFactor("WR", 31));
  expect(ageFactor("QB", 34)).toBe(1); // quarterbacks last longest
});

test("every trade it proposes follows the rules: both caps hold, the partner helps, only the partner's spare or depth players come back", () => {
  const sample = [...league.players].filter((_, i) => i % 7 === 0);
  let proposed = 0;
  for (const p of sample) {
    for (const t of findTrades(league, p)) {
      proposed++;
      expect(t.partner).not.toBe(p.team);
      expect(t.give).toEqual([p]);
      expect(t.from.ok && t.to.ok, `${p.name} to ${t.partner}`).toBe(true);
      expect(t.from.after).toBeGreaterThanOrEqual(0);
      expect(t.to.after).toBeGreaterThanOrEqual(0);
      expect(t.realism).toBeGreaterThanOrEqual(1);
      expect(t.realism).toBeLessThanOrEqual(99);
      expect(t.fairness).toBeGreaterThanOrEqual(0);
      const B = league.byTeam.get(t.partner)!;
      for (const a of t.get) if (a.kind === "player") {
        expect(B.some((x) => x.id === a.p.id), `${a.p.name} is on ${t.partner}`).toBe(true);
        expect(a.p.status).toBe("A");
      }
      // the partner's cap room moves by exactly the salary swap
      const incoming = t.get.reduce((s, a) => s + (a.kind === "player" ? a.p.apy : 0), 0);
      expect(Math.abs(t.to.change - (incoming - p.apy)) < 0.2 && Math.abs(t.from.change - (p.apy - incoming)) < 0.2, "cap change matches the salaries").toBe(true);
    }
  }
  expect(proposed).toBeGreaterThan(100);
});

test("every player on a roster has a trade or a stated reason there is none, and most have a trade", () => {
  let withTrade = 0, total = 0;
  for (const team of ["KC", "GB", "DET", "MIA"]) {
    for (const { player, trades } of tradesForRoster(league, team)) {
      total++;
      if (trades.length) withTrade++;
      else expect(whyNoTrade(league, player).length, player.name).toBeGreaterThan(10);
    }
  }
  expect(withTrade / total).toBeGreaterThan(0.8);
});

test("results are repeatable and ordered, most realistic first", () => {
  const p = league.players.find((x) => x.group === "WR" && x.rating >= 80)!;
  const a = findTrades(league, p), b = findTrades(league, p);
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  for (let i = 1; i < a.length; i++) expect(a[i - 1].realism).toBeGreaterThanOrEqual(a[i].realism);
  expect(a.length).toBeLessThanOrEqual(3);
  expect(new Set(a.map((t) => t.partner)).size).toBe(a.length);
});

function mini(space: Record<string, number>, rows: Partial<Player>[]): League {
  const players: Player[] = rows.map((r, i) => ({ id: String(i), name: `P${i}`, team: "A", group: "WR", age: 26, rating: 70, apy: 5, gtd: 0, years: 3, src: "e", status: "A", rank: 1, measured: true, draft: 0, ...r }) as Player);
  const byTeam = new Map<string, Player[]>();
  for (const p of players) (byTeam.get(p.team) ?? byTeam.set(p.team, []).get(p.team)!).push(p);
  return { cap: 300, space, spaceAssumed: {}, byTeam, players, byId: new Map(players.map((p) => [p.id, p])) };
}

test("a club without cap room cannot take a big salary for a pick, but can if it sends salary back", () => {
  const star = { team: "A", group: "WR", rating: 90, apy: 30, years: 3, rank: 1 };
  const bWeak = [{ team: "B", rating: 60, apy: 2, rank: 1 }, { team: "B", rating: 58, apy: 1, rank: 2 }, { team: "B", rating: 55, apy: 1, rank: 3 }];
  const aDepth = [{ team: "A", rating: 70, apy: 3, rank: 2 }, { team: "A", rating: 68, apy: 3, rank: 3 }, { team: "A", rating: 65, apy: 2, rank: 4 }];
  // B has no room: nothing works with B sending only players that earn little.
  const tight = mini({ A: 20, B: 0 }, [star, ...aDepth, ...bWeak]);
  expect(findTrades(tight, tight.players[0]).every((t) => t.to.after >= 0)).toBe(true);
  // B with room: a pick-only deal is possible.
  const roomy = mini({ A: 20, B: 40 }, [star, ...aDepth, ...bWeak]);
  expect(findTrades(roomy, roomy.players[0]).length).toBeGreaterThan(0);
  // B with no room and a roster of cheap players cannot absorb $30M at all.
  const none = mini({ A: 20, B: 0 }, [star, ...aDepth, ...bWeak]);
  expect(findTrades(none, none.players[0])).toHaveLength(0);
});

test("a club that is already strong at the position does not want the player, and an injured-reserve player is worth much less", () => {
  const star = { team: "A", group: "QB", rating: 80, apy: 10, rank: 1 };
  const strong = mini({ A: 20, B: 20 }, [star, { team: "B", group: "QB", rating: 90, apy: 10, rank: 1 }, { team: "B", group: "QB", rating: 85, apy: 3, rank: 2 }]);
  expect(findTrades(strong, strong.players[0])).toHaveLength(0);
  const hurt = mini({ A: 20, B: 20 }, [{ ...star, status: "R" }, { team: "B", group: "QB", rating: 60, apy: 3, rank: 1 }]);
  const asked = findTrades(hurt, hurt.players[0]);
  expect(asked.length).toBeGreaterThan(0);
  expect(asked[0].warnings.join(" ")).toMatch(/injured reserve/);
  expect(whyNoTrade(hurt, hurt.players[0])).toMatch(/injured reserve/);
  expect(tradeValue({ ...hurt.players[0], status: "A" })).toBeGreaterThan(tradeValue(hurt.players[0]));
});

test("every other club is asked about a player: each answers with a package that respects both caps, or says why not", () => {
  for (const p of league.players.filter((_, i) => i % 40 === 0)) {
    const all = allOffers(league, p);
    expect(all).toHaveLength(31);
    expect(all.some((o) => o.partner === p.team)).toBe(false);
    expect(new Set(all.map((o) => o.partner)).size).toBe(31);
    for (const o of all) {
      if (o.offers.length) {
        expect(o.offers.length).toBeLessThanOrEqual(3);
        for (const t of o.offers) expect(t.from.ok && t.to.ok, `${p.name} to ${o.partner}`).toBe(true);
      } else expect((o.reason ?? "").length, `${p.name} / ${o.partner}`).toBeGreaterThan(10);
    }
  }
});

test("pick a team, then a player, and see what each of the other 31 clubs would send", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-tab="trades"]').evaluate((b) => (b as HTMLElement).click());
  const team = page.getByLabel("Team", { exact: true });
  await expect(team).toBeVisible({ timeout: 20_000 });
  await team.selectOption("GB");
  const player = page.getByLabel("Player", { exact: true });
  const opt = player.locator("option").nth(1);
  await player.selectOption(await opt.getAttribute("value") as string);
  const price = page.locator(".tf-price");
  await expect(price).toBeVisible();
  await expect(price.locator(".tf-ask")).toContainText("of the other 31 clubs");
  const could = await price.locator(".tf-offers").first().locator(".tf-offer").count();
  await page.locator(".tf-cannot summary").click();
  const cannot = await price.locator(".tf-cannot .tf-offer").count();
  expect(could + cannot).toBe(31);
  if (could) {
    await price.locator(".tf-offer-head").first().click();
    await expect(price.locator(".tf-trade").first()).toBeVisible();
    await expect(price.locator(".tf-check a").first()).toHaveAttribute("href", /^https:\/\/overthecap\.com\/salary-cap\/[a-z-]+$/);
    await page.getByRole("group", { name: "Order the clubs" }).getByRole("button").nth(2).click();
  }
  await page.locator(".tf-roster summary").click();
  await expect(page.locator(".tf-row").first()).toBeVisible();
  await page.getByRole("group", { name: "Position" }).getByRole("button", { name: "QB", exact: true }).click();
  expect(await page.locator(".tf-row").count()).toBeLessThan(8);
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(sw).toBeLessThanOrEqual(cw);
});

test("the licensed-data importer reads a contracts export and a cap-room list into the override files' shapes", async () => {
  const { parseCsv, contractsFrom, capFrom, dollars } = await import("../scripts/import-trade-overrides.mjs");
  expect(dollars("$12,500,000")).toBe(12_500_000);
  expect(dollars("12.5M")).toBe(12_500_000);
  const contracts = contractsFrom(parseCsv('Player,Team,Cap Hit,Guaranteed,Years Left\n"Smith, Jr.",KC,"$20,000,000",$35M,3\nNo Money,KC,,,\n'));
  expect(Object.keys(contracts)).toEqual(["smith"]);
  expect(contracts.smith).toEqual({ apy: 20_000_000, gtd: 35_000_000, years: 3 });
  expect(capFrom(parseCsv("Team,Cap Space\nKC,\"$8,400,000\"\nGB,3.2\n"))).toEqual({ KC: 8.4, GB: 3.2 });
});

test("trades lean on draft picks: most best offers include a pick, and a club's list holds at most one player-for-player swap", () => {
  let best = 0, withPick = 0, lists = 0;
  for (const p of league.players.filter((_, i) => i % 9 === 0)) {
    for (const o of allOffers(league, p)) {
      if (!o.offers.length) continue;
      lists++;
      best++;
      if (o.offers[0].get.some((g) => g.kind === "pick")) withPick++;
      expect(o.offers.filter((t) => t.get.every((g) => g.kind === "player")).length, `${p.name} / ${o.partner}`).toBeLessThanOrEqual(1);
    }
  }
  expect(lists).toBeGreaterThan(500);
  expect(withPick / best, "share of best offers that include a pick").toBeGreaterThan(0.8);
});
