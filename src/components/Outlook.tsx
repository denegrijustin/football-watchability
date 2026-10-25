import { useEffect, useState } from "react";
import { logos, type League } from "../data";
import { fetchData } from "../data/load";
import { ChipImg } from "../logoTone";
import { Skeleton } from "./Skeleton";
import { LeverageChart, LeverageGames, type Leverage } from "./Leverage";
import { TeamOpen } from "../openTeam";
import "../tracker.css";

type Team = { id: string; name: string; abbr: string; logoId: string | null };
type Seed = Team & {
  seed: number;
  bye: boolean;
  bid: string;
  record: string;
  rank?: number;
  conf?: string | null;
  division?: string | null;
  projW?: number | null;
  pPlayoffs?: number | null;
  pConf?: number | null;
  pDiv?: number | null;
  pTitle?: number | null;
};
type Out = Team & Partial<Seed>;
type Ranked = Team & {
  rank: number;
  conf: string | null;
  record: string;
  ap: number | null;
  coaches: number | null;
  cfp: number | null;
  fpiRank: number | null;
  composite: number;
  pConf?: number | null;
  confRank?: number;
};
type CfbGridRow = Team & {
  conf: string;
  record: string;
  rank: number;
  expW: number;
  pSeed: number[];
  pPlayoffs: number;
  pBye: number;
  pConfTitle: number;
};
type GridRow = Team & {
  division: string;
  record: string;
  expW: number;
  pSeed: number[];
  pPlayoffs: number;
  pDiv: number;
};
type TrackerTeam = Team & { conf?: string; record?: string; p: number; q?: (number | null)[]; win?: number | null; not?: number | null };
type Tracker = { spots: number; inRace: number; tiers: { key: string; label: string; note: string; teams: TrackerTeam[] }[] };
type Stamp = { cycle: string; built: string; fpiUpdated: string | null };
const TOP = 120;
type Data = {
  cfb?: Stamp & {
    sources: string[];
    sim: { sims: number; games: number } | null;
    leverage?: Leverage | null;
    tracker?: Tracker | null;
    grid: CfbGridRow[] | null;
    composite: Ranked[];
    playoff: { field: Seed[]; out: Out[]; rules: { teams: number; autoBids: number; byes: number } };
    bowls: { eligible: number; conferences: { name: string; teams: number; eligible: (Out & { pBowl: number })[]; bubble: (Out & { pBowl: number })[] }[] };
  };
  nfl?: Stamp & { sim: { sims: number; games: number } | null; leverage?: Leverage | null; conferences: Record<string, { field: Seed[]; out: Out[]; grid: GridRow[] | null; tracker?: Tracker | null }> };
};

const pct = (n?: number | null) => (n == null ? "–" : n >= 99.5 ? ">99%" : n < 0.5 ? "<1%" : `${Math.round(n)}%`);
const POLL: Record<string, string> = { fpi: "ESPN FPI", ap: "AP", coaches: "Coaches", cfp: "CFP committee" };
const dayText = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function Logo({ t }: { t: Team }) {
  const src = t.logoId ? logos[t.logoId] : undefined;
  return src ? <ChipImg className="ol-logo" src={src} size={24} /> : <span className="ol-chip" aria-hidden="true">{t.abbr.slice(0, 3)}</span>;
}

function SeedRow({ s, odds, tag }: { s: Seed; odds: [string, number | null | undefined][]; tag: string }) {
  return (
    <li className={`ol-row${s.bye ? " bye" : ""}`}>
      <b className="ol-seed" aria-label={`Seed ${s.seed}`}>{s.seed}</b>
      <Logo t={s} />
      <span className="ol-team">
        <strong>{s.name}</strong>
        <small>
          {s.record}
          {s.conf ? ` · ${s.conf}` : ""} · {tag}
          {s.bye ? " · first-round bye" : ""}
        </small>
      </span>
      <span className="ol-odds">
        {odds.map(([k, v]) => (
          <span key={k}>
            <b>{pct(v)}</b>
            <small>{k}</small>
          </span>
        ))}
      </span>
    </li>
  );
}

const cell = (v: number) => (v >= 0.5 ? (v >= 99.5 ? "100" : v.toFixed(v < 10 ? 1 : 0)) : "–");
const heat = (v: number) => (v >= 0.5 ? { background: `color-mix(in srgb, var(--lime) ${Math.min(70, Math.round(v * 0.9 + 6))}%, transparent)` } : undefined);

/** Every team against every seed: how often the season ends with it there. The shaded columns are the first-round byes. */
function SeedGrid({
  label,
  rows,
  seeds,
  byes,
  extra,
}: {
  label: string;
  rows: { id: string; name: string; abbr: string; logoId: string | null; sub: string; expW: number; pSeed: number[]; cols: number[] }[];
  seeds: number;
  byes: number;
  extra: string[];
}) {
  return (
    <div className="ol-gridwrap" role="region" aria-label={label} tabIndex={0}>
      <table className="ol-grid">
        <thead>
          <tr>
            <th scope="col">Team</th>
            <th scope="col" title="Expected wins">Exp W</th>
            {Array.from({ length: seeds }, (_, i) => i + 1).map((n) => (
              <th scope="col" key={n} className={n <= byes ? `bye${n === byes ? " edge" : ""}` : undefined} title={n <= byes ? `Seed ${n}: first-round bye` : `Seed ${n}`}>
                #{n}
              </th>
            ))}
            {extra.map((c) => (
              <th scope="col" key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <th scope="row">
                <span className="ol-name">
                  <Logo t={r} />
                  <span>
                    <strong>{r.name}</strong>
                    <small>{r.sub}</small>
                  </span>
                </span>
              </th>
              <td data-l="Exp W">{r.expW.toFixed(1)}</td>
              {r.pSeed.map((v, i) => (
                <td key={i} data-l={`#${i + 1}`} className={`cell${i < byes ? ` bye${i === byes - 1 ? " edge" : ""}` : ""}`} style={heat(v)}>
                  {cell(v)}
                </td>
              ))}
              {r.cols.map((v, i) => (
                <td key={i} data-l={extra[i]} className={i === 0 ? "tot" : undefined}>{pct(v)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OutRow({ t }: { t: Out }) {
  return (
    <li className="ol-out">
      <Logo t={t} />
      <span>{t.name}</span>
      <small>
        {t.record}
        {t.rank ? ` · #${t.rank}` : ""}
        {t.pPlayoffs != null ? ` · ${pct(t.pPlayoffs)} to make it` : ""}
      </small>
    </li>
  );
}

/**
 * Rankings and projections from ESPN FPI (scripts/build-outlook.mjs): the college composite
 * ranking, projected College Football Playoff field and bowl picture, and the projected NFL
 * playoff field. College is rebuilt Sunday mornings, the NFL Tuesday mornings.
 */
function RankingTable({ cfb, conf, setConf, shown, setShown }: { cfb: NonNullable<Data["cfb"]>; conf: string; setConf: (c: string) => void; shown: number; setShown: (n: number) => void }) {
  const confs = [...new Set(cfb.composite.map((t) => t.conf ?? ""))].filter(Boolean).sort((a, b) => a.localeCompare(b));
  const all = conf === "all";
  const rows = all ? cfb.composite.slice(0, TOP) : cfb.composite.filter((t) => t.conf === conf);
  const shownRows = all ? rows.slice(0, shown) : rows;
  const hasCfp = cfb.sources.includes("cfp");
  return (
    <>
      <p className="ol-note">
        Composite of {cfb.sources.map((k) => POLL[k] ?? k).join(", ")}: the average rank, with a team outside a poll's top 25 counted as 30
        {hasCfp ? " and the committee's rank counted double" : "; the committee's CFP ranking joins when it is first released"}. Rebuilt every Sunday morning.
      </p>
      <label className="ol-pick">
        <span>Conference</span>
        <select value={conf} onChange={(e) => { setConf(e.target.value); setShown(25); }} aria-label="Conference">
          <option value="all">All FBS (top {TOP})</option>
          {confs.map((c) => (
            <option key={c} value={c}>{c === "Ind" ? "Independents" : c}</option>
          ))}
        </select>
      </label>
      <table className="ol-table" aria-label={all ? `Top ${TOP} composite ranking` : `${conf} composite ranking`}>
        <thead>
          <tr>
            <th scope="col">{all ? "#" : "Conf"}</th>
            <th scope="col">Team</th>
            {!all && <th scope="col" title="Overall composite rank">All</th>}
            <th scope="col">AP</th>
            <th scope="col">Coach</th>
            {hasCfp && <th scope="col">CFP</th>}
            <th scope="col">FPI</th>
            {!all && <th scope="col" title="Chance to win the conference (ESPN FPI)">Title</th>}
          </tr>
        </thead>
        <tbody>
          {shownRows.map((t, i) => (
            <tr key={t.id}>
              <th scope="row">{all ? t.rank : (t.confRank ?? i + 1)}</th>
              <td>
                <span className="ol-name">
                  <Logo t={t} />
                  <span>
                    <strong>{t.name}</strong>
                    <small>{t.record} · {t.conf === "Ind" ? "Independent" : t.conf}</small>
                  </span>
                </span>
              </td>
              {!all && <td>{t.rank}</td>}
              <td>{t.ap ?? "–"}</td>
              <td>{t.coaches ?? "–"}</td>
              {hasCfp && <td>{t.cfp ?? "–"}</td>}
              <td>{t.fpiRank ?? "–"}</td>
              {!all && <td>{t.conf === "Ind" ? "–" : pct(t.pConf)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {all && shown < rows.length && (
        <button type="button" className="ol-more" onClick={() => setShown(rows.length)}>
          Show all {rows.length}
        </button>
      )}
    </>
  );
}

/** Playoff leverage: how much the next game moves each team's playoff odds (the same simulations as the seed grid, split by that game's result). */
function LeveragePart({ lev, sims, cycle, dow, league }: { lev?: Leverage | null; sims?: number; cycle: string; dow: string; league: "NFL" | "College" }) {
  if (!lev) return <p className="ol-note">Playoff leverage appears once the schedule has been fetched and the simulation has run.</p>;
  return (
    <>
      <h3 className="lev-h">{league === "NFL" ? "NFL" : "College football"} playoff leverage · going into week {lev.week}</h3>
      <p className="ol-note">
        Each logo sits at the team's playoff chance now. The orange end is its chance if it loses its next game, the blue end if it wins; the longer the bar, the more the game matters. Teams on a bye show only where they stand.
        {league === "NFL" ? " " : " Teams with no realistic shot are left out. "}
        From {sims?.toLocaleString() ?? "many"} simulations of the rest of the season, as of the {dow} {dayText(cycle)} refresh (updates every {dow}). A team that already played this week is left out.
      </p>
      <LeverageChart rows={lev.rows} label={`${league} playoff chances now, after a loss and after a win`} />
      {lev.games.length > 0 && (
        <>
          <h3 className="lev-h">Leverage by game</h3>
          <p className="ol-note">Both teams' swings added together (a game where one result moves two playoff races is worth the most). Darker means bigger.</p>
          <LeverageGames games={lev.games} />
        </>
      )}
    </>
  );
}

const TIER_NOTE: Record<string, string> = {
  clinched: "In the field in every simulated season.",
  safe: "Still makes the field in at least half the simulated seasons where it loses two or more more games.",
  thin: "Makes the field at least half the time if it loses one more game, but not two.",
  table: "Makes the field at least half the time only if it wins out.",
  must: "Makes it mostly by winning its conference (the automatic bid); almost never without the title.",
  life: "Needs to win and get help: under half even if it wins out.",
  favored: "More likely in than not.",
  toss: "Close to a coin flip.",
  under: "Needs things to go its way.",
  long: "A real but small chance.",
  g6: "A Group of 6 school with a real chance; the highest-ranked champion from the group gets one spot.",
  out: "Under a 1% chance.",
};

/** The playoff picture in tiers, from clinched to eliminated, built from the same simulated seasons as the seed grid. Each logo opens the team's profile. */
function TrackerPart({ tracker, title, sims, nfl = false, league, compact = false, headExtra }: { tracker?: Tracker | null; title: string; sims?: number; nfl?: boolean; league: "CFB" | "NFL"; /** One row per tier, the note under its label: the NFL tracker fits on a phone screen. */ compact?: boolean; /** Shown in place of the title (the conference switch). */ headExtra?: React.ReactNode }) {
  if (!tracker) return <p className="ol-note">The playoff tracker appears once the schedule has been fetched and the simulation has run.</p>;
  const clinched = tracker.tiers.find((t) => t.key === "clinched")?.teams ?? [];
  return (
    <section className={`tk${compact ? " compact" : ""}`} aria-label={title}>
      <header className="tk-head">
        {headExtra ?? <h3>{title}</h3>}
        <p><b>{tracker.spots}</b> spots · <b>{tracker.inRace}</b> teams in contention</p>
      </header>
      {tracker.tiers.map((tier) => (
        <section key={tier.key} className={`tk-tier ${tier.key}`} aria-label={tier.label}>
          <div className="tk-top" title={TIER_NOTE[tier.key]}>
            <h4>{tier.label} <small>{tier.note}</small></h4>
            <span className="tk-count" aria-label={`${tier.teams.length} teams`}>{tier.key === "clinched" ? `${clinched.length}/${tracker.spots}` : tier.teams.length}</span>
          </div>
          {tier.key === "clinched" ? (
            <ul className="tk-logos slots">
              {Array.from({ length: tracker.spots }, (_, i) => clinched[i] ? <li key={clinched[i].id}><TrackerLogo t={clinched[i]} league={league} /></li> : <li key={`a${i}`} className="avail" aria-hidden="true">AVAIL</li>)}
            </ul>
          ) : tier.teams.length ? (
            <ul className="tk-logos">{tier.teams.map((t) => <li key={t.id}><TrackerLogo t={t} league={league} /></li>)}</ul>
          ) : (
            <p className="tk-none">{tier.key === "safe" ? "No teams are safe." : tier.key === "clinched" ? "None yet." : tier.key === "must" ? "None yet — fills in as the season plays out." : "None."}</p>
          )}
        </section>
      ))}
      <p className="ol-note tk-foot">
        From {sims?.toLocaleString() ?? "many"} simulated seasons ({nfl ? "each won by the better ESPN FPI team, ties split evenly" : "each game won by the better ESPN FPI team; the field is ordered by FPI minus 6 points per loss"}). {nfl ? "Each tier is a band of playoff odds." : "A tier is where a team's odds cross 50% when it loses 0, 1 or 2+ more games."} {Object.values(TIER_NOTE).length ? "Touch a logo for the team's profile." : ""}
      </p>
    </section>
  );
}

/** The NFL tracker, one conference at a time (switch between AFC and NFC), so every tier shows without scrolling on a phone. */
function NflTracker({ nfl }: { nfl: NonNullable<Data["nfl"]> }) {
  const confs = Object.keys(nfl.conferences);
  const [conf, setConf] = useState(confs[0] ?? "AFC");
  const c = nfl.conferences[conf];
  return (
    <TrackerPart
      tracker={c?.tracker}
      title={`${conf} playoff tracker`}
      sims={nfl.sim?.sims}
      nfl
      league="NFL"
      compact
      headExtra={
        <div className="segmented tk-conf" role="group" aria-label="Conference">
          {confs.map((k) => <button key={k} type="button" aria-pressed={conf === k} onClick={() => setConf(k)}>{k}</button>)}
        </div>
      }
    />
  );
}

function TrackerLogo({ t, league }: { t: TrackerTeam; league: "CFB" | "NFL" }) {
  const odds = [t.q?.[0] != null ? `${pct(t.q[0])} if it wins out` : null, t.q?.[1] != null ? `${pct(t.q[1])} with one more loss` : null, t.q?.[2] != null ? `${pct(t.q[2])} with two more` : null].filter(Boolean).join(" · ");
  return (
    <TeamOpen className="img tk-team" team={{ league, name: t.name, abbr: t.abbr }}>
      <span title={`${t.name}${t.record ? ` ${t.record}` : ""}${t.conf ? ` · ${t.conf}` : ""} — ${pct(t.p)} to make the field${odds ? ` (${odds})` : ""}`}>
        <Logo t={t} />
        <span className="sr-only">{t.name}</span>
      </span>
    </TeamOpen>
  );
}

export function Outlook({ defaultLeague }: { defaultLeague: League }) {
  const [data, setData] = useState<Data | null>(null);
  const [league, setLeague] = useState<League>(defaultLeague);
  const [part, setPart] = useState<"playoff" | "tracker" | "leverage" | "ranking" | "bowls">("playoff");
  const [shown, setShown] = useState(25);
  const [conf, setConf] = useState("all");
  useEffect(() => {
    let live = true;
    fetchData<Data>("outlook").then((m) => live && setData(m));
    return () => {
      live = false;
    };
  }, []);

  const cfb = data?.cfb;
  const nfl = data?.nfl;
  return (
    <section className="ol" aria-label="Rankings and projections">
      <div className="ol-controls">
        <div className="segmented" role="group" aria-label="League">
          <button aria-pressed={league === "CFB"} onClick={() => setLeague("CFB")}>College</button>
          <button aria-pressed={league === "NFL"} onClick={() => setLeague("NFL")}>NFL</button>
        </div>
        {league === "NFL" && (
          <div className="segmented" role="group" aria-label="Outlook section">
            <button aria-pressed={part === "playoff"} onClick={() => setPart("playoff")}>Seeds</button>
            <button aria-pressed={part === "tracker"} onClick={() => setPart("tracker")}>Tracker</button>
            <button aria-pressed={part === "leverage"} onClick={() => setPart("leverage")}>Leverage</button>
          </div>
        )}
        {league === "CFB" && (
          <div className="segmented" role="group" aria-label="Outlook section">
            <button aria-pressed={part === "playoff"} onClick={() => setPart("playoff")}>Playoff</button>
            <button aria-pressed={part === "tracker"} onClick={() => setPart("tracker")}>Tracker</button>
            <button aria-pressed={part === "leverage"} onClick={() => setPart("leverage")}>Leverage</button>
            <button aria-pressed={part === "ranking"} onClick={() => setPart("ranking")}>Rankings</button>
            <button aria-pressed={part === "bowls"} onClick={() => setPart("bowls")}>Bowls</button>
          </div>
        )}
      </div>
      {!data ? (
        <Skeleton rows={5} kind="row" />
      ) : league === "NFL" ? (
        !nfl ? (
          <p className="ol-note">The NFL outlook has not been built yet.</p>
        ) : part === "leverage" ? (
          <LeveragePart lev={nfl.leverage} sims={nfl.sim?.sims} cycle={nfl.cycle} dow="Tuesday" league="NFL" />
        ) : part === "tracker" ? (
          <NflTracker nfl={nfl} />
        ) : (
          <>
            <p className="ol-note">
              As of the Tuesday {dayText(nfl.cycle)} refresh; updates every Tuesday morning. Division winners take seeds 1–4, then the three best remaining records; only seed 1 gets a bye.
            </p>
            {nfl.sim ? (
              <p className="ol-note">
                Odds come from playing out the rest of the schedule {nfl.sim.sims.toLocaleString()} times ({nfl.sim.games} games left), each won by the better ESPN FPI team with a home-field edge.
                Ties for a seed are split evenly instead of using head-to-head tiebreakers, so treat close races as close. Each cell is the chance of finishing in that seed; the shaded #1 column is the
                chance at the first-round bye.
              </p>
            ) : (
              <p className="ol-note">The seed grid appears once the schedule has been fetched; until then only ESPN's playoff odds are shown.</p>
            )}
            <div className="ol-cols">
              {Object.entries(nfl.conferences).map(([conf, c]) => (
                <div key={conf} className={c.grid ? "ol-wide" : undefined}>
                  <h3>{conf}</h3>
                  {c.grid ? (
                    <SeedGrid
                      label={`${conf} seed odds`}
                      seeds={7}
                      byes={1}
                      extra={["Playoffs", "Division"]}
                      rows={c.grid.map((r) => ({ ...r, sub: `${r.record} · ${r.division.replace(/^(AFC|NFC) /, "")}`, cols: [r.pPlayoffs, r.pDiv] }))}
                    />
                  ) : (
                    <>
                      <ol className="ol-list" aria-label={`${conf} playoff seeds`}>
                        {c.field.map((s) => (
                          <SeedRow key={s.id} s={{ ...s, conf: s.division }} tag={s.bid} odds={[["playoffs", s.pPlayoffs], ["division", s.pDiv], ["title", s.pTitle]]} />
                        ))}
                      </ol>
                      <p className="ol-sub">First out</p>
                      <ul className="ol-outs">{c.out.map((t) => <OutRow key={t.id} t={t} />)}</ul>
                    </>
                  )}
                </div>
              ))}
            </div>
          </>
        )
      ) : !cfb ? (
        <p className="ol-note">The college outlook has not been built yet.</p>
      ) : part === "leverage" ? (
        <LeveragePart lev={cfb.leverage} sims={cfb.sim?.sims} cycle={cfb.cycle} dow="Sunday" league="College" />
      ) : part === "tracker" ? (
        <TrackerPart tracker={cfb.tracker} title="College Football Playoff tracker" sims={cfb.sim?.sims} league="CFB" />
      ) : part === "playoff" ? (
        <>
          <p className="ol-note">
            Projected {cfb.playoff.rules.teams}-team field as of the Sunday {dayText(cfb.cycle)} refresh; updates every Sunday morning. The {cfb.playoff.rules.autoBids} highest-ranked
            projected conference champions get in, plus the next best teams, seeded by composite rank. Seeds 1–{cfb.playoff.rules.byes} get a first-round bye.
          </p>
          {cfb.grid && cfb.sim && (
            <>
              <p className="ol-note">
                Odds come from playing out the rest of the regular season {cfb.sim.sims.toLocaleString()} times ({cfb.sim.games} games left), each won by the better ESPN FPI team with a home-field edge. A team's conference champion is whoever finishes with the best
                conference record (the title games aren't played), the five best champions get in, and the field is ordered by FPI minus 6 points per loss, a stand-in for the selection committee. Each cell is the chance of that seed;
                the shaded #1–#{cfb.playoff.rules.byes} columns are the first-round byes. Teams under 0.5% are left out.
              </p>
              <SeedGrid
                label="Playoff seed odds"
                seeds={cfb.playoff.rules.teams}
                byes={cfb.playoff.rules.byes}
                extra={["Playoffs", "Bye", "Conf title"]}
                rows={cfb.grid.map((r) => ({ ...r, sub: `${r.record} · ${r.conf === "Ind" ? "Independent" : r.conf}`, cols: [r.pPlayoffs, r.pBye, r.pConfTitle] }))}
              />
              <p className="ol-sub">Field if the season ended on today's composite</p>
            </>
          )}
          <ol className="ol-list" aria-label="Projected playoff field">
            {cfb.playoff.field.map((s) => (
              <SeedRow key={s.id} s={s} tag={s.bid === "champion" ? "projected conference champion" : "at-large"} odds={[["playoffs", s.pPlayoffs], ["conf title", s.pConf], ["title", s.pTitle]]} />
            ))}
          </ol>
          <p className="ol-sub">First four out</p>
          <ul className="ol-outs">{cfb.playoff.out.map((t) => <OutRow key={t.id} t={t} />)}</ul>
        </>
      ) : part === "ranking" ? (
        <RankingTable cfb={cfb} conf={conf} setConf={setConf} shown={shown} setShown={setShown} />
      ) : (
        <>
          <p className="ol-note">
            Bowl picture: {cfb.bowls.eligible} teams are projected to reach six wins (or already have). Projected bowl matchups need each bowl's conference tie-ins, which this
            page does not have yet, so it shows who is on track to be eligible. Rebuilt every Sunday morning.
          </p>
          <ul className="ol-bowls">
            {cfb.bowls.conferences.map((g) => (
              <li key={g.name}>
                <details>
                  <summary>
                    <strong>{g.name}</strong>
                    <span>{g.eligible.length} of {g.teams} on track{g.bubble.length ? ` · ${g.bubble.length} on the bubble` : ""}</span>
                  </summary>
                  <ul className="ol-outs">
                    {g.eligible.map((t) => (
                      <li className="ol-out" key={t.id}>
                        <Logo t={t} />
                        <span>{t.name}</span>
                        <small>{t.record} · {pct(t.pBowl)} to reach 6 wins</small>
                      </li>
                    ))}
                    {g.bubble.map((t) => (
                      <li className="ol-out bubble" key={t.id}>
                        <Logo t={t} />
                        <span>{t.name}</span>
                        <small>{t.record} · bubble · {pct(t.pBowl)}</small>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
