import type { PlayArtKind } from "../playImpact";

export const ART_LABEL: Record<PlayArtKind, string> = {
  run: "Run",
  pass: "Pass",
  incomplete: "Incomplete pass",
  td: "Touchdown",
  sack: "Sack",
  safety: "Safety",
  int: "Interception",
  fumble: "Fumble",
  fg: "Field goal",
  fgMiss: "Missed kick",
  xpMiss: "Missed extra point",
  tackle: "Tackle",
  tfl: "Tackle for loss",
  pd: "Pass defended",
  qbhit: "QB hit",
  adjust: "Adjustment",
  other: "Play",
};

/** A small football, tilted, drawn around (0,0). */
const Ball = ({ rx = 4.2, ry = 2.5, laces = true }: { rx?: number; ry?: number; laces?: boolean }) => (
  <>
    <ellipse rx={rx} ry={ry} />
    {laces && <path d={`M0 ${-ry * 0.55}v${ry * 1.1}M${-rx * 0.35} ${-ry * 0.3}v${ry * 0.6}M${rx * 0.35} ${-ry * 0.3}v${ry * 0.6}`} />}
  </>
);

const Posts = () => <path d="M6 3v10M18 3v10M6 13h12M12 13v8" />;
const Cross = ({ x, y }: { x: number; y: number }) => <path d={`M${x - 2.6} ${y - 2.6}l5.2 5.2M${x + 2.6} ${y - 2.6}l-5.2 5.2`} />;

/**
 * Play art for the plays behind a player's impact number: one simple line
 * drawing per kind of play, colored by the row it sits in.
 */
export function PlayArt({ kind, size = 24 }: { kind: PlayArtKind; size?: number }) {
  return (
    <svg
      className={`play-art art-${kind}`}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {kind === "run" && (
        <>
          <circle cx="15" cy="4.5" r="2" />
          <path d="M12.5 8.5l-3 3.5 3 2-1 5.5M12.5 8.5l3.5 1.8 2.2-1.3M9.5 12l-3 1M12.5 14l3.5 1.5 1 3.5M3 6h3M2 9.5h4M3 13h2" />
        </>
      )}
      {kind === "pass" && (
        <>
          <path d="M3.5 19C5.5 9 12.5 5.5 16.5 7" strokeDasharray="2 2.6" />
          <g transform="translate(18 7) rotate(-22)">
            <Ball />
          </g>
        </>
      )}
      {kind === "incomplete" && (
        <>
          <path d="M3.5 19C5.5 9 11.5 5.5 15 7.5" strokeDasharray="2 2.6" />
          <Cross x={19} y={8} />
        </>
      )}
      {kind === "td" && (
        <>
          <g transform="translate(12 8) rotate(-30)">
            <Ball rx={6} ry={3.5} />
          </g>
          <path d="M3 19h18" strokeWidth="2.6" />
          <path d="M7 15.5v1.5M12 15.5v1.5M17 15.5v1.5" />
        </>
      )}
      {kind === "sack" && (
        <>
          <path d="M12 3v10M7.5 9.5L12 14l4.5-4.5M4 20h16M5 16.5l2 3.5M19 16.5l-2 3.5" />
        </>
      )}
      {kind === "safety" && (
        <>
          <path d="M12 3l7 2.8v5.2c0 4.6-2.9 7.8-7 10-4.1-2.2-7-5.4-7-10V5.8z" />
          <text x="12" y="15.2" fontSize="9.5" fontWeight="800" textAnchor="middle" fill="currentColor" stroke="none">
            2
          </text>
        </>
      )}
      {kind === "int" && (
        <>
          <path d="M4 8h12l-3-3M20 16H8l3 3" />
          <g transform="translate(12 12) rotate(-30)">
            <Ball rx={3} ry={1.8} laces={false} />
          </g>
        </>
      )}
      {kind === "fumble" && (
        <>
          <g transform="translate(10.5 11) rotate(-35)">
            <Ball rx={5.5} ry={3.2} />
          </g>
          <path d="M16 4.5l1.8-1.8M19 8l2.6-.6M17.5 16.5c1.2-1.2 2.4-1.2 3.6 0M3 19c1.5-1.3 3-1.3 4.5 0s3 1.3 4.5 0" />
        </>
      )}
      {kind === "fg" && (
        <>
          <Posts />
          <g transform="translate(12 6.5) rotate(-60)">
            <Ball rx={3} ry={1.8} laces={false} />
          </g>
        </>
      )}
      {(kind === "fgMiss" || kind === "xpMiss") && (
        <>
          <Posts />
          <Cross x={12} y={7} />
        </>
      )}
      {kind === "tackle" && (
        <>
          <circle cx="12" cy="12" r="2.6" />
          <path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4M5.8 5.8l2.8 2.8M15.4 15.4l2.8 2.8M18.2 5.8l-2.8 2.8M8.6 15.4l-2.8 2.8" />
        </>
      )}
      {kind === "qbhit" && (
        <>
          <circle cx="12" cy="12" r="4.6" />
          <path d="M5 5l3 3M19 5l-3 3M5 19l3-3M19 19l-3-3" />
        </>
      )}
      {kind === "tfl" && (
        <>
          <path d="M3 6h18M17 10.5L8 19.5M8 13.5v6h6" />
        </>
      )}
      {kind === "pd" && (
        <path d="M6 12.5V10a1.5 1.5 0 013 0V5.5a1.5 1.5 0 013 0V10m0-3.5a1.5 1.5 0 013 0V11m0-2.5a1.5 1.5 0 013 0V15c0 4-2.5 6-6 6s-6-2-6-5.5z" />
      )}
      {kind === "adjust" && <path d="M4.5 17a7.5 7.5 0 0115 0M12 17l3.5-5M6 17h12" />}
      {kind === "other" && <circle cx="12" cy="12" r="3" />}
    </svg>
  );
}
