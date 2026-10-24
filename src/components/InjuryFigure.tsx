import { bodyRegion } from "../bodyMap";

/**
 * A small front-facing figure with the injured area lit and pulsing (three times, then it stays lit, so it is not a loop to run down the battery).
 * A head injury sends out rings. When the side is not given, both sides are lit more softly. Illness and undisclosed injuries show the plain figure.
 */
export function InjuryFigure({ type, location, side, detail, size = 64 }: { type: string | null; location?: string | null; side?: string | null; detail?: string | null; size?: number }) {
  const reg = bodyRegion(type, location, detail, side);
  const soft = reg.paired && !reg.sideKnown;
  return (
    <figure className="ifig" style={{ width: size }}>
      <svg viewBox="0 0 100 230" width={size} height={size * 2.3} role="img" aria-label={`Injury area: ${reg.label}${reg.paired && reg.sideKnown ? `, ${side?.toLowerCase()} side` : ""}`}>
        <g className="ifig-body">
          <circle cx="50" cy="20" r="13" />
          <rect x="44" y="32" width="12" height="9" rx="4" />
          <path d="M30 46h40q8 2 8 12v34q0 8-6 10v20H28v-20q-6-2-6-10V58q0-10 8-12z" />
          <rect x="10" y="52" width="13" height="46" rx="6.5" /><rect x="77" y="52" width="13" height="46" rx="6.5" />
          <rect x="8" y="98" width="11" height="36" rx="5.5" /><rect x="81" y="98" width="11" height="36" rx="5.5" />
          <rect x="28" y="116" width="20" height="62" rx="9" /><rect x="52" y="116" width="20" height="62" rx="9" />
          <rect x="29" y="176" width="17" height="48" rx="8" /><rect x="54" y="176" width="17" height="48" rx="8" />
        </g>
        {reg.hits.map((h, i) => (
          <g key={i} className={`ifig-hit${soft ? " soft" : ""}${reg.effect === "ripple" ? " ripple" : ""}`} style={{ transformOrigin: `${h.x}px ${h.y}px` }}>
            <circle className="ifig-glow" cx={h.x} cy={h.y} r={h.r} />
            <circle className="ifig-core" cx={h.x} cy={h.y} r={Math.max(3, h.r * 0.45)} />
            {reg.effect === "ripple" && <><circle className="ifig-ring r1" cx={h.x} cy={h.y} r={h.r} /><circle className="ifig-ring r2" cx={h.x} cy={h.y} r={h.r} /></>}
          </g>
        ))}
      </svg>
      <figcaption>{reg.label}{reg.paired && reg.sideKnown ? ` · ${side?.toLowerCase()}` : ""}</figcaption>
    </figure>
  );
}
