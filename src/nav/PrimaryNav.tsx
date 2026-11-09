import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import { slate, type View } from "../data";
import { TabIcon } from "../components/TabIcon";
import { CATEGORIES, categoryOf, type ActionItem, type CategoryId, type NavItem, type Status } from "./navConfig";

type Props = {
  view: View;
  status: Status;
  counts: { all: number; live: number; upcoming: number; final: number };
  onView: (v: View) => void;
  onStatus: (s: Exclude<Status, "all">) => void;
  /** Opens the Game Center for the top game (false when there is none). */
  onGameCenter: () => boolean;
};

const csvName = () => slate.period.replace(/[^\w]+/g, "-");

/** A view reached from inside a page lights the menu entry it belongs to. */
const ENTRY: Partial<Record<View, View>> = { outlook: "standings", sim: "picks", upset: "picks" };

const reveal = (el: HTMLElement | null) => {
  if (!el) return;
  el.scrollIntoView({ block: "center" });
  el.focus({ preventScroll: true });
};
const SHOW: Record<ActionItem["action"], () => void> = {
  "game-center": () => {},
  "time-zone": () => reveal(document.querySelector<HTMLElement>(".tz-pick select")),
  "how-to": () => {
    const d = document.getElementById("how-to-read") as HTMLDetailsElement | null;
    if (d) d.open = true;
    reveal(d?.querySelector("summary") ?? null);
  },
  about: () => {
    const d = document.getElementById("about-slate") as HTMLDetailsElement | null;
    if (d) d.open = true;
    reveal(d?.querySelector("summary") ?? null);
  },
};

/**
 * The primary navigation: five categories. On a computer they are a row of buttons that open a dropdown; on a phone the same buttons are
 * a bar at the bottom and the dropdown is a sheet above it (CSS decides, see nav.css). Every destination is always in the page (a closed
 * menu is only hidden), so a destination is one click or tap from its category and the whole app is two interactions deep.
 */
export function PrimaryNav({ view, status, counts, onView, onStatus, onGameCenter }: Props) {
  const [open, setOpen] = useState<CategoryId | null>(null);
  const [hint, setHint] = useState("");
  const root = useRef<HTMLElement>(null);
  const current = categoryOf(view);

  const triggers = () => [...(root.current?.querySelectorAll<HTMLElement>(".nav-trigger") ?? [])];
  const trigger = (id: CategoryId) => root.current?.querySelector<HTMLElement>(`.nav-trigger[data-category="${id}"]`) ?? null;
  const entries = (id: CategoryId) => [...(root.current?.querySelectorAll<HTMLElement>(`#nav-panel-${id} .nav-item`) ?? [])];
  const close = (refocus: boolean) => {
    const was = open;
    setOpen(null);
    setHint("");
    if (refocus && was) trigger(was)?.focus();
  };

  // One menu at a time; a click or focus anywhere else, or Escape, closes it.
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      const t = e.target as Node;
      // A click anywhere outside the nav, or focus moving out of the open menu (and its button), closes it.
      const scope = e.type === "focusin" ? root.current?.querySelector(".nav-cat[data-open=true]") : root.current;
      if (!scope?.contains(t)) {
        setOpen(null);
        setHint("");
      }
    };
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const inside = root.current?.contains(document.activeElement);
      close(!!inside || document.activeElement === document.body);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("focusin", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("focusin", away);
      document.removeEventListener("keydown", key);
    };
  });
  // The sheet or dropdown must not outlive a narrow-to-wide resize with a stale open state; the section changing from outside also closes it.
  useEffect(() => {
    setOpen(null);
    setHint("");
  }, [view, status]);

  const onTrigger = (e: KeyboardEvent<HTMLButtonElement>, id: CategoryId) => {
    const all = triggers();
    const i = all.indexOf(e.currentTarget);
    const move = (to: number) => {
      const t = all[(to + all.length) % all.length];
      e.preventDefault();
      t.focus();
      if (open) setOpen(t.dataset.category as CategoryId);
    };
    if (e.key === "ArrowRight") move(i + 1);
    else if (e.key === "ArrowLeft") move(i - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(all.length - 1);
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      // The menu must be open (visible) before focus can move into it, so commit the state first.
      flushSync(() => setOpen(id));
      const list = entries(id);
      (e.key === "ArrowDown" ? list[0] : list[list.length - 1])?.focus();
    }
  };
  const onPanel = (e: KeyboardEvent<HTMLElement>, id: CategoryId) => {
    const list = entries(id);
    const i = list.indexOf(document.activeElement as HTMLElement);
    const go = (to: number) => {
      e.preventDefault();
      list[(to + list.length) % list.length]?.focus();
    };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(list.length - 1);
  };

  const choose = (item: NavItem) => {
    if (item.kind === "view") {
      onView(item.view);
      close(true);
    } else if (item.kind === "status") {
      onStatus(item.status);
      close(true);
    } else if (item.kind === "link") {
      close(true);
    } else if (item.action === "game-center") {
      if (onGameCenter()) close(false);
      else setHint("No game is open to show right now. Open a game from the dashboard with its GC button.");
    } else {
      close(false);
      setTimeout(SHOW[item.action], 0);
    }
  };

  const isActive = (item: NavItem) =>
    item.kind === "view"
      ? (ENTRY[view] ?? view) === item.view && (item.view !== "board" || status === "all")
      : item.kind === "status"
        ? view === "board" && status === item.status
        : false;
  const countOf = (item: NavItem) => (item.kind === "status" ? counts[item.status] : item.kind === "view" && item.view === "board" ? counts.all : null);

  return (
    <nav ref={root} className="site-nav" aria-label="Primary" data-open={open ?? "none"}>
      <ul className="nav-list">
        {CATEGORIES.map((c) => (
          <li key={c.id} className="nav-cat" data-open={open === c.id}>
            <button
              type="button"
              className="nav-trigger"
              data-category={c.id}
              aria-expanded={open === c.id}
              aria-controls={`nav-panel-${c.id}`}
              aria-current={current === c.id ? "true" : undefined}
              onClick={() => (open === c.id ? close(false) : (setHint(""), setOpen(c.id)))}
              onKeyDown={(e) => onTrigger(e, c.id)}
            >
              <TabIcon name={c.icon} />
              <span className="nav-trigger-label">{c.label}</span>
              <svg className="nav-caret" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true" focusable="false">
                <path d="M2 4.5l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="nav-panel" id={`nav-panel-${c.id}`} role="group" aria-label={c.label} onKeyDown={(e) => onPanel(e, c.id)}>
              {c.groups.map((g, gi) => (
                <section key={gi} className="nav-group" aria-labelledby={g.label ? `nav-group-${c.id}-${gi}` : undefined}>
                  {g.label && (
                    <h3 className="nav-group-label" id={`nav-group-${c.id}-${gi}`}>
                      {g.label}
                    </h3>
                  )}
                  <ul>
                    {g.items.map((item) => {
                      const n = countOf(item);
                      const descId = `nav-desc-${c.id}-${item.id}`;
                      const body = (
                        <>
                          <span className="nav-item-main">
                            <span className="nav-item-label">{item.label}</span>
                            {n !== null && (
                              <span className="nav-count" aria-hidden="true">
                                {n}
                              </span>
                            )}
                          </span>
                          <span className="nav-item-desc" id={descId}>
                            {item.desc}
                          </span>
                        </>
                      );
                      return (
                        <li key={item.id}>
                          {item.kind === "link" ? (
                            <a
                              className="nav-item"
                              href={item.href}
                              download={item.download ?? (item.id === "csv" ? `watch-slate-${csvName()}.csv` : undefined)}
                              target={item.external ? "_blank" : undefined}
                              rel={item.external ? "noopener noreferrer" : undefined}
                              aria-label={item.label}
                              aria-describedby={descId}
                              onClick={() => choose(item)}
                            >
                              {body}
                            </a>
                          ) : (
                            <button
                              type="button"
                              className="nav-item"
                              data-tab={item.kind === "view" ? item.view : undefined}
                              data-status={item.kind === "status" ? item.status : undefined}
                              data-action={item.kind === "action" ? item.action : undefined}
                              aria-label={item.label}
                              aria-describedby={descId}
                              aria-current={isActive(item) ? "page" : undefined}
                              onClick={() => choose(item)}
                            >
                              {body}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
              {c.id === "games" && hint && (
                <p className="nav-hint" role="status">
                  {hint}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
      {open && <div className="nav-scrim" aria-hidden="true" onClick={() => close(false)} />}
    </nav>
  );
}
