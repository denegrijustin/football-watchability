import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { LiveScores } from "./live";
import { GameCenterProvider, preloadGameCenter } from "./components/GameCenterContext";
import "./styles.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LiveScores>
      <GameCenterProvider>
        <App />
      </GameCenterProvider>
    </LiveScores>
  </React.StrictMode>,
);

// Fetch the Game Center code once the board is up, so the first tap on a game doesn't wait for it.
(window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 2000)))(() => preloadGameCenter());
