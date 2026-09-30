export type Advanced = {
  eff: {
    tot: number | null;
    totRank: number | null;
    off: number | null;
    offRank: number | null;
    def: number | null;
    defRank: number | null;
    st: number | null;
    stRank: number | null;
  } | null;
  epa: { off: number | null; def: number | null; st: number | null } | null;
  sosRank: number | null;
  controlRank: number | null;
  qbr: { name: string; value: number | null; rank: number | null; of: number; epa: number | null } | null;
  ngs: {
    qb?: { name: string; cpoe: number | null; ttt: number | null; aggr: number | null; air: number | null } | null;
    rush?: { name: string; ryoe: number | null; ryoeTotal: number; eight: number | null } | null;
    rec?: { name: string; sep: number | null; yacoe: number | null; share: number | null } | null;
  } | null;
} | null;

type Side = { abbr: string; adv: Advanced };
const signed = (n: number | null | undefined, d = 1) =>
  n == null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(d)}`;
const num = (n: number | null | undefined, d = 1) => (n == null ? "—" : n.toFixed(d));
const rk = (r: number | null | undefined) => (r ? `#${r}` : "");
const last = (name?: string) => (name ? name.split(" ").slice(-1)[0] : "");

type Row = {
  label: string;
  hint: string;
  cell: (a: Advanced) => { v: string; sub?: string } | null;
  /** Which side is better, for highlighting: higher or lower value wins. */
  better?: (a: Advanced) => number | null;
  lowerIsBetter?: boolean;
};

const ROWS: Row[] = [
  {
    label: "Overall efficiency",
    hint: "ESPN FPI efficiency, 0–100, with league rank",
    cell: (a) => (a?.eff?.tot != null ? { v: num(a.eff.tot), sub: rk(a.eff.totRank) } : null),
    better: (a) => a?.eff?.tot ?? null,
  },
  {
    label: "Offense",
    hint: "FPI offensive efficiency (0–100)",
    cell: (a) => (a?.eff?.off != null ? { v: num(a.eff.off), sub: rk(a.eff.offRank) } : null),
    better: (a) => a?.eff?.off ?? null,
  },
  {
    label: "Defense",
    hint: "FPI defensive efficiency (0–100)",
    cell: (a) => (a?.eff?.def != null ? { v: num(a.eff.def), sub: rk(a.eff.defRank) } : null),
    better: (a) => a?.eff?.def ?? null,
  },
  {
    label: "Special teams",
    hint: "FPI special-teams efficiency (0–100)",
    cell: (a) => (a?.eff?.st != null ? { v: num(a.eff.st), sub: rk(a.eff.stRank) } : null),
    better: (a) => a?.eff?.st ?? null,
  },
  {
    label: "Net EPA / game",
    hint: "FPI expected points added per game: offense + defense + special teams",
    cell: (a) =>
      a?.epa?.off != null ? { v: signed((a.epa.off ?? 0) + (a.epa.def ?? 0) + (a.epa.st ?? 0)), sub: `O ${signed(a.epa.off)} · D ${signed(a.epa.def)}` } : null,
    better: (a) => (a?.epa?.off != null ? (a.epa.off ?? 0) + (a.epa.def ?? 0) + (a.epa.st ?? 0) : null),
  },
  {
    label: "QBR",
    hint: "ESPN Total QBR, adjusted for opponents (0–100), with rank among qualified QBs",
    cell: (a) => (a?.qbr?.value != null ? { v: num(a.qbr.value), sub: `${last(a.qbr.name)} ${rk(a.qbr.rank)}` } : null),
    better: (a) => a?.qbr?.value ?? null,
  },
  {
    label: "Completion % over expected",
    hint: "Next Gen Stats CPOE: completion rate above what the throws' difficulty predicts",
    cell: (a) => (a?.ngs?.qb?.cpoe != null ? { v: `${signed(a.ngs.qb.cpoe)}%`, sub: last(a.ngs.qb.name) } : null),
    better: (a) => a?.ngs?.qb?.cpoe ?? null,
  },
  {
    label: "Time to throw",
    hint: "Next Gen Stats average seconds from snap to throw",
    cell: (a) => (a?.ngs?.qb?.ttt != null ? { v: `${num(a.ngs.qb.ttt, 2)}s`, sub: `aggr ${num(a.ngs.qb.aggr)}%` } : null),
  },
  {
    label: "Rush yds over expected",
    hint: "Next Gen Stats RYOE per carry for the lead rusher",
    cell: (a) => (a?.ngs?.rush?.ryoe != null ? { v: `${signed(a.ngs.rush.ryoe)}/att`, sub: last(a.ngs.rush.name) } : null),
    better: (a) => a?.ngs?.rush?.ryoe ?? null,
  },
  {
    label: "Receiver separation",
    hint: "Next Gen Stats average yards of separation at the catch point, lead target",
    cell: (a) => (a?.ngs?.rec?.sep != null ? { v: `${num(a.ngs.rec.sep)} yd`, sub: last(a.ngs.rec.name) } : null),
    better: (a) => a?.ngs?.rec?.sep ?? null,
  },
  {
    label: "Schedule so far",
    hint: "FPI strength of schedule rank to date (1 = hardest)",
    cell: (a) => (a?.sosRank ? { v: `#${a.sosRank}` } : null),
    better: (a) => (a?.sosRank ? -a.sosRank : null),
  },
  {
    label: "Game control",
    hint: "FPI game-control rank: how much teams have led their games (1 = most)",
    cell: (a) => (a?.controlRank ? { v: `#${a.controlRank}` } : null),
    better: (a) => (a?.controlRank ? -a.controlRank : null),
  },
];

/** Side-by-side advanced stats and rankings for the two teams. */
export function AdvancedStats({ away, home, league }: { away: Side; home: Side; league: string }) {
  const rows = ROWS.filter((r) => r.cell(away.adv) || r.cell(home.adv));
  if (!rows.length) return null;
  return (
    <div className="detail-content adv">
      <table className="adv-table">
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Stat</span>
            </th>
            <th scope="col">{away.abbr}</th>
            <th scope="col">{home.abbr}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const a = r.cell(away.adv),
              h = r.cell(home.adv);
            const ba = r.better?.(away.adv),
              bh = r.better?.(home.adv);
            const win = ba != null && bh != null && ba !== bh ? (ba > bh ? 0 : 1) : -1;
            return (
              <tr key={r.label}>
                <th scope="row" title={r.hint}>
                  {r.label}
                </th>
                {[a, h].map((c, i) => (
                  <td key={i} className={win === i ? "adv-edge" : undefined}>
                    {c ? (
                      <>
                        <strong>{c.v}</strong>
                        {c.sub && <span>{c.sub}</span>}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="source-note">
        {league === "NFL"
          ? "NFL Next Gen Stats (season), ESPN QBR and ESPN FPI efficiencies, EPA and schedule ranks. Highlighted: the better side."
          : "ESPN QBR and ESPN FPI efficiencies and schedule ranks (the college equivalents of NFL tracking data). Highlighted: the better side."}
      </p>
    </div>
  );
}

/** One-line matchup edge: each offense against the other defense, by FPI rank. */
export function EdgeLine({ away, home }: { away: Side; home: Side }) {
  const ea = away.adv?.eff,
    eh = home.adv?.eff;
  if (!ea?.offRank || !eh?.defRank || !eh?.offRank || !ea?.defRank) return null;
  const pair = (o: Side, oe: number, d: Side, de: number) => (
    <span className={oe + 5 < de ? "edge-o" : de + 5 < oe ? "edge-d" : undefined}>
      {o.abbr} O #{oe} vs {d.abbr} D #{de}
    </span>
  );
  return (
    <p className="edge-line" title="FPI offensive and defensive efficiency ranks">
      <span className="micro-label">Matchup</span>
      {pair(away, ea.offRank, home, eh.defRank)}
      {pair(home, eh.offRank, away, ea.defRank)}
    </p>
  );
}
