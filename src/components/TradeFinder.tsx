import { useEffect, useMemo, useState } from "react";
import { logos } from "../data";
import { fetchData } from "../data/load";
import { ChipImg } from "../logoTone";
import { NFL_TEAMS } from "../trade/teams";
import { allOffers, describeAsset, findTrades, pickPackage, toLeague, tradeValue, tradesForRoster, whyNoTrade, type League, type Offer, type Player, type Trade, type TradeData } from "../trade/engine";
import { GROUPS } from "../../scripts/trade/lib.mjs";
import { acquirable, draftCapital, projectedOrder, type Buy } from "../trade/acquire";
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

function TradeCard({ t, p, compact = false }: { t: Trade; p: Player; compact?: boolean }) {
  const tone = t.realism >= 80 ? "hi" : t.realism >= 60 ? "mid" : "lo";
  return (
    <li className="tf-trade">
      <div className="tf-trade-head">
        {!compact && <Logo team={t.partner} size={28} />}
        <strong>{compact ? "This package" : (NFL_TEAMS[t.partner]?.name ?? t.partner)}</strong>
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

type Sort = "realism" | "value" | "team";

/** One club's answer for the chosen player: the package it would send, with the other ways it could do it, or why it can't. */
function OfferRow({ o, p, open, onToggle }: { o: Offer; p: Player; open: boolean; onToggle: () => void }) {
  const best = o.offers[0];
  const name = NFL_TEAMS[o.partner]?.name ?? o.partner;
  if (!best) {
    return (
      <li className="tf-offer none">
        <div className="tf-offer-head static">
          <Logo team={o.partner} size={26} />
          <span className="tf-offer-who"><b>{name}</b><small className="tf-why-not">{o.reason}</small></span>
        </div>
      </li>
    );
  }
  const tone = best.realism >= 80 ? "hi" : best.realism >= 60 ? "mid" : "lo";
  return (
    <li className={`tf-offer${open ? " open" : ""}`}>
      <button type="button" className="tf-offer-head" aria-expanded={open} onClick={onToggle}>
        <Logo team={o.partner} size={26} />
        <span className="tf-offer-who"><b>{name}</b><small>{best.get.map(describeAsset).join(" + ")}</small></span>
        <span className={`tf-real ${tone}`} title="How likely the two clubs would do it">{best.realism}</span>
      </button>
      {open && (
        <div className="tf-offer-detail">
          <ul className="tf-trades">{o.offers.map((t, i) => <TradeCard key={i} t={t} p={p} compact />)}</ul>
        </div>
      )}
    </li>
  );
}

/** Pick a club, pick one of its players, and see what it would take from each of the other 31 clubs to get him. */
function Price({ league, p }: { league: League; p: Player }) {
  const [sort, setSort] = useState<Sort>("realism");
  const [openTeam, setOpenTeam] = useState<string | null>(null);
  const offers = useMemo(() => allOffers(league, p), [league, p]);
  useEffect(() => setOpenTeam(null), [p.id]);
  const value = tradeValue(p);
  const could = offers.filter((o) => o.offers.length);
  const cannot = offers.filter((o) => !o.offers.length);
  const ordered = [...could].sort((a, b) => sort === "team" ? (NFL_TEAMS[a.partner]?.name ?? a.partner).localeCompare(NFL_TEAMS[b.partner]?.name ?? b.partner) : sort === "value" ? b.offers[0].getValue - a.offers[0].getValue || b.offers[0].realism - a.offers[0].realism : b.offers[0].realism - a.offers[0].realism || a.partner.localeCompare(b.partner));
  const ask = pickPackage(value);
  return (
    <section className="tf-price" aria-label={`What it would take to get ${p.name}`}>
      <div className="tf-card">
        <span className={`tf-rating r${Math.min(9, Math.floor(p.rating / 10))}`}>{p.rating}</span>
        <div className="tf-card-who">
          <h3>{p.name}</h3>
          <p>{NFL_TEAMS[p.team]?.name} · {p.group} · age {p.age} · {money(p.apy)} × {p.years} ({SRC[p.src]}){p.status === "R" ? " · on injured reserve" : ""}</p>
        </div>
      </div>
      <p className="tf-ask"><b>His price:</b> about {value.toLocaleString()} points on the draft chart, roughly {ask.map((k) => k.label).join(" + ")}. {could.length} of the other 31 clubs could realistically get a deal done.</p>
      <div className="tf-sorts" role="group" aria-label="Order the clubs">
        <span>Order by</span>
        {([["realism", "Most likely"], ["value", "Biggest offer"], ["team", "Team A–Z"]] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={sort === k} onClick={() => setSort(k)}>{l}</button>)}
      </div>
      <h4 className="tf-sub">What each club would send ({could.length})</h4>
      <ol className="tf-offers">
        {ordered.map((o) => <OfferRow key={o.partner} o={o} p={p} open={openTeam === o.partner} onToggle={() => setOpenTeam(openTeam === o.partner ? null : o.partner)} />)}
      </ol>
      {cannot.length > 0 && (
        <details className="tf-cannot">
          <summary>{cannot.length} clubs that could not or would not ▾</summary>
          <ul className="tf-offers">{cannot.map((o) => <OfferRow key={o.partner} o={o} p={p} open={false} onToggle={() => {}} />)}</ul>
        </details>
      )}
    </section>
  );
}

type Standings = { nfl: { conferences: { divisions: { teams: { abbr: string; pct: number; diff: number }[] }[] }[] } };

/** One player a club could buy, with the picks it would cost; opens to the reasons. */
function BuyRow({ b, open, onToggle }: { b: Buy; open: boolean; onToggle: () => void }) {
  const p = b.player;
  const tone = b.realism >= 80 ? "hi" : b.realism >= 60 ? "mid" : "lo";
  return (
    <li className={`tf-offer${open ? " open" : ""}`}>
      <button type="button" className="tf-offer-head" aria-expanded={open} onClick={onToggle}>
        <Logo team={p.team} />
        <span className="tf-offer-who"><b>{p.name}</b><small>{p.team} · {p.group} · {p.rating} · age {p.age} · {money(p.apy)} × {p.years}</small></span>
        <span className="tf-cost">{b.price.map((c) => ROUND[c.round - 1]).join(" + ")}<small>round{b.price.length > 1 ? "s" : ""}</small></span>
        <span className={`tf-real ${tone}`} title="How likely the two clubs would do it">{b.realism}</span>
      </button>
      {open && (
        <div className="tf-offer-detail">
          <ul className="tf-why">
            {b.reasons.map((r, i) => <li key={i}>{r}</li>)}
            {b.warnings.map((r, i) => <li key={`w${i}`} className="warn">{r}</li>)}
          </ul>
          <p className="tf-check">Check the real cap: <a href={otcUrl(p.team)} target="_blank" rel="noreferrer noopener">{p.team} ↗</a> (Over the Cap)</p>
        </div>
      )}
    </li>
  );
}
const ROUND = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th"];

/** The main way a trade happens: the club spends its own draft picks on a player from another club. */
function Acquire({ league, team, order }: { league: League; team: string; order: Record<string, number> }) {
  const [group, setGroup] = useState("all");
  const [sort, setSort] = useState<"fit" | "cheap" | "rating">("fit");
  const [openId, setOpenId] = useState<string | null>(null);
  const capital = useMemo(() => draftCapital(team, order), [team, order]);
  const res = useMemo(() => acquirable(league, team, capital, group === "all" ? {} : { group }), [league, team, capital, group]);
  const list = useMemo(() => {
    const l = [...res.buys];
    if (sort === "cheap") l.sort((a, b) => a.priceValue - b.priceValue || b.realism - a.realism);
    else if (sort === "rating") l.sort((a, b) => b.player.rating - a.player.rating || b.realism - a.realism);
    return l.slice(0, 60);
  }, [res, sort]);
  return (
    <div className="tf-acq">
      <p className="tf-ask"><b>Draft capital:</b> {capital.map((c) => <span key={c.round} className="tf-pickchip" title={c.label}>R{c.round} <small>#{c.overall}</small></span>)}</p>
      <div className="tf-groups" role="group" aria-label="Position">
        {["all", ...GROUPS].map((g) => <button key={g} type="button" aria-pressed={group === g} onClick={() => { setGroup(g); setOpenId(null); }}>{g === "all" ? "All" : g}</button>)}
      </div>
      <div className="tf-sorts" role="group" aria-label="Order the players">
        <span>Order by</span>
        {([["fit", "Most likely"], ["cheap", "Cheapest"], ["rating", "Highest rated"]] as const).map(([k, t]) => <button key={k} type="button" aria-pressed={sort === k} onClick={() => setSort(k)}>{t}</button>)}
      </div>
      <h4 className="tf-sub">Players {team} could buy with its picks ({res.buys.length})</h4>
      {list.length ? (
        <ol className="tf-offers" data-testid="acquire-list">
          {list.map((b) => <BuyRow key={b.player.id} b={b} open={openId === b.player.id} onToggle={() => setOpenId(openId === b.player.id ? null : b.player.id)} />)}
        </ol>
      ) : <p className="tf-nonote">No player at this position fits.</p>}
      <p className="tf-count">Left out: {res.noNeed} players who would not help {team}, {res.unaffordable} who cost more than its picks cover, {res.capBlocked} whose salary does not fit its cap room.</p>
    </div>
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
  const [pid, setPid] = useState<string | null>(null);
  const [group, setGroup] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [order, setOrder] = useState<Record<string, number>>({});
  useEffect(() => { let on = true; fetchData<Standings>("standings").then((d) => { if (on) setOrder(projectedOrder(d.nfl.conferences.flatMap((c) => c.divisions.flatMap((v) => v.teams)))); }, () => {}); return () => { on = false; }; }, []);
  useEffect(() => { let on = true; fetchData<TradeData>("trade-players").then((d) => on && setData(d), () => on && setError(true)); return () => { on = false; }; }, []);
  const league = useMemo(() => (data ? toLeague(data) : null), [data]);
  // The club's players, most valuable first, grouped by position for the picker.
  const players = useMemo(() => (league ? [...(league.byTeam.get(team) ?? [])].sort((a, b) => tradeValue(b) - tradeValue(a)) : []), [league, team]);
  const chosen = players.find((p) => p.id === pid) ?? players[0] ?? null;
  const roster = useMemo(() => (league && rosterOpen ? tradesForRoster(league, team) : []), [league, team, rosterOpen]);
  if (error) return <p role="alert" className="ol-note">The trade finder could not load. Reload the page to try again.</p>;
  if (!league || !data) return <Skeleton rows={6} />;
  const byGroup = GROUPS.map((g) => [g, players.filter((p) => p.group === g).sort((a, b) => b.rating - a.rating)] as const).filter(([, ps]) => ps.length);
  const shown = roster.filter((r) => group === "all" || r.player.group === group).map((r) => r.player);
  const withTrade = roster.filter((r) => r.trades.length).length;
  return (
    <section className="tf" aria-label="Trade finder">
      <div className="tf-top">
        <h2>Trade finder</h2>
        <div className="tf-modes" role="group" aria-label="Trade finder mode">
          <button type="button" aria-pressed={mode === "buy"} onClick={() => setMode("buy")}>Buy with picks</button>
          <button type="button" aria-pressed={mode === "sell"} onClick={() => setMode("sell")}>Shop a player</button>
        </div>
      </div>
      <div className="tf-pick">
        <label className="tf-team">
          <span className="tf-step">1 · Team</span>
          <span className="tf-selwrap"><Logo team={team} size={26} />
            <select aria-label="Team" value={team} onChange={(e) => { setTeam(e.target.value); setPid(null); setOpenId(null); }}>
              {Object.entries(NFL_TEAMS).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
            </select>
          </span>
        </label>
        {mode === "sell" && <label className="tf-player">
          <span className="tf-step">2 · Player</span>
          <select aria-label="Player" value={chosen?.id ?? ""} onChange={(e) => setPid(e.target.value)}>
            {byGroup.map(([g, ps]) => <optgroup key={g} label={g}>{ps.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.rating} · {money(p.apy)}</option>)}</optgroup>)}
          </select>
        </label>}
      </div>
      {mode === "buy" && <Acquire league={league} team={team} order={order} />}
      {mode === "sell" && <><SecHead as="h3" className="tf-h" title="How this works" info={{
        means: "Pick a club and one of its players, and see what each of the other 31 clubs would have to send to get him: a player, a pick or a package. A club only appears with an offer if he would help it (he would start, or it is short at his position), it has something your club can use that it can spare, and both clubs stay under the cap with a legal roster. “Realism” is 0 to 100; the clubs that could not or would not say why.",
        how: "Value is in the draft-pick chart's points, from the player's rating by position, his age and how his contract compares with the market. Ratings come from this and last season's production and snap share (nflverse); there are no free grades for blockers, so those are a depth-level estimate from snaps, draft slot and experience. Most contracts are estimates (rookie scale for recent draftees, the market for his rating otherwise), cap room is assumed to be the same typical amount for every club, and which picks a club owns is not checked. Official figures can be supplied in src/data/contract-overrides.json and team-cap-overrides.json.",
      }} />
      {chosen && <Price league={league} p={chosen} />}</>}
      <p className="tf-note">{mode === "buy" ? "Buying spends the club's own seven picks, each at the spot its record projects for the draft; picks already traded are not in the open data, so check them before trusting a price. " : ""}Trades are only possible inside the league's trade window; these are what-ifs for the offseason or the next deadline. {data.cap.assumed ? `Cap assumed at ${money(data.cap.limit)} with ${money(data.cap.typicalSpaceM)} of room per club; ` : ""}<a href="https://overthecap.com/salary-cap-space" target="_blank" rel="noreferrer noopener">every club's real cap room is on Over the Cap ↗</a> and on <a href="https://www.spotrac.com/nfl/cap/_/year/2026" target="_blank" rel="noreferrer noopener">Spotrac ↗</a>, and in the <a href="https://nflpa.com/reports/public-salary-cap-report" target="_blank" rel="noreferrer noopener">NFLPA's public salary cap report ↗</a>.</p>
      {mode === "sell" && <details className="tf-roster" onToggle={(e) => setRosterOpen((e.currentTarget as HTMLDetailsElement).open)}>
        <summary>The best trade for every player on the roster ▾</summary>
        {rosterOpen && (
          <>
            <div className="tf-groups" role="group" aria-label="Position">
              {["all", ...GROUPS].map((g) => <button key={g} type="button" aria-pressed={group === g} onClick={() => setGroup(g)}>{g === "all" ? "All" : g}</button>)}
            </div>
            <p className="tf-count">{withTrade} of {roster.length} players have a realistic trade; the rest say why not.</p>
            <ol className="tf-list">
              {shown.map((p) => <Row key={p.id} p={p} league={league} open={openId === p.id} onToggle={() => setOpenId(openId === p.id ? null : p.id)} />)}
            </ol>
          </>
        )}
      </details>}
    </section>
  );
}
