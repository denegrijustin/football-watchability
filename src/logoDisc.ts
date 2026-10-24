// Which disc a team logo reads best on: white logos (and light-gold ones) vanish on white, dark ones on dark. The logo's own pixels are
// sampled once and the disc is dark when most of the logo is light, white otherwise.
import { useEffect, useState } from "react";

export const DISC_LIGHT = "#f4f6f8";
export const DISC_DARK = "#1d232a";
const cache = new Map<string, string>();

const lum = (r: number, g: number, b: number) => {
  const f = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

function pick(img: HTMLImageElement): string {
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 24;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, 24, 24);
    const d = ctx.getImageData(0, 0, 24, 24).data;
    let n = 0, light = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { n++; if (lum(d[i], d[i + 1], d[i + 2]) > 0.55) light++; }
    return n > 20 && light / n > 0.4 ? DISC_DARK : DISC_LIGHT;
  } catch {
    return DISC_LIGHT;
  }
}

/** The fill for the disc behind `url`'s logo (white until the logo has been read). */
export function useDiscFill(url: string | undefined): string {
  const [fill, setFill] = useState(() => (url && cache.get(url)) || DISC_LIGHT);
  useEffect(() => {
    if (!url) return;
    const hit = cache.get(url);
    if (hit) { setFill(hit); return; }
    let live = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { const f = pick(img); cache.set(url, f); if (live) setFill(f); };
    img.src = url;
    return () => { live = false; };
  }, [url]);
  return fill;
}
