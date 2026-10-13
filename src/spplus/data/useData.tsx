import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Snapshot } from "./snapshotTypes";
import { buildModel } from "./model";
import type { Model } from "./types";
import { fetchData } from "../../data/load";

interface Ctx {
  snapshot: Snapshot | null;
  model: Model | null;
  loadError: string | null;
  retry: () => void;
}

const DataCtx = createContext<Ctx | null>(null);
export const useData = (): Ctx => {
  const c = useContext(DataCtx);
  if (!c) throw new Error("DataProvider missing");
  return c;
};

/** The sheet's snapshot is a data file like the rest of the board (/data/spplus.json), refreshed by the scheduled rebuild. */
export function DataProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setLoadError(null);
    fetchData<Snapshot>("spplus").then((s) => live && setSnapshot(s), (e: Error) => live && setLoadError(e.message));
    return () => { live = false; };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const model = useMemo(() => (snapshot ? buildModel(snapshot) : null), [snapshot]);
  const value = useMemo(() => ({ snapshot, model, loadError, retry }), [snapshot, model, loadError, retry]);
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}
