import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { openModal } from "../modal";
import { logos, networkLogo, rankLine, rankTitle, results, slate, tierLabel, type League } from "../data";
import { gridDays, gridGames, GRID_SLOT, layoutGrid, slot, type GridGame, type PlacedGame } from "../data/grid";
import { renderGridImage, type GridImage } from "../exportJpg";
import { useLive } from "../live";
import { NetChip } from "./NetChip";
import { dateOf, tzLabel, useTz } from "../tz";
import { GameCard } from "./GameCard";
import { ResultCard } from "./ResultCard";

const SLOT = GRID_SLOT;
const fmt = (min: number) => {
  const h = Math.floor(min / 60) % 24,
    m = min % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const kick = (min: number) => fmt(min).replace(":00 ", " ");
const ENTERTAINING = new Set(["elite", "vgood", "good"]);

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
 * better) are highlighted; Background games use a dashed outline and ↓ marker. A block opens the same
 * card as the main board.
 */
export function TvGrid() {
  const tz = useTz();
  const all = useMemo(gridGames, [tz]);
  const days = useMemo(() => gridDays(all), [all]);
  const wide = useWide();
  const [day, setDay] = useState(() => {
    const today = dateOf(new Date());
    return (days.find((d) => d.date >= today) ?? days[0])?.date ?? "";
  });
  const [league, setLeague] = useState<"all" | League>("all");
  const [conference, setConference] = useState("all-fbs");
  const [onlyGood, setOnlyGood] = useState(false);
  const [open, setOpen] = useState<GridGame | null>(null);
  const [busy, setBusy] = useState(false);
  const [image, setImage] = useState<(GridImage & { url: string }) | null>(null);
  const menu = useRef<HTMLDetailsElement>(null);

  // Conference only narrows college games, so it applies when College is picked.
  const keep = (g: GridGame) =>
    (league === "all" || g.league === league) &&
    (league !== "CFB" || conference === "all-fbs" || g.conferences.includes(conference)) &&
    (!onlyGood || ENTERTAINING.has(g.tier));
  const games = all.filter((g) => slot(g.start).date === day && keep(g));

  const { lanes, placed, startMin, steps } = layoutGrid(games);
  const dayName = days.find((d) => d.date === day);
  const dateLabel = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const exportJpg = async (scope: "day" | "weekend" | "week") => {
    if (menu.current) menu.current.open = false;
    setBusy(true);
    try {
      const label = (date: string) =>
        new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
      const made = await renderGridImage({
        period: slate.period,
        scope,
        days: days
          .filter((d) => scope !== "day" || d.date === day)
          // The whole-week image is the full NFL + college slate: it ignores the league and conference pickers
          // (but still honors "Entertaining only" if you have it on).
          .map((d) => ({
            ...d,
            label: label(d.date),
            games: all.filter((g) => slot(g.start).date === d.date && (scope === "week" ? !onlyGood || ENTERTAINING.has(g.tier) : keep(g))),
          })),
      });
      // Show it first: saving to Photos needs a fresh tap (phones only allow the share sheet right after one), and
      // touching and holding the preview saves it on iOS and Android too.
      if (made) setImage({ ...made, url: URL.createObjectURL(made.blob) });
    } finally {
      setBusy(false);
    }
  };
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
            <button
              key={l}
              aria-pressed={league === l}
              onClick={() => {
                setLeague(l);
                if (l !== "CFB") setConference("all-fbs");
              }}
            >
              {l === "all" ? "All" : l === "NFL" ? "NFL" : "College"}
            </button>
          ))}
        </div>
        <button className="tv-toggle" aria-pressed={onlyGood} onClick={() => setOnlyGood((v) => !v)}>
          Entertaining only
        </button>
        {league === "CFB" && (
          <label className="tv-conf">
            <span className="sr-only">Conference</span>
            <select value={conference} onChange={(e) => setConference(e.target.value)} aria-label="Conference">
              {slate.conferences.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id === "all-fbs" ? "All conferences" : c.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <details className="export export-jpg-menu" ref={menu}>
          <summary className="export-jpg" aria-disabled={busy || !placed.length}>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {busy ? "Making image…" : "Save image"}
          </summary>
          <div className="export-menu">
            <button type="button" disabled={busy || !placed.length} onClick={() => exportJpg("day")}>
              <strong>This day ({dayName?.day})</strong>
              <span>{dateLabel}, with the filters above</span>
            </button>
            <button type="button" disabled={busy} onClick={() => exportJpg("weekend")}>
              <strong>Full weekend</strong>
              <span>Every day, stacked in one image, with the filters above</span>
            </button>
            <button type="button" disabled={busy} onClick={() => exportJpg("week")}>
              <strong>Whole week · NFL + college</strong>
              <span>Every day, both leagues, one image (ignores the league and conference pickers)</span>
            </button>
          </div>
        </details>
        <ul className="tv-key" aria-label="Key">
          <li className="k-hl">Entertaining (74+)</li>
          <li className="k-mid">Watchable (64–73)</li>
          <li className="k-dim">↓ Lower priority (&lt;64)</li>
          <li className="k-rank" title="Both ranks are ESPN FPI power ratings: conference rank is the team's place among its conference mates, overall rank is across the whole league.">
            Under each logo: conference rank · overall rank (ESPN FPI)
          </li>
        </ul>
      </div>
      <div className="board-heading tv-heading">
        <h2>{dateLabel}</h2>
        <span role="status">
          {games.length} games · {good} entertaining
        </span>
        <span className="sort-label">Times {tzLabel(tz)}</span>
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
                    <NetChip network={c.network} logo={logo} alt={c.label} />
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
      <ImageDialog
        image={image}
        onClose={() => {
          if (image) URL.revokeObjectURL(image.url);
          setImage(null);
        }}
      />
    </section>
  );
}

function Block({ g, pos, onOpen }: { g: PlacedGame; pos: CSSProperties; onOpen: () => void }) {
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
        {g.tier === "bg" ? `↓ ${g.score}` : g.score}
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

/**
 * The finished image: a preview, a share button that opens the phone's share sheet ("Save Image" puts it in Photos),
 * and a plain download. Touching and holding the preview also saves it from iOS and Android browsers.
 */
function ImageDialog({ image, onClose }: { image: (GridImage & { url: string }) | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState("");
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    setNote("");
    if (image && !d.open) openModal(d);
    if (!image && d.open) d.close();
  }, [image]);
  const file = image ? new File([image.blob], image.filename, { type: "image/png" }) : null;
  const canShare = !!file && typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  const touch = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const share = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: "TV grid" });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setNote("Couldn't open the share sheet. Use Download, or touch and hold the image.");
    }
  };
  return (
    <dialog ref={ref} className="img-dialog" aria-label="TV grid image" onClose={onClose} onClick={(e) => e.target === ref.current && ref.current?.close()}>
      {image && (
        <div className="img-dialog-body">
          <img src={image.url} alt="Preview of the exported TV grid" width={image.width} height={image.height} />
          <p className="img-meta">
            {image.width.toLocaleString()} × {image.height.toLocaleString()} px PNG · {(image.blob.size / 1e6).toFixed(1)} MB · {image.scale.toFixed(1)}× resolution, sharp when you zoom in
          </p>
          {touch && <p className="img-meta">Touch and hold the image to save it to Photos.</p>}
          {note && <p className="img-meta" role="alert">{note}</p>}
          <div className="img-actions">
            {canShare && (
              <button type="button" className="img-primary" onClick={share}>
                Save to Photos / Share
              </button>
            )}
            <a className={canShare ? "" : "img-primary"} href={image.url} download={image.filename}>
              Download PNG
            </a>
            <button type="button" onClick={() => ref.current?.close()}>
              Close
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

/** The same card as the main board, in a dialog over the grid. */
function GameDialog({ game, onClose }: { game: GridGame | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (game && !d.open) openModal(d);
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
          {result && <ResultCard result={result} defaultExpanded />}
          {upcoming && <GameCard game={upcoming} defaultExpanded />}
        </div>
      )}
    </dialog>
  );
}


