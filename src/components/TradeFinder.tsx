import { useEffect, useMemo, useState } from "react";
import { logos } from "../data";
import { fetchData } from "../data/load";
import { ChipImg } from "../logoTone";
import { NFL_TEAMS } from "../trade/teams";
import { describeAsset, findTrades, toLeague, tradeValue, tradesForRoster, whyNoTrade, type League, type Player, type Trade, type TradeData } from "../trade/engine";
import { GROUPS } from "../../scripts/trade/lib.mjs";
import { SecHead } from "./Info";
import { Skeleton } from "./Skeleton";
import "../tradeFinder.css";

const money = (m: number) => `$${m >= 10 ? Math.round(m) : m.toFixed(1)}M`;
/** Over the Cap's own page for a club's cap: linked, not copied (their terms forbid copying their data), so a reader can check the real figures. */
const otcUrl = (team: string) => `https://overthecap.com/salary-cap/${(NFL_TEAMS[team]?.name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
const SRC: Record<Player["src"], string> = { k: "known contract", r: "rookie scale", e: "estimated", o: "supplied" };

function Logo({ team, size = 22 }: { team: string; size?: number }) {
  const t = NFL_TEAMS[team];
  const src = t ? logos[t.logo] : undefined;
  return src ? <ChipImg src={src} size={size} /> : <span className="tf-nologo" aria-hidden="true">{team}</span>;
}

function Cap({ label, side }: { label: string; side: Trade["from"] }) {
  return (
    <span className={`tf-cap${side.ok ? "" : " bad"}`}>
      <b>{label}</b> cap room {money(side.before)} → {money(side.after)} <i>({side.change >= 0 ? "+" : "−"}{money(Math.abs(side.change))})</i>
    </span>
  );
}

function TradeCard({ t, p }: { t: Trade; p: Player }) {
  const tone = t.realism >= 80 ? "hi" : t.realism >= 60 ? "mid" : "lo";
  return (
    <li className="tf-trade">
      <div className="tf-trade-head">
        <Logo team={t.partner} size={28} />
        <strong>{NFL_TEAMS[t.partner]?.name ?? t.partner}</strong>
        <span className={`tf-real ${tone}`} title="How likely the two clubs would do it: even value, a real need, both caps work, no hole left behind">{t.realism}<small>realism</small></span>
      </div>
      <p className="tf-swap">
        <span className="tf-give"><b>{p.team} sends</b> {p.name} ({p.group}, {p.rating}, {money(p.apy)})</span>
        <span className="tf-get"><b>{t.partner} sends</b> {t.get.map(describeAsset).join(" + ")}</span>
      </p>
      <p className="tf-caps"><Cap label={p.team} side={t.from} /><Cap label={t.partner} side={t.to} /></p>
      <p className="tf-check">Check the real cap: <a href={otcUrl(p.team)} target="_blank" rel="noreferrer noopener">{p.team} ↗</a> · <a href={otcUrl(t.partner)} target="_blank" rel="noreferrer noopener">{t.partner} ↗</a> (Over the Cap)</p>
      <ul className="tf-why">
        {t.reasons.map((r, i) => <li key={i}>{r}</li>)}
        {t.warnings.map((r, i) => <li key={`w${i}`} className="warn">{r}</li>)}
      </ul>
    </li>
  );
}

function Row({ p, league, open, onToggle }: { p: Player; league: League; open: boolean; onToggle: () => void }) {
  const trades = useMemo(() => findTrades(league, p), [league, p]);
  const best = trades[0];
  return (
    <li className={`tf-row${open ? " open" : ""}`}>
      <button type="button" className="tf-head" aria-expanded={open} onClick={onToggle}>
        <span className={`tf-rating r${Math.min(9, Math.floor(p.rating / 10))}`} title={p.measured ? "Rated from this and last season's production and playing time" : "Not enough playing time to measure: a depth-level estimate"}>{p.rating}</span>
        <span className="tf-who"><b>{p.name}</b><small>{p.group} · age {p.age} · {money(p.apy)} × {p.years} · {SRC[p.src]}{p.status === "R" ? " · IR" : ""}</small></span>
        <span className="tf-best">
          {best ? <><Logo team={best.partner} /><span className="tf-best-text">{best.get.map(describeAsset).join(" + ")}</span><span className={`tf-real ${best.realism >= 80 ? "hi" : best.realism >= 60 ? "mid" : "lo"}`}>{best.realism}</span></> : <span className="tf-none">No realistic trade</span>}
        </span>
      </button>
      {open && (
        <div className="tf-detail">
          {trades.length ? <ul className="tf-trades">{trades.map((t) => <TradeCard key={t.partner} t={t} p={p} />)}</ul> : <p className="tf-nonote">{whyNoTrade(league, p)}</p>}
          <p className="tf-value">Trade value {tradeValue(p).toLocaleString()} points (the draft-pick chart's scale).</p>
        </div>
      )}
    </li>
  );
}

/**
 * A realistic trade for every player on a club's roster: who would want him, what they could send back, and whether both clubs' caps and rosters survive it.
 * Open data only, so the ratings, the contracts and each club's cap room are estimates; the page says which.
 */
export function TradeFinder() {
  const [data, setData] = useState<TradeData | null>(null);
  const [error, setError] = useState(false);
  const [team, setTeam] = useState("KC");
  const [group, setGroup] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => { let on = true; fetchData<TradeData>("trade-players").then((d) => on && setData(d), () => on && setError(true)); return () => { on = false; }; }, []);
  const league = useMemo(() => (data ? toLeague(data) : null), [data]);
  const roster = useMemo(() => (league ? tradesForRoster(league, team) : []), [league, team]);
  if (error) return <p role="alert" className="ol-note">The trade finder could not load. Reload the page to try again.</p>;
  if (!league || !data) return <Skeleton rows={6} />;
  const shown = roster.filter((r) => group === "all" || r.player.group === group).map((r) => r.player);
  const withTrade = roster.filter((r) => r.trades.length).length;
  return (
    <section className="tf" aria-label="Trade finder">
      <div className="tf-top">
        <h2>Trade finder</h2>
        <label className="tf-team">
          <span className="sr-only">Team</span>
          <Logo team={team} size={26} />
          <select value={team} onChange={(e) => { setTeam(e.target.value); setOpenId(null); }}>
            {Object.entries(NFL_TEAMS).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
          </select>
        </label>
      </div>
      <SecHead as="h3" className="tf-h" title="How this works" info={{
        means: "For every player on the roster, the best few trades another club could realistically agree to: the other club would start him or needs the depth, sends back a player your club can use and/or a pick of the right value, and both clubs stay under the cap with a legal roster. “Realism” is 0 to 100.",
        how: "Value is in the draft-pick chart's points, from the player's rating by position, his age and how his contract compares with the market. Ratings come from this and last season's production and snap share (nflverse); there are no free grades for blockers, so those are a depth-level estimate from snaps, draft slot and experience. Most contracts are estimates (rookie scale for recent draftees, the market for his rating otherwise), cap room is assumed to be the same typical amount for every club, and which picks a club owns is not checked. Official figures can be supplied in src/data/contract-overrides.json and team-cap-overrides.json.",
      }} />
      <p className="tf-note">Trades are only possible inside the league's trade window; these are what-ifs for the offseason or the next deadline. {data.cap.assumed ? `Cap assumed at ${money(data.cap.limit)} with ${money(data.cap.typicalSpaceM)} of room per club; ` : ""}<a href="https://overthecap.com/salary-cap-space" target="_blank" rel="noreferrer noopener">every club's real cap room is on Over the Cap ↗</a>.</p>
      <div className="tf-groups" role="group" aria-label="Position">
        {["all", ...GROUPS].map((g) => <button key={g} type="button" aria-pressed={group === g} onClick={() => setGroup(g)}>{g === "all" ? "All" : g}</button>)}
      </div>
      <p className="tf-count">{withTrade} of {roster.length} players have a realistic trade; the rest say why not.</p>
      <ol className="tf-list">
        {shown.map((p) => <Row key={p.id} p={p} league={league} open={openId === p.id} onToggle={() => setOpenId(openId === p.id ? null : p.id)} />)}
      </ol>
    </section>
  );
}
