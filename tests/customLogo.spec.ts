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

test("Denver uses the supplied D logo with the donkey and the taped unicorn horn, and the logo upgrader will not replace it", async () => {
  const sources = JSON.parse(readFileSync("src/data/logo-sources.json", "utf8")).logos as { logoId: string; source: string }[];
  expect(sources.find((l) => l.logoId === "denver-broncos")!.source).toBe("custom");
  const meta = await sharp("public/logos/denver-broncos.webp").metadata();
  expect([meta.width, meta.height]).toEqual([128, 128]);
  expect(meta.hasAlpha).toBe(true);
  // The art is the orange "D": mostly orange where it is opaque, with a grey coat and a gold horn in it.
  const { data } = await sharp("public/logos/denver-broncos.webp").raw().toBuffer({ resolveWithObject: true });
  let orange = 0, grey = 0, gold = 0, opaque = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    opaque++;
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    if (r > 200 && g > 50 && g < 120 && b < 80) orange++;
    else if (Math.abs(r - g) < 14 && Math.abs(g - b) < 18 && r > 150 && r < 225) grey++;
    else if (r > 220 && g > 170 && b < 90) gold++;
  }
  expect(opaque).toBeGreaterThan(8000);
  expect(orange / opaque).toBeGreaterThan(0.25);
  expect(grey / opaque).toBeGreaterThan(0.05);
  expect(gold).toBeGreaterThan(15);
  expect(readFileSync("scripts/upgrade-logos.mjs", "utf8")).toContain('l.source === "custom"');
});

test("the Chargers use the supplied emblem (the winged donkey-unicorn on the blue field), and a banner for midfield", async () => {
  const sources = JSON.parse(readFileSync("src/data/logo-sources.json", "utf8")).logos as { logoId: string; source: string }[];
  expect(sources.find((l) => l.logoId === "los-angeles-chargers")!.source).toBe("custom");
  const meta = await sharp("public/logos/los-angeles-chargers.webp").metadata();
  expect([meta.width, meta.height]).toEqual([128, 128]);
  const { data } = await sharp("public/logos/los-angeles-chargers.webp").raw().toBuffer({ resolveWithObject: true });
  let blue = 0, gold = 0, opaque = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    opaque++;
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    if (b > 150 && r < 60) blue++;
    else if (r > 220 && g > 150 && b < 80) gold++;
  }
  expect(blue / opaque).toBeGreaterThan(0.4); // the Chargers' blue field
  expect(gold / opaque).toBeGreaterThan(0.05); // the gold lettering
  const art = await sharp("public/field-art/chargers.webp").metadata();
  expect(art.width! / art.height!).toBeCloseTo(720 / 493, 1);
});
