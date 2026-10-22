import { useEffect, useRef, useState } from "react";
import { rename } from "../../data/load";
import { trimGame } from "../../gameTrim.js";
import { DRIVE } from "../../../scripts/perf/lib.mjs";
import { playsForDrive, resolveTeamId, type GameDrive, type LogPlay, type LogTeam } from "../drivesCalc";
import type { PerfData, PerfGame } from "../types";

// The play-by-play itself is not stored in the performance files. "Show the plays" asks the same endpoint the Game Center uses
// (functions/api/game.js, with the same direct-to-ESPN fallback) and keeps the answer for the rest of the visit.
interface GameLog { teams: LogTeam[]; log: LogPlay[] }
const PATHS = { nfl: "nfl", cfb: "cfb" } as const;
const ESPN_PATH = { nfl: "nfl", cfb: "college-football" } as const;
const cache = new Map<string, Promise<GameLog>>();

const shape = (j: { teams?: LogTeam[]; log?: LogPlay[] }): GameLog => {
  if (!Array.isArray(j.log) || !Array.isArray(j.teams)) throw new Error("This game's play list is not available yet.");
  return { teams: j.teams, log: j.log };
};

export function loadGameLog(league: "nfl" | "cfb", espn: string): Promise<GameLog> {
  const k = `${league}:${espn}`;
  let p = cache.get(k);
  if (!p) {
    p = (async () => {
      try {
        const r = await fetch(`/api/game?league=${PATHS[league]}&event=${espn}`, { cache: "no-store" });
        if (r.ok && (r.headers.get("content-type") ?? "").includes("json")) return shape(rename(await r.json()));
      } catch { /* try ESPN directly, as the Game Center does */ }
      const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/${ESPN_PATH[league]}/summary?event=${espn}`);
      if (!r.ok) throw new Error(`The play list could not be loaded (${r.status}).`);
      return shape(rename(trimGame(await r.json())) as Parameters<typeof shape>[0]);
    })();
    cache.set(k, p);
    p.catch(() => cache.delete(k));
  }
  return p;
}

type State = { s: "idle" } | { s: "loading" } | { s: "error"; msg: string } | { s: "done"; plays: LogPlay[] } | { s: "nomatch"; why: string };

export const espnGameUrl = (league: "nfl" | "cfb", espn: string) => `https://www.espn.com/${ESPN_PATH[league]}/game/_/gameId/${espn}`;

/** The "Show the plays" block under a selected drive. */
export function DrivePlays({ data, game, drive, abbr, otDrives, teamName }: { data: PerfData; game: PerfGame | undefined; drive: GameDrive; abbr: string | undefined; otDrives: number; teamName: string }) {
  const [st, setSt] = useState<State>({ s: "idle" });
  const [open, setOpen] = useState(false);
  const tok = useRef(0);
  useEffect(() => () => { tok.current = -1; }, []);
  // A different drive starts closed, and an answer for the old one is ignored.
  useEffect(() => { tok.current = Math.max(0, tok.current) + 1; setOpen(false); setSt({ s: "idle" }); }, [drive.key, game?.id]);

  const espn = game?.espn;
  const run = () => {
    if (!espn) { setSt({ s: "nomatch", why: "This game has no Game Center id, so its play list cannot be loaded." }); return; }
    setSt({ s: "loading" });
    const my = tok.current;
    const live = { get current() { return my === tok.current; } };
    loadGameLog(data.league, espn).then(
      (g) => {
        if (!live.current) return;
        const r = drive.row;
        const id = resolveTeamId(g.teams, { team: drive.team, abbr, pf: r.pf, pa: r.pa, home: r.h === 1 });
        if (!id) return setSt({ s: "nomatch", why: "The play list's teams could not be matched to this team." });
        const m = playsForDrive(g.log, id, drive, otDrives);
        setSt(m.ok ? { s: "done", plays: m.plays } : { s: "nomatch", why: m.reason });
      },
      (e: Error) => live.current && setSt({ s: "error", msg: e.message }),
    );
  };
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && (st.s === "idle" || st.s === "error")) run();
  };
  const t = drive.tuple;
  return (
    <div className="dv-plays">
      <button type="button" className="btn small" aria-expanded={open} onClick={toggle}>{open ? "Hide the plays" : "Show the plays"}</button>
      {open && (
        <div role="region" aria-label={`Plays of drive ${drive.no}`} aria-live="polite" className="dv-playbox">
          {st.s === "loading" && <p className="sub"><span className="spin" aria-hidden="true" /> Loading the play list from the Game Center…</p>}
          {st.s === "error" && <p className="note-box" role="alert">{st.msg} <button type="button" className="btn small" onClick={run}>Try again</button>{espn && <> <a href={espnGameUrl(data.league, espn)} target="_blank" rel="noreferrer">Open the game on ESPN</a></>}</p>}
          {st.s === "nomatch" && <p className="note-box">I could not tell which plays belong to this drive. {st.why} {espn && <a href={espnGameUrl(data.league, espn)} target="_blank" rel="noreferrer">Open the full play-by-play on ESPN</a>}</p>}
          {st.s === "done" && (
            <>
              <ol className="dv-playlist">
                {st.plays.map((p) => (
                  <li key={p.id} className={p.score ? "score" : p.turnover ? "turn" : undefined}>
                    <span className="clk">{p.clock}</span>
                    <span className="txt">{p.text || p.kind}</span>
                    <span className="yds">{p.kind && !/Pass|Rush|Sack|Run/i.test(p.kind) ? p.kind : `${p.yards >= 0 ? "+" : "−"}${Math.abs(p.yards)} yd`}</span>
                  </li>
                ))}
              </ol>
              <p className="sub">Matched by team and game clock: {st.plays.length} logged play{st.plays.length === 1 ? "" : "s"} for a {teamName} drive of {t[DRIVE.PLAYS]} play{t[DRIVE.PLAYS] === 1 ? "" : "s"}. The list leaves out penalties, timeouts, punts and kickoffs, and extra points can appear after a touchdown. {game?.espn && <a href={espnGameUrl(data.league, game.espn)} target="_blank" rel="noreferrer">Full play-by-play on ESPN</a>}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
