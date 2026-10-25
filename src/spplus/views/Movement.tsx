import { useMemo } from "react";
import { useData } from "../data/useData";
import { useRoute } from "../store";
import { fmt } from "../data/derive";
import { TeamLink } from "../components/common";
import { Movers, type MoverTeam } from "../components/Movers";
import { DIV_LABEL, type DivKey } from "../data/types";

/** Who is moving in the SP+ ratings: risers and fallers, then every team in the division with its rank, change and trend. */
export default function Movement() {
  const { model } = useData();
  const [route] = useRoute();
  const div: DivKey = route.div === "ALL" ? "FBS" : route.div;
  const divTeams = useMemo(() => (model ? model.teams.filter((t) => t.division === div && t.weeks[model.latest]) : []), [model, div]);
  const teams = useMemo<MoverTeam[]>(() => {
    if (!model) return [];
    const q = route.q.trim().toLowerCase();
    return divTeams
      .filter((t) => (!route.conf || t.weeks[model.latest]?.conf === route.conf) && (!q || t.name.toLowerCase().includes(q)))
      .map((t) => ({
        id: t.id,
        name: t.name,
        sub: t.weeks[model.latest]?.conf ?? undefined,
        link: <TeamLink team={t} size={18} />,
        rank: { sp: model.weeks.map((w) => t.weeks[w]?.spRk ?? null), off: model.weeks.map((w) => t.weeks[w]?.offRk ?? null), def: model.weeks.map((w) => t.weeks[w]?.defRk ?? null) },
        rating: model.weeks.map((w) => t.weeks[w]?.sp ?? null),
      }));
  }, [model, divTeams, route.conf, route.q]);
  if (!model) return null;
  const filtered = route.conf || route.q.trim();
  return <Movers teams={teams} weeks={model.weeks} size={divTeams.length} unit="SP+" fmtRating={(v) => fmt(v)} title={`${DIV_LABEL[div]} SP+ movers${route.conf ? ` · ${route.conf}` : ""}`} filterNote={filtered ? "ranks are national" : undefined} />;
}
