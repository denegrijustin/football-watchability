import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import sharp from "sharp";

test("Oklahoma uses the supplied logo, and the logo upgrader will not replace it", async () => {
  const sources = JSON.parse(readFileSync("src/data/logo-sources.json", "utf8")).logos as { logoId: string; source: string }[];
  expect(sources.find((l) => l.logoId === "oklahoma")!.source).toBe("custom");
  expect(JSON.parse(readFileSync("src/data/logos.json", "utf8")).oklahoma).toBe("/logos/oklahoma.webp");
  const meta = await sharp("public/logos/oklahoma.webp").metadata();
  expect([meta.width, meta.height]).toEqual([128, 128]);
  // The supplied mark is a red "OU" on a transparent background: mostly crimson where it is opaque.
  const { data } = await sharp("public/logos/oklahoma.webp").raw().toBuffer({ resolveWithObject: true });
  let red = 0;
  let opaque = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 200) {
      opaque++;
      if (data[i] > 150 && data[i + 1] < 90 && data[i + 2] < 90) red++;
    }
  }
  expect(opaque).toBeGreaterThan(2000);
  expect(red / opaque).toBeGreaterThan(0.5);
  // Both the refresh and the manual workflow skip custom logos.
  expect(readFileSync("scripts/upgrade-logos.mjs", "utf8")).toContain('l.source === "custom"');
});
