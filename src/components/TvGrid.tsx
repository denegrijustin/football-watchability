import { useMemo, useState, type CSSProperties } from "react";
import { logos, networkLogo, tierLabel, type League } from "../data";
import { gridDays, gridGames, netRank, slot, type GridGame } from "../data/grid";

const SLOT = 30; // minutes per row
const fmt = (min: number) => {
  const h = Math.floor(min / 60) % 24,
    m = min % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const kick = (min: number) => fmt(min).replace(":00 ", " ");
const WATCH = new Set(["elite", "vgood", "good"]);

type Placed = GridGame & { minute: number; col: number };

/**
 * Linear TV grid for one day: networks across, half-hour rows down, one block
 * per game spanning its broadcast window. Worth-watching games (Good or
 * better) are lit up with their score; Background games are dimmed.
 */
export function TvGrid({ onOpen }: { onOpen: (g: GridGame) => void }) {
  const all = useMemo(gridGames, []);
  const days = useMemo(() => gridDays(all), [all]);
  const [day, setDay] = useState(() => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    return (days.find((d) => d.date >= today) ?? days[0])?.date ?? "";
  });
  const [league, setLeague] = useState<"all" | League>("all");
  const [onlyGood, setOnlyGood] = useState(false);

  const games = all.filter(
    (g) =>
      slot(g.start).date === day &&
      (league === "all" || g.league === league) &&
      (!onlyGood || WATCH.has(g.tier)),
  );

  // Columns: one per network, with extra lanes when a network (ESPN+, say)
  // carries overlapping games.
  const nets = [...new Set(games.map((g) => g.network))].sort((a, b) => netRank(a) - netRank(b) || a.localeCompare(b));
  const columns: { network: string; label: string }[] = [];
  const placed: Placed[] = [];
  for (const net of nets) {
    const lanes: number[] = []; // end minute per lane
    const firstCol = columns.length;
    const gs = games
      .filter((g) => g.network === net)
      .map((g) => ({ ...g, minute: slot(g.start).minute }))
      .sort((a, b) => a.minute - b.minute);
    for (const g of gs) {
      let lane = lanes.findIndex((end) => end <= g.minute);
      if (lane < 0) {
        lane = lanes.length;
        lanes.push(0);
        columns.push({ network: net, label: g.netLabel });
      }
      lanes[lane] = g.minute + g.minutes;
      placed.push({ ...g, col: firstCol + lane });
    }
  }
  const startMin = placed.length ? Math.floor(Math.min(...placed.map((g) => g.minute)) / SLOT) * SLOT : 12 * 60;
  const endMin = placed.length
    ? Math.ceil(Math.max(...placed.map((g) => g.minute + g.minutes)) / SLOT) * SLOT
    : startMin + 4 * 60;
  const rows = (endMin - startMin) / SLOT;
  const dayName = days.find((d) => d.date === day);
  const dateLabel = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const good = games.filter((g) => WATCH.has(g.tier)).length;

  return (
    <section className="tvgrid" aria-label="TV grid">
      <div className="tv-toolbar">
        <div className="segmented" role="group" aria-label="Day">
          {days.map((d) => (
            <button key={d.date} aria-pressed={d.date === day} onClick={() => setDay(d.date)}>
              {d.day}
            </button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label="League">
          {(["all", "NFL", "CFB"] as const).map((l) => (
            <button key={l} aria-pressed={league === l} onClick={() => setLeague(l)}>
              {l === "all" ? "All" : l === "NFL" ? "NFL" : "College"}
            </button>
          ))}
        </div>
        <button className="tv-toggle" aria-pressed={onlyGood} onClick={() => setOnlyGood((v) => !v)}>
          Worth watching only
        </button>
        <ul className="tv-key" aria-label="Key">
          <li className="k-hl">Lit: Good or better (74+)</li>
          <li className="k-mid">Watchable (64–73)</li>
          <li className="k-dim">Dimmed: Background (&lt;64)</li>
        </ul>
      </div>
      <div className="board-heading tv-heading">
        <h2>{dateLabel}</h2>
        <span role="status">
          {games.length} games · {good} worth watching
        </span>
        <span className="sort-label">Times Eastern</span>
      </div>

      {placed.length ? (
        <div className="tv-scroll" tabIndex={0} aria-label={`TV grid for ${dateLabel}. Scroll to see more networks.`}>
          <div
            className="tv-table"
            style={
              {
                gridTemplateColumns: `58px repeat(${columns.length}, minmax(118px, 1fr))`,
                gridTemplateRows: `44px repeat(${rows}, var(--tv-row))`,
              } as CSSProperties
            }
          >
            <div className="tv-corner">{dayName?.day}</div>
            {columns.map((c, i) => {
              const logo = networkLogo(c.network);
              return (
                <div key={i} className="tv-net" style={{ gridColumn: i + 2 }} title={c.label}>
                  {logo ? (
                    <span className="net-chip">
                      <img src={logo} alt={c.label} height="16" />
                    </span>
                  ) : (
                    <span className="tv-net-text">{c.label}</span>
                  )}
                </div>
              );
            })}
            {Array.from({ length: rows }, (_, r) => (
              <div
                key={`t${r}`}
                className={`tv-time ${r % 2 ? "odd" : ""}`}
                style={{ gridRow: r + 2 }}
                aria-hidden={r % 2 ? true : undefined}
              >
                {fmt(startMin + r * SLOT)}
              </div>
            ))}
            {Array.from({ length: rows }, (_, r) => (
              <div
                key={`s${r}`}
                className={`tv-stripe ${r % 2 ? "odd" : ""}`}
                style={{ gridRow: r + 2, gridColumn: `2 / span ${columns.length}` }}
              />
            ))}
            {placed.map((g) => {
              const row = Math.floor((g.minute - startMin) / SLOT) + 2;
              const span = Math.max(4, Math.round(g.minutes / SLOT));
              const cls = WATCH.has(g.tier) ? "hl" : g.tier === "bg" ? "dim" : "mid";
              const [a, h] = g.sides;
              return (
                <button
                  key={g.key}
                  className={`tv-game ${cls} ${g.tier}`}
                  style={{ gridColumn: g.col + 2, gridRow: `${row} / span ${span}` }}
                  onClick={() => onOpen(g)}
                  aria-label={`${g.matchup}, ${kick(g.minute)} on ${g.netLabel}. ${
                    g.final ? `Final ${g.final}. ` : ""
                  }Watchability ${g.score}, ${tierLabel(g.tier)}.`}
                >
                  <Side t={a} cls="away" />
                  <span className="tv-label">
                    <strong>
                      {a.abbr} @ {h.abbr}
                    </strong>
                    <span>{g.final ? `Final ${g.final}` : `${kick(g.minute)} · ${g.netLabel}`}</span>
                  </span>
                  <Side t={h} cls="home" />
                  <span className="tv-score" title={tierLabel(g.tier)}>
                    {g.score}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <h3>No games on this day with these filters.</h3>
        </div>
      )}
    </section>
  );
}

function Side({ t, cls }: { t: GridGame["sides"][number]; cls: string }) {
  return (
    <span className={`tv-side ${cls}`} style={{ background: t.color ?? "#1d2a35" }}>
      {t.tag && <span className="tv-tag">{t.tag}</span>}
      <img src={logos[t.logoId]} alt="" loading="lazy" />
    </span>
  );
}
