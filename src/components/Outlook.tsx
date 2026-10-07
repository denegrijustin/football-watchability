import { useEffect, useState } from "react";
import { logos, type League } from "../data";

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
type Stamp = { cycle: string; built: string; fpiUpdated: string | null };
const TOP = 120;
type Data = {
  cfb?: Stamp & {
    sources: string[];
    sim: { sims: number; games: number } | null;
    grid: CfbGridRow[] | null;
    composite: Ranked[];
    playoff: { field: Seed[]; out: Out[]; rules: { teams: number; autoBids: number; byes: number } };
    bowls: { eligible: number; conferences: { name: string; teams: number; eligible: (Out & { pBowl: number })[]; bubble: (Out & { pBowl: number })[] }[] };
  };
  nfl?: Stamp & { sim: { sims: number; games: number } | null; conferences: Record<string, { field: Seed[]; out: Out[]; grid: GridRow[] | null }> };
};

const pct = (n?: number | null) => (n == null ? "–" : n >= 99.5 ? ">99%" : n < 0.5 ? "<1%" : `${Math.round(n)}%`);
const POLL: Record<string, string> = { fpi: "ESPN FPI", ap: "AP", coaches: "Coaches", cfp: "CFP committee" };
const dayText = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function Logo({ t }: { t: Team }) {
  const src = t.logoId ? logos[t.logoId] : undefined;
  return src ? <img src={src} alt="" width="28" height="28" loading="lazy" /> : <span className="ol-chip" aria-hidden="true">{t.abbr.slice(0, 3)}</span>;
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
              <td>{r.expW.toFixed(1)}</td>
              {r.pSeed.map((v, i) => (
                <td key={i} className={`cell${i < byes ? ` bye${i === byes - 1 ? " edge" : ""}` : ""}`} style={heat(v)}>
                  {cell(v)}
                </td>
              ))}
              {r.cols.map((v, i) => (
                <td key={i} className={i === 0 ? "tot" : undefined}>{pct(v)}</td>
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

export function Outlook({ defaultLeague }: { defaultLeague: League }) {
  const [data, setData] = useState<Data | null>(null);
  const [league, setLeague] = useState<League>(defaultLeague);
  const [part, setPart] = useState<"playoff" | "ranking" | "bowls">("playoff");
  const [shown, setShown] = useState(25);
  const [conf, setConf] = useState("all");
  useEffect(() => {
    let live = true;
    import("../data/outlook.json").then((m) => live && setData(m.default as unknown as Data));
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
        {league === "CFB" && (
          <div className="segmented" role="group" aria-label="Outlook section">
            <button aria-pressed={part === "playoff"} onClick={() => setPart("playoff")}>Playoff</button>
            <button aria-pressed={part === "ranking"} onClick={() => setPart("ranking")}>Rankings</button>
            <button aria-pressed={part === "bowls"} onClick={() => setPart("bowls")}>Bowls</button>
          </div>
        )}
      </div>
      {!data ? (
        <p className="ol-note" role="status">Loading…</p>
      ) : league === "NFL" ? (
        !nfl ? (
          <p className="ol-note">The NFL outlook has not been built yet.</p>
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
