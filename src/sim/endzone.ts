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
  /** No lettering at all (Tennessee's checkerboard, Notre Dame's hash marks). */
  noWord?: boolean;
  serif: boolean;
  italic?: boolean;
  /** Lettering size in field pixels; otherwise it is chosen from the length of the word. */
  size?: number;
  /** A checkerboard laid over the base: the two colors and the square size, in field pixels. */
  checker?: { a: string; b: string; size: number };
  /** Diagonal hash lines (Notre Dame). */
  hash?: { color: string; gap: number };
  /** Black wedges biting in from both edges (the Bengals' tiger stripes). */
  tiger?: string;
  /** The word spelled one letter to a diamond, down the length of the end zone (Missouri). */
  diamonds?: { fill: string; ink: string };
  /** A border around the end zone. */
  border?: string;
  /** A stripe along the back line. */
  stripe?: string;
  /** Small diamonds stacked at both ends of the end zone, top to bottom (USC's cardinal, white, cardinal). */
  ends?: string[];
  /** A jagged ridge along the end line (Wyoming's brown mountains). */
  ridge?: string;
  /** A different word in each end zone (the Steelers: PITTSBURGH on one end, STEELERS on the other). */
  words?: [string, string];
  /** Turf colors, light and dark mowing stripes, when the field itself is not green (Boise State's blue). */
  field?: [string, string];
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

/**
 * Teams whose end zones are known by sight, by the short name the simulator uses (the school, or the NFL nickname). Everything not listed gets the
 * default below. To add a team, add a line: the fields are the ones in EndzoneArt.
 */
const FAMOUS: Record<string, Partial<EndzoneArt>> = {
  // college
  tennessee: { base: "#ffffff", checker: { a: "#ff8200", b: "#ffffff", size: 20 }, noWord: true },
  "notre dame": { base: "#17472c", hash: { color: "rgba(255,255,255,0.88)", gap: 44 }, noWord: true },
  missouri: { base: "#111111", border: "#f1b82d", diamonds: { fill: "#f1b82d", ink: "#111111" } },
  "ole miss": { base: "#2d7db6", ink: "#d4572e", outline: "#ffffff", italic: true, size: 62 },
  lsu: { base: "#fdd023", ink: "#461d7c", outline: "#ffffff", size: 116 },
  oregon: { base: "#24572f", ink: "#fee123", outline: "rgba(0,0,0,0)", size: 84 },
  michigan: { base: "#ffcb05", ink: "#00274c", outline: "#ffcb05", stripe: "#00274c" },
  clemson: { base: "#f56600", ink: "#522d80", outline: "#ffffff" },
  "boise state": { base: "#d64309", ink: "#0033a0", outline: "#ffffff", word: "BRONCOS", size: 58, field: ["#0d43b3", "#0a3a9f"] },
  maryland: { base: "#111111", checker: { a: "#ffc72c", b: "#111111", size: 25 }, noWord: true },
  "florida state": { base: "#f4f0e4", ink: "#ceb888", outline: "#782f40", stripe: "#782f40", size: 44 },
  california: { base: "#fdb515", ink: "#003262", outline: "rgba(0,0,0,0)", border: "#003262", word: "California", italic: true, size: 60 },
  colorado: { base: "#16130f", ink: "#cfb87c", outline: "rgba(0,0,0,0)", size: 72 },
  tulane: { base: "#3d95e0", ink: "#00573f", outline: "#ffffff", words: ["GREEN WAVE", "GREEN WAVE"], size: 56 },
  kentucky: { base: "#0033a0", ink: "#ffffff", outline: "#00205b", size: 62 },
  "north carolina": { base: "#7bafd4", ink: "#ffffff", outline: "rgba(0,0,0,0)", word: "TAR HEELS", size: 66, border: "#ffffff" },
  rice: { base: "#00205b", ink: "#cfd3d8", outline: "rgba(0,0,0,0)", word: "Rice", words: ["Rice", "Owls"], serif: true, italic: true, size: 64 },
  unlv: { base: "#111111", ink: "#cc0000", outline: "#ffffff", word: "REBELS", size: 78 },
  memphis: { base: "#aeb4bb", tiger: "#0d2a5c", ink: "#ffffff", outline: "#0d2a5c", words: ["Memphis", "Tigers"], size: 60 },
  usc: { base: "#ffc72c", ink: "#990000", outline: "#ffffff", word: "USC", ends: ["#990000", "#ffffff", "#990000"], size: 84 },
  "southern california": { base: "#ffc72c", ink: "#990000", outline: "#ffffff", word: "USC", ends: ["#990000", "#ffffff", "#990000"], size: 84 },
  wyoming: { base: "#ffc425", ink: "#492f24", outline: "rgba(0,0,0,0)", ridge: "#492f24", words: ["WYOMING", "COWBOYS"], serif: true, size: 58 },
  // NFL
  nebraska: { base: "#e41c38", ink: "#ffffff", outline: "#a50f26", border: "#ffffff", words: ["HUSKERS", "NEBRASKA"], serif: false, size: 60 },
  "49ers": { base: "#aa0000", ink: "#ffffff", outline: "#000000", stripe: "#b3995d", size: 78 },
  steelers: { base: "#ffb612", ink: "#101820", outline: "#ffffff", words: ["PITTSBURGH", "STEELERS"], size: 56 },
  browns: { base: "#28683a", ink: "#ff3c00", outline: "rgba(0,0,0,0)", size: 72 },
  chargers: { base: "#0f6cc0", ink: "#ffffff", outline: "#ffc20e", size: 58 },
  cowboys: { base: "#0a3a8c", ink: "#b0b7bc", outline: "rgba(0,0,0,0.35)", size: 66 },
  bengals: { base: "#fb4f14", ink: "#ffffff", outline: "#000000", tiger: "#000000", size: 66 },
  ravens: { base: "#241773", ink: "#f3ead2", outline: "#a8861c", italic: true, serif: true, size: 66 },
  chiefs: { base: "#e2b72d", ink: "#a6192e", outline: "#7a0f1e", serif: true, size: 80 },
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
