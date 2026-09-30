import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { LiveScores } from "./live";
import "./styles.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LiveScores>
      <App />
    </LiveScores>
  </React.StrictMode>,
);
