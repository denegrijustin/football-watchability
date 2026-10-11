import registry from "./data/conference-logos.json" with { type: "json" };
import { LogoMark } from "./logoTone";

type Entry = { label: string; color: string; src?: string };
const conferences = registry.conferences as Record<string, Entry>;

/** The conference's entry, or null for independents and anything not listed. */
export const confEntry = (name?: string | null): Entry | null => (name ? conferences[name] ?? null : null);

/**
 * A conference's mark painted on the field: its official logo when one has been added to data/conference-logos.json, otherwise a
 * lettered badge in the conference's color.
 */
export function ConfMark({ conf, cx, cy, size }: { conf?: string | null; cx: number; cy: number; size: number }) {
  const e = confEntry(conf);
  if (!e) return null;
  if (e.src)
    return (
      <g className="lf-conf" data-conf={conf}>
        <LogoMark src={e.src} cx={cx} cy={cy} size={size} chipOpacity={0.85} />
      </g>
    );
  return (
    <g className="lf-conf" data-conf={conf}>
      <rect x={cx - size / 2} y={cy - size * 0.36} width={size} height={size * 0.72} rx={size * 0.18} fill={e.color} stroke="#fff" strokeWidth="0.4" opacity="0.92" />
      <text x={cx} y={cy + size * 0.12} textAnchor="middle" className="lf-conf-text" style={{ fontSize: `${size * (e.label.length > 3 ? 0.27 : 0.34)}px` }}>
        {e.label}
      </text>
    </g>
  );
}
