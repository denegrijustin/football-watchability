import { useEffect } from "react";
import type { View } from "../data";
import { isStatus, isView, type Status } from "./navConfig";

/**
 * The address bar follows the section: `?view=trades` (no `view` for the board) and, on the board, `?status=live|upcoming|final`.
 * Every other query parameter (`league`, ...) is left as it is. A navigation the reader makes adds a history entry (so Back and Forward
 * work); a filter changed from the board's own controls only rewrites the current one.
 */
export type NavState = { view: View; status: Status };

const urlFor = (view: View, status: Status) => {
  const u = new URL(location.href);
  if (view === "board") u.searchParams.delete("view");
  else u.searchParams.set("view", view);
  if (view === "board" && status !== "all") u.searchParams.set("status", status);
  else u.searchParams.delete("status");
  return u.pathname + u.search + u.hash;
};
const here = () => location.pathname + location.search + location.hash;

/** What the address says (an unknown or missing view is the board, an unknown status is "all"). */
export function readNav(search = typeof location === "undefined" ? "" : location.search): NavState {
  const p = new URLSearchParams(search);
  const view = p.get("view");
  const status = p.get("status");
  const v: View = isView(view) ? view : "board";
  return { view: v, status: v === "board" && isStatus(status) ? status : "all" };
}

/** Call before changing the section on purpose: adds the history entry for it. */
export function pushNav(view: View, status: Status) {
  try {
    const next = urlFor(view, status);
    if (next !== here()) history.pushState(null, "", next);
  } catch {
    /* history blocked: the section still changes */
  }
}

export function useViewHistory(view: View, status: Status, restore: (s: NavState) => void) {
  // Whatever the state is, the address says the same (a bad `?view=` is cleaned up on the first run).
  useEffect(() => {
    try {
      const next = urlFor(view, status);
      if (next !== here()) history.replaceState(null, "", next);
    } catch {
      /* history blocked */
    }
  }, [view, status]);
  useEffect(() => {
    const pop = () => restore(readNav());
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  });
}
