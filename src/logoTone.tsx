import { useSyncExternalStore } from "react";

/**
 * A logo painted on a field needs something behind it that is not its own color: a white logo on a white chip vanishes. The
 * logo's own pixels decide it (read once from the image itself, so replaced logos are always judged as they are): a mostly
 * light logo gets a dark chip, a mostly dark or mid-tone one a white chip.
 */
export const CHIP_LIGHT = "#ffffff";
export const CHIP_DARK = "#1d232a";

const tones = new Map<string, string>();
const pending = new Set<string>();
const listeners = new Set<() => void>();

/** Pure: which chip suits these pixels (RGBA bytes). Exported for tests. */
export function chipFor(rgba: ArrayLike<number>): string {
  let n = 0;
  let sum = 0;
  let light = 0;
  let dark = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    const lum = (0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]) / 255;
    n++;
    sum += lum;
    if (lum > 0.78) light++;
    else if (lum < 0.28) dark++;
  }
  if (!n) return CHIP_LIGHT;
  if (light / n > 0.4) return CHIP_DARK; // white or near-white logo
  if (dark / n > 0.5) return CHIP_LIGHT; // black or near-black logo
  return sum / n > 0.62 ? CHIP_DARK : CHIP_LIGHT;
}

function measure(src: string) {
  if (tones.has(src) || pending.has(src) || typeof Image === "undefined") return;
  pending.add(src);
  const img = new Image();
  img.onload = () => {
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 24;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx!.drawImage(img, 0, 0, 24, 24);
      tones.set(src, chipFor(ctx!.getImageData(0, 0, 24, 24).data));
      listeners.forEach((f) => f());
    } catch {
      /* unreadable image: it keeps the default chip */
    }
    pending.delete(src);
  };
  img.onerror = () => pending.delete(src);
  img.src = src;
}

const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};

/** The chip color for this logo: white until the logo has been read, then whichever contrasts with it. */
export function useChip(src: string | undefined) {
  return useSyncExternalStore(subscribe, () => (src ? tones.get(src) : undefined) ?? CHIP_LIGHT, () => CHIP_LIGHT);
}
export function useMeasured(src: string | undefined) {
  if (src) measure(src);
}

/** A logo for an SVG field, on a round chip that contrasts with it. */
export function LogoMark({ src, cx, cy, size, chipOpacity = 0.92, imageClass, chipClass, gameLogo }: { gameLogo?: boolean; src?: string; cx: number; cy: number; size: number; chipOpacity?: number; imageClass?: string; chipClass?: string }) {
  useMeasured(src);
  const chip = useChip(src);
  if (!src) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={size * 0.68} fill={chip} opacity={chipOpacity} className={chipClass} data-chip={chip === CHIP_DARK ? "dark" : "light"} />
      <image href={src} x={cx - size / 2} y={cy - size / 2} width={size} height={size} preserveAspectRatio="xMidYMid meet" className={imageClass} {...(gameLogo ? { "data-game-logo": true } : {})} />
    </g>
  );
}
