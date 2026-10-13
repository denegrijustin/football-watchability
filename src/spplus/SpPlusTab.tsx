import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { DataProvider } from "./data/useData";
import { SpPlusApp } from "./SpPlusApp";
import css from "./spplus.css?inline";

/**
 * The CFB SP+ tab. It renders inside a shadow root, so its styles cannot leak into the board and the board's styles cannot reach it.
 * Everything in it (ratings, simulator, ATS tracker, ...) lives under src/spplus.
 */
export default function SpPlusTab() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const shadow = el.shadowRoot ?? el.attachShadow({ mode: "open" });
    shadow.replaceChildren();
    const style = document.createElement("style");
    style.textContent = css;
    const mount = document.createElement("div");
    shadow.append(style, mount);
    const root = createRoot(mount);
    root.render(
      <DataProvider>
        <SpPlusApp />
      </DataProvider>,
    );
    return () => root.unmount();
  }, []);
  return <div ref={host} className="spp-host" data-testid="spplus-host" />;
}
