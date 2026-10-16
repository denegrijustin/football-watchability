/**
 * The home team's end zone, painted the way the real one looks. A few programs have a famous design (Tennessee's orange and white checkerboard,
 * Notre Dame's navy with gold lettering); everyone else gets the team's color with its name in the alternate color when that reads well, and white
 * (or black on a light end zone) when it does not. Both end zones are the home team's, as in a real stadium.
 */
export interface EndzoneArt {
  base: string;
  /** Lettering fill and outline. */
  ink: string;
  outline: string;
  word: string;
  serif: boolean;
  /** A checkerboard laid over the base: the two colors and the square size, in field pixels. */
  checker?: { a: string; b: string; size: number };
  /** A stripe along the back line. */
  stripe?: string;
}

const lum = (hex: string) => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0.3;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  const f = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
/** WCAG contrast ratio between two colors. */
export const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Programs whose end zones are known by sight, by school name. */
const FAMOUS: Record<string, Partial<EndzoneArt>> = {
  tennessee: { base: "#ffffff", ink: "#ff8200", outline: "#ffffff", checker: { a: "#ff8200", b: "#ffffff", size: 50 } },
  "notre dame": { base: "#0c2340", ink: "#c99700", outline: "#07162a", serif: true, stripe: "#c99700" },
  michigan: { base: "#ffcb05", ink: "#00274c", outline: "#ffcb05", stripe: "#00274c" },
  clemson: { base: "#f56600", ink: "#522d80", outline: "#ffffff" },
  lsu: { base: "#461d7c", ink: "#fdd023", outline: "#2b0f4d" },
};

export function endzoneFor(t: { short: string; color: string; alt?: string }): EndzoneArt {
  const word = t.short.toUpperCase();
  const famous = FAMOUS[t.short.toLowerCase()];
  const base = famous?.base ?? t.color;
  // The alternate color for the lettering when it stands out from the end zone, otherwise white or black, whichever reads better.
  const fallback = contrast(base, "#ffffff") >= contrast(base, "#111111") ? "#ffffff" : "#111111";
  const ink = famous?.ink ?? (t.alt && contrast(base, t.alt) >= 3 ? t.alt : fallback);
  const outline = famous?.outline ?? (lum(ink) > 0.4 ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.7)");
  return { base, ink, outline, word, serif: false, ...famous };
}
