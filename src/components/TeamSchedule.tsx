import { useEffect, useState } from "react";
import { slate } from "../data";
import { timeOf, tzAbbr, useTz } from "../tz";
import { ChipImg } from "../logoTone";
import { openTeam } from "../openTeam";
import { useOpenGame } from "./GameCenterContext";
import { Skeleton } from "./Skeleton";

type SchedGame = {
  id: string; date: string; venue: "vs" | "at" | "N";
  opp: { id: string; name: string; full: string; abbr: string; logo: string | null; rank: number | null };
  done: boolean; live: boolean; result: "W" | "L" | "T" | null; pts: number | null; oppPts: number | null;
  timeValid: boolean; network: string | null; detail: string | null;
};
type Sched = { team: { id: string; name: string; abbr: string }; games: SchedGame[] };

/** "Sat, Aug 30". A game with no time yet is dated in Eastern time (ESPN stamps it at midnight there), so it does not slip to the day before. */
const dateText = (g: SchedGame, tz: string) => new Date(g.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: g.timeValid ? tz : "America/New_York" });

/**
 * The team's whole season: every finished game with its result and score, then the games still to play with the time, the network and the watchability
 * rating where the board has one. The season comes from /api/team-schedule (ESPN); a game on this week's board opens its Game Center.
 */
export function TeamSchedule({ lg, name, abbr }: { lg: "CFB" | "NFL"; name: string; abbr?: string }) {
  const tz = useTz();
  const openGame = useOpenGame();
  const [data, setData] = useState<Sched | null>(null);
  const [error, setError] = useState(false);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    const ctl = new AbortController();
    setData(null); setError(false);
    const q = new URLSearchParams({ league: lg === "NFL" ? "nfl" : "cfb", name, ...(abbr ? { abbr } : {}) });
    fetch(`/api/team-schedule?${q}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Sched) => setData(d))
      .catch((e) => { if (!ctl.signal.aborted) setError(true); void e; });
    return () => ctl.abort();
  }, [lg, name, abbr, tries]);

  if (error) return <p role="alert" className="rs-none">The schedule could not load. <button type="button" className="ts-retry" onClick={() => setTries((n) => n + 1)}>Try again</button></p>;
  if (!data) return <Skeleton rows={6} />;
  const played = data.games.filter((g) => g.done);
  const ahead = data.games.filter((g) => !g.done);
  const wins = played.filter((g) => g.result === "W").length;
  const tally = (v: (g: SchedGame) => boolean) => { const l = played.filter(v); return `${l.filter((g) => g.result === "W").length}–${l.filter((g) => g.result === "L").length}`; };
  const rating = (g: SchedGame) => slate.games.find((x) => x.espnId === g.id);
  const row = (g: SchedGame) => {
    const board = rating(g);
    const open = board?.espnId ? () => openGame(board.espnId) : undefined;
    return (
      <li key={g.id} className={`ts-row${g.done ? ` ${g.result === "W" ? "won" : g.result === "L" ? "lost" : ""}` : ""}${g.id === ahead[0]?.id ? " next" : ""}`}>
        <span className="ts-date">{dateText(g, tz)}</span>
        <span className="ts-at" aria-label={g.venue === "at" ? "away" : g.venue === "N" ? "neutral site" : "home"}>{g.venue === "at" ? "@" : g.venue === "N" ? "N" : "vs"}</span>
        <button type="button" className="ts-logo" aria-label={`Open ${g.opp.name}`} onClick={() => openTeam({ league: lg, name: g.opp.name, abbr: g.opp.abbr })}>
          {g.opp.logo ? <ChipImg src={g.opp.logo} size={24} /> : <span className="rs-nologo" aria-hidden="true">{g.opp.name.slice(0, 2)}</span>}
        </button>
        <span className="ts-opp">{g.opp.rank != null && <small>#{g.opp.rank}</small>}<b>{g.opp.name}</b></span>
        {g.done ? (
          <>
            <span className={`ts-res ${g.result === "W" ? "w" : g.result === "L" ? "l" : "t"}`} aria-label={g.result === "W" ? "Won" : g.result === "L" ? "Lost" : "Tied"}>{g.result}</span>
            <span className="ts-score">{g.pts} – {g.oppPts}</span>
          </>
        ) : (
          <>
            {board ? <span className="ts-watch" title="Watchability">{Math.round(board.score)}</span> : <span />}
            <span className="ts-when">
              {g.live ? <b>{g.detail ?? "Live"}</b> : g.timeValid ? <><b>{timeOf(g.date, undefined, true)} {tzAbbr()}</b>{g.network && <small>{g.network}</small>}</> : <b>TBD</b>}
            </span>
          </>
        )}
        {open && <button type="button" className="ts-gc" onClick={open}>Game Center</button>}
      </li>
    );
  };
  return (
    <section className="ts" aria-label="Full schedule">
      <header className="ts-head">
        <h3>Full Schedule <small>({data.games.length} games)</small></h3>
        <p><b>{wins}–{played.length - wins - played.filter((g) => g.result === "T").length}</b> <span>({tally((g) => g.venue === "vs")} Home, {tally((g) => g.venue === "at")} Away)</span></p>
      </header>
      {played.length > 0 && <ol className="ts-list" aria-label="Played">{played.map(row)}</ol>}
      {ahead.length > 0 && <>
        <h4 className="ts-band">Upcoming games</h4>
        <ol className="ts-list" aria-label="Upcoming">{ahead.map(row)}</ol>
      </>}
      {!data.games.length && <p className="rs-none">No games are listed for this team yet.</p>}
    </section>
  );
}
