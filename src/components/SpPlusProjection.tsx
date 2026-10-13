import { useEffect, useState } from "react";
import { fetchData } from "../data/load";
import { projectGame, type SpLite, type SpProjection } from "../spplus/lite";
import { navigate } from "../spplus/store";

let liteLoad: Promise<SpLite | null> | null = null;
/** The small SP+ file, fetched once per page; a failed load is not remembered, so the next game opened tries again. */
function loadLite(): Promise<SpLite | null> {
  if (!liteLoad) {
    liteLoad = fetchData<SpLite>("spplus-lite").catch(() => {
      liteLoad = null;
      return null;
    });
  }
  return liteLoad;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const one = (x: number) => x.toFixed(1);

type Team = { espnId?: string; logoId?: string; name: string; abbr?: string };

/**
 * The SP+ simulation's score for a college game, in the Game Center's Projection panel: expected points for each side, the win chance and
 * the middle half of margins, from 6,000 simulated games. Shown only when both teams are FBS teams in the SP+ sheet.
 */
export function SpPlusProjection({ away, home, date, onOpen }: { away: Team; home: Team; date: string; onOpen: () => void }) {
  const [p, setP] = useState<SpProjection | null>(null);
  const aKey = `${away.espnId}|${away.logoId}|${away.name}`, hKey = `${home.espnId}|${home.logoId}|${home.name}`;
  useEffect(() => {
    let live = true;
    setP(null);
    if (!date) return;
    loadLite().then((lite) => {
      if (live && lite) setP(projectGame(lite, away, home, date));
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aKey, hKey, date]);
  if (!p) return null;
  const a = away.abbr ?? away.name, h = home.abbr ?? home.name;
  const fav = p.winAway >= 0.5 ? a : h;
  const m = Math.abs(p.margin);
  const range = (v: number) => (v > 0 ? `${a} by ${Math.round(v)}` : `${h} by ${Math.round(-v)}`);
  const open = () => {
    navigate({ view: "simulator", week: null, p: { a: `FBS:${p.away}`, b: `FBS:${p.home}`, v: p.neutral ? "n" : "b" } });
    onOpen();
  };
  return (
    <div className="gc-spp" data-testid="gc-spplus">
      <div className="gc-spp-head">
        <span className="gc-k">SP+ simulated score</span>
        <button type="button" className="gc-spp-open" onClick={open}>
          Open in CFB SP+ <span aria-hidden="true">→</span>
        </button>
      </div>
      <div className="gc-spp-score" aria-label={`SP+ simulation: ${away.name} ${one(p.awayPts)}, ${home.name} ${one(p.homePts)}`}>
        <span>
          {a} <strong>{one(p.awayPts)}</strong>
        </span>
        <span aria-hidden="true">–</span>
        <span>
          <strong>{one(p.homePts)}</strong> {h}
        </span>
      </div>
      <p className="gc-spp-sub">
        Likely final {Math.round(p.awayPts)}–{Math.round(p.homePts)} · {fav} wins {pct(Math.max(p.winAway, p.winHome))}
        {m >= 0.5 ? ` · ${fav} by ${one(m)}` : " · a toss-up"} · middle half of games: {range(p.marginRange[0])} to {range(p.marginRange[1])}
      </p>
      <p className="gc-spp-sub">
        {p.sims.toLocaleString("en-US")} simulated games from SP+ ratings through week {p.week}
        {p.neutral ? ", neutral site" : ", home field included"}.
      </p>
    </div>
  );
}
