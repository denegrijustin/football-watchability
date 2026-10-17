/** Field coordinates for 64 marchers outlining the actual home logo. */
export type BandPoint = [number, number];

/** Sample the alpha silhouette; transparent padding does not change its size. */
export function logoOutline(data: Uint8ClampedArray, width: number, height: number, count = 64): BandPoint[] | null {
  const alpha = (x: number, y: number) => x < 0 || y < 0 || x >= width || y >= height ? 0 : data[(y * width + x) * 4 + 3];
  const edge: BandPoint[] = [];
  let minX = width, maxX = 0, minY = height, maxY = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (alpha(x, y) < 100) continue;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => alpha(x + dx, y + dy) < 100)) edge.push([x, y]);
  }
  if (edge.length < count || maxX <= minX || maxY <= minY) return null;
  // Farthest-point sampling covers thin details and disconnected portions evenly.
  const selected = [edge[0]];
  const distance = edge.map(() => Infinity);
  for (let k = 1; k < count; k++) {
    const last = selected[selected.length - 1];
    let best = -1, at = 0;
    edge.forEach(([x, y], i) => {
      distance[i] = Math.min(distance[i], (x - last[0]) ** 2 + (y - last[1]) ** 2);
      if (distance[i] > best) { best = distance[i]; at = i; }
    });
    selected.push(edge[at]);
  }
  const scale = Math.min(46 / (maxX - minX), 26 / (maxY - minY));
  return selected.map(([x, y]) => [60 + (x - (minX + maxX) / 2) * scale, 20 + (y - (minY + maxY) / 2) * scale]);
}

/** A near-sideline exit: retain each file's x to avoid crossing diagonally. */
export const exitPoints = (points: BandPoint[]): BandPoint[] => points.map(([x], i) => [x, 45 + (i % 4) * 0.7]);

export const bandPhase = (left: number, opening: boolean): "logo" | "show" | "exit" =>
  left <= 30_000 ? "exit" : opening || left <= 90_000 ? "logo" : "show";

export const OHIO_DOTTER = 1; // Member 1 is a sousaphone, not the drum major.
export const OHIO_DOT: BandPoint = [66, 12];
export const OHIO_STAGE: BandPoint = [92, 12];
const oval = (cx: number, cy: number, rx: number, ry: number, n: number): BandPoint[] =>
  Array.from({ length: n }, (_, i) => [cx + rx * Math.cos(i * Math.PI * 2 / n), cy + ry * Math.sin(i * Math.PI * 2 / n)]);
function stroke(points: BandPoint[], n: number): BandPoint[] {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  const total = lengths.reduce((a, b) => a + b, 0);
  return Array.from({ length: n }, (_, k) => {
    let distance = total * k / (n - 1), segment = 0;
    while (segment < lengths.length - 1 && distance > lengths[segment]) distance -= lengths[segment++];
    const t = distance / lengths[segment];
    return [points[segment][0] + (points[segment + 1][0] - points[segment][0]) * t, points[segment][1] + (points[segment + 1][1] - points[segment][1]) * t];
  });
}
/** A stylized Script Ohio: 63 letter positions and a reserved sousaphone dot. */
export const SCRIPT_OHIO: BandPoint[] = [
  ...oval(36, 20, 7, 11, 20),
  ...stroke([[48, 29], [53, 9], [50, 23], [54, 18], [57, 18], [59, 21], [57, 29]], 17),
  ...stroke([[66, 18], [64, 29]], 7),
  ...oval(80, 24, 6, 6, 19),
];


/** Staged beyond the home sideline: four shallow files, fully outside the SVG. */
export const entrancePoints = (count = 64): BandPoint[] => Array.from({ length: count }, (_, i) => [24 + (i % 16) * 4.8, 44 + Math.floor(i / 16) * 1.1]);

/** Conference bookends use the home team's conference, not its opponent's. */
export function bandCue(left: number, step: number, hasConference: boolean): "logo" | "conference" | "show" | "exit" {
  if (left <= 30_000) return "exit";
  if (left <= 90_000) return "logo";
  if (hasConference && left <= 150_000) return "conference";
  if (step === 0) return "logo";
  if (hasConference && step === 1) return "conference";
  return "show";
}
