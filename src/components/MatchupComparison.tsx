import { useId, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronDown, Minus, Shield, Swords } from "lucide-react";
import "./matchup.css";

export const mockMatchup: MatchupData = {
  league: "NFL", season: 2026, rankedTeams: 32, sample: true,
  teams: [
    { id: "kc", name: "Kansas City Chiefs", abbreviation: "KC", metrics: [
      { id: "scoring", offense: { value: 27.4, rank: 6 }, defense: { value: 19.2, rank: 7 } },
      { id: "total", offense: { value: 371.8, rank: 8 }, defense: { value: 305.6, rank: 5 } },
      { id: "passing", offense: { value: 258.2, rank: 1 }, defense: { value: 208.3, rank: 9 } },
      { id: "rushing", offense: { value: 113.6, rank: 18 }, defense: { value: 97.3, rank: 6 } },
      { id: "thirdDown", offense: { value: 46.1, rank: 3 }, defense: { value: 35.4, rank: 8 } },
      { id: "turnovers", offense: { value: 5, rank: 7 }, defense: { value: 10, rank: 4 } },
    ] },
    { id: "lv", name: "Las Vegas Raiders", abbreviation: "LV", metrics: [
      { id: "scoring", offense: { value: 20.6, rank: 24 }, defense: { value: 25.8, rank: 26 } },
      { id: "total", offense: { value: 312.5, rank: 32 }, defense: { value: 354.2, rank: 22 } },
      { id: "passing", offense: { value: 215.8, rank: 29 }, defense: { value: 233.4, rank: 24 } },
      { id: "rushing", offense: { value: 96.7, rank: 27 }, defense: { value: 120.8, rank: 19 } },
      { id: "thirdDown", offense: { value: 36.2, rank: 26 }, defense: { value: 43.6, rank: 27 } },
      { id: "turnovers", offense: { value: 9, rank: 23 }, defense: { value: 6, rank: 20 } },
    ] },
  ],
};

const categories = [
  { id: "scoring", label: "Scoring", unit: "PPG" },
  { id: "total", label: "Total yards", unit: "YPG" },
  { id: "passing", label: "Passing yards", unit: "YPG" },
  { id: "rushing", label: "Rushing yards", unit: "YPG" },
  { id: "thirdDown", label: "3rd down", unit: "%" },
  { id: "turnovers", label: "Turnovers", unit: "Total" },
] as const;
export type MetricId = typeof categories[number]["id"];
export type Stat = { value: number | null; rank: number | null; worst?: boolean };
export type MatchupTeam = {
  id: string; name: string; abbreviation: string; logo?: string;
  metrics: { id: MetricId; offense: Stat; defense: Stat }[];
};
export type MatchupData = { league: "NFL" | "CFB"; season: number; rankedTeams: number; sample?: boolean; source?: string; sourceUrl?: string; updatedAt?: string; teams: [MatchupTeam, MatchupTeam] };
const validRank = (rank?: number | null): rank is number => Number.isInteger(rank) && rank! > 0;
export function rankEdge(left?: number | null, right?: number | null) {
  if (!validRank(left) || !validRank(right)) return null;
  return right - left;
}

function StatCell({ stat, unit, league, rankedTeams }: { stat?: Stat; unit: string; league: MatchupData["league"]; rankedTeams: number }) {
  const rank = validRank(stat?.rank) && stat.rank <= rankedTeams ? stat.rank : null;
  const bottom = rank != null && (league === "CFB" ? rank > rankedTeams * 0.8 : rank > rankedTeams / 2 && rank >= rankedTeams - 9);
  const badge = rank === 1 ? league === "NFL" ? "Best in League" : "Best in Nation" : (rank === rankedTeams || stat?.worst) ? "Worst" : bottom ? league === "CFB" ? rank > rankedTeams * 0.95 ? "Bottom 5%" : rank > rankedTeams * 0.9 ? "Bottom 10%" : "Bottom 20%" : rank >= rankedTeams - 4 ? "Bottom 5" : "Bottom 10" : rank && rank <= 5 ? "Top 5" : rank && rank <= 10 ? "Top 10" : null;
  return <div className="mc:flex mc:min-w-0 mc:flex-col mc:items-center mc:gap-1 mc:py-2">
    <strong className="mc:text-base mc:font-semibold mc:tabular-nums mc:text-zinc-100">
      {stat?.value != null && Number.isFinite(stat.value) ? `${stat.value.toFixed(unit === "Total" ? 0 : 1)}${unit === "%" ? "%" : ""}` : "—"}
    </strong>
    <div className="mc:flex mc:flex-wrap mc:items-center mc:justify-center mc:gap-1 mc:text-xs mc:text-zinc-400">
      <span>{rank ? `#${rank}${league === "CFB" ? " nationally" : ""}` : "Unranked"}</span>
      {badge && <span className={`mc:rounded-full mc:border mc:px-1.5 mc:py-0.5 mc:font-semibold ${bottom ? "mc:border-red-400/25 mc:bg-red-400/10 mc:text-red-300" : "mc:border-emerald-400/25 mc:bg-emerald-400/10 mc:text-emerald-300"}`}>{badge}</span>}
    </div>
  </div>;
}

function Edge({ left, right, names }: { left?: Stat; right?: Stat; names: [string, string] }) {
  const delta = rankEdge(left?.rank, right?.rank);
  const strong = delta != null && Math.abs(delta) > 5;
  const Icon = strong ? delta! > 0 ? ArrowLeft : ArrowRight : Minus;
  const label = delta == null ? "Rank comparison unavailable" : strong ? `${names[delta > 0 ? 0 : 1]} advantage: ${Math.abs(delta)} rank spots` : `Even matchup: ${Math.abs(delta)} rank spots apart`;
  return <span aria-label={label} title={label} className={`mc:flex mc:flex-col mc:items-center mc:gap-0.5 mc:text-xs mc:tabular-nums ${strong ? "mc:text-emerald-300" : "mc:text-zinc-500"}`}>
    <Icon size={16} aria-hidden="true" /><span aria-hidden="true">{delta == null ? "—" : Math.abs(delta)}</span>
  </span>;
}

function TeamMark({ team }: { team: MatchupTeam }) {
  return <span className="mc:inline-flex mc:items-center mc:justify-center mc:gap-1.5" title={team.name}>{team.logo && <img src={team.logo} alt="" width={24} height={24} className="mc:h-6 mc:w-6 mc:shrink-0 mc:object-contain" />}<span>{team.abbreviation}</span></span>;
}

function Crossover({ left, right, side, league, rankedTeams }: { left: MatchupTeam; right: MatchupTeam; side: "offense" | "defense"; league: MatchupData["league"]; rankedTeams: number }) {
  const other = side === "offense" ? "defense" : "offense";
  const Icon = side === "offense" ? Swords : Shield;
  return <section className="mc:min-w-0 mc:overflow-hidden mc:rounded-xl mc:border mc:border-zinc-700/70 mc:bg-zinc-900">
    <h4 className="mc:m-0 mc:flex mc:items-center mc:gap-2 mc:border-b mc:border-zinc-700/70 mc:px-3 mc:py-3 mc:text-sm mc:font-semibold mc:text-zinc-100"><Icon size={16} aria-hidden="true" /><TeamMark team={left} /> {side} vs. <TeamMark team={right} /> {other}</h4>
    <table className="mc:w-full mc:table-fixed mc:border-collapse mc:text-left">
      <caption className="mc:sr-only">{left.name} {side} against {right.name} {other}</caption>
      <thead><tr className="mc:text-[10px] mc:uppercase mc:tracking-wider mc:text-zinc-400">
        <th scope="col" className="mc:w-[30%] mc:px-3 mc:py-2">Metric</th>
        <th scope="col" className="mc:w-[28%] mc:text-center"><TeamMark team={left} /></th>
        <th scope="col" className="mc:w-[14%] mc:text-center">Edge</th>
        <th scope="col" className="mc:w-[28%] mc:text-center"><TeamMark team={right} /></th>
      </tr></thead>
      <tbody>{categories.map(({ id, label, unit }) => {
        const a = left.metrics.find(m => m.id === id)?.[side], b = right.metrics.find(m => m.id === id)?.[other];
        return <tr key={id} className="mc:border-t mc:border-zinc-800 mc:transition-colors mc:hover:bg-zinc-800/70">
          <th scope="row" className="mc:px-3 mc:py-2 mc:text-xs mc:font-medium mc:text-zinc-300">{label}<span className="mc:block mc:text-[10px] mc:font-normal mc:text-zinc-500">{unit}</span></th>
          <td><StatCell stat={a} unit={unit} league={league} rankedTeams={rankedTeams} /></td><td><Edge left={a} right={b} names={[left.abbreviation, right.abbreviation]} /></td><td><StatCell stat={b} unit={unit} league={league} rankedTeams={rankedTeams} /></td>
        </tr>;
      })}</tbody>
    </table>
  </section>;
}

export function MatchupComparison({ data }: { data: MatchupData }) {
  const [a, b] = data.teams;
  const [swapped, setSwapped] = useState(false);
  const [left, right] = swapped ? [b, a] : [a, b];
  return <div className="matchup-engine mc:rounded-xl mc:border mc:border-zinc-700 mc:bg-zinc-950 mc:p-3 mc:text-zinc-100 mc:@container">
    <div className="mc:mb-3 mc:flex mc:flex-wrap mc:items-center mc:justify-between mc:gap-2">
      <div><h3 className="mc:m-0 mc:text-sm mc:font-semibold">Offense vs. defense</h3><p className="mc:m-0 mc:text-xs mc:text-zinc-400">{data.league} · {data.season}{data.sample ? " · Sample data" : " · Season rankings"}</p></div>
      <button type="button" aria-pressed={swapped} onClick={() => setSwapped(v => !v)} className="mc:cursor-pointer mc:rounded-lg mc:border mc:border-zinc-700 mc:bg-zinc-800 mc:px-3 mc:py-2 mc:text-xs mc:text-zinc-200 mc:hover:bg-zinc-700 mc:focus-visible:outline-2 mc:focus-visible:outline-emerald-300">Swap teams</button>
    </div>
    <div className="mc:grid mc:gap-3 mc:@min-[680px]:grid-cols-2"><Crossover left={left} right={right} side="offense" league={data.league} rankedTeams={data.rankedTeams} /><Crossover left={left} right={right} side="defense" league={data.league} rankedTeams={data.rankedTeams} /></div>
    {data.updatedAt && <p className="mc:mb-0 mc:mt-3 mc:text-[11px] mc:text-zinc-400"><a href={data.sourceUrl} target="_blank" rel="noreferrer" className="mc:text-zinc-300 mc:underline">{data.source}</a> · {data.rankedTeams} teams · Updated {new Date(data.updatedAt).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} CT. Current season totals; tied values share ranks.</p>}
    <p className="mc:mb-0 mc:mt-3 mc:text-[11px] mc:text-zinc-400">Lower rank is better. Arrows point to the advantage; gaps of 5 or fewer are even. Defense shows yards/points allowed, conversion rate allowed and takeaways; offense shows giveaways.</p>
  </div>;
}

export function ExpandableMatchupCard({ data = mockMatchup }: { data?: MatchupData }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <article className="matchup-engine mc:overflow-hidden mc:rounded-2xl mc:border mc:border-zinc-700 mc:bg-zinc-900 mc:text-zinc-100">
    <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(v => !v)} className="mc:flex mc:w-full mc:cursor-pointer mc:items-center mc:justify-between mc:gap-3 mc:border-0 mc:bg-transparent mc:p-5 mc:text-left mc:text-zinc-100 mc:focus-visible:outline-2 mc:focus-visible:outline-emerald-300">
      <span><span className="mc:block mc:text-xs mc:uppercase mc:tracking-wider mc:text-emerald-300">Matchup comparison {data.sample && "· Demo"}</span><strong className="mc:mt-1 mc:block mc:text-lg">{data.teams[0].name} vs. {data.teams[1].name}</strong></span>
      <ChevronDown size={22} aria-hidden="true" className={`mc:shrink-0 mc:transition-transform mc:duration-300 mc:motion-reduce:transition-none ${open ? "mc:rotate-180" : ""}`} />
    </button>
    <div id={id} inert={!open} aria-hidden={!open} className={`mc:grid mc:transition-[grid-template-rows,opacity] mc:duration-300 mc:ease-in-out mc:motion-reduce:transition-none ${open ? "mc:grid-rows-[1fr] mc:opacity-100" : "mc:grid-rows-[0fr] mc:opacity-0"}`}>
      <div className="mc:min-h-0 mc:overflow-hidden"><div className="mc:p-3 mc:pt-0"><MatchupComparison data={data} /></div></div>
    </div>
  </article>;
}
