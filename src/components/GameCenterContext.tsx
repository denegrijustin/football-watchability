import { createContext, lazy, Suspense, useContext, useState, type ReactNode } from "react";

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
const loadGameCenter = () => import("./GameCenter");
const GameCenter = lazy(loadGameCenter);
export const preloadGameCenter = () => void loadGameCenter();

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
        <Suspense fallback={null}>
          <GameCenter espnId={open?.id ?? null} stub={open?.stub} onClose={() => setOpen(null)} />
        </Suspense>
      )}
    </Ctx.Provider>
  );
}
