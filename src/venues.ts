import { useEffect, useState } from "react";

export type Venue = { name?: string; capacity: number | null };
type Venues = Record<string, Venue>;

let loaded: Promise<Venues> | null = null;
/** public/venues.json (scripts/attendance.mjs), fetched once and shared. Empty when it can't be read. */
const load = () =>
  (loaded ??= fetch("/venues.json")
    .then((r) => (r.ok && (r.headers.get("content-type") ?? "").includes("json") ? (r.json() as Promise<Venues>) : {}))
    .catch(() => ({})));

/** Stadium capacities by ESPN venue id; `{}` until loaded or when none are known. */
export function useVenues(): Venues {
  const [venues, setVenues] = useState<Venues>({});
  useEffect(() => {
    let live = true;
    load().then((v) => live && setVenues(v));
    return () => {
      live = false;
    };
  }, []);
  return venues;
}
