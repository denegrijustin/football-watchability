// Builds a team logo file from artwork supplied by hand (a picture on a white background), e.g.
//
//   node scripts/custom-logo.mjs <input> <logoId> [--chiefs]
//
// The white background becomes transparent (only the white connected to the picture's edge, so white inside the art stays),
// the art is trimmed and fitted into a square, and public/logos/<logoId>.webp is written. --chiefs recolors black and grey art
// to Kansas City red and gold (black -> red, grey -> gold, white stays white). Record the logo in src/data/logo-sources.json
// with source "custom" so scripts/upgrade-logos.mjs never replaces it. The site draws some of these upside down (styles.css).
import sharp from "sharp";

const [input, logoId, ...flags] = process.argv.slice(2);
if (!input || !logoId) throw new Error("usage: node scripts/custom-logo.mjs <input> <logoId> [--chiefs]");
const SIZE = 256;
const RED = [227, 24, 55];
const GOLD = [255, 184, 28];

const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const lum = (i) => (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
// Background is what is already transparent, or white.
const isBg = (i) => data[i + 3] < 128 || (data[i] > 238 && data[i + 1] > 238 && data[i + 2] > 238);

// Flood the background from the edges.
const bg = new Uint8Array(W * H);
const stack = [];
const push = (x, y) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const p = y * W + x;
  if (bg[p] || !isBg(p * 4)) return;
  bg[p] = 1;
  stack.push(p);
};
for (let x = 0; x < W; x++) (push(x, 0), push(x, H - 1));
for (let y = 0; y < H; y++) (push(0, y), push(W - 1, y));
while (stack.length) {
  const p = stack.pop();
  const x = p % W;
  const y = (p - x) / W;
  push(x + 1, y), push(x - 1, y), push(x, y + 1), push(x, y - 1);
}

const out = Buffer.alloc(W * H * 4);
const mix = (a, b, t) => a.map((v, k) => Math.round(v + (b[k] - v) * t));
for (let p = 0; p < W * H; p++) {
  const i = p * 4;
  let rgb = [data[i], data[i + 1], data[i + 2]];
  let a = bg[p] ? 0 : 255;
  if (!bg[p]) {
    // A light edge pixel next to the removed background is anti-aliasing: let it fade rather than leave a white halo.
    const x = p % W;
    const y = (p - x) / W;
    const near = (x > 0 && bg[p - 1]) || (x < W - 1 && bg[p + 1]) || (y > 0 && bg[p - W]) || (y < H - 1 && bg[p + W]);
    if (near) a = Math.round(255 * Math.min(1, Math.max(0, (1 - lum(i)) / 0.35)));
    if (flags.includes("--chiefs")) {
      const l = lum(i);
      rgb = l < 0.65 ? mix(RED, GOLD, l / 0.65) : mix(GOLD, [255, 255, 255], (l - 0.65) / 0.35);
    }
  }
  out[i] = rgb[0];
  out[i + 1] = rgb[1];
  out[i + 2] = rgb[2];
  out[i + 3] = a;
}
const png = await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
const file = new URL(`../public/logos/${logoId}.webp`, import.meta.url).pathname;
const res = await sharp(png)
  .trim({ threshold: 1 })
  .resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .webp({ quality: 90, alphaQuality: 100 })
  .toFile(file);
console.log(`${logoId}: ${res.size} bytes -> ${file}`);
