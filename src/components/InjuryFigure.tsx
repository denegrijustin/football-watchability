import { useRef } from "react";
import { bodyRegion } from "../bodyMap";
import { INJURY_FIGURES } from "../injuryFigures";
import { useOnScreen } from "../motion";

/**
 * A small front-facing player in the team's uniform (the pictures in public/injury) with the injured area lit and pulsing (three times, then it stays lit, so it is not a loop to run down the battery).
 * A head injury sends out rings. When the side is not given, both sides are lit more softly. Illness and undisclosed injuries show the plain figure.
 */
export function InjuryFigure({ type, location, side, detail, team, size = 64 }: { team?: string | null; type: string | null; location?: string | null; side?: string | null; detail?: string | null; size?: number }) {
  const ref = useRef<HTMLElement>(null);
  const seen = useOnScreen(ref, true);
  const reg = bodyRegion(type, location, detail, side);
  const known = !!team && INJURY_FIGURES.has(team);
  const soft = reg.paired && !reg.sideKnown;
  return (
    <figure ref={ref} className={`ifig${seen ? " play" : ""}`} style={{ width: size }}>
      <svg viewBox="0 0 130 230" width={size} height={size * 2} role="img" aria-label={`Injury area: ${reg.label}${reg.paired && reg.sideKnown ? `, ${side?.toLowerCase()} side` : ""}`}>
        <image className="ifig-body" href={`/injury/${known ? team : "generic"}.webp`} x="0" y="0" width="130" height="230" preserveAspectRatio="xMidYMid meet" />
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
