import { useEffect, useId, useRef, useState } from "react";

/**
 * The tab bar's views as one pop-up menu, shown instead of the scrolling tab strip on a phone: the same picker as Team performance beside it
 * (a bottom sheet), so neither side of the bar is a row you have to swipe. The tabs stay in the page for keyboard and screen-reader use on larger screens.
 */
export function ViewMenu({ views, view, onPick }: { views: { key: string; label: string }[]; view: string; onPick: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();
  const active = views.find((v) => v.key === view);

  const close = (refocus = true) => { setOpen(false); if (refocus) btn.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!wrap.current?.contains(e.composedPath()[0] as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    (wrap.current?.querySelector<HTMLElement>('[aria-checked="true"]') ?? wrap.current?.querySelector<HTMLElement>('[role="menuitemradio"]'))?.focus();
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const key = (e: React.KeyboardEvent) => {
    const items = [...(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => { e.preventDefault(); items[(n + items.length) % items.length]?.focus(); };
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else if (e.key === "Tab") setOpen(false);
  };

  return (
    <div className="pmenu vmenu" ref={wrap} onKeyDown={key}>
      <button ref={btn} type="button" className={`pmenu-btn${active ? " on" : ""}`} data-testid="view-menu-btn" aria-haspopup="menu" aria-expanded={open} aria-controls={id}
        onClick={() => setOpen((o) => !o)} onKeyDown={(e) => { if (e.key === "ArrowDown" && !open) { e.preventDefault(); setOpen(true); } }}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        <span className="pm-label">{active ? active.label : "Views"}</span>
        <svg className="pm-chev" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <>
          <div className="pmenu-scrim" onClick={() => close(false)} aria-hidden="true" />
          <div className="pmenu-pop" role="menu" id={id} aria-label="Views">
            <div className="pmenu-grab" aria-hidden="true" />
            <p className="pmenu-head">Views</p>
            {views.map((v) => (
              <button key={v.key} type="button" role="menuitemradio" aria-checked={view === v.key} tabIndex={-1} className="pmenu-item vm-item" onClick={() => { setOpen(false); onPick(v.key); }}>
                <span className="pm-text"><b>{v.label}</b></span>
                <svg className="pm-check" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
