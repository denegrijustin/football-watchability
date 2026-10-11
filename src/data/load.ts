/** Board data lives in /data/<name>.json (built from src/data by vite.config.ts), fetched rather than bundled. */
const cache = new Map<string, Promise<unknown>>();

/**
 * The Denver Broncos are called the Denver Donkeys on this site. Only the words people read change: ids, logo ids, abbreviations
 * and every feed key stay as they are, so the team is still matched, logoed and scored as the Broncos underneath.
 */
const DONKEYS: [RegExp, string][] = [
  [/Denver Broncos/g, "Denver Donkeys"],
  [/\bBroncos\b/g, "Donkeys"],
];
export const donkeys = (s: string) => (s.includes("Broncos") ? DONKEYS.reduce((t, [re, to]) => t.replace(re, to), s) : s);
/** CBS and NBC games are listed as the network alone; the Paramount+ and Peacock listings are not shown. */
const noParamount = (s: string) => (s.includes("Paramount+") || s.includes("Peacock") ? s.replace(/(CBS|NBC)\s*\/\s*(Paramount\+|Peacock)/g, "$1") : s);
export function rename<T>(v: T): T {
  if (typeof v === "string") return noParamount(donkeys(v)) as T;
  if (Array.isArray(v)) return v.map(rename) as T;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = rename(x);
    return out as T;
  }
  return v;
}

export function fetchData<T>(name: string): Promise<T> {
  let hit = cache.get(name) as Promise<T> | undefined;
  if (!hit) {
    hit = fetch(`/data/${name}.json`).then(async (res) => {
      if (!res.ok) throw new Error(`Could not load ${name} (${res.status})`);
      return rename((await res.json()) as T);
    });
    hit.catch(() => cache.delete(name));
    cache.set(name, hit);
  }
  return hit;
}

/** The same file again, ignoring what was fetched earlier (for views that keep up with the hourly rebuild while games are on). */
export function refetchData<T>(name: string): Promise<T> {
  cache.delete(name);
  return fetchData<T>(name);
}
