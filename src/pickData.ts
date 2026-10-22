import { useEffect, useState } from "react";
import { fetchData } from "./data/load";
import { buildModel } from "./spplus/data/model";
import type { Snapshot } from "./spplus/data/snapshotTypes";
import type { Model } from "./spplus/data/types";
import type { SpLite } from "./spplus/lite";
import type { NflData } from "./nfl/types";

export interface PickData { model: Model; espn: Record<string, string>; nfl: NflData }
let cached: Promise<PickData> | null = null;

/** Both leagues' data for the picks and parlays, loaded once and shared (the same files the SP+ and NFL+ tabs read). */
export function loadPickData(): Promise<PickData> {
  cached ??= Promise.all([fetchData<Snapshot>("spplus"), fetchData<SpLite>("spplus-lite").catch(() => ({ espn: {} }) as SpLite), fetchData<NflData>("nfl")])
    .then(([snap, lite, nfl]) => ({ model: buildModel(snap), espn: lite.espn ?? {}, nfl }))
    .catch((e) => { cached = null; throw e; });
  return cached;
}

export function usePickData(): { data: PickData | null; error: boolean } {
  const [state, set] = useState<{ data: PickData | null; error: boolean }>({ data: null, error: false });
  useEffect(() => {
    let live = true;
    loadPickData().then((data) => live && set({ data, error: false }), () => live && set({ data: null, error: true }));
    return () => { live = false; };
  }, []);
  return state;
}
