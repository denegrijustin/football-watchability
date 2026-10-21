import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { PERF_TABS, isPerfKey, type PerfKey } from "./tabs";

const ICON: Record<PerfKey, ReactNode> = {
  "p-profile": <path d="M4 20V10m5 10V4m5 16v-7m5 7V8" />,
  "p-drives": <path d="M3 7h18v10H3zM9 7v10m6-10v10M5 12h2m10 0h2" />,
  "p-trends": <path d="M3 17l5-6 4 3 8-9M15 5h5v5" />,
  "p-situations": <path d="M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z" />,
  "p-bigplays": <path d="M13 3L5 14h6l-1 7 8-11h-6z" />,
  "p-finishing": <path d="M5 21V4m0 0h12l-2 4 2 4H5" />,
  "p-matchup": <path d="M8 4l-5 5 5 5M3 9h12m1 11l5-5-5-5m5 5H9" />,
  "p-field": <path d="M3 6h18v12H3zM12 6v12M3 12h2m14 0h2" />,
};
const Glyph = ({ k }: { k: PerfKey }) => <svg className="pm-ico" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON[k]}</svg>;

/** One pop-up menu for the eight team-performance views, so they do not crowd the tab bar. A popover on a computer, a bottom sheet on a phone. */
export function PerfMenu({ view, onPick }: { view: string; onPick: (key: PerfKey) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();
  const active = isPerfKey(view) ? PERF_TABS.find((t) => t.key === view)! : null;

  const close = (refocus = true) => { setOpen(false); if (refocus) btn.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!wrap.current?.contains(e.composedPath()[0] as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    const sel = wrap.current?.querySelector<HTMLElement>('[aria-checked="true"]') ?? wrap.current?.querySelector<HTMLElement>('[role="menuitemradio"]');
    sel?.focus();
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const key = (e: React.KeyboardEvent) => {
    const items = [...(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement) >= 0 ? items.indexOf(document.activeElement as HTMLElement) : items.findIndex((el) => el === (e.target as HTMLElement));
    const go = (n: number) => { e.preventDefault(); items[(n + items.length) % items.length]?.focus(); };
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else if (e.key === "Tab") setOpen(false);
  };

  return (
    <div className="pmenu" ref={wrap} onKeyDown={key}>
      <button ref={btn} type="button" className={`pmenu-btn${active ? " on" : ""}`} data-testid="perf-menu-btn" aria-haspopup="menu" aria-expanded={open} aria-controls={id}
        onClick={() => setOpen((o) => !o)} onKeyDown={(e) => { if (e.key === "ArrowDown" && !open) { e.preventDefault(); setOpen(true); } }}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20V10m5 10V4m5 16v-7m5 7V8" /></svg>
        <span className="pm-label">{active ? active.label : "Team performance"}</span>
        <svg className="pm-chev" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <>
          <div className="pmenu-scrim" onClick={() => close(false)} aria-hidden="true" />
          <div className="pmenu-pop" role="menu" id={id} aria-label="Team performance views">
            <div className="pmenu-grab" aria-hidden="true" />
            <p className="pmenu-head">Team performance</p>
            {PERF_TABS.map((t) => (
              <button key={t.key} type="button" role="menuitemradio" aria-checked={view === t.key} tabIndex={-1} className="pmenu-item" onClick={() => { setOpen(false); onPick(t.key); }}>
                <span className="pm-badge"><Glyph k={t.key} /></span>
                <span className="pm-text"><b>{t.label}</b><small>{t.question}</small></span>
                <svg className="pm-check" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
