// Builds LSU's midfield art from the supplied photo of the tiger eye on the field (scripts/art/lsu-eye.png): the eye is cut out of the grass
// (olive-green pixels become transparent, feathered at the edge), enlarged, and written to public/field-art/lsu.webp.
//
//   node scripts/lsu-art.mjs
import sharp from "sharp";

const SRC = new URL("./art/lsu-eye.png", import.meta.url).pathname;
const OUT = new URL("../public/field-art/lsu.webp", import.meta.url).pathname;
const BOX = { left: 28, top: 36, width: 192, height: 74 };

const { data, info } = await sharp(SRC).extract(BOX).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const hsv = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx / 255];
};
const out = Buffer.from(data);
const grass = new Uint8Array(W * H);
for (let p = 0; p < W * H; p++) {
  const [h, s, v] = hsv(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]);
  // Turf is olive green (hue about 60-100) and darker than the gold of the eye; the eye's purple, white and gold are all outside that.
  grass[p] = h >= 62 && h <= 110 && s > 0.18 && v < 0.62 ? 1 : 0;
}
// A pixel is grass only when its neighbourhood is too (so the shaded gold of the eye is kept); then feather the cut.
const solid = new Uint8Array(W * H);
for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) n += grass[(y + dy) * W + x + dx];
  solid[y * W + x] = n >= 6 ? 1 : 0;
}
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const p = y * W + x;
  if (solid[p]) out[p * 4 + 3] = 0;
  else if (grass[p]) out[p * 4 + 3] = 90;
  else {
    let near = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const q = (y + dy) * W + x + dx; if (q >= 0 && q < W * H) near += solid[q]; }
    out[p * 4 + 3] = near ? 200 : 255;
  }
}
// The photo's yard lines cross the eye as thin white strokes. White that is not part of a thick patch (the eye's own white is) is painted over with
// the colors around it, or cleared where it borders turf.
const white = new Uint8Array(W * H);
for (let p = 0; p < W * H; p++) {
  const [, s, v] = hsv(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]);
  white[p] = v > 0.72 && s < 0.28 ? 1 : 0;
}
const count = (arr, x, y, r) => {
  let n = 0, t = 0;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const xx = x + dx, yy = y + dy;
    if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
    t++;
    n += arr[yy * W + xx];
  }
  return n / t;
};
const fixed = Buffer.from(out);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const p = y * W + x;
  if (!white[p] || out[p * 4 + 3] === 0 || count(white, x, y, 2) >= 0.5) continue;
  const turf = count(solid, x, y, 3);
  if (turf > 0.25) { fixed[p * 4 + 3] = 0; continue; }
  let r = 0, g = 0, b = 0, n = 0;
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const xx = x + dx, yy = y + dy, q = yy * W + xx;
    if (xx < 0 || yy < 0 || xx >= W || yy >= H || white[q] || grass[q]) continue;
    r += out[q * 4]; g += out[q * 4 + 1]; b += out[q * 4 + 2]; n++;
  }
  if (n) { fixed[p * 4] = r / n; fixed[p * 4 + 1] = g / n; fixed[p * 4 + 2] = b / n; }
}
const png = await sharp(fixed, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
const trimmed = await sharp(png).trim({ threshold: 1 }).png().toBuffer();
const res = await sharp(trimmed).resize({ width: 640, kernel: "lanczos3" }).webp({ quality: 90, alphaQuality: 100 }).toFile(OUT);
console.log(`field-art/lsu: ${res.size} bytes, ${res.width}x${res.height}`);
