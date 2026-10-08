import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ExpandableMatchupCard, mockMatchup, type MatchupData } from "./components/MatchupComparison";
import { slate } from "./data";
import { matchupForGame } from "./data/matchup";
function Demo() {
  const [league, setLeague] = useState<MatchupData["league"]>("NFL");
  const sample = new URLSearchParams(window.location.search).has("sample");
  const sampleData: MatchupData = league === "NFL" ? mockMatchup : {
    ...mockMatchup, league: "CFB", rankedTeams: 136,
    teams: mockMatchup.teams.map((team, i) => ({ ...team, name: i ? "College Team B" : "College Team A", abbreviation: i ? "B" : "A",
      metrics: team.metrics.map(m => ({ ...m, offense: { ...m.offense, rank: i && m.offense.rank ? m.offense.rank + 104 : m.offense.rank }, defense: { ...m.defense, rank: i && m.defense.rank ? m.defense.rank + 104 : m.defense.rank } })) })) as MatchupData["teams"],
  };
  const game = slate.games.find(g => g.league === league && matchupForGame(g));
  const data = sample ? sampleData : game && matchupForGame(game);
  return <main style={{ maxWidth: 1000, margin: "40px auto", padding: 16 }}><h1 style={{ fontSize: 24 }}>Game matchup engine</h1><p style={{ color: "#a1a1aa", marginBottom: 24 }}>Open the game card to compare each offense against the opposing defense.</p><label style={{ display: "block", marginBottom: 16 }}>League <select aria-label="League" value={league} onChange={e => setLeague(e.target.value as MatchupData["league"])} style={{ background: "#27272a", color: "#fafafa", border: "1px solid #52525b", padding: 8, borderRadius: 8, marginLeft: 8 }}><option value="NFL">NFL</option><option value="CFB">College</option></select></label>{data ? <ExpandableMatchupCard data={data} /> : <p>Season statistics are unavailable for this matchup.</p>}</main>;
}
createRoot(document.getElementById("root")!).render(<Demo />);
