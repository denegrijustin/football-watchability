import { guardLogos } from "../logoGuard";
import { useEffect, useRef } from "react";
import { LiveMirror, useLiveMap, type LiveMap } from "../live";
import { createRoot } from "react-dom/client";
import { NflProvider } from "./useNfl";
import { NflApp } from "./NflApp";
import perfCss from "../perf/perf.css?inline";
import css from "../spplus/spplus.css?inline";

/** The NFL+ tab. Like the CFB SP+ tab it renders in a shadow root, and it shares that tab's stylesheet and chart components. */
export default function NflTab() {
  const host = useRef<HTMLDivElement>(null);
  // The tab is its own React root, so it is handed the live scores and redrawn when they change.
  const map = useLiveMap();
  const draw = useRef<(m: LiveMap) => void>(() => {});
  const latest = useRef(map);
  latest.current = map;
  useEffect(() => draw.current(map), [map]);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const shadow = el.shadowRoot ?? el.attachShadow({ mode: "open" });
    shadow.replaceChildren();
    const style = document.createElement("style");
    style.textContent = css + perfCss;
    const mount = document.createElement("div");
    shadow.append(style, mount);
    guardLogos(shadow);
    const root = createRoot(mount);
    draw.current = (m) => root.render(<LiveMirror map={m}><NflProvider><NflApp /></NflProvider></LiveMirror>);
    draw.current(latest.current);
    return () => root.unmount();
  }, []);
  return <div ref={host} className="nfl-host" data-testid="nfl-host" />;
}
