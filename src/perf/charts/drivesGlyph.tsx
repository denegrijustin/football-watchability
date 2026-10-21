import { OUTCOMES, type OutcomeKind } from "../drivesCalc";

/** One mark per kind of ending. Color helps, but each is also its own shape, so no one has to tell hues apart. */
export function ResultGlyph({ kind, size = 14, x, y }: { kind: OutcomeKind; size?: number; x?: number; y?: number }) {
  const c = `var(--rs-${kind})`;
  const body = (() => {
    switch (kind) {
      case "td": return <polygon points="7,0.8 8.8,5 13.3,5.3 9.8,8.2 10.9,12.6 7,10.2 3.1,12.6 4.2,8.2 0.7,5.3 5.2,5" fill={c} stroke="var(--rs-edge)" strokeWidth="0.8" strokeLinejoin="round" />;
      case "fg": return <polygon points="7,1.5 12.8,12 1.2,12" fill={c} stroke="var(--rs-edge)" strokeWidth="0.8" strokeLinejoin="round" />;
      case "punt": return <circle cx="7" cy="7" r="4.6" fill="var(--rs-fill)" stroke={c} strokeWidth="2" />;
      case "turnover": return <path d="M2.5 2.5 L11.5 11.5 M11.5 2.5 L2.5 11.5" stroke={c} strokeWidth="3" strokeLinecap="round" />;
      case "downs": return <rect x="2.5" y="2.5" width="9" height="9" rx="1" fill="var(--rs-fill)" stroke={c} strokeWidth="2" />;
      case "missed": return <polygon points="7,2 12,11.5 2,11.5" fill="var(--rs-fill)" stroke={c} strokeWidth="2" strokeLinejoin="round" />;
      case "against": return (<><polygon points="7,0.8 13.2,7 7,13.2 0.8,7" fill={c} stroke="var(--rs-edge)" strokeWidth="0.8" /><circle cx="7" cy="7" r="2" fill="var(--rs-fill)" /></>);
      default: return <rect x="2.5" y="6" width="9" height="2.4" rx="1.2" fill={c} />;
    }
  })();
  return <svg className="rs-glyph" width={size} height={size} viewBox="0 0 14 14" x={x} y={y} aria-hidden="true" focusable="false" style={{ overflow: "visible" }}>{body}</svg>;
}

/** The glyph with its short name: how a drive's ending is written everywhere. */
export function ResultChip({ kind, label }: { kind: OutcomeKind; label: string }) {
  return <span className={`rs-chip rs-${kind}`}><ResultGlyph kind={kind} size={14} /><span>{label}</span></span>;
}

/** Legend for the marks, with a one-line meaning on hover/focus (title) and always in the text for the two that are easy to mistake. */
export function OutcomeLegend({ kinds }: { kinds?: OutcomeKind[] }) {
  const list = OUTCOMES.filter((o) => !kinds || kinds.includes(o.kind));
  return (
    <ul className="rs-legend legend" aria-label="What each mark means">
      {list.map((o) => <li key={o.kind} title={o.plain}><ResultGlyph kind={o.kind} size={13} /> {o.label}</li>)}
    </ul>
  );
}
