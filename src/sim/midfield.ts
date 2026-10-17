/**
 * Teams that put a picture of their own at midfield, by logo id: the file (in public/field-art/), its width over height, and how wide it is drawn
 * on the simulator's field (of 1200) and on a game card's field (of 120). Everyone else gets their logo.
 */
export const MIDFIELD_ART: Record<string, { src: string; ratio: number; stage: number; card: number }> = {
  "los-angeles-chargers": { src: "/field-art/chargers.webp", ratio: 720 / 493, stage: 260, card: 19 },
  lsu: { src: "/field-art/lsu.webp", ratio: 640 / 247, stage: 230, card: 17 },
  "denver-broncos": { src: "/field-art/denver.webp", ratio: 320 / 325, stage: 150, card: 11 },
};
