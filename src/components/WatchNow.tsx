import { useMemo } from "react";
import type { filterGames } from "../data";
import { useFlow, useLive, useLiveMap, useNow } from "../live";
import { liveStatusParts } from "../liveStatus";
import { closeAndLate, pickWatchNow, type Tile } from "../watchNow";
import { useOpenGame } from "./GameCenterContext";

type Game = ReturnType<typeof filterGames>[number];
type T = { name: string; abbr?: string; logoId?: string };
const abbr = (t: unknown) => (t as T).abbr ?? (t as T).name;

function WatchTile({ tile }: { tile: Tile<Game> }) {
  const g = tile.game, openGame = useOpenGame();
  const live = useLive(g.espnId), flow = useFlow(g.espnId, g.league, live);
  const [a, h] = g.teams, cl = closeAndLate(live);
  const parts = live ? liveStatusParts(live.detail) : null;
  const home = flow?.at(-1)?.[0];
  const fav = home == null ? null : home >= 50 ? { who: abbr(h), pct: home } : { who: abbr(a), pct: 100 - home };
  const when = tile.kind === "live" ? (parts && (parts.period || parts.text) ? `${parts.period} ${parts.clock || parts.text}`.trim() : "Live") : tile.minutes < 2 ? "Kickoff now" : `In ${tile.minutes} min`;
  return (
    <li>
      <button type="button" className={`wn-tile ${tile.kind}${cl.both ? " hot" : ""}`} onClick={() => openGame(g.espnId)} aria-label={`Watch now: ${abbr(a)} at ${abbr(h)}, ${when}${live ? `, ${live.away} to ${live.home}` : ""}. Open Game Center`}>
        <span className="wn-when">{tile.kind === "live" && <i aria-hidden="true" />}{when}</span>
        <span className="wn-teams">
          <b>{abbr(a)}</b><em>{live ? live.away : ""}</em>
          <b>{abbr(h)}</b><em>{live ? live.home : ""}</em>
        </span>
        <span className="wn-foot">
          {tile.kind === "live" ? (fav ? <span title="Win probability">{fav.who} {Math.round(fav.pct)}%</span> : <span>Win % soon</span>) : <span>Watchability {g.score}</span>}
          {cl.both && <strong><span className="wn-long">{cl.label}</span><span className="wn-short">Close &amp; late</span></strong>}
        </span>
      </button>
    </li>
  );
}

/** The best games to put on right now: the hottest live games, then the best ones kicking off within the hour. */
export function WatchNow({ games }: { games: Game[] }) {
  const map = useLiveMap(), now = useNow(30_000);
  const tiles = useMemo(() => pickWatchNow(games.filter((g) => g.espnId) as never as Game[], map, now), [games, map, now]);
  if (!tiles.length) return null;
  return (
    <section className="watch-now" aria-label="Watch now">
      <h3>Watch now</h3>
      <ul>{tiles.map((t) => <WatchTile key={t.game.id} tile={t as Tile<Game>} />)}</ul>
    </section>
  );
}
