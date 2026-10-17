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
