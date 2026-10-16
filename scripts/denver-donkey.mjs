// Builds public/logos/denver-broncos.webp: the Broncos' classic "D" with the horse turned into a donkey (long ears, grey coat) wearing a
// unicorn horn that has been duct-taped to its head. The source picture (scripts/art/denver-d-horse.jpg) is the supplied classic logo.
//
//   node scripts/denver-donkey.mjs
//
// The grey background is removed, the horse's white coat is recoloured, and the ears, horn and tape are drawn over it as vector shapes in
// the picture's own coordinates (1206 x 1161). Record the logo in src/data/logo-sources.json with source "custom" so upgrade-logos.mjs keeps it.
import sharp from "sharp";

const SRC = new URL("./art/denver-d-horse.jpg", import.meta.url).pathname;
const OUT = new URL("../public/logos/denver-broncos.webp", import.meta.url).pathname;
const SIZE = 128;
const COAT = [196, 201, 208]; // a donkey's grey

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const px = (x, y) => (y * W + x) * 4;
const near = (i, c, tol) => Math.abs(data[i] - c[0]) <= tol && Math.abs(data[i + 1] - c[1]) <= tol && Math.abs(data[i + 2] - c[2]) <= tol;

// 1. The grey backdrop: whatever is connected to the picture's edge and close to the corner colour.
const back = [data[0], data[1], data[2]];
const bg = new Uint8Array(W * H);
const stack = [];
const take = (x, y, tol, mark, test) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const p = y * W + x;
  if (mark[p] || !test(px(x, y), tol)) return;
  mark[p] = 1;
  stack.push(p);
};
const fill = (seeds, tol, mark, test) => {
  for (const [x, y] of seeds) take(x, y, tol, mark, test);
  while (stack.length) {
    const p = stack.pop();
    const x = p % W, y = (p - x) / W;
    take(x + 1, y, tol, mark, test), take(x - 1, y, tol, mark, test), take(x, y + 1, tol, mark, test), take(x, y - 1, tol, mark, test);
  }
};
const edges = [];
for (let x = 0; x < W; x++) edges.push([x, 0], [x, H - 1]);
for (let y = 0; y < H; y++) edges.push([0, y], [W - 1, y]);
fill(edges, 14, bg, (i, t) => near(i, back, t));

// 2. The horse's white coat (connected from points inside the body and head, and bounded by its black outline): recoloured grey.
const coat = new Uint8Array(W * H);
fill([[600, 720], [560, 760], [610, 330], [520, 420], [520, 560]], 40, coat, (i, t) => near(i, [255, 255, 255], t) && !bg[i / 4]);

const out = Buffer.alloc(W * H * 4);
for (let p = 0; p < W * H; p++) {
  const i = p * 4;
  let rgb = [data[i], data[i + 1], data[i + 2]];
  if (coat[p]) {
    // keep a little of the original shading so the outline's soft edge does not turn into a rim
    const k = data[i] / 255;
    rgb = COAT.map((c) => Math.round(c * (0.55 + 0.45 * k) + 0 * (1 - k)));
  }
  out[i] = rgb[0], out[i + 1] = rgb[1], out[i + 2] = rgb[2];
  out[i + 3] = bg[p] ? 0 : 255;
}

// 3. Ears, horn and tape.
const ink = "#0b0b0b";
const overlay = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <clipPath id="horn"><path d="M505 300 L585 288 L452 52 Z"/></clipPath>
  </defs>
  <!-- the donkey's long ears, set wide apart and tilted outward, with rounded tips and a darker rim -->
  <g stroke="${ink}" stroke-width="10" stroke-linejoin="round" stroke-linecap="round">
    <path d="M600 276 C566 232 540 150 548 90 C552 56 586 42 612 66 C648 106 672 200 674 272 Z" fill="rgb(${COAT})"/>
    <path d="M610 262 C586 226 568 156 574 112 C578 92 596 88 610 104 C634 134 648 202 650 258 Z" fill="#e6cdd0" stroke="none"/>
    <path d="M668 276 C690 200 740 112 790 70 C820 48 852 70 846 106 C838 160 794 232 738 292 Z" fill="rgb(${COAT})"/>
    <path d="M696 266 C718 206 756 140 790 108 C806 96 820 106 818 122 C812 166 780 222 732 272 Z" fill="#e6cdd0" stroke="none"/>
  </g>
  <!-- the unicorn horn -->
  <g stroke="${ink}" stroke-width="10" stroke-linejoin="round">
    <path d="M505 300 L585 288 L452 52 Z" fill="#f6c21b"/>
    <g clip-path="url(#horn)" stroke="#b8860b" stroke-width="12" fill="none">
      <path d="M470 150 L560 120"/><path d="M485 190 L580 158"/><path d="M498 232 L588 200"/><path d="M510 274 L596 242"/>
    </g>
    <path d="M505 300 L585 288 L452 52 Z" fill="none"/>
  </g>
  <!-- duct tape: a strip around the base of the horn and two across the forehead -->
  <g stroke="${ink}" stroke-width="8" stroke-linejoin="round" fill="#cfd3d8">
    <path d="M480 262 L612 244 L620 300 L488 320 Z"/>
    <path d="M466 318 L650 286 L660 330 L476 366 Z" transform="rotate(-14 560 320)"/>
    <path d="M520 330 L700 300 L706 346 L526 378 Z" transform="rotate(16 600 340)"/>
  </g>
  <g stroke="#7d848c" stroke-width="4" fill="none" stroke-linecap="round">
    <path d="M500 290 L606 274"/><path d="M486 330 L640 304" transform="rotate(-14 560 320)"/><path d="M540 350 L690 324" transform="rotate(16 600 340)"/>
  </g>
</svg>`;

const base = await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
const composed = await sharp(base).composite([{ input: Buffer.from(overlay), top: 0, left: 0 }]).png().toBuffer();
const res = await sharp(composed)
  .trim({ threshold: 1 })
  .resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .webp({ quality: 92, alphaQuality: 100 })
  .toFile(OUT);
if (process.env.PREVIEW) await sharp(composed).trim({ threshold: 1 }).resize(600, 600, { fit: "contain", background: { r: 40, g: 44, b: 50, alpha: 1 } }).png().toFile(process.env.PREVIEW);
console.log(`denver-broncos: ${res.size} bytes -> ${OUT}`);
