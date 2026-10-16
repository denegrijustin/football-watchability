// Builds the Chargers' two pictures (the logo from scripts/art/chargers-shield.png, the midfield art from scripts/art/chargers-banner.png):
//   public/logos/los-angeles-chargers.webp   the supplied shield (the donkey with the taped unicorn horn), 128px
//   public/field-art/chargers.webp           the whole banner without the outer gold stripes, for the middle of the field in the simulator and on the cards
//
//   node scripts/chargers-art.mjs
//
// Record the logo in src/data/logo-sources.json with source "custom" so scripts/upgrade-logos.mjs never replaces it.
import sharp from "sharp";

const SRC = new URL("./art/chargers-banner.png", import.meta.url).pathname;
const LOGO = new URL("../public/logos/los-angeles-chargers.webp", import.meta.url).pathname;
const FIELD = new URL("../public/field-art/chargers.webp", import.meta.url).pathname;

const meta = await sharp(SRC).metadata();
console.log(`source ${meta.width}x${meta.height}`);

// The logo: the supplied shield (scripts/art/chargers-shield.png). The white backdrop connected to the picture's edge becomes transparent;
// the shield's own white (inside its blue outline) stays.
const shield = new URL("./art/chargers-shield.png", import.meta.url).pathname;
const { data, info } = await sharp(shield).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const near = (i) => data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240;
const bg = new Uint8Array(W * H);
const stack = [];
const take = (x, y) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const p = y * W + x;
  if (bg[p] || !near(p * 4)) return;
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
console.log(`los-angeles-chargers: ${logo.size} bytes`);

// The field art: the banner between the gold stripes, so it reads as a flag laid on the turf.
const banner = await sharp(SRC).extract({ left: 90, top: 0, width: 1428, height: meta.height }).resize({ width: 720 }).webp({ quality: 88 }).toFile(FIELD);
console.log(`field-art/chargers: ${banner.size} bytes, ${banner.width}x${banner.height}`);
