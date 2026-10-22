import { useEffect, useMemo, useState } from "react";
import type { PerfAdapter } from "./data";
import type { PerfData } from "./types";
import { useNfl } from "../nfl/useNfl";
import { NflMark } from "../nfl/common";
import { navigateNfl } from "../nfl/store";
import { useData } from "../spplus/data/useData";
import { Mark, useTeamLookup } from "../spplus/components/common";
import { navigate as navigateSp } from "../spplus/store";
import { fetchData } from "../data/load";
import type { SpLite } from "../spplus/lite";
import { inPopulation, indexOf } from "./engine";

const GREY = "#6b7785";

/** NFL+: teams are nflverse abbreviations; the rest comes from the NFL+ data the section already loaded. */
export function useNflAdapter(data: PerfData | null): PerfAdapter {
  const { data: nfl } = useNfl();
  return useMemo<PerfAdapter>(() => {
    const ids = data ? indexOf(data).teams.filter((t) => inPopulation(data, t)) : [];
    const name = (id: string) => nfl?.teams[id]?.name ?? data?.teams[id]?.name ?? id;
    const next = (id: string) => {
      const g = nfl?.games.filter((x) => x.type === "REG" && x.aS == null && (x.away === id || x.home === id)).sort((a, b) => a.week - b.week || a.date.localeCompare(b.date))[0];
      return g ? { opp: g.away === id ? g.home : g.away, date: g.date, home: g.home === id } : null;
    };
    return {
      league: "nfl", label: "NFL", teamIds: ids, name, short: (id) => name(id).split(" ").pop() ?? id,
      color: (id) => nfl?.teams[id]?.color ?? data?.teams[id]?.color ?? GREY, conf: (id) => nfl?.teams[id]?.conf ?? data?.teams[id]?.conf ?? null,
      mark: (id, size = 22) => <NflMark abbr={id} size={size} />,
      next,
      adjusted: (id) => {
        const r = nfl?.teams[id]?.r;
        if (!r) return null;
        // Ratings "before week w+1" are the ratings through week w's games.
        return Object.keys(r).map(Number).filter((w) => w >= 2).sort((a, b) => a - b).map((w) => ({ week: w - 1, total: r[w][0], off: r[w][1], def: r[w][2] }));
      },
      adjustedLabel: "NFL+ rating",
      adjustedNote: "NFL+ ratings are opponent-adjusted: each team's points-per-game strength against an average opponent, from EPA on every play, with last season's ratings as a starting point. Offense is higher-is-better; defense is points allowed, lower is better.",
      openTeam: (id) => navigateNfl({ view: "team", team: id }),
      defaultTeam: ids.includes("SEA") ? "SEA" : ids[0] ?? null,
    };
  }, [data, nfl]);
}

/** CFB SP+: teams are ESPN team ids. Names, logos and ratings come through the sheet's team list and the small lite file. */
export function useCfbAdapter(data: PerfData | null): PerfAdapter {
  const { espn } = useData();
  const lookup = useTeamLookup();
  const [lite, setLite] = useState<SpLite | null>(null);
  useEffect(() => { let live = true; fetchData<SpLite>("spplus-lite").then((l) => live && setLite(l), () => {}); return () => { live = false; }; }, []);
  return useMemo<PerfAdapter>(() => {
    const ids = data ? indexOf(data).teams.filter((t) => inPopulation(data, t)) : [];
    const sheet = (id: string) => espn[id] ?? data?.teams[id]?.name ?? id;
    const idOf = new Map(Object.entries(espn).map(([id, nm]) => [nm, id]));
    const name = (id: string) => data?.teams[id]?.name ?? sheet(id);
    const today = new Date().toISOString().slice(0, 10);
    return {
      league: "cfb", label: "College (FBS)", teamIds: ids, name, short: (id) => data?.teams[id]?.abbr ?? name(id),
      color: (id) => data?.teams[id]?.color ?? GREY, conf: (id) => data?.teams[id]?.conf ?? lite?.teams[sheet(id)]?.conf ?? null,
      mark: (id, size = 22) => <Mark team={lookup(sheet(id))} size={size} />,
      next: (id) => {
        const nm = sheet(id);
        const g = lite?.slate.filter((x) => x.date >= today && (x.away === nm || x.home === nm)).sort((a, b) => a.date.localeCompare(b.date))[0];
        if (!g) return null;
        const opp = idOf.get(g.away === nm ? g.home : g.away);
        return opp && ids.includes(opp) ? { opp, date: g.date, home: g.home === nm } : null;
      },
      adjusted: (id) => {
        const r = lite?.teams[sheet(id)]?.r;
        if (!r) return null;
        return Object.keys(r).map(Number).sort((a, b) => a - b).map((w) => ({ week: w, total: r[w][0], off: r[w][1], def: r[w][2] }));
      },
      adjustedLabel: "SP+ rating",
      adjustedNote: "SP+ ratings are opponent-adjusted: each team's per-game strength against an average opponent, from the SP+ spreadsheet this section already uses. Offense is higher-is-better; defense is points allowed, lower is better.",
      openTeam: (id) => { const t = lookup(sheet(id)); if (t) navigateSp({ view: "team", team: t.id }); },
      defaultTeam: ids[0] ?? null,
    };
  }, [data, espn, lookup, lite]);
}
