import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Snapshot } from "./snapshotTypes";
import { buildModel } from "./model";
import type { Model } from "./types";
import { fetchData } from "../../data/load";
import { useFinals } from "../../finals";
import { liveResults } from "./finals";
import type { SpLite } from "../lite";

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
  const sheetModel = useMemo(() => (snapshot ? buildModel(snapshot) : null), [snapshot]);
  // Games that have ended since the sheet was last updated: ESPN's finals, graded in the ATS tracker as soon as they land.
  const { finals } = useFinals();
  const [espn, setEspn] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    fetchData<SpLite>("spplus-lite").then((l) => live && setEspn(l.espn ?? {}), () => {});
    return () => { live = false; };
  }, []);
  const model = useMemo(() => {
    if (!sheetModel) return null;
    const extra = liveResults(sheetModel, finals, espn);
    return extra.length ? { ...sheetModel, liveResults: extra } : sheetModel;
  }, [sheetModel, finals, espn]);
  const value = useMemo(() => ({ snapshot, model, loadError, retry }), [snapshot, model, loadError, retry]);
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}
