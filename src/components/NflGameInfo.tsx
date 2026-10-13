import { useEffect, useState } from "react";
import { fetchData } from "../data/load";
import type { NflData, NflGame } from "../nfl/types";
import { projectGameRow, type NflProjection } from "../nfl/model";
import { depthLine, gameFacts, snapLines } from "../nfl/context";
import { navigateNfl } from "../nfl/store";

let load: Promise<NflData | null> | null = null;
/** The NFL data file, fetched once per page; a failed load is not remembered. */
function loadNfl(): Promise<NflData | null> {
  if (!load) {
    load = fetchData<NflData>("nfl").catch(() => {
      load = null;
      return null;
    });
  }
  return load;
}

function useNflGame(espnId: string | null) {
  const [state, setState] = useState<{ data: NflData; game: NflGame } | null>(null);
  useEffect(() => {
    let live = true;
    setState(null);
    if (!espnId) return;
    loadNfl().then((data) => {
      const game = data?.games.find((g) => g.espn === espnId);
      if (live && data && game) setState({ data, game });
    });
    return () => {
      live = false;
    };
  }, [espnId]);
  return state;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const one = (x: number) => x.toFixed(1);
const signed = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(1)}`;

/** The simulated score for an NFL game, at the top of the Game Center's Projection panel. */
export function NflProjectionBlock({ espnId, onOpen }: { espnId: string | null; onOpen: () => void }) {
  const s = useNflGame(espnId);
  const [p, setP] = useState<NflProjection | null>(null);
  useEffect(() => {
    setP(s ? projectGameRow(s.data, s.game, { n: 6000 }) : null);
  }, [s]);
  if (!s || !p) return null;
  const { game: g, data } = s;
  const nick = (a: string) => data.teams[a]?.name.split(" ").pop() ?? a;
  const fav = p.sim.winA >= 0.5 ? g.away : g.home;
  const m = Math.abs(p.sim.meanMargin);
  return (
    <div className="gc-spp" data-testid="gc-nfl">
      <div className="gc-spp-head">
        <span className="gc-k">Simulated score</span>
        <button
          type="button"
          className="gc-spp-open"
          onClick={() => {
            navigateNfl({ view: "simulator", week: null, p: { a: g.away, b: g.home, v: g.neutral ? "n" : "h" } });
            onOpen();
          }}
        >
          Open in NFL Ratings <span aria-hidden="true">→</span>
        </button>
      </div>
      <div className="gc-spp-score" aria-label={`Simulation: ${g.away} ${one(p.sim.meanA)}, ${g.home} ${one(p.sim.meanB)}`}>
        <span>
          {g.away} <strong>{one(p.sim.meanA)}</strong>
        </span>
        <span aria-hidden="true">–</span>
        <span>
          <strong>{one(p.sim.meanB)}</strong> {g.home}
        </span>
      </div>
      <p className="gc-spp-sub">
        Likely final {Math.round(p.sim.meanA)}–{Math.round(p.sim.meanB)} · {nick(fav)} wins {pct(Math.max(p.sim.winA, p.sim.winB))}
        {m >= 0.5 ? ` · ${nick(fav)} by ${one(m)}` : " · a toss-up"} · total {one(p.sim.meanTotal)}
      </p>
      <p className="gc-spp-sub">
        {p.basis === "market"
          ? `Centered on the closing line (${nick(g.home)} ${signed(-(g.spread ?? 0))}, total ${g.total}); the team ratings alone say ${nick(g.home)} ${signed(p.ratingsMarginHome)}, total ${one(p.ratingsTotal)}.`
          : `No closing line yet, so this comes from the team ratings (before week ${g.week}).`}{" "}
        {p.sim.n.toLocaleString("en-US")} simulated games.
      </p>
    </div>
  );
}

/** What nflverse knows about the game's setting: rest, roof and surface, QBs, coaches, referee, depth-chart starters, and snap leaders for finals. */
export function NflSettingPanel({ espnId }: { espnId: string | null }) {
  const s = useNflGame(espnId);
  if (!s) return null;
  const { game: g, data } = s;
  const facts = gameFacts(data, g);
  const depth = [g.away, g.home].map((t) => [t, depthLine(data, t)] as const).filter((x) => x[1]);
  const snaps = snapLines(data, g);
  if (!facts.length && !depth.length && !snaps.length) return null;
  return (
    <section className="gc-panel" data-testid="gc-nfl-setting">
      <h3 className="micro-label">Game setting</h3>
      <ul className="proj-parts">
        {facts.map(([k, v]) => (
          <li key={k}>
            <span>{k}</span>
            <span>{v}</span>
          </li>
        ))}
        {g.aS == null && depth.map(([t, line]) => (
          <li key={t}>
            <span>{data.teams[t].name.split(" ").pop()} starters</span>
            <span>{line}</span>
          </li>
        ))}
        {snaps.flatMap((x) => [
          <li key={`${x.team}o`}>
            <span>{data.teams[x.team].name.split(" ").pop()} offense snaps</span>
            <span>{x.off}</span>
          </li>,
          <li key={`${x.team}d`}>
            <span>{data.teams[x.team].name.split(" ").pop()} defense snaps</span>
            <span>{x.def}</span>
          </li>,
        ])}
      </ul>
      <p className="gc-note">From nflverse (CC-BY 4.0).</p>
    </section>
  );
}
