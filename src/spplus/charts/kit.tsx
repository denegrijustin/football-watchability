import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export const C = {
  s: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#2f9d2f", "#9085e9", "#e66767"],
  other: "#898781", grid: "#2c2c2a", axis: "#383835", surface: "#1a1a19", ink: "#f0efec", ink2: "#c3c2b7", muted: "#898781",
  seq: ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"],
  lo: "#e66767", hi: "#3987e5", mid: "#383835",
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

export interface TipState { x: number; y: number; title: string; rows: [string, string][]; swatch?: string }

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
      <b>{tip.swatch && <i style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: tip.swatch, marginRight: 6 }} />}{tip.title}</b>
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
