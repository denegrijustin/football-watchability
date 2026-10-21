import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export const C = {
  s: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#2f9d2f", "#9085e9", "#e66767"],
  // neutrals follow the tool's light or dark palette (the host's custom properties); the hues stay fixed
  other: "var(--muted)", grid: "var(--grid)", axis: "var(--axis)", surface: "var(--surface)", ink: "var(--ink)", ink2: "var(--ink-2)", muted: "var(--muted)", sText: "var(--s4-text)",
  seq: ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"],
  lo: "#e66767", hi: "#3987e5", mid: "var(--axis)",
};

/** Eight conferences carry a categorical hue (fixed by name); every other conference stays neutral. */
const CONF_HUE: Record<string, number> = { "Big Ten": 0, SEC: 1, ACC: 2, "Big 12": 3, "Pac-12": 4, AAC: 5, MWC: 6, "Sun Belt": 7 };
export const confColor = (conf: string | null | undefined): string => (conf != null && conf in CONF_HUE ? C.s[CONF_HUE[conf]] : C.other);
export const confHasHue = (conf: string | null | undefined) => conf != null && conf in CONF_HUE;

export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(Math.floor(el.getBoundingClientRect().width));
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export interface TipState { x: number; y: number; title: string; rows: [string, string][]; swatch?: string; logo?: import("react").ReactNode }

/** Tooltip state for one chart: show it at a point inside the chart box, hide on leave/blur/escape. */
export function useTip() {
  const [tip, setTip] = useState<TipState | null>(null);
  const hide = useCallback(() => setTip(null), []);
  useEffect(() => {
    if (!tip) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setTip(null);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [tip]);
  return { tip, show: setTip, hide };
}

export function TipView({ tip, width }: { tip: TipState | null; width: number }) {
  if (!tip) return null;
  const left = Math.max(4, Math.min(width - 190, tip.x + 12));
  return (
    <div className="tip" role="status" style={{ left, top: Math.max(0, tip.y - 12), transform: tip.y > 120 ? "translateY(-100%)" : "none" }}>
      <b>{tip.logo && <span className="tip-logo">{tip.logo}</span>}{tip.swatch && !tip.logo && <i style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: tip.swatch, marginRight: 6 }} />}{tip.title}</b>
      {tip.rows.map(([k, v]) => (
        <div className="tr" key={k}><span>{k}</span><span>{v}</span></div>
      ))}
    </div>
  );
}

/** Position of an element's centre relative to a container (for tips opened by focus or tap). */
export function centreIn(container: Element | null, el: Element): { x: number; y: number } {
  if (!container) return { x: 0, y: 0 };
  const a = container.getBoundingClientRect(), b = el.getBoundingClientRect();
  return { x: b.left - a.left + b.width / 2, y: b.top - a.top + b.height / 2 };
}

export function Legend({ items }: { items: { label: string; color: string; dash?: boolean }[] }) {
  return (
    <div className="legend" aria-label="Legend">
      {items.map((i) => (
        <span key={i.label}><i style={{ background: i.dash ? "transparent" : i.color, border: i.dash ? `2px dashed ${i.color}` : undefined }} />{i.label}</span>
      ))}
    </div>
  );
}

export function niceTicks(lo: number, hi: number, count = 5): number[] {
  if (!(hi > lo)) return [lo];
  const step0 = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

export function ChartFrame({ children, title, sub, right }: { children: ReactNode; title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="panel">
      <div className="phead">
        <div><h2>{title}</h2>{sub && <p className="sub" style={{ margin: 0 }}>{sub}</p>}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

/** A logo inside an SVG that falls back to a short text label when the image cannot load. */
export function LogoImg({ href, x, y, size, fallback }: { href: string | undefined; x: number; y: number; size: number; fallback: string }) {
  const [bad, setBad] = useState(false);
  if (!href || bad) return <text x={x + size / 2} y={y + size / 2 + 3} textAnchor="middle" style={{ fontSize: 9 }}>{fallback}</text>;
  return <image href={href} x={x} y={y} width={size} height={size} onError={() => setBad(true)} />;
}

/** Dark or light text, whichever reads better on this color ("#rrggbb" or "rgb(r,g,b)"). */
export function inkOn(color: string): string {
  let r = 0, g = 0, b = 0;
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex) [r, g, b] = [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16));
  else {
    const m = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return "#0d0d0d";
    [r, g, b] = [+m[1], +m[2], +m[3]];
  }
  const f = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const l = 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  // whichever of the two inks has the higher contrast ratio on this color
  return (l + 0.05) / 0.054 >= 1.05 / (l + 0.05) ? "#0d0d0d" : "#f5f5f2";
}
