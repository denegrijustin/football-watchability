import React, { useEffect } from "react";
import App from "./App";
import { LiveScores } from "./live";
import { GameCenterProvider, preloadGameCenter } from "./components/GameCenterContext";
import { fault } from "./fault";

/** The whole app, with its providers. It is imported only once the week's slate is in hand (see Bootstrap), so every module below may read the data synchronously. */
export default function AppRoot() {
  fault("root");
  useEffect(() => {
    // Fetch the Game Center code once the board is up, so the first tap on a game doesn't wait for it. A failure here is recorded and ignored.
    const idle = window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 2000));
    if (!(window as { __fbNoPreload?: boolean }).__fbNoPreload) idle(() => preloadGameCenter());
  }, []);
  return (
    <React.StrictMode>
      <LiveScores>
        <GameCenterProvider>
          <App />
        </GameCenterProvider>
      </LiveScores>
    </React.StrictMode>
  );
}
