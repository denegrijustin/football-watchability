import { Component, createContext, lazy, Suspense, useContext, useState, type ReactNode } from "react";

// ---------- open/close from anywhere ----------
/** A game the board doesn't carry any more (earlier weeks), described just enough to open. */
export type GameStub = {
  league: "NFL" | "CFB";
  date: string;
  matchup: string;
  teams: { name: string; abbr: string; logoId: string; color?: string | null; score: number }[];
};
const Ctx = createContext<(espnId: string, stub?: GameStub) => void>(() => {});
export const useOpenGame = () => useContext(Ctx);

// The Game Center is the largest piece of the app; it loads the first time a game is opened (or hovered).
// If the site was updated while this page was open, the old chunk's file is gone: reload once to pick up the new version.
// A first failure is often a dropped connection, so it is tried once more before giving up.
const loadGameCenter = () =>
  import("./GameCenter")
    .catch(() => new Promise((r) => setTimeout(r, 700)).then(() => import("./GameCenter")))
    .catch((err) => {
    try {
      if (!sessionStorage.getItem("fbwatch-gc-reload")) {
        sessionStorage.setItem("fbwatch-gc-reload", "1");
        location.reload();
        return new Promise<never>(() => {});
      }
    } catch {
      /* storage blocked: fall through to the message */
    }
    throw err;
  });
const GameCenter = lazy(loadGameCenter);
export const preloadGameCenter = () => void loadGameCenter();

/** A Game Center that fails must never take the whole page with it (React unmounts everything on an uncaught render error). */
class GcBoundary extends Component<{ children: ReactNode; onClose: () => void }, { failed: boolean; why: string }> {
  state = { failed: false, why: "" };
  static getDerivedStateFromError(err: unknown) {
    return { failed: true, why: String((err as Error)?.message ?? err).slice(0, 160) };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="gc-failed" role="alertdialog" aria-label="Game Center">
        <p>The Game Center could not load.{this.state.why && <small> {this.state.why}</small>}</p>
        <button type="button" onClick={() => location.reload()}>Reload</button>
        <button type="button" onClick={() => { this.setState({ failed: false, why: "" }); this.props.onClose(); }}>Close</button>
      </div>
    );
  }
}

export function GameCenterProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<{ id: string; stub?: GameStub } | null>(null);
  const [used, setUsed] = useState(false);
  return (
    <Ctx.Provider
      value={(id, stub) => {
        setUsed(true);
        setOpen({ id, stub });
      }}
    >
      {children}
      {used && (
        <GcBoundary key={open?.id ?? "closed"} onClose={() => setOpen(null)}>
          <Suspense fallback={null}>
            <GameCenter espnId={open?.id ?? null} stub={open?.stub} onClose={() => setOpen(null)} />
          </Suspense>
        </GcBoundary>
      )}
    </Ctx.Provider>
  );
}
