/** Board data lives in /data/<name>.json (built from src/data by vite.config.ts), fetched rather than bundled. */
const cache = new Map<string, Promise<unknown>>();
export function fetchData<T>(name: string): Promise<T> {
  let hit = cache.get(name) as Promise<T> | undefined;
  if (!hit) {
    hit = fetch(`/data/${name}.json`).then((res) => {
      if (!res.ok) throw new Error(`Could not load ${name} (${res.status})`);
      return res.json() as Promise<T>;
    });
    hit.catch(() => cache.delete(name));
    cache.set(name, hit);
  }
  return hit;
}
