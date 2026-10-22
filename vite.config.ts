import { defineConfig, type Plugin } from "vite";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { buildLite } from "./src/spplus/liteBuild";
import { buildPlusRanks, buildWeeklyRanks } from "./src/plusRanksBuild";

// The board's data files are fetched at run time (/data/<name>.json) instead of being compiled into the
// JavaScript, so a refresh changes only these small, revalidated files and the scripts stay cached.
const DATA = ["slate", "results", "matchup-stats", "broadcast-checks", "season", "imperialism", "outlook", "spplus", "nfl", "finals", "team-players", "perf-nfl", "perf-cfb", "perf-nfl-prev", "perf-cfb-prev", "perf-status"];
const dataFile = (name: string) => new URL(`./src/data/${name}.json`, import.meta.url);
const minified = (name: string) => JSON.stringify(JSON.parse(readFileSync(dataFile(name), "utf8")));

// The CFB SP+ tab reads the whole sheet snapshot (spplus.json); the Game Center reads only this small file derived from it.
const spLite = () =>
  existsSync(dataFile("spplus"))
    ? JSON.stringify(buildLite(JSON.parse(readFileSync(dataFile("spplus"), "utf8")), JSON.parse(readFileSync(dataFile("team-ids"), "utf8"))))
    : null;

// The national SP+ and NFL+ ranks shown on every game card and in the ticker: one small file built from the SP+ sheet and the NFL ratings.
const plusRanks = () =>
  existsSync(dataFile("spplus")) && existsSync(dataFile("nfl"))
    ? JSON.stringify(buildPlusRanks(JSON.parse(readFileSync(dataFile("spplus"), "utf8")), JSON.parse(readFileSync(dataFile("nfl"), "utf8")), JSON.parse(readFileSync(dataFile("team-ids"), "utf8"))))
    : null;

// Each week's pre-game ranks, for the Upset Alert Meter's look back at earlier weeks.
const weeklyRanks = () =>
  existsSync(dataFile("spplus")) && existsSync(dataFile("nfl"))
    ? JSON.stringify(buildWeeklyRanks(JSON.parse(readFileSync(dataFile("spplus"), "utf8")), JSON.parse(readFileSync(dataFile("nfl"), "utf8")), JSON.parse(readFileSync(dataFile("team-ids"), "utf8"))))
    : null;

const dataFiles = (): Plugin => ({
  name: "board-data-files",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (/^\/data\/spplus-lite\.json(\?.*)?$/.test(req.url ?? "")) {
        const lite = spLite();
        if (!lite) return next();
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-cache");
        return res.end(lite);
      }
      if (/^\/data\/plus-ranks\.json(\?.*)?$/.test(req.url ?? "")) {
        const ranks = plusRanks();
        if (!ranks) return next();
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-cache");
        return res.end(ranks);
      }
      if (/^\/data\/plus-ranks-weekly\.json(\?.*)?$/.test(req.url ?? "")) {
        const weekly = weeklyRanks();
        if (!weekly) return next();
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-cache");
        return res.end(weekly);
      }
      const m = /^\/data\/([\w-]+)\.json(\?.*)?$/.exec(req.url ?? "");
      if (!m || !DATA.includes(m[1]) || !existsSync(dataFile(m[1]))) return next();
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-cache");
      res.end(minified(m[1]));
    });
  },
  generateBundle() {
    for (const name of DATA) if (existsSync(dataFile(name))) this.emitFile({ type: "asset", fileName: `data/${name}.json`, source: minified(name) });
    const lite = spLite();
    if (lite) this.emitFile({ type: "asset", fileName: "data/spplus-lite.json", source: lite });
    const ranks = plusRanks();
    if (ranks) this.emitFile({ type: "asset", fileName: "data/plus-ranks.json", source: ranks });
    const weekly = weeklyRanks();
    if (weekly) this.emitFile({ type: "asset", fileName: "data/plus-ranks-weekly.json", source: weekly });
  },
});

// Cache and security headers live in config/_headers, not public/, because the refresh publishes the whole
// public folder from the data branch and would overwrite them with an old copy.
const siteHeaders = (): Plugin => ({
  name: "site-headers",
  apply: "build",
  closeBundle() {
    copyFileSync(new URL("./config/_headers", import.meta.url), new URL("./dist/_headers", import.meta.url));
  },
});

// Every build has an id (the commit on Cloudflare Pages, a timestamp elsewhere). The page carries its own and checks /version.json against it,
// so a page left open across a deploy can tell it is out of date and offer to reload.
const BUILD_ID = process.env.CF_PAGES_COMMIT_SHA ?? process.env.GITHUB_SHA ?? Date.now().toString(36);
const versionFile = (): Plugin => ({
  name: "version-file",
  generateBundle() {
    this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ id: BUILD_ID }) });
  },
});

// Logos are cached for a year; a changed logo set changes this stamp, which is appended to every logo URL.
const logoVersion = createHash("sha1")
  .update((readdirSync(new URL("./public/logos", import.meta.url), { recursive: true }) as string[]).filter((f) => /\.\w+$/.test(f)).sort().map((f) => {
    const b = readFileSync(new URL(`./public/logos/${f}`, import.meta.url));
    return `${f}:${b.length}:${createHash("sha1").update(b).digest("hex").slice(0, 8)}`;
  }).join("|"))
  .digest("hex")
  .slice(0, 8);

export default defineConfig({
  plugins: [react(), tailwindcss(), dataFiles(), versionFile(), siteHeaders()],
  define: { __LOGO_V__: JSON.stringify(logoVersion), __BUILD_ID__: JSON.stringify(BUILD_ID) },
  build: {
    rollupOptions: {
      input: { main: "index.html", matchup: "matchup-demo.html" },
      // Plain hashed file names: nothing in a URL (like "Logo" or "Game") for a content blocker to match, which would break the
      // Game Center's lazy load with "Failed to fetch dynamically imported module".
      output: { chunkFileNames: "assets/c-[hash].js", entryFileNames: "assets/e-[hash].js", assetFileNames: "assets/a-[hash][extname]" },
    },
  },
});
