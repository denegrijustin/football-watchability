import { defineConfig, type Plugin } from "vite";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The board's data files are fetched at run time (/data/<name>.json) instead of being compiled into the
// JavaScript, so a refresh changes only these small, revalidated files and the scripts stay cached.
const DATA = ["slate", "results", "matchup-stats", "broadcast-checks", "season", "imperialism", "outlook"];
const dataFile = (name: string) => new URL(`./src/data/${name}.json`, import.meta.url);
const minified = (name: string) => JSON.stringify(JSON.parse(readFileSync(dataFile(name), "utf8")));

const dataFiles = (): Plugin => ({
  name: "board-data-files",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const m = /^\/data\/([\w-]+)\.json(\?.*)?$/.exec(req.url ?? "");
      if (!m || !DATA.includes(m[1]) || !existsSync(dataFile(m[1]))) return next();
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-cache");
      res.end(minified(m[1]));
    });
  },
  generateBundle() {
    for (const name of DATA) if (existsSync(dataFile(name))) this.emitFile({ type: "asset", fileName: `data/${name}.json`, source: minified(name) });
  },
});

// Logos are cached for a year; a changed logo set changes this stamp, which is appended to every logo URL.
const logoVersion = createHash("sha1")
  .update(readdirSync(new URL("./public/logos", import.meta.url)).sort().map((f) => {
    const b = readFileSync(new URL(`./public/logos/${f}`, import.meta.url));
    return `${f}:${b.length}:${createHash("sha1").update(b).digest("hex").slice(0, 8)}`;
  }).join("|"))
  .digest("hex")
  .slice(0, 8);

export default defineConfig({
  plugins: [react(), tailwindcss(), dataFiles()],
  define: { __LOGO_V__: JSON.stringify(logoVersion) },
  build: { rollupOptions: { input: { main: "index.html", matchup: "matchup-demo.html" } } },
});
