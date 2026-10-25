// Shared helpers for the app's motion. The rules they enforce: movement happens once and for a reason (something changed), only transform and opacity
// are animated where it matters, nothing keeps moving off-screen or in a hidden tab, and everything switches off for reduced-motion, data-saver or a low battery.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

type Nav = Navigator & { connection?: { saveData?: boolean }; getBattery?: () => Promise<{ level: number; charging: boolean; addEventListener: (e: string, f: () => void) => void }> };

/** Whether movement is switched off right now (reduced-motion, data-saver or low power): the <html data-motion> flag set by initMotion. */
export const motionOff = () => typeof document !== "undefined" && document.documentElement.dataset.motion === "off";

/**
 * Sets <html data-motion="off"|"on"> and <html data-hidden> so the stylesheet can switch the new animations off and pause every looping one while the tab is
 * hidden. Called once at start-up.
 */
export function initMotion() {
  const root = document.documentElement, nav = navigator as Nav;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  let lowBattery = false;
  const apply = () => { root.dataset.motion = reduce?.matches || nav.connection?.saveData || lowBattery ? "off" : "on"; };
  const hidden = () => { if (document.hidden) root.setAttribute("data-hidden", ""); else root.removeAttribute("data-hidden"); };
  apply(); hidden();
  reduce?.addEventListener?.("change", apply);
  document.addEventListener("visibilitychange", hidden);
  idleGovernor(root);
  nav.getBattery?.().then((b) => {
    const check = () => { lowBattery = !b.charging && b.level <= 0.2; apply(); };
    check(); b.addEventListener("levelchange", check); b.addEventListener("chargingchange", check);
  }).catch(() => {});
}

/**
 * A phone left open on the board keeps its looping animations (live dots, the score ticker, the pulse on the ball) running all day, and each one keeps the
 * screen redrawing. After IDLE_MS with no touch, scroll, key or pointer input every looping animation is paused (<html data-idle> is set so styles can know),
 * and the first input after that plays them again. One-shot animations are left alone, and a sweep catches loops that start while idle.
 */
export const IDLE_MS = 25_000;
function idleGovernor(root: HTMLElement) {
  const paused = new Set<Animation>();
  let timer: ReturnType<typeof setTimeout> | undefined, sweeper: ReturnType<typeof setInterval> | undefined;
  const sweep = () => {
    for (const a of document.getAnimations()) {
      if (a.playState === "running" && a.effect?.getTiming().iterations === Infinity) { a.pause(); paused.add(a); }
    }
  };
  const sleep = () => { root.setAttribute("data-idle", ""); sweep(); sweeper = setInterval(sweep, 4000); };
  const wake = () => {
    clearTimeout(timer);
    if (root.hasAttribute("data-idle")) {
      root.removeAttribute("data-idle");
      clearInterval(sweeper);
      for (const a of paused) { try { a.play(); } catch { /* the element is gone */ } }
      paused.clear();
    }
    timer = setTimeout(sleep, IDLE_MS);
  };
  for (const ev of ["pointerdown", "pointermove", "touchstart", "touchmove", "scroll", "wheel", "keydown"]) window.addEventListener(ev, wake, { passive: true, capture: true });
  wake();
}

/** A short buzz on phones that support it (a game going live). Skipped when motion is off or the tab is hidden. */
export function haptic(ms = 18) {
  if (motionOff() || document.hidden) return;
  try { navigator.vibrate?.(ms); } catch { /* not supported */ }
}

/** True for `ms` after `value` changes (never on the first render). The cue behind a score flash or a card pulse. */
export function useChanged(value: number | string | undefined, ms = 1100): boolean {
  const prev = useRef(value);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (prev.current === value) return;
    const had = prev.current;
    prev.current = value;
    if (had === undefined || motionOff()) return;
    setOn(true);
    const t = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return on;
}

// One IntersectionObserver for the whole page: each watcher is a callback keyed by its element.
const watchers = new Map<Element, (visible: boolean) => void>();
let io: IntersectionObserver | null = null;
function observe(el: Element, cb: (v: boolean) => void) {
  io ??= new IntersectionObserver((entries) => entries.forEach((e) => watchers.get(e.target)?.(e.isIntersecting)), { rootMargin: "80px" });
  watchers.set(el, cb);
  io.observe(el);
  return () => { watchers.delete(el); io?.unobserve(el); };
}

/** Whether the element is on (or just off) the screen. Looping animations inside it are paused by CSS when it is not. */
export function useOnScreen<T extends Element>(ref: RefObject<T | null>, once = false): boolean {
  const [seen, setSeen] = useState(typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let stop = () => {};
    stop = observe(el, (v) => { setSeen(v); if (v && once) stop(); });
    return () => stop();
  }, [ref, once]);
  return seen;
}

/**
 * Eases the children of a list to their new places when the order or the set changes (a game getting hotter, a filter applied): the children
 * are measured before and after and each one that moved slides from where it was. Runs only when `signature` changes, and only animates transform.
 */
export function useFlip(ref: RefObject<HTMLElement | null>, signature: string) {
  const last = useRef<Map<string, { x: number; y: number }>>(new Map());
  const first = useRef(true);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const origin = box.getBoundingClientRect();
    const items = [...box.children].filter((c): c is HTMLElement => c instanceof HTMLElement && !!c.dataset.gameId);
    const next = new Map<string, { x: number; y: number }>();
    const moves: [HTMLElement, number, number][] = [];
    for (const el of items) {
      const r = el.getBoundingClientRect(), pos = { x: r.left - origin.left, y: r.top - origin.top };
      next.set(el.dataset.gameId!, pos);
      const was = last.current.get(el.dataset.gameId!);
      if (was && !first.current && (Math.abs(was.x - pos.x) > 2 || Math.abs(was.y - pos.y) > 2) && Math.abs(was.y - pos.y) < 900) moves.push([el, was.x - pos.x, was.y - pos.y]);
    }
    last.current = next;
    first.current = false;
    if (motionOff() || !moves.length || moves.length > 40) return;
    for (const [el, dx, dy] of moves) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 340, easing: "cubic-bezier(.2,.8,.2,1)" });
  }, [ref, signature]);
}

/** Pauses every looping animation inside a card while it is scrolled out of view (a class, set straight on the element: no re-render). */
export function usePauseOffscreen(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    return observe(el, (v) => el.classList.toggle("offscreen", !v));
  }, [ref]);
}
