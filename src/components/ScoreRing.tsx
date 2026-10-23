import { useEffect, useRef, useState, type ReactNode } from "react";
import { motionOff, useOnScreen } from "../motion";

const R = 21, C = 2 * Math.PI * R;

/**
 * The watchability score as a ring that fills the first time it is on screen and again whenever the number changes. The ring takes its colour from the
 * card's tier (--score-color). With a breakdown it is a button that opens "why it is this number".
 */
export function ScoreRing({ score, label, children }: { score: number; label: string; children?: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const seen = useOnScreen(box, true);
  const [shown, setShown] = useState(motionOff() ? score : 0);
  useEffect(() => {
    if (!seen) return;
    const id = requestAnimationFrame(() => setShown(score));
    return () => cancelAnimationFrame(id);
  }, [seen, score]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("click", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("click", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const ring = (
    <>
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r={R} className="sr-track" />
        <circle cx="24" cy="24" r={R} className="sr-fill" strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(100, shown) / 100)} />
      </svg>
      <strong>{score}</strong>
    </>
  );
  return (
    <div className="score-ring" ref={box}>
      {children ? (
        <button type="button" className="sr-btn" aria-expanded={open} aria-label={`${label}. Show why`} onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>{ring}</button>
      ) : ring}
      {open && children && <div className="sr-pop" role="dialog" aria-label="Why it scored this" onClick={(e) => e.stopPropagation()}>{children}</div>}
    </div>
  );
}
