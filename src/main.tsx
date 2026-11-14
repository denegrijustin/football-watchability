import React from "react";
import ReactDOM from "react-dom/client";
import { Bootstrap, RootBoundary } from "./Bootstrap";
import "./styles.css";
import "./motion.css";
import "./phoneTop.css";
import "./cardSize.css";
import "./nav.css";
import "./dashboard.css";
import "./reliability.css";
import { guardLogos } from "./logoGuard";
import { initMotion } from "./motion";
initMotion();
// The page's code is a small shell first: it draws the site's name and navigation, fetches the week's games, and only then loads the app.
const PregamePreview = new URLSearchParams(location.search).has("pregamePreview") ? React.lazy(() => import("./PregamePreview")) : null;
ReactDOM.createRoot(document.getElementById("root")!).render(
  <RootBoundary>
    {PregamePreview ? (
      <React.Suspense fallback={null}>
        <PregamePreview />
      </React.Suspense>
    ) : (
      <Bootstrap />
    )}
  </RootBoundary>,
);

guardLogos();
