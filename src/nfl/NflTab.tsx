import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { NflProvider } from "./useNfl";
import { NflApp } from "./NflApp";
import css from "../spplus/spplus.css?inline";

/** The NFL Ratings tab. Like the CFB SP+ tab it renders in a shadow root, and it shares that tab's stylesheet and chart components. */
export default function NflTab() {
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
    root.render(<NflProvider><NflApp /></NflProvider>);
    return () => root.unmount();
  }, []);
  return <div ref={host} className="nfl-host" data-testid="nfl-host" />;
}
