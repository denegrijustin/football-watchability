/**
 * A team logo can match what it sits on: a white logo on a white page, a navy one on a navy card. This watches every
 * logo image (the page and the SP+ / NFL+ shadow roots), reads the logo's own pixels once, compares them with the
 * color behind the image, and when too much of the logo would disappear gives it a small chip that contrasts with it.
 */
const lum = (r: number, g: number, b: number) => {
  const f = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

const CHIP_LIGHT = "#ffffff";
const CHIP_DARK = "#1d232a";
const MARK = "data-lg";

type Px = Float32Array; // relative luminance of each opaque pixel of a 24 x 24 sample
const pixels = new Map<string, Px | null>();

function sample(img: HTMLImageElement): Px | null {
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 24;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, 24, 24);
    const d = ctx.getImageData(0, 0, 24, 24).data;
    const out: number[] = [];
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) out.push(lum(d[i], d[i + 1], d[i + 2]));
    return out.length > 20 ? Float32Array.from(out) : null;
  } catch {
    return null; // unreadable image: it stays as it is
  }
}

const parseColor = (s: string) => {
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
};
/** The average of the color stops in a computed gradient (rgb(), rgba() and color(srgb ...)). */
function gradientColor(img: string) {
  const stops = [...img.matchAll(/rgba?\(([^)]+)\)|color\(srgb ([^)]+)\)/g)];
  if (!stops.length) return null;
  let r = 0, g = 0, b = 0, a = 0;
  for (const m of stops) {
    const p = (m[1] ?? m[2]).split(/[ ,/]+/).filter(Boolean).map(Number);
    const k = m[2] ? 255 : 1;
    r += p[0] * k; g += p[1] * k; b += p[2] * k; a += p.length > 3 ? p[3] : 1;
  }
  const n = stops.length;
  return { r: r / n, g: g / n, b: b / n, a: Math.min(1, a / n) };
}
const up = (e: Element): Element | null => e.parentElement ?? ((e.getRootNode() as ShadowRoot).host ?? null);

/** The color behind an element: its ancestors' backgrounds laid over the page color. Null when a gradient is in the way. */
function backdrop(el: Element): number | null {
  const layers: { r: number; g: number; b: number; a: number }[] = [];
  for (let e = up(el); e; e = up(e)) {
    const cs = getComputedStyle(e);
    let c = parseColor(cs.backgroundColor);
    // a gradient over a solid color is only shading; a gradient on its own is taken at the average of its stops
    if (cs.backgroundImage !== "none" && !cs.backgroundImage.startsWith("url(") && !(c && c.a >= 0.99)) {
      const g = gradientColor(cs.backgroundImage);
      if (!g) return null;
      c = g;
    }
    if (c && c.a > 0) {
      layers.push(c);
      if (c.a >= 0.99) break;
    }
  }
  const root = parseColor(getComputedStyle(document.documentElement).backgroundColor);
  let [r, g, b] = root && root.a > 0.5 ? [root.r, root.g, root.b] : [255, 255, 255];
  for (const c of layers.reverse()) {
    r = c.r * c.a + r * (1 - c.a);
    g = c.g * c.a + g * (1 - c.a);
    b = c.b * c.a + b * (1 - c.a);
  }
  return lum(r, g, b);
}

function apply(img: HTMLImageElement) {
  const px = pixels.get(img.currentSrc || img.src);
  if (!px) return;
  const w = img.getBoundingClientRect().width;
  if (w < 8) return;
  const bl = backdrop(img);
  if (bl == null) return;
  let bad = 0;
  for (let i = 0; i < px.length; i++) if (ratio(px[i], bl) < 1.8) bad++;
  if (bad / px.length > 0.4) {
    const pad = Math.max(1, Math.round(w * 0.1));
    img.setAttribute(MARK, "1");
    img.style.cssText += `;box-sizing:border-box;padding:${pad}px;border-radius:${Math.round(w * 0.28)}px;background:${bl > 0.35 ? CHIP_DARK : CHIP_LIGHT}`;
  } else if (img.hasAttribute(MARK)) {
    img.removeAttribute(MARK);
    img.style.removeProperty("background");
    img.style.removeProperty("padding");
    img.style.removeProperty("border-radius");
  }
}

// an image in a collapsed or hidden section has no size yet; it is judged when it first gets one
const sized = typeof ResizeObserver !== "undefined" ? new ResizeObserver((es) => es.forEach((e) => apply(e.target as HTMLImageElement))) : null;

function consider(img: HTMLImageElement) {
  const src = img.currentSrc || img.src;
  if (!src || !/\/logos\/|\/game-logos\//.test(src)) return;
  if (pixels.has(src)) {
    apply(img);
    sized?.observe(img);
    return;
  }
  if (!img.complete || !img.naturalWidth) {
    img.addEventListener("load", () => consider(img), { once: true });
    return;
  }
  pixels.set(src, sample(img));
  apply(img);
  sized?.observe(img);
}

const idle = (f: () => void) => (window.requestIdleCallback ?? ((g: () => void) => setTimeout(g, 200)))(f);

export function guardLogos(root: Document | ShadowRoot = document) {
  let queued = false;
  const seen = new WeakSet<HTMLImageElement>();
  const scan = () => {
    queued = false;
    root.querySelectorAll("img").forEach((img) => {
      if (!seen.has(img)) {
        seen.add(img);
        consider(img);
      }
    });
  };
  const queue = () => {
    if (queued) return;
    queued = true;
    idle(scan);
  };
  const target = root instanceof Document ? root.body : root;
  new MutationObserver(queue).observe(target, { childList: true, subtree: true });
  // the system appearance changes the colors behind the logos
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    root.querySelectorAll("img").forEach((i) => apply(i as HTMLImageElement));
  });
  queue();
}
