import { test, expect } from "@playwright/test";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

test("saved announcer photos survive old lookup versions without network requests", () => {
  const dir = mkdtempSync(join(tmpdir(), "announcer-cache-"));
  try {
    for (const path of ["scripts", "data-raw", "public/announcers"]) mkdirSync(join(dir, path), { recursive: true });
    copyFileSync("scripts/fetch-announcer-photos.mjs", join(dir, "scripts/fetch-announcer-photos.mjs"));
    writeFileSync(join(dir, "data-raw/announcers.json"), JSON.stringify({ games: { one: { network: "CBS", crew: [{ name: "Saved Announcer" }] } } }));
    const cache = { "Saved Announcer": { file: "/announcers/saved-announcer.jpg", source: "commons", v: 2, credit: "Original credit" } };
    writeFileSync(join(dir, "data-raw/announcer-photos.json"), JSON.stringify(cache));
    writeFileSync(join(dir, "public/announcers/saved-announcer.jpg"), "saved image bytes");
    writeFileSync(join(dir, "no-network.mjs"), "globalThis.fetch = () => { console.error('UNEXPECTED_NETWORK_REQUEST'); throw new Error('offline'); };\n");
    const output = execFileSync(process.execPath, ["--import", join(dir, "no-network.mjs"), join(dir, "scripts/fetch-announcer-photos.mjs")], { encoding: "utf8" });
    expect(output).toContain("looked up 0");
    expect(JSON.parse(readFileSync(join(dir, "data-raw/announcer-photos.json"), "utf8"))).toEqual(cache);
    expect(readFileSync(join(dir, "public/announcers/saved-announcer.jpg"), "utf8")).toBe("saved image bytes");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
