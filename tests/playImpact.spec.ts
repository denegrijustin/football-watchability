import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { attributePlays, impact, W, type ImpactEvent, type PlayerRow } from "../src/playImpact";

const fixture = JSON.parse(readFileSync("tests/fixtures/game-nfl-log.json", "utf8"));
const players: PlayerRow[] = Object.values(fixture.players).flat() as PlayerRow[];
const byName = (n: string) => players.find((p) => p.name === n)!;
const events = (name: string) => {
  const p = byName(name);
  return attributePlays(p, fixture, impact(p).value)!.events;
};
const pointsOf = (evs: ImpactEvent[], art: string) => evs.filter((e) => e.art === art).map((e) => e.points);

test("impact weights score a stat line the same way the card always has", () => {
  const qb: PlayerRow = {
    id: "1", name: "Test QB", short: "T. QB", jersey: "1", headshot: null,
    passing: { cmp: 20, att: 30, yds: 300, td: 2, int: 1, sacks: 0, qbr: null },
  };
  // 300 yds * .04 + 2 TD * 4 - 1 INT * 4.5 - 10 incompletions * .15 = 14
  expect(impact(qb).value).toBe(14);
  const kicker: PlayerRow = { id: "2", name: "Test K", short: "T. K", jersey: "2", headshot: null, kicking: { fgm: 2, fga: 3, xpm: 3, xpa: 4, long: 40 } };
  // 2 * 2 - 1 * 3 - 1 * 1.5 = -0.5
  expect(impact(kicker).value).toBe(-0.5);
  expect(W.fumbleLost).toBe(-4);
});

test("the plays behind every player's number add up to that number", () => {
  for (const p of players) {
    const v = impact(p).value;
    const r = attributePlays(p, fixture, v)!;
    const sum = r.events.reduce((a, e) => a + e.points, 0);
    expect(Math.abs(sum + r.other - v), `${p.name}: ${sum} + ${r.other} vs ${v}`).toBeLessThan(0.011);
  }
});

test("no play log means no play list", () => {
  const p = byName("Josh Allen");
  expect(attributePlays(p, { ...fixture, log: undefined }, 1)).toBeNull();
  expect(attributePlays(p, { ...fixture, log: [] }, 1)).toBeNull();
});

test("real ESPN play text is credited to the right players", () => {
  // Rushing touchdown: 1 yard * .1 + 6.
  const allen = events("Josh Allen");
  expect(allen.find((e) => e.art === "td")).toMatchObject({ role: "rushing touchdown", points: 6.1, yards: 1 });
  // Sacked: the quarterback loses 0.7, split sacks give each rusher half of a sack.
  expect(pointsOf(allen, "sack")).toEqual([W.sacked]);
  expect(pointsOf(events("Tuli Tuipulotu"), "sack")).toEqual([W.sack / 2]);
  expect(pointsOf(events("Nick Barrett"), "sack")).toEqual([W.sack / 2]);
  expect(pointsOf(events("Greg Rousseau"), "sack")).toEqual([W.sack]);
  // The adjustment for 8+ carries under 3.0 a carry is its own line, not a play.
  expect(allen.find((e) => e.art === "adjust")).toMatchObject({ id: "adjust", points: W.slowRush });
  // A completion credits passer (yards) and receiver (catch + yards); defenders in parentheses get a tackle.
  const comp = (n: string) => events(n).find((e) => e.text.includes("pass short left to D.Moore"));
  expect(comp("Josh Allen")).toMatchObject({ art: "pass", role: "completion", yards: 16, points: 0.64 });
  expect(comp("DJ Moore")).toMatchObject({ art: "pass", role: "catch", yards: 16, points: 2.1 });
  expect(events("Rodney Shelley").find((e) => e.text.includes("D.Moore pushed ob"))).toMatchObject({ art: "tackle", points: W.tackle });
  // A suffix and middle initials don't hide a player: "C.Gardner-Johnson" is C.J. Gardner-Johnson.
  expect(pointsOf(events("C.J. Gardner-Johnson"), "tackle").length).toBeGreaterThan(0);
  // Field goals credit the kicker.
  expect(events("Cameron Dicker").find((e) => e.art === "fg")).toMatchObject({ points: W.fgMade, yards: 33 });
  // Interception: passer and the intended target lose, the defender gains.
  const pickPass = (n: string) => events(n).filter((e) => e.text.includes("INTERCEPTED by G.Smith"));
  expect(pickPass("Josh Allen").map((e) => e.points).sort()).toEqual([W.passInt, W.incomplete].sort());
  expect(pickPass("Keon Coleman").map((e) => e.points)).toEqual([W.targetMiss]);
  expect(pickPass("Genesis Smith")).toMatchObject([{ art: "int", points: W.int }]);
  // A fumble the other team recovers costs the ball carrier 4, and only him.
  const fum = events("James Cook III").find((e) => e.art === "fumble");
  expect(fum).toMatchObject({ points: W.fumbleLost });
  expect(events("Troy Dye").some((e) => e.art === "fumble")).toBe(false);
  // Missed field goal, pass breakup, tackle for loss, and a safety.
  expect(events("Tyler Bass").find((e) => e.art === "fgMiss")).toMatchObject({ points: W.fgMiss, yards: 52 });
  expect(events("Derwin James Jr.").find((e) => e.art === "pd")).toMatchObject({ points: W.pd });
  expect(events("Tuli Tuipulotu").find((e) => e.art === "tfl")).toMatchObject({ points: W.tfl, yards: -2 });
  expect(events("Khalil Mack").find((e) => e.art === "safety")).toMatchObject({ points: W.sack });
  expect(events("Josh Allen").find((e) => e.art === "safety")).toMatchObject({ points: W.sacked });
});

test("plays come back in game order with period and clock", () => {
  const cook = events("James Cook III").filter((e) => e.id !== "adjust");
  expect(cook.every((e) => e.period != null && e.clock)).toBe(true);
  expect(cook[0].id).toBe("s3"); // the fumble, earliest in the log
});

test("the trimmed game keeps every play that can credit a player, not just the last 40", async () => {
  const { trimGame } = await import("../src/gameTrim.js");
  const play = (i: number, type: string, text: string, team = "1") => ({
    id: `p${i}`,
    type: { text: type },
    text,
    period: { number: 1 + Math.floor(i / 20) },
    clock: { displayValue: "10:00" },
    statYardage: 3,
    start: { team: { id: team }, yardsToEndzone: 60 },
    end: { team: { id: team }, yardsToEndzone: 57 },
    scoringPlay: false,
    isTurnover: false,
  });
  const rush = Array.from({ length: 70 }, (_, i) => play(i, "Rush", `J.Cook up the middle to BUF ${i} for 3 yards (T.Dye).`));
  const noise = [
    play(100, "Timeout", "Timeout #1 by LAC at 03:30."),
    play(101, "Kickoff", "T.Bass kicks 62 yards from BUF 35 to LAC 3."),
    play(102, "Punt", "S.Martin punts 45 yards."),
    play(103, "Penalty", "J.Allen scrambles to LAC 4 for 16 yards.PENALTY on BUF-D.Dawkins, Offensive Holding, 10 yards"),
    play(104, "Field Goal Good", "C.Dicker 33 yard field goal is GOOD, Center-J.Harris, Holder-J.Scott.", "24"),
  ];
  const summary = {
    header: { id: "1", competitions: [{ competitors: [{ team: { id: "1", abbreviation: "BUF" }, homeAway: "home", score: "10" }, { team: { id: "24", abbreviation: "LAC" }, homeAway: "away", score: "3" }], status: { type: { state: "post" } } }] },
    drives: { previous: [{ id: "d1", team: { id: "1" }, plays: [...rush, ...noise] }] },
  };
  const game = trimGame(summary) as { plays: unknown[]; log: { id: string; text: string; team: string }[] };
  expect(game.plays).toHaveLength(40); // the live feed's recent plays are unchanged
  expect(game.log).toHaveLength(71); // all 70 rushes and the field goal, nothing else
  expect(game.log.map((p) => p.id)).not.toContain("p100"); // timeout
  expect(game.log.map((p) => p.id)).not.toContain("p101"); // kickoff
  expect(game.log.map((p) => p.id)).not.toContain("p102"); // punt
  expect(game.log.map((p) => p.id)).not.toContain("p103"); // penalty-only play
  expect(game.log.at(-1)).toMatchObject({ id: "p104", team: "24" });
  expect(Object.keys(game.log[0]).sort()).toEqual(["clock", "id", "kind", "period", "score", "team", "text", "turnover", "yards"]);
});
