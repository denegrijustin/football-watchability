import { useEffect, useState } from "react";
import { MIN_GAP_MS, useLines } from "../lines";
import { slate } from "../data";
import { timeOf, tzAbbr, useTz } from "../tz";

const ago = (ms: number) => { const m = Math.round(ms / 60000); return m < 1 ? "just now" : m === 1 ? "1 min ago" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };

/**
 * When the lines on the page are from, and a button to bring them up to date. Opening a page that uses this loads the current lines and then checks
 * again every 15 minutes while it is showing; the button is for the moment you are about to bet. The server keeps each copy ten minutes, so this is light for ESPN.
 */
export function LinesBar({ compact = false }: { compact?: boolean }) {
  useTz();
  const { at, busy, error, refresh } = useLines({ auto: true });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  const waiting = at != null && now - at < MIN_GAP_MS;
  const saved = (slate as { snapshotDate?: string }).snapshotDate;
  return (
    <div className={`lb${compact ? " compact" : ""}`} role="status" aria-live="polite">
      <span className="lb-text">
        {at != null ? <>Lines from <b>{timeOf(new Date(at), undefined, true)} {tzAbbr()}</b> <span className="muted">({ago(now - at)})</span></> : busy ? "Getting the current lines…" : <>Saved lines{saved ? ` from ${new Date(`${saved}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}` : ""}</>}
        {error && <span className="lb-err"> · could not reach ESPN, showing {at != null ? "the last lines" : "saved lines"}</span>}
      </span>
      <button type="button" className="btn small ghost lb-btn" onClick={() => void refresh()} disabled={busy || waiting} title={waiting ? "Just updated" : "Fetch the current lines from ESPN"}>
        <span aria-hidden="true" className={busy ? "lb-spin" : undefined}>⟳</span> {busy ? "Refreshing" : "Refresh lines"}
      </button>
    </div>
  );
}
