import { useEffect, useRef, useState } from "react";
import { useLiveStatus } from "../live";
import { refreshLines } from "../lines";
import { haptic, motionOff } from "../motion";

/** Tells the page something just refreshed (scores or lines): the toast below listens for it. */
export const announceRefresh = (what: "scores" | "lines") => window.dispatchEvent(new CustomEvent("fbwatch:refreshed", { detail: what }));

/**
 * Pull-to-refresh on a touch screen (drag the top of the page down) plus the "Updated just now" toast that follows any manual refresh.
 * The pull indicator is moved with a transform written straight to the element while dragging, so nothing re-renders.
 */
export function RefreshUi() {
  const { refresh } = useLiveStatus();
  const spin = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const on = () => { setToast("Updated just now"); clearTimeout(timer); timer = setTimeout(() => setToast(null), 2200); };
    window.addEventListener("fbwatch:refreshed", on);
    return () => { window.removeEventListener("fbwatch:refreshed", on); clearTimeout(timer); };
  }, []);
  useEffect(() => {
    if (!window.matchMedia?.("(pointer: coarse)").matches) return;
    const el = spin.current;
    if (!el) return;
    let y0 = 0, pull = 0, active = false;
    const draw = (p: number, busy = false) => {
      el.style.transform = `translate(-50%, ${p - 48}px) rotate(${p * 4}deg)`;
      el.style.opacity = String(Math.min(1, p / 50));
      el.classList.toggle("busy", busy);
    };
    const start = (e: TouchEvent) => { active = window.scrollY <= 0 && e.touches.length === 1 && !document.querySelector("dialog[open]"); y0 = e.touches[0].clientY; pull = 0; };
    const move = (e: TouchEvent) => {
      if (!active) return;
      const d = e.touches[0].clientY - y0;
      if (d <= 0 || window.scrollY > 0) { if (pull) draw(0); pull = 0; if (window.scrollY > 0) active = false; return; }
      pull = Math.min(100, d * 0.5);
      draw(pull);
    };
    const end = () => {
      if (active && pull >= 52) {
        haptic(10);
        draw(52, true);
        refresh();
        void refreshLines(true);
        setTimeout(() => draw(0), 900);
      } else draw(0);
      active = false; pull = 0;
    };
    document.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchmove", move, { passive: true });
    document.addEventListener("touchend", end, { passive: true });
    return () => { document.removeEventListener("touchstart", start); document.removeEventListener("touchmove", move); document.removeEventListener("touchend", end); };
  }, [refresh]);
  return (
    <>
      <div className="ptr" ref={spin} aria-hidden="true" data-off={motionOff() ? "" : undefined}><i /></div>
      <div className="toast-host" aria-live="polite">{toast && <div className="toast" role="status">{toast}</div>}</div>
    </>
  );
}
