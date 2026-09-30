import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { logos, networkLogo, rankLine, rankTitle, results, slate, tierLabel, type League } from "../data";
import { gridDays, gridGames, netRank, slot, type GridGame } from "../data/grid";
import { useLive } from "../live";
import { GameCard } from "./GameCard";
import { ResultCard } from "./ResultCard";

const SLOT = 30; // minutes per time step
const fmt = (min: number) => {
  const h = Math.floor(min / 60) % 24,
    m = min % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const kick = (min: number) => fmt(min).replace(":00 ", " ");
const ENTERTAINING = new Set(["elite", "vgood", "good"]);

type Placed = GridGame & { minute: number; lane: number };

/** Desktop lays time left to right; phones keep it top to bottom. */
function useWide() {
  const q = "(min-width: 900px)";
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

/**
 * Linear TV grid for one day. On desktop, networks run down the side and time
 * runs left to right; on phones, networks run across and time runs down. One
 * block per game spans its broadcast window. Entertaining games (Good or
 * better) are highlighted; Background games are dimmed. A block opens the same
 * card as the main board.
 */
export function TvGrid() {
  const all = useMemo(gridGames, []);
  const days = useMemo(() => gridDays(all), [all]);
  const wide = useWide();
  const [day, setDay] = useState(() => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    return (days.find((d) => d.date >= today) ?? days[0])?.date ?? "";
  });
  const [league, setLeague] = useState<"all" | League>("all");
  const [onlyGood, setOnlyGood] = useState(false);
  const [open, setOpen] = useState<GridGame | null>(null);

  const games = all.filter(
    (g) =>
      slot(g.start).date === day &&
      (league === "all" || g.league === league) &&
      (!onlyGood || ENTERTAINING.has(g.tier)),
  );

  // Lanes: one per network, plus extra lanes when a network (ESPN+, say)
  // carries overlapping games.
  const nets = [...new Set(games.map((g) => g.network))].sort((a, b) => netRank(a) - netRank(b) || a.localeCompare(b));
  const lanes: { network: string; label: string }[] = [];
  const placed: Placed[] = [];
  for (const net of nets) {
    const ends: number[] = [];
    const first = lanes.length;
    const gs = games
      .filter((g) => g.network === net)
      .map((g) => ({ ...g, minute: slot(g.start).minute }))
      .sort((a, b) => a.minute - b.minute);
    for (const g of gs) {
      let lane = ends.findIndex((end) => end <= g.minute);
      if (lane < 0) {
        lane = ends.length;
        ends.push(0);
        lanes.push({ network: net, label: g.netLabel });
      }
      ends[lane] = g.minute + g.minutes;
      placed.push({ ...g, lane: first + lane });
    }
  }
  const startMin = placed.length ? Math.floor(Math.min(...placed.map((g) => g.minute)) / SLOT) * SLOT : 12 * 60;
  const endMin = placed.length
    ? Math.ceil(Math.max(...placed.map((g) => g.minute + g.minutes)) / SLOT) * SLOT
    : startMin + 4 * 60;
  const steps = (endMin - startMin) / SLOT;
  const dayName = days.find((d) => d.date === day);
  const dateLabel = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const good = games.filter((g) => ENTERTAINING.has(g.tier)).length;

  // In the wide layout lanes are rows and time is columns; tall is the reverse.
  const laneCell = (i: number): CSSProperties => (wide ? { gridRow: i + 2 } : { gridColumn: i + 2 });
  const timeCell = (i: number): CSSProperties => (wide ? { gridColumn: i + 2 } : { gridRow: i + 2 });
  const tableStyle: CSSProperties = wide
    ? {
        gridTemplateColumns: `112px repeat(${steps}, var(--tv-step))`,
        gridTemplateRows: `30px repeat(${lanes.length}, var(--tv-lane))`,
      }
    : {
        gridTemplateColumns: `58px repeat(${lanes.length}, minmax(118px, 1fr))`,
        gridTemplateRows: `44px repeat(${steps}, var(--tv-row))`,
      };

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
          Entertaining only
        </button>
        <ul className="tv-key" aria-label="Key">
          <li className="k-hl">Entertaining (74+)</li>
          <li className="k-mid">Watchable (64–73)</li>
          <li className="k-dim">Background (&lt;64)</li>
        </ul>
      </div>
      <div className="board-heading tv-heading">
        <h2>{dateLabel}</h2>
        <span role="status">
          {games.length} games · {good} entertaining
        </span>
        <span className="sort-label">Times Eastern</span>
      </div>

      {placed.length ? (
        <div
          className={`tv-scroll ${wide ? "wide" : "tall"}`}
          tabIndex={0}
          aria-label={`TV grid for ${dateLabel}. Scroll to see more.`}
        >
          <div className="tv-table" style={tableStyle}>
            <div className="tv-corner">{dayName?.day}</div>
            {lanes.map((c, i) => {
              const logo = networkLogo(c.network);
              return (
                <div key={i} className="tv-net" style={laneCell(i)} title={c.label}>
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
            {Array.from({ length: steps }, (_, r) => (
              <div
                key={`t${r}`}
                className={`tv-time ${r % 2 ? "odd" : ""}`}
                style={timeCell(r)}
                aria-hidden={r % 2 ? true : undefined}
              >
                {wide ? kick(startMin + r * SLOT) : fmt(startMin + r * SLOT)}
              </div>
            ))}
            {Array.from({ length: steps }, (_, r) => (
              <div
                key={`s${r}`}
                className={`tv-stripe ${r % 2 ? "odd" : ""}`}
                style={
                  wide
                    ? { gridColumn: r + 2, gridRow: `2 / span ${lanes.length}` }
                    : { gridRow: r + 2, gridColumn: `2 / span ${lanes.length}` }
                }
              />
            ))}
            {placed.map((g) => {
              const at = Math.floor((g.minute - startMin) / SLOT) + 2;
              const span = Math.max(4, Math.round(g.minutes / SLOT));
              const pos: CSSProperties = wide
                ? { gridRow: g.lane + 2, gridColumn: `${at} / span ${span}` }
                : { gridColumn: g.lane + 2, gridRow: `${at} / span ${span}` };
              return <Block key={g.key} g={g} pos={pos} onOpen={() => setOpen(g)} />;
            })}
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <h3>No games on this day with these filters.</h3>
        </div>
      )}
      <GameDialog game={open} onClose={() => setOpen(null)} />
    </section>
  );
}

function Block({ g, pos, onOpen }: { g: Placed; pos: CSSProperties; onOpen: () => void }) {
  const live = useLive(g.espnId);
  const cls = ENTERTAINING.has(g.tier) ? "hl" : g.tier === "bg" ? "dim" : "mid";
  const [a, h] = g.sides;
  const status = g.final
    ? `Final ${g.final}`
    : live && live.state !== "pre"
      ? `${live.state === "post" ? "Final" : live.detail} · ${live.away}–${live.home}`
      : `${kick(g.minute)} · ${g.netLabel}`;
  return (
    <button
      className={`tv-game ${cls} ${g.tier}${live?.state === "in" ? " is-live" : ""}`}
      style={pos}
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={`${g.matchup}, ${kick(g.minute)} on ${g.netLabel}. ${status}. Watchability ${g.score}, ${tierLabel(
        g.tier,
      )}. Open game card.`}
    >
      <Side t={a} cls="away" />
      <span className="tv-label">
        <strong>
          {a.abbr} @ {h.abbr}
        </strong>
        <span>{status}</span>
      </span>
      <Side t={h} cls="home" />
      <span className="tv-score" title={tierLabel(g.tier)}>
        {g.score}
      </span>
    </button>
  );
}

function Side({ t, cls }: { t: GridGame["sides"][number]; cls: string }) {
  return (
    <span className={`tv-side ${cls}`} style={{ background: t.color ?? "#1d2a35" }}>
      {t.tag && <span className="tv-tag">{t.tag}</span>}
      {rankLine(t.ranks, true) && (
        <span className="tv-rank" title={rankTitle(t.ranks)}>
          {rankLine(t.ranks, true)}
        </span>
      )}
      <img src={logos[t.logoId]} alt="" loading="lazy" />
    </span>
  );
}

/** The same card as the main board, in a dialog over the grid. */
function GameDialog({ game, onClose }: { game: GridGame | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (game && !d.open) d.showModal();
    if (!game && d.open) d.close();
  }, [game]);
  const result = game?.final ? results.find((r) => r.espnId === game.espnId) : undefined;
  const upcoming = game && !game.final ? slate.games.find((g) => g.espnId === game.espnId) : undefined;
  return (
    <dialog
      ref={ref}
      className="tv-dialog"
      aria-label={game ? game.matchup : "Game card"}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {game && (
        <div className="tv-dialog-body">
          <button className="tv-dialog-close" onClick={onClose} aria-label="Close">
            ×
          </button>
          {result && <ResultCard result={result} />}
          {upcoming && <GameCard game={upcoming} />}
        </div>
      )}
    </dialog>
  );
}
