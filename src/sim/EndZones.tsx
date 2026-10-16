import { useId } from "react";
import type { EndzoneArt } from "./endzone";

/** The field's coordinate system the art is drawn in: 1200 wide with 100-wide end zones, 560 tall. Anything that shows it scales this box. */
export const EZ_W = 1200;
export const EZ_H = 560;
const EZ = 100;

const lettering = (ez: EndzoneArt, size: number) => ({
  fill: ez.ink, stroke: ez.outline, fontSize: size, fontWeight: 900, letterSpacing: 6, textAnchor: "middle" as const, dominantBaseline: "middle" as const,
  paintOrder: "stroke" as const, strokeWidth: 6, strokeLinejoin: "round" as const,
  fontFamily: ez.serif ? "Georgia, 'Times New Roman', serif" : undefined, fontStyle: ez.italic ? ("italic" as const) : undefined,
});

/**
 * Both end zones of a field, in the home team's design, drawn in a 1200 x 560 box. Used by the simulator's stage and by the game cards, so the
 * two always look alike. Everything is styled inline: it needs no stylesheet.
 */
export function EndZones({ ez, name }: { ez: EndzoneArt; name: string }) {
  const id = useId().replace(/:/g, "");
  const CY = EZ_H / 2;
  const size = ez.size ?? (ez.word.length <= 6 ? 54 : ez.word.length <= 9 ? 44 : ez.word.length <= 12 ? 36 : 28);
  const longest = Math.max(ez.word.length, ...(ez.words?.map((w) => w.length) ?? []));
  const fit = longest * (size * 0.72 + 6) > 480 ? { textLength: 480, lengthAdjust: "spacingAndGlyphs" as const } : {};
  return (
    <g data-endzones={name}>
      <defs>
        <linearGradient id={`${id}s`} x1="0" x2="1"><stop offset="0" stopColor="#000" stopOpacity="0.3" /><stop offset="1" stopColor="#000" stopOpacity="0" /></linearGradient>
        {ez.checker && (
          <pattern id={`${id}c`} width={ez.checker.size * 2} height={ez.checker.size * 2} patternUnits="userSpaceOnUse">
            <rect width={ez.checker.size * 2} height={ez.checker.size * 2} fill={ez.checker.b} />
            <rect width={ez.checker.size} height={ez.checker.size} fill={ez.checker.a} />
            <rect x={ez.checker.size} y={ez.checker.size} width={ez.checker.size} height={ez.checker.size} fill={ez.checker.a} />
          </pattern>
        )}
      </defs>
      {[0, EZ_W - EZ].map((x) => (
        <g key={x} data-endzone={name} transform={x === 0 ? undefined : `translate(${EZ_W} 0) scale(-1 1)`}>
          <rect x="0" width={EZ} height={EZ_H} fill={ez.base} />
          {ez.checker && <rect x="0" width={EZ} height={EZ_H} fill={`url(#${id}c)`} />}
          {ez.hash && Array.from({ length: Math.ceil((EZ_H + EZ) / ez.hash.gap) }, (_, i) => (
            <line key={i} x1="8" x2={EZ - 8} y1={i * ez.hash!.gap + 40} y2={i * ez.hash!.gap - 40} stroke={ez.hash!.color} strokeWidth="3" />
          ))}
          {ez.tiger && Array.from({ length: 7 }, (_, i) => {
            const y = (i + 0.3) * (EZ_H / 7);
            return (
              <g key={i} fill={ez.tiger}>
                <polygon points={`0,${y} ${EZ * 0.42},${y + 34} 0,${y + 78}`} />
                <polygon points={`${EZ},${y + 36} ${EZ * 0.58},${y + 70} ${EZ},${y + 112}`} />
              </g>
            );
          })}
          {ez.stripe && <rect x="0" width="10" height={EZ_H} fill={ez.stripe} />}
          {ez.ridge && <polygon fill={ez.ridge} points={`0,0 ${Array.from({ length: 29 }, (_, i) => `${i % 2 ? 14 : 30 + (i % 4 === 0 ? 8 : 0)},${(i * EZ_H) / 28}`).join(" ")} 0,${EZ_H}`} />}
          {ez.border && <rect x="5" y="5" width={EZ - 10} height={EZ_H - 10} fill="none" stroke={ez.border} strokeWidth="10" />}
          <rect x="0" width={EZ} height={EZ_H} fill={`url(#${id}s)`} opacity="0.7" />
        </g>
      ))}
      {!ez.noWord && !ez.diamonds && [[EZ / 2 + 4, -90], [EZ_W - EZ / 2 - 4, 90]].map(([x, rot], side) => (
        <text key={rot} transform={`translate(${x} ${CY}) rotate(${rot})`} {...fit} style={lettering(ez, size)}>{ez.words?.[side] ?? ez.word}</text>
      ))}
      {ez.ends && [0, 1].flatMap((side) => [0, 1].flatMap((bottom) => ez.ends!.map((color, i) => {
        const cx = side === 0 ? EZ / 2 : EZ_W - EZ / 2;
        const cy = bottom ? EZ_H - 34 - i * 40 : 34 + i * 40;
        return <polygon key={`${side}-${bottom}-${i}`} points={`${cx},${cy - 19} ${cx + 17},${cy} ${cx},${cy + 19} ${cx - 17},${cy}`} fill={color} stroke="#990000" strokeWidth="2" />;
      })))}
      {ez.diamonds && [0, 1].map((side) => {
        const letters = ez.word.replace(/\s/g, "").split("");
        const n = letters.length, step = (EZ_H - 40) / n;
        return letters.map((ch, i) => {
          // The word reads bottom to top on the left end zone and top to bottom on the right, like the lettering elsewhere.
          const cx = side === 0 ? EZ / 2 : EZ_W - EZ / 2;
          const cy = side === 0 ? EZ_H - 20 - (i + 0.5) * step : 20 + (i + 0.5) * step;
          const r = Math.min(step * 0.62, 48);
          return (
            <g key={`${side}-${i}`}>
              <polygon points={`${cx},${cy - r} ${cx + r * 0.9},${cy} ${cx},${cy + r} ${cx - r * 0.9},${cy}`} fill={ez.diamonds!.fill} />
              <text transform={`translate(${cx} ${cy}) rotate(${side === 0 ? -90 : 90})`} style={{ ...lettering(ez, r * 0.9), fill: ez.diamonds!.ink, letterSpacing: 0, stroke: "none" }}>{ch}</text>
            </g>
          );
        });
      })}
    </g>
  );
}
