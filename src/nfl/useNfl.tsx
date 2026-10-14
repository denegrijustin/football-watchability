import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchData } from "../data/load";
import { useFinals } from "../finals";
import { withNflFinals } from "./finals";
import type { NflData } from "./types";

interface Ctx { data: NflData | null; error: string | null; retry: () => void }
const C = createContext<Ctx | null>(null);
export const useNfl = (): Ctx => {
  const c = useContext(C);
  if (!c) throw new Error("NflProvider missing");
  return c;
};

export function NflProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<NflData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    setError(null);
    fetchData<NflData>("nfl").then((d) => live && setData(d), (e: Error) => live && setError(e.message));
    return () => { live = false; };
  }, [n]);
  // Games that have ended since nflverse last published: ESPN's finals fill in the score, so the ATS tracker grades them at once.
  const { finals } = useFinals();
  const withFinals = useMemo(() => (data ? withNflFinals(data, finals) : null), [data, finals]);
  const value = useMemo(() => ({ data: withFinals, error, retry: () => setN((x) => x + 1) }), [withFinals, error]);
  return <C.Provider value={value}>{children}</C.Provider>;
}
