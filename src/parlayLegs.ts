// Turns the two leagues' picks into parlay legs: the side the ratings like against the spread, and the over or under.
import type { Model } from "./spplus/data/types";
import { atsGames } from "./spplus/data/ats";
import { expectation, normCdf, paramsFor, ratingsFor } from "./spplus/sim";
import { findBoardGame, lineText } from "./livePicks";
import { pendingPicks } from "./nfl/model";
import type { NflData } from "./nfl/types";
import type { Leg } from "./parlay";

type SlateGame = { espnId: string; league: string; date?: string; teams: { name: string; espnId?: string | null }[] };

/** A game that has kicked off can no longer be bet. The board's kickoff time is used when the game is found there, else the date. */
const started = (kickoffIso: string | undefined, dateOnly: string | null | undefined, now: number) =>
  kickoffIso ? Date.parse(kickoffIso) <= now : dateOnly ? Date.parse(`${dateOnly.slice(0, 10)}T23:59:59Z`) < now : false;

const r1 = (n: number) => Math.round(n * 10) / 10;

export function cfbLegs(model: Model, espn: Record<string, string>, games: SlateGame[], now = Date.now()): Leg[] {
  const done = new Set(atsGames(model).map((g) => g.id));
  const out: Leg[] = [];
  for (const p of model.projections) {
    if (p.week !== model.latest || done.has(p.id) || !model.byId.has(`FBS:${p.away}`) || !model.byId.has(`FBS:${p.home}`)) continue;
    const hit = findBoardGame(games, espn, p.away, p.home, p.date);
    const kick = hit?.game.date;
    if (started(kick, p.date, now)) continue;
    const when = kick ?? `${p.date ?? ""} ${p.time ?? ""}`;
    const base = { league: "CFB" as const, gameId: p.id, game: `${p.away} at ${p.home}`, away: p.away, home: p.home, when };
    const par = paramsFor(model, p.week);
    const A = ratingsFor(model, p.away, p.week), B = ratingsFor(model, p.home, p.week);
    if (p.atsPick && p.spreadPts != null && p.spreadDiff != null && A && B) {
      const e = expectation(par, A, B, p.neutral ? "neutral" : "b-home");
      const mu = p.atsPick === p.home ? -e.margin : e.margin;
      const pts = p.spreadPts as number, line = pts === 0 ? 0 : p.spreadTeam === p.atsPick ? pts : -pts;
      out.push({ ...base, id: `${p.id}-s`, kind: "spread", team: p.atsPick, label: `${p.atsPick} ${lineText(line)}`, cover: 1 - normCdf((line - mu) / par.sigmaMargin), edge: r1(p.spreadDiff), line, pickIsHome: p.atsPick === p.home, liveIsHome: hit?.swapped ? p.atsPick !== p.home : p.atsPick === p.home, espnId: hit?.game.espnId ?? null });
    }
    if (p.ou != null && p.ouPick && p.ouDiff != null && p.ouDiff !== 0) {
      out.push({ ...base, id: `${p.id}-t`, kind: "total", label: `${p.ouPick} ${p.ou}`, cover: normCdf(Math.abs(p.ouDiff) / par.sigmaTotal), edge: r1(Math.abs(p.ouDiff)) });
    }
  }
  return out;
}

export function nflLegs(data: NflData, games: SlateGame[], now = Date.now()): Leg[] {
  const out: Leg[] = [];
  const sigma = data.params.model.sigma, sigmaT = data.params.total.sigma;
  const byEspn = new Map(games.filter((g) => g.league === "NFL").map((g) => [g.espnId, g]));
  for (const { g, p } of pendingPicks(data)) {
    const kick = g.espn ? byEspn.get(g.espn)?.date : undefined;
    if (started(kick, g.date, now)) continue;
    const when = kick ?? `${g.date} ${g.time ?? ""}`;
    const name = data.teams[p.pick]?.name ?? p.pick;
    const e = (g.mm as number) - (g.spread as number);
    const line = p.pickIsHome ? (g.spread as number) : -(g.spread as number);
    const base = { league: "NFL" as const, gameId: g.id, game: `${g.away} at ${g.home}`, away: g.away, home: g.home, when };
    out.push({ ...base, id: `${g.id}-s`, kind: "spread", team: name, label: `${name} ${lineText(line)}`, cover: normCdf((p.pickIsHome ? e : -e) / sigma), edge: r1(p.edge), line, pickIsHome: p.pickIsHome, espnId: g.espn ?? null });
  }
  // Totals: the ratings' own total against the posted one, for every game with both that has not started.
  for (const g of data.games) {
    if (g.type !== "REG" || g.aS != null || g.total == null || g.mt == null) continue;
    const kick = g.espn ? byEspn.get(g.espn)?.date : undefined;
    if (started(kick, g.date, now)) continue;
    const diff = g.mt - g.total;
    if (Math.abs(diff) < 0.05) continue;
    out.push({ league: "NFL", gameId: g.id, game: `${g.away} at ${g.home}`, away: g.away, home: g.home, when: kick ?? `${g.date} ${g.time ?? ""}`, id: `${g.id}-t`, kind: "total", label: `${diff > 0 ? "Over" : "Under"} ${g.total}`, cover: normCdf(Math.abs(diff) / sigmaT), edge: r1(Math.abs(diff)) });
  }
  return out;
}

