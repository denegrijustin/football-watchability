import alt from "./data/team-alt.json";

const table = alt as Record<string, string>;
const lum = (hex: string) => {
  const c = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

/** A team's second color for the glow and accents (gold for Pittsburgh), or undefined when it has none or it is too dark to glow on a dark card. */
export function altColor(logoId: string | undefined): string | undefined {
  const hex = logoId ? table[logoId] : undefined;
  return hex && lum(hex) >= 0.12 ? `#${hex}` : undefined;
}
