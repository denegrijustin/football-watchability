import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { LiveScores } from "./live";
import { GameCenterProvider } from "./components/GameCenter";
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
