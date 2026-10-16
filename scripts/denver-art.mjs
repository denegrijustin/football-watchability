// Builds Denver's two pictures from the supplied artwork (scripts/art/denver-donkey.png: the classic "D" with a donkey wearing a taped unicorn horn):
//   public/logos/denver-broncos.webp   the logo, 128px
//   public/field-art/denver.webp       the same art, larger, for the middle of the field in the simulator and on the cards
//
//   node scripts/denver-art.mjs
//
// The grey backdrop (what is connected to the picture's edge and close to the corner colour) becomes transparent. Record the logo in
// src/data/logo-sources.json with source "custom" so scripts/upgrade-logos.mjs never replaces it.
import sharp from "sharp";

const SRC = new URL("./art/denver-donkey.png", import.meta.url).pathname;
const LOGO = new URL("../public/logos/denver-broncos.webp", import.meta.url).pathname;
const FIELD = new URL("../public/field-art/denver.webp", import.meta.url).pathname;

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const back = [data[0], data[1], data[2]];
const near = (i, tol) => Math.abs(data[i] - back[0]) <= tol && Math.abs(data[i + 1] - back[1]) <= tol && Math.abs(data[i + 2] - back[2]) <= tol;
const bg = new Uint8Array(W * H);
const stack = [];
const take = (x, y) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const p = y * W + x;
  if (bg[p] || !near(p * 4, 12)) return;
  bg[p] = 1;
  stack.push(p);
};
for (let x = 0; x < W; x++) take(x, 0), take(x, H - 1);
for (let y = 0; y < H; y++) take(0, y), take(W - 1, y);
while (stack.length) {
  const p = stack.pop();
  const x = p % W, y = (p - x) / W;
  take(x + 1, y), take(x - 1, y), take(x, y + 1), take(x, y - 1);
}
const out = Buffer.from(data);
for (let p = 0; p < W * H; p++) out[p * 4 + 3] = bg[p] ? 0 : 255;
const png = await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
const trimmed = await sharp(png).trim({ threshold: 1 }).png().toBuffer();

const logo = await sharp(trimmed).resize(128, 128, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 92, alphaQuality: 100 }).toFile(LOGO);
const field = await sharp(trimmed).resize({ width: 320 }).webp({ quality: 90, alphaQuality: 100 }).toFile(FIELD);
console.log(`denver-broncos: ${logo.size} bytes; field-art/denver: ${field.size} bytes, ${field.width}x${field.height}`);
