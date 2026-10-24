import type { ReactElement } from "react";
/** Small drawings of the rivalry trophies (an axe, a bucket, a jug, a golden egg and so on), in the gold the app uses, for the cards. */
const ART: Record<string, ReactElement> = {
  egg: <><ellipse cx="12" cy="12.5" rx="5.5" ry="7.5" /><path d="M8 20.5h8" /></>,
  hat: <><path d="M3 15h18" /><path d="M7 15c0-5 2-8 5-8s5 3 5 8" /><path d="M7 12h10" /></>,
  jug: <><path d="M8 7h8v3c2 1 3 3 3 6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4c0-3 1-5 3-6z" /><path d="M10 4h4v3h-4z" /><path d="M18 11c2 0 3 1 3 3" /></>,
  axe: <><path d="M12 3v18" /><path d="M12 5c4-2 8 0 8 4-4 1-6 0-8-1z" /></>,
  pig: <><ellipse cx="12" cy="13" rx="7" ry="5" /><circle cx="19" cy="13" r="2" /><path d="M8 18v3M16 18v3M8 8l-1-3 3 1" /></>,
  bucket: <><path d="M6 8h12l-1.5 12h-9z" /><path d="M6 8c0-3 12-3 12 0" /><path d="M5 11c-2-5 3-8 7-8s9 3 7 8" /></>,
  club: <><path d="M6 20L16 6" /><circle cx="17.5" cy="5" r="2.5" /><path d="M5 19l2 2" /></>,
  bell: <><path d="M6 17c0-4 1-9 6-9s6 5 6 9z" /><path d="M5 17h14" /><path d="M10 20h4" /><path d="M12 5V3" /></>,
  boot: <><path d="M8 3h6v9l6 3v4H6l-1-3z" /><path d="M6 19h14" /></>,
  cup: <><path d="M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4c0 3 1 4 3 4M17 6h3c0 3-1 4-3 4" /><path d="M12 14v4M8 21h8" /></>,
  barrel: <><path d="M6 5h12c1 4 1 10 0 14H6c-1-4-1-10 0-14z" /><path d="M6 9h12M6 15h12" /></>,
  wheel: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2" /><path d="M12 4v16M4 12h16M6.3 6.3l11.4 11.4M17.7 6.3L6.3 17.7" /></>,
  skillet: <><circle cx="10" cy="12" r="6" /><path d="M16 12h6" /></>,
};

/** The trophy as a small gold line drawing; falls back to a cup for a trophy with no drawing of its own. */
export function TrophyIcon({ kind, size = 20, title }: { kind: string; size?: number; title?: string }) {
  return (
    <svg className="trophy-ico" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      {ART[kind] ?? ART.cup}
    </svg>
  );
}
