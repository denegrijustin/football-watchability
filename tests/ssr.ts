// Renders a React component to markup for a test. Playwright rewrites React components imported into test files, so the component is bundled by
// Vite for the server (as the site's own build would) and called from the bundle.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { build } from "vite";

/** `entry` is the source of a module that exports `render(arg) => string`; it may import from the repo by absolute path. */
export async function bundle(name: string, entry: string): Promise<(arg?: unknown) => string> {
  const dir = new URL(`../node_modules/.cache/ssr-${name}/`, import.meta.url).pathname;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}entry.tsx`, entry);
  await build({ configFile: false, logLevel: "silent", root: dir, define: { __LOGO_V__: JSON.stringify("test"), __BUILD_ID__: JSON.stringify("test") }, build: { ssr: `${dir}entry.tsx`, outDir: `${dir}out`, emptyOutDir: true, rollupOptions: { output: { format: "es", entryFileNames: "entry.mjs" } } }, ssr: { noExternal: [/src\//] } });
  // The site's data modules fetch /data/*.json when they load; serve those from the repo's own files.
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const m = /^\/data\/([\w-]+)\.json/.exec(url);
    if (!m) return realFetch(input, init);
    return new Response(readFileSync(new URL(`../src/data/${m[1]}.json`, import.meta.url)), { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return (await import(pathToFileURL(`${dir}out/entry.mjs`).href)).render;
}
export const src = (path: string) => new URL(`../src/${path}`, import.meta.url).pathname;
