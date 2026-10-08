import { createRoot } from "react-dom/client";
import { ExpandableMatchupCard } from "./components/MatchupComparison";
createRoot(document.getElementById("root")!).render(<main style={{ maxWidth: 1000, margin: "40px auto", padding: 16 }}><h1 style={{ fontSize: 24 }}>Game matchup engine</h1><p style={{ color: "#a1a1aa", marginBottom: 24 }}>Open the game card to compare each offense against the opposing defense.</p><ExpandableMatchupCard /></main>);
