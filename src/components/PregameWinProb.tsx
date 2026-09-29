type Reading = { at: string; home: number; espn: number | null; market: number | null };
export type WinProbData = {
  home: number;
  espn: number | null;
  market: number | null;
  book: string | null;
  basis: string;
  history: Reading[];
};

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { weekday: "short", timeZone: "America/Chicago" });
const pct = (n: number) => `${Math.round(n)}%`;

/**
 * Pregame win probability: ESPN's matchup predictor and the sportsbook
 * moneyline (vig removed), each as an away-vs-home split bar with a 50% tick.
 * Same colors as the in-game chart on finished games: away red, home blue.
 * Once there are readings from more than one refresh, shows how it moved.
 */
export function PregameWinProb({ wp, away, home }: { wp: WinProbData; away: string; home: string }) {
  const rows = [
    wp.espn != null && { label: "ESPN predictor", home: wp.espn },
    wp.market != null && { label: `${wp.book ?? "Sportsbook"} odds`, home: wp.market },
  ].filter(Boolean) as { label: string; home: number }[];
  if (!rows.length) rows.push({ label: `From the ${wp.basis}`, home: wp.home });

  const fav = (h: number) => (h >= 50 ? home : away);
  const split = rows.length === 2 && fav(rows[0].home) !== fav(rows[1].home);
  const summary = split
    ? `Split: ESPN favors ${fav(rows[0].home)}, the odds favor ${fav(rows[1].home)}`
    : `${fav(rows[0].home)} favored`;

  const hist = wp.history.filter((h) => h.home != null);
  const first = hist[0];
  const moved = hist.length > 1 ? hist[hist.length - 1].home - first.home : 0;

  return (
    <section className="pwp" aria-label={`Pregame win probability. ${summary}.`}>
      <div className="pwp-head">
        <h4 className="micro-label">Win probability</h4>
        <span className={split ? "pwp-split" : undefined}>{summary}</span>
      </div>
      {rows.map((r) => (
        <div className="pwp-row" key={r.label}>
          <span className="pwp-label">{r.label}</span>
          <span className="pwp-val away">
            {away} {pct(100 - r.home)}
          </span>
          <span
            className="pwp-bar"
            role="img"
            aria-label={`${r.label}: ${away} ${pct(100 - r.home)}, ${home} ${pct(r.home)}`}
          >
            <i className="a" style={{ width: `${100 - r.home}%` }} />
            <i className="h" style={{ width: `${r.home}%` }} />
            <b aria-hidden="true" />
          </span>
          <span className="pwp-val home">
            {home} {pct(r.home)}
          </span>
        </div>
      ))}
      {hist.length > 1 && Math.abs(moved) >= 1 && (
        <p className="pwp-move">
          Since {day(first.at)}: {home} {pct(first.home)} → {pct(hist[hist.length - 1].home)}{" "}
          <span className={moved > 0 ? "up" : "down"}>
            ({moved > 0 ? "+" : "−"}
            {Math.abs(Math.round(moved))})
          </span>
        </p>
      )}
    </section>
  );
}
