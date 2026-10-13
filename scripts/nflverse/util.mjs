// Shared helpers: download nflverse release files (with a local cache for the big ones) and the file locations.
import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

export const RELEASES = process.env.NFLVERSE_BASE ?? "https://github.com/nflverse/nflverse-data/releases/download";
export const urls = {
  games: `${RELEASES}/schedules/games.csv`,
  teams: `${RELEASES}/teams/teams_colors_logos.csv`,
  pbp: (y) => `${RELEASES}/pbp/play_by_play_${y}.csv.gz`,
  injuries: (y) => `${RELEASES}/injuries/injuries_${y}.csv`,
  depth: (y) => `${RELEASES}/depth_charts/depth_charts_${y}.csv`,
  snaps: (y) => `${RELEASES}/snap_counts/snap_counts_${y}.csv`,
};

/** Downloads a URL to a file (following redirects). `maxAgeMs` reuses a recent copy. Throws on any non-200. */
export async function download(url, file, { maxAgeMs = 0 } = {}) {
  if (maxAgeMs && existsSync(file) && Date.now() - statSync(file).mtimeMs < maxAgeMs) return file;
  mkdirSync(new URL("./", `file://${file}`).pathname, { recursive: true });
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(180_000) });
  if (!res.ok || !res.body) throw new Error(`${url} returned ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(file));
  return file;
}
