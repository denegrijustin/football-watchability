import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { LiveScores } from "./live";
import { GameCenterProvider, preloadGameCenter } from "./components/GameCenterContext";
import "./styles.css";
import "./motion.css";
import "./phoneTop.css";
import "./cardSize.css";
import "./nav.css";
import "./dashboard.css";
import { guardLogos } from "./logoGuard";
import { initMotion } from "./motion";
initMotion();
const PregamePreview = new URLSearchParams(location.search).has("pregamePreview") ? React.lazy(() => import("./PregamePreview")) : null;
ReactDOM.createRoot(document.getElementById("root")!).render(
  PregamePreview ? (
    <React.Suspense fallback={null}>
      <PregamePreview />
    </React.Suspense>
  ) : (
  <React.StrictMode>
    <LiveScores>
      <GameCenterProvider>
        <App />
      </GameCenterProvider>
    </LiveScores>
  </React.StrictMode>
  ),
);

// Fetch the Game Center code once the board is up, so the first tap on a game doesn't wait for it.
(window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 2000)))(() => preloadGameCenter());

guardLogos();
