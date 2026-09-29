import { useId, useState } from "react";

/**
 * Win-probability line for a finished game. Up is the home team, down the away
 * team; the midline is 50%. Quarter boundaries are marked so a late swing reads
 * as late. Hover or focus shows the probability at that point.
 */
export function WinProb({
  wp,
  away,
  home,
}: {
  wp: [number, number | null][];
  away: string;
  home: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const uid = useId().replace(/:/g, "");
  if (wp.length < 8) return null;
  const W = 300,
    H = 84,
    padL = 34;
  const n = wp.length;
  const x = (i: number) => padL + (i / (n - 1)) * (W - padL);
  const y = (p: number) => 2 + (1 - p / 100) * (H - 4);
  const d = wp.map(([p], i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(" ");
  const area = `${d} L${x(n - 1)},${y(50)} L${x(0)},${y(50)} Z`;
  // Quarter starts
  const marks: { i: number; q: number }[] = [];
  wp.forEach(([, q], i) => {
    if (q && q > 1 && q !== wp[i - 1]?.[1] && !marks.some((m) => m.q === q)) marks.push({ i, q });
  });
  const peak = (side: "home" | "away") =>
    Math.max(...wp.map(([p]) => (side === "home" ? p : 100 - p)));
  const label = `Win probability: ${home} peaked at ${peak("home")}%, ${away} at ${peak("away")}%.`;
  const cols = Math.min(n, 40);
  const colW = (W - padL) / cols;
  const at = (c: number) => Math.round((c / (cols - 1)) * (n - 1));
  const tip = active == null ? null : wp[at(active)];
  const q = tip?.[1];
  return (
    <figure className="wp">
      <figcaption className="micro-label">Win probability</figcaption>
      <div className="wp-wrap">
        <svg viewBox={`0 0 ${W} ${H + 12}`} role="img" aria-label={label}>
          <clipPath id={`${uid}t`}>
            <rect x={0} y={0} width={W} height={y(50)} />
          </clipPath>
          <clipPath id={`${uid}b`}>
            <rect x={0} y={y(50)} width={W} height={H} />
          </clipPath>
          <path d={area} className="wp-home" clipPath={`url(#${uid}t)`} />
          <path d={area} className="wp-away" clipPath={`url(#${uid}b)`} />
          <line x1={padL} x2={W} y1={y(50)} y2={y(50)} className="wp-mid" />
          {marks.map((m) => (
            <g key={m.q}>
              <line x1={x(m.i)} x2={x(m.i)} y1={0} y2={H} className="wp-q" />
              <text x={x(m.i) + 3} y={H + 10} className="wp-qt">
                {m.q > 4 ? "OT" : `Q${m.q}`}
              </text>
            </g>
          ))}
          <text x={padL + 3} y={H + 10} className="wp-qt">
            Q1
          </text>
          <path d={d} className="wp-line" />
          <text x={0} y={10} className="wp-side">
            {home}
          </text>
          <text x={0} y={H - 2} className="wp-side">
            {away}
          </text>
          {active != null && <line x1={x(at(active))} x2={x(at(active))} y1={0} y2={H} className="wp-cursor" />}
          {Array.from({ length: cols }, (_, c) => (
            <rect
              key={c}
              x={padL + c * colW}
              y={0}
              width={colW}
              height={H}
              fill="transparent"
              tabIndex={c % 4 === 0 ? 0 : -1}
              aria-label={`${wp[at(c)][1] ? (wp[at(c)][1]! > 4 ? "OT" : `Q${wp[at(c)][1]}`) : "Kickoff"}: ${home} ${wp[at(c)][0]}%`}
              onPointerEnter={() => setActive(c)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(c)}
              onBlur={() => setActive(null)}
            />
          ))}
        </svg>
        {tip && (
          <div className="wp-tip" role="status" style={{ left: `${(x(at(active!)) / W) * 100}%` }}>
            <strong>{tip[0] >= 50 ? `${home} ${tip[0]}%` : `${away} ${100 - tip[0]}%`}</strong>
            <span>{q ? (q > 4 ? "Overtime" : `Q${q}`) : "Kickoff"}</span>
          </div>
        )}
      </div>
    </figure>
  );
}
