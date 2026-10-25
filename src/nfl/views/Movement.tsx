import { useMemo } from "react";
import { useNfl } from "../useNfl";
import { useNflRoute } from "../store";
import { ratingsAt, shortName, teamRows } from "../model";
import { fmtSigned } from "../../spplus/data/derive";
import { Movers, type MoverTeam } from "../../spplus/components/Movers";
import { NflTeamLink } from "../common";

/** Who is moving in the NFL+ ratings: risers and fallers, then every team with its rank, change and trend. */
export default function Movement() {
  const { data } = useNfl();
  const [route] = useNflRoute();
  const last = data?.ratingsThroughWeek ?? 0;
  const weeks = useMemo(() => Array.from({ length: last }, (_, i) => i + 1), [last]);
  const teams = useMemo<MoverTeam[]>(() => {
    if (!data) return [];
    const byWeek = weeks.map((w) => new Map(teamRows(data, w).map((r) => [r.abbr, r.rank])));
    return Object.keys(data.teams)
      .filter((a) => !route.group || data.teams[a].conf === route.group || data.teams[a].div === route.group || `${data.teams[a].conf} ${data.teams[a].div}` === route.group)
      .map((a) => ({
        id: a,
        name: data.teams[a].name,
        link: <NflTeamLink abbr={a} size={18} label={shortName(data.teams[a].name).replace("Broncos", "Donkeys")} />,
        rank: { sp: byWeek.map((m) => m.get(a)?.sp ?? null), off: byWeek.map((m) => m.get(a)?.off ?? null), def: byWeek.map((m) => m.get(a)?.def ?? null) },
        rating: weeks.map((w) => ratingsAt(data, a, w)?.[0] ?? null),
      }));
  }, [data, weeks, route.group]);
  if (!data) return null;
  return <Movers teams={teams} weeks={weeks} size={Object.keys(data.teams).length} unit="Rating" fmtRating={(v) => (v == null ? "—" : fmtSigned(v))} title={`NFL+ movers${route.group ? ` · ${route.group}` : ""}`} filterNote={route.group ? "ranks are league-wide" : undefined} />;
}
