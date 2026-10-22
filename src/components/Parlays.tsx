import { useEffect, useMemo, useState } from "react";
import { logos, slate } from "../data";
import { fetchData } from "../data/load";
import { buildModel } from "../spplus/data/model";
import type { Snapshot } from "../spplus/data/snapshotTypes";
import type { Model } from "../spplus/data/types";
import type { SpLite } from "../spplus/lite";
import type { NflData } from "../nfl/types";
import { logoSlug } from "../nfl/model";
import { cfbLegs, nflLegs } from "../parlayLegs";
import { STRENGTH_LABEL, strengthOf } from "../livePicks";
import { BREAK_EVEN, american, byGame, recommend, type Leg, type Parlay } from "../parlay";
import { ChipImg } from "../logoTone";
import { freshNfl, useLines } from "../lines";
import { freshCfbModel } from "../spplus/data/freshLines";
import { LinesBar } from "./LinesBar";

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
  const st = strengthOf(leg.cover);
  return (
    <li className="pl-leg">
      <LegLogo leg={leg} model={model} />
      <span className="pl-main"><b>{leg.label}</b><small>{showLeague ? `${leg.league} · ` : ""}{leg.game} · {kick(leg.when)}</small></span>
      <span className="pl-chance"><b>{pct(leg.cover)}</b>{st && <small className={`lp-tier ${st}`}>{STRENGTH_LABEL[st]}</small>}</span>
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
        <div><dt>Model chance</dt><dd>{pct(s.p, s.p < 0.1 ? 1 : 0)}</dd></div>
        <div><dt>Pays at −110</dt><dd>{american(s.american)}</dd></div>
        <div><dt>Break-even</dt><dd>{pct(1 / s.decimal, 1)}</dd></div>
        <div><dt>$10 wins</dt><dd>${((s.decimal - 1) * 10).toFixed(2)}</dd></div>
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
  const [data, setData] = useState<{ model: Model; espn: Record<string, string>; nfl: NflData } | null>(null);
  const [err, setErr] = useState(false);
  const [scope, setScope] = useState<"league" | "all">("league");
  const [kinds, setKinds] = useState<{ spread: boolean; total: boolean }>({ spread: true, total: true });
  const [min, setMin] = useState(0.55);
  const [week, setWeek] = useState(true);
  const { lines } = useLines();
  useEffect(() => {
    let live = true;
    Promise.all([fetchData<Snapshot>("spplus"), fetchData<SpLite>("spplus-lite").catch(() => ({ espn: {} } as SpLite)), fetchData<NflData>("nfl")])
      .then(([snap, lite, nfl]) => live && setData({ model: buildModel(snap), espn: lite.espn ?? {}, nfl }), () => live && setErr(true));
    return () => { live = false; };
  }, []);

  const pool = useMemo(() => {
    if (!data) return [];
    const games = slate.games as never as Parameters<typeof cfbLegs>[2];
    const all = [...(scope === "all" || league === "CFB" ? cfbLegs(freshCfbModel(data.model, lines, data.espn), data.espn, games) : []), ...(scope === "all" || league === "NFL" ? nflLegs(freshNfl(data.nfl, lines), games) : [])];
    const day = (l: Leg) => Date.parse(l.when.slice(0, 10));
    const first = Math.min(...all.map(day).filter(Number.isFinite));
    return all.filter((l) => kinds[l.kind] && (!week || !Number.isFinite(first) || day(l) <= first + 6 * 864e5));
  }, [data, scope, league, kinds, week, lines]);
  const slips = useMemo(() => recommend(pool, { minCover: min }), [pool, min]);
  const games = useMemo(() => byGame(pool, 0.5), [pool]);
  const showLeague = scope === "all";
  const label = league === "CFB" ? "College" : "NFL";

  if (err) return <p className="ol-note">The picks could not be loaded. Reload to try again.</p>;
  if (!data) return <p className="ol-note" role="status">Loading the picks…</p>;
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
            <option value={BREAK_EVEN}>52.4% (break-even)</option>
            <option value={0.55}>55%</option>
            <option value={0.58}>58%</option>
            <option value={0.6}>60%</option>
          </select>
        </label>
      </div>
      <LinesBar />
      <p className="ol-note pl-warn">
        <b>Read this first.</b> A parlay only pays if every leg hits, so one miss loses the slip. Each leg is priced at −110. The chances are the model's own, and its picks have not beaten the line so far this season, so treat them as a ranking of the picks rather than as a promise. Bet only what you can afford to lose, and check the line at your book before you place anything: lines move.
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
