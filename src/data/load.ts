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

/** One data file, tried up to three times: each try gives up after 15 seconds, and a retry skips the browser's cache in case a bad copy is stuck in it. */
async function getJson(name: string): Promise<unknown> {
  let last: unknown;
  for (let i = 0; i < 3; i++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15_000);
    try {
      const res = await fetch(`/data/${name}.json`, { signal: ctl.signal, ...(i ? { cache: "no-store" as const } : {}) });
      if (!res.ok) throw new Error(`Could not load ${name} (${res.status})`);
      return await res.json();
    } catch (e) {
      last = e instanceof DOMException && e.name === "AbortError" ? new Error(`Loading ${name} timed out`) : e;
      if (i < 2) await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw last;
}

export function fetchData<T>(name: string): Promise<T> {
  let hit = cache.get(name) as Promise<T> | undefined;
  if (!hit) {
    hit = getJson(name).then((j) => rename(j as T));
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
