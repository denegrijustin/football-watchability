import { guardLogos } from "../logoGuard";
import { useEffect, useRef } from "react";
import { LiveMirror, useLiveMap, type LiveMap } from "../live";
import { createRoot } from "react-dom/client";
import { DataProvider } from "./data/useData";
import { SpPlusApp } from "./SpPlusApp";
import css from "./spplus.css?inline";
import perfCss from "../perf/perf.css?inline";

/**
 * The CFB SP+ tab. It renders inside a shadow root, so its styles cannot leak into the board and the board's styles cannot reach it.
 * Everything in it (ratings, simulator, ATS tracker, ...) lives under src/spplus.
 */
export default function SpPlusTab() {
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
    draw.current = (m) =>
      root.render(
        <LiveMirror map={m}>
          <DataProvider>
            <SpPlusApp />
          </DataProvider>
        </LiveMirror>,
      );
    draw.current(latest.current);
    return () => root.unmount();
  }, []);
  return <div ref={host} className="spp-host" data-testid="spplus-host" />;
}
