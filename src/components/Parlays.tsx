import { useMemo, useState } from "react";
import { logos, slate } from "../data";
import type { Model } from "../spplus/data/types";
import { logoSlug } from "../nfl/model";
import { cfbLegs, nflLegs } from "../parlayLegs";
import { BREAK_EVEN, american, byGame, recommend, type Leg, type Parlay } from "../parlay";
import { ChipImg } from "../logoTone";
import { freshNfl, useLines } from "../lines";
import { cfbHistory, nflHistory, PROOF_LABEL } from "../calibration";
import { freshCfbModel } from "../spplus/data/freshLines";
import { LinesBar } from "./LinesBar";
import { usePickData } from "../pickData";
import { Skeleton } from "./Skeleton";

const pct = (n: number, d = 0) => `${(n * 100).toFixed(d)}%`;
const kick = (when: string) => {
  const t = Date.parse(when);
  if (!when.includes("T") || Number.isNaN(t)) return when.slice(0, 10);
  return new Date(t).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
};

function LegLogo({ leg, model }: { leg: Leg; model: Model | null }) {
  if (leg.kind === "total") return <span className="pl-ico" aria-hidden="true">{leg.label.startsWith("Over") ? "▲" : "▼"}</span>;
  const src = leg.league === "NFL" ? logos[logoSlug(leg.team ?? "")] : model?.byId.get(`FBS:${leg.team}`)?.logo?.local ?? model?.byId.get(`FBS:${leg.team}`)?.logo?.remote;
  return src ? <ChipImg src={src} size={22} /> : <span className="pl-ico" aria-hidden="true">●</span>;
}

function LegRow({ leg, model, showLeague }: { leg: Leg; model: Model | null; showLeague: boolean }) {
  const tag = leg.hist ? ({ proven: "strong", promising: "lean", unproven: "slight" } as const)[leg.hist.proof] : "slight";
  return (
    <li className="pl-leg">
      <LegLogo leg={leg} model={model} />
      <span className="pl-main"><b>{leg.label}</b><small>{showLeague ? `${leg.league} · ` : ""}{leg.game} · {kick(leg.when)}</small></span>
      <span className="pl-chance"><b title={leg.raw != null ? `The model says ${pct(leg.raw)}; history says ${pct(leg.cover)}` : undefined}>{pct(leg.cover, 1)}</b><small className={`lp-tier ${tag}`}>{leg.hist ? PROOF_LABEL[leg.hist.proof] : "No history"}</small></span>
    </li>
  );
}

function Slip({ parlay, model, showLeague, note }: { parlay: Parlay; model: Model | null; showLeague: boolean; note?: string }) {
  const s = parlay.stats;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const text = `${parlay.title}: ${parlay.legs.map((l) => `${l.label} (${l.game})`).join(" + ")} · ${american(s.american)} at −110 a leg`;
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* clipboard blocked: nothing to do */ }
  };
  return (
    <article className="pl-slip">
      <header><h4>{parlay.title}</h4><button type="button" className="btn small ghost" onClick={copy}>{copied ? "Copied" : "Copy slip"}</button></header>
      <ul className="pl-legs">{parlay.legs.map((l) => <LegRow key={l.id} leg={l} model={model} showLeague={showLeague} />)}</ul>
      <dl className="pl-stats">
        <div><dt>Chance (history)</dt><dd>{pct(s.p, 1)}</dd></div>
        <div><dt>Pays at −110</dt><dd>{american(s.american)}</dd></div>
        <div><dt>Break-even</dt><dd>{pct(1 / s.decimal, 1)}</dd></div>
        <div><dt>Expected</dt><dd className={s.ev >= 0 ? "pos" : "neg"} title="Expected profit per $1 from the history-based chances. Negative means the slip loses money on average.">{s.ev >= 0 ? "+" : "−"}{Math.abs(s.ev * 100).toFixed(0)}¢ per $1</dd></div>
      </dl>
      {note && <p className="pl-note">{note}</p>}
    </article>
  );
}

/**
 * Recommended parlays from the two leagues' picks: the most likely legs, one per game, in slips of two to four, plus each game's own best legs.
 * Odds are the standard −110 a leg; the chances are the model's, so read them as a ranking of the picks, not as promises.
 */
export function Parlays({ league }: { league: "CFB" | "NFL" }) {
  const { data, error: err } = usePickData();
  const [scope, setScope] = useState<"league" | "all">("league");
  const [kinds, setKinds] = useState<{ spread: boolean; total: boolean }>({ spread: true, total: true });
  const [min, setMin] = useState(0);
  const [week, setWeek] = useState(true);
  const { lines } = useLines();

  const pool = useMemo(() => {
    if (!data) return [];
    const games = slate.games as never as Parameters<typeof cfbLegs>[2];
    const all = [...(scope === "all" || league === "CFB" ? cfbLegs(freshCfbModel(data.model, lines, data.espn), data.espn, games, Date.now(), cfbHistory(data.model)) : []), ...(scope === "all" || league === "NFL" ? nflLegs(freshNfl(data.nfl, lines), games, Date.now(), nflHistory(data.nfl)) : [])];
    const day = (l: Leg) => Date.parse(l.when.slice(0, 10));
    const first = Math.min(...all.map(day).filter(Number.isFinite));
    return all.filter((l) => kinds[l.kind] && (!week || !Number.isFinite(first) || day(l) <= first + 6 * 864e5));
  }, [data, scope, league, kinds, week, lines]);
  const slips = useMemo(() => recommend(pool, { minCover: min }), [pool, min]);
  const games = useMemo(() => byGame(pool, 0.5), [pool]);
  const showLeague = scope === "all";
  const label = league === "CFB" ? "College" : "NFL";

  if (err) return <p className="ol-note">The picks could not be loaded. Reload to try again.</p>;
  if (!data) return <Skeleton rows={4} />;
  return (
    <>
      <div className="pl-controls">
        <div className="segmented" role="group" aria-label="Which games">
          <button aria-pressed={scope === "league"} onClick={() => setScope("league")}>{label} only</button>
          <button aria-pressed={scope === "all"} onClick={() => setScope("all")}>All football</button>
        </div>
        <div className="segmented" role="group" aria-label="Which bets">
          <button aria-pressed={kinds.spread} onClick={() => setKinds({ ...kinds, spread: !kinds.spread })}>Spreads</button>
          <button aria-pressed={kinds.total} onClick={() => setKinds({ ...kinds, total: !kinds.total })}>Totals</button>
        </div>
        <div className="segmented" role="group" aria-label="How far ahead">
          <button aria-pressed={week} onClick={() => setWeek(true)}>Next 7 days</button>
          <button aria-pressed={!week} onClick={() => setWeek(false)}>All upcoming</button>
        </div>
        <label className="pl-min">Only legs at least
          <select value={min} onChange={(e) => setMin(Number(e.target.value))} aria-label="Minimum chance for a leg">
            <option value={0}>Any</option>
            <option value={0.5}>50%</option>
            <option value={BREAK_EVEN}>52.4% (break-even)</option>
            <option value={0.55}>55%</option>
          </select>
        </label>
      </div>
      <LinesBar />
      <p className="ol-note pl-warn">
        <b>Read this first.</b> A parlay only pays if every leg hits, so one miss loses the slip. Each leg is priced at −110. The chances are what picks with the same edge have really done in the past (about a coin flip so far), not the model's more confident number, so most slips show a negative expected value. That is the honest picture today. Bet only what you can afford to lose, and check the line at your book before you place anything: lines move.
      </p>
      {slips.length ? (
        <div className="pl-slips">
          {slips.map((s) => <Slip key={s.id} parlay={s} model={data.model} showLeague={showLeague} note={s.id.endsWith("-1") ? "Shares no game with the top slip of the same size." : undefined} />)}
        </div>
      ) : (
        <p className="ol-note">Not enough legs clear {pct(min)} to build a slip. Lower the minimum chance or turn on both bet types.</p>
      )}
      <h3 className="lev-h">By game</h3>
      <p className="ol-note">Each game's best legs, with a same-game slip when both its spread and total are worth taking. The two legs of one game are linked (a blowout moves both), so that slip's chance is only approximate.</p>
      <ul className="pl-games">
        {games.map((g) => (
          <li key={g.gameId}>
            <details>
              <summary><span className="pl-gtitle"><b>{g.game}</b><small>{showLeague ? `${g.league} · ` : ""}{kick(g.when)}</small></span><span className="pl-gbest">{pct(g.legs[0].cover)} <small>best leg</small></span></summary>
              <ul className="pl-legs">{g.legs.map((l) => <LegRow key={l.id} leg={l} model={data.model} showLeague={false} />)}</ul>
              {g.same && <p className="pl-same">Same-game slip: <b>{pct(g.same.stats.p, 0)}</b> to hit, pays <b>{american(g.same.stats.american)}</b> at −110.</p>}
            </details>
          </li>
        ))}
      </ul>
      {!games.length && <p className="ol-note">No games with picks right now.</p>}
    </>
  );
}
