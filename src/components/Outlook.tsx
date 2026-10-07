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
};
type Stamp = { cycle: string; built: string; fpiUpdated: string | null };
type Data = {
  cfb?: Stamp & {
    sources: string[];
    composite: Ranked[];
    playoff: { field: Seed[]; out: Out[]; rules: { teams: number; autoBids: number; byes: number } };
    bowls: { eligible: number; conferences: { name: string; teams: number; eligible: (Out & { pBowl: number })[]; bubble: (Out & { pBowl: number })[] }[] };
  };
  nfl?: Stamp & { conferences: Record<string, { field: Seed[]; out: Out[] }> };
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
export function Outlook({ defaultLeague }: { defaultLeague: League }) {
  const [data, setData] = useState<Data | null>(null);
  const [league, setLeague] = useState<League>(defaultLeague);
  const [part, setPart] = useState<"playoff" | "ranking" | "bowls">("playoff");
  const [shown, setShown] = useState(25);
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
            <button aria-pressed={part === "ranking"} onClick={() => setPart("ranking")}>Top 120</button>
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
              Projected playoff field as of the Tuesday {dayText(nfl.cycle)} refresh; updates every Tuesday morning. Division winners are seeded 1–4 by
              projected wins, then the three best remaining teams; only seed 1 gets a bye. From ESPN FPI.
            </p>
            <div className="ol-cols">
              {Object.entries(nfl.conferences).map(([conf, c]) => (
                <div key={conf}>
                  <h3>{conf}</h3>
                  <ol className="ol-list" aria-label={`${conf} playoff seeds`}>
                    {c.field.map((s) => (
                      <SeedRow key={s.id} s={{ ...s, conf: s.division }} tag={s.bid} odds={[["playoffs", s.pPlayoffs], ["division", s.pDiv], ["title", s.pTitle]]} />
                    ))}
                  </ol>
                  <p className="ol-sub">First out</p>
                  <ul className="ol-outs">{c.out.map((t) => <OutRow key={t.id} t={t} />)}</ul>
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
          <ol className="ol-list" aria-label="Projected playoff field">
            {cfb.playoff.field.map((s) => (
              <SeedRow key={s.id} s={s} tag={s.bid === "champion" ? "projected conference champion" : "at-large"} odds={[["playoffs", s.pPlayoffs], ["conf title", s.pConf], ["title", s.pTitle]]} />
            ))}
          </ol>
          <p className="ol-sub">First four out</p>
          <ul className="ol-outs">{cfb.playoff.out.map((t) => <OutRow key={t.id} t={t} />)}</ul>
        </>
      ) : part === "ranking" ? (
        <>
          <p className="ol-note">
            Composite of {cfb.sources.map((k) => POLL[k] ?? k).join(", ")}: the average rank, with a team outside a poll's top 25 counted as 30
            {cfb.sources.includes("cfp") ? " and the committee's rank counted double" : "; the committee's CFP ranking joins when it is first released"}. Rebuilt every Sunday morning.
          </p>
          <table className="ol-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Team</th>
                <th scope="col">AP</th>
                <th scope="col">Coach</th>
                {cfb.sources.includes("cfp") && <th scope="col">CFP</th>}
                <th scope="col">FPI</th>
              </tr>
            </thead>
            <tbody>
              {cfb.composite.slice(0, shown).map((t) => (
                <tr key={t.id}>
                  <th scope="row">{t.rank}</th>
                  <td>
                    <span className="ol-name">
                      <Logo t={t} />
                      <span>
                        <strong>{t.name}</strong>
                        <small>{t.record} · {t.conf}</small>
                      </span>
                    </span>
                  </td>
                  <td>{t.ap ?? "–"}</td>
                  <td>{t.coaches ?? "–"}</td>
                  {cfb.sources.includes("cfp") && <td>{t.cfp ?? "–"}</td>}
                  <td>{t.fpiRank ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown < cfb.composite.length && (
            <button type="button" className="ol-more" onClick={() => setShown(cfb.composite.length)}>
              Show all {cfb.composite.length}
            </button>
          )}
        </>
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
