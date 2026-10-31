import "../touchdown.css";

const EMOJI = ["🏈", "🎉", "🙌", "🔥", "🏈", "🎊", "💥"];

/** An official's touchdown signal (both arms straight up), drawn for this app. */
function Official() {
  return (
    <svg className="td-ref" viewBox="0 0 100 100" aria-hidden="true">
      <g className="td-arm l"><path d="M33 58 L19 14 Q18 8 24 8 Q29 8 30 13 L42 56 Z" /><circle cx="22" cy="9" r="5.5" /></g>
      <g className="td-arm r"><path d="M67 58 L81 14 Q82 8 76 8 Q71 8 70 13 L58 56 Z" /><circle cx="78" cy="9" r="5.5" /></g>
      <path className="td-body" d="M30 60 Q50 50 70 60 L74 96 L26 96 Z" />
      <path className="td-stripes" d="M40 56 L38 96 M50 54 L50 96 M60 56 L62 96" />
      <circle className="td-head" cx="50" cy="38" r="12" />
      <path className="td-cap" d="M38 34 Q50 22 62 34 L62 36 L38 36 Z" />
    </svg>
  );
}

/** The celebration over a game card for a few seconds: the official's signal, TOUCHDOWN, the scoring team, and emoji drifting up. Looks only; the card underneath still works. */
export function TouchdownBurst({ team, color }: { team: string; color?: string | null }) {
  return (
    <div className="td-burst" role="status" aria-live="polite" style={color ? ({ "--td": color } as React.CSSProperties) : undefined}>
      <span className="td-sr">Touchdown, {team}</span>
      <div className="td-glow" aria-hidden="true" />
      <div className="td-center" aria-hidden="true">
        <Official />
        <strong>TOUCHDOWN!</strong>
        <em>{team}</em>
      </div>
      {EMOJI.map((e, i) => <span key={i} className={`td-emoji e${i + 1}`} aria-hidden="true">{e}</span>)}
    </div>
  );
}
