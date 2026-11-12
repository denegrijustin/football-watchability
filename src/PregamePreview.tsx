import { HalftimeBand } from "./halftime";
import { PregameCheer } from "./pregameCheer";
import { usePregame } from "./pregameLogic";

/**
 * A review page for the pregame shows: `/?pregamePreview=CFB` or `=NFL`. It needs no live game. Parameters:
 *   pregame=12       minutes before kickoff when the page loads (time then runs normally; fractions work)
 *   pstate=pre|in|post|postponed   the game's status (a live, finished or postponed game gets no show)
 *   shift=10         revise the scheduled kickoff by this many minutes (negative = earlier)
 */
const KICKOFF = "2026-09-05T23:30:00Z";
const params = () => new URLSearchParams(location.search);
const SIDES = {
  CFB: { home: { abbr: "OSU", name: "Ohio State", color: "#bb0000", logoId: "ohio-state", conf: "Big Ten" }, away: { abbr: "MICH", name: "Michigan", color: "#00274c", logoId: "michigan", conf: "Big Ten" } },
  NFL: { home: { abbr: "ATL", name: "Falcons", color: "#a71930", logoId: "atl" }, away: { abbr: "NO", name: "Saints", color: "#d3bc8d", logoId: "no" } },
} as const;

function Stage({ league }: { league: "CFB" | "NFL" }) {
  const q = params();
  const shift = Number(q.get("shift") ?? 0) || 0;
  const date = new Date(Date.parse(KICKOFF) + shift * 60_000).toISOString();
  const pstate = q.get("pstate") ?? "pre";
  const state = pstate === "in" ? "in" : pstate === "post" ? "post" : "pre";
  const pregame = usePregame({ league, date, state, detail: pstate === "postponed" ? "Postponed" : null });
  const { home, away } = SIDES[league];
  if (!pregame) return <p className="pp-empty" data-pregame="none">Normal pregame field: no show right now.</p>;
  return league === "NFL"
    ? <PregameCheer pregame={pregame} espnId="401772510" home={home} away={away} />
    : <HalftimeBand pregame={pregame} espnId="401752500" home={home} away={away} />;
}

export default function PregamePreview() {
  const league = params().get("pregamePreview") === "NFL" ? "NFL" : "CFB";
  const go = (patch: Record<string, string | null>) => {
    const q = params();
    for (const [k, v] of Object.entries(patch)) v === null ? q.delete(k) : q.set(k, v);
    location.search = q.toString();
  };
  const mins = league === "NFL" ? [16, 15, 12, 8, 5.2, 4.8] : [21, 20, 14, 8, 5.2, 4.8];
  return (
    <main style={{ padding: 16, maxWidth: 1000, margin: "0 auto", minHeight: "100vh", background: "#101a22", color: "#e8eef2", font: "14px system-ui" }}>
      <h1 style={{ fontSize: 18 }}>Pregame preview · {league === "NFL" ? "NFL cheerleaders (15 min)" : "College band (20 min)"}</h1>
      <p>
        <button onClick={() => go({ pregamePreview: league === "NFL" ? "CFB" : "NFL" })}>Show {league === "NFL" ? "college" : "NFL"}</button>{" "}
        Minutes before kickoff:{" "}
        {mins.map((m) => <button key={m} onClick={() => go({ pregame: String(m) })}>{m}</button>)}{" "}
        Status:{" "}
        {["pre", "in", "post", "postponed"].map((s) => <button key={s} onClick={() => go({ pstate: s })}>{s}</button>)}{" "}
        Kickoff:{" "}
        <button onClick={() => go({ shift: "10" })}>+10 min</button> <button onClick={() => go({ shift: "-10" })}>-10 min</button> <button onClick={() => go({ shift: null })}>as scheduled</button>
      </p>
      <h2 style={{ fontSize: 14 }}>Game card size</h2>
      <div data-size="card" style={{ width: "100%", maxWidth: 380 }}><Stage league={league} /></div>
      <h2 style={{ fontSize: 14 }}>Game Center size</h2>
      <div data-size="center" style={{ width: "100%", maxWidth: 720 }}><Stage league={league} /></div>
    </main>
  );
}
