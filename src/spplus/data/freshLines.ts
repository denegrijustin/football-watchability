import type { Line } from "../../lines";
import type { Model, Projection } from "./types";

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The college model with the current week's spreads and totals replaced by fresh ones, and the picks worked out again against them: SP+'s own margin
 * (the sheet's "projected margin") against the new spread decides the side, and its projected score against the new total decides over or under.
 */
export function freshCfbModel(model: Model, lines: Map<string, Line>, espn: Record<string, string>): Model {
  const by = new Map<string, Line>();
  for (const l of lines.values()) {
    if (l.league !== "CFB" || l.state !== "pre") continue;
    const h = espn[l.homeId], a = espn[l.awayId];
    if (h && a) by.set(`${a}|${h}`, l);
  }
  if (!by.size) return model;
  const projections = model.projections.map((p: Projection): Projection => {
    if (p.week !== model.latest || p.projMargin == null) return p;
    const direct = by.get(`${p.away}|${p.home}`);
    const l = direct ?? by.get(`${p.home}|${p.away}`);
    if (!l) return p;
    const sameWay = !!direct;
    const homeSpread = sameWay ? l.spread : -l.spread; // the sheet's home team's spread
    const homeFavoredBy = -homeSpread;
    const diff = p.projMargin - homeFavoredBy;
    const pts = Math.abs(homeSpread);
    const spreadTeam = homeSpread < 0 ? p.home : homeSpread > 0 ? p.away : null;
    const m = /^(\d+)-(\d+)/.exec(p.projScore ?? "");
    const projTotal = m ? Number(m[1]) + Number(m[2]) : null;
    const ouDiff = projTotal != null && l.total != null ? r1(projTotal - l.total) : p.ouDiff;
    return {
      ...p,
      spread: spreadTeam ? `${spreadTeam} -${pts}` : "PK",
      spreadTeam, spreadPts: pts,
      atsPick: diff > 0 ? p.home : diff < 0 ? p.away : null,
      spreadDiff: r1(Math.abs(diff)),
      ou: l.total ?? p.ou, ouDiff,
      ouPick: ouDiff == null || ouDiff === 0 ? p.ouPick : ouDiff > 0 ? "Over" : "Under",
    };
  });
  return { ...model, projections };
}
