import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { build } from "vite";

// Playwright rewrites React components imported into test files, so the layer is rendered the way the site's own build would: bundled by Vite for
// the server, then called for its markup.
async function markup(): Promise<string> {
  const dir = new URL("../node_modules/.cache/wx-render/", import.meta.url).pathname;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}entry.tsx`, `import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WeatherFx } from "${new URL("../src/WeatherFx", import.meta.url).pathname}";
export const html = (fx: never) => renderToStaticMarkup(createElement("svg", null, createElement(WeatherFx, { fx, seed: 42 }), createElement(WeatherFx, { fx, seed: 42 })));
`);
  await build({ configFile: false, logLevel: "silent", root: dir, build: { ssr: `${dir}entry.tsx`, outDir: `${dir}out`, emptyOutDir: true, rollupOptions: { output: { format: "cjs", entryFileNames: "entry.cjs" } } }, ssr: { noExternal: [/WeatherFx/] } });
  const mod = createRequire(import.meta.url)(`${dir}out/entry.cjs`);
  return mod.html(storm as never);
}

const storm = { rain: 3, snow: 0, wind: 3, storm: true, fog: false, drizzle: false, drift: 1, rate: 1, windMph: 38, windText: "", rainText: "" };

test("rain follows its drawn angle and repeated weather layers have unique clips", async ({ page }) => {
  await page.setContent(await markup());
  const ids = await page.locator("clipPath").evaluateAll((els) => els.map((el) => el.id));
  expect(new Set(ids).size).toBe(2);
  expect(await page.locator(".wx-bolt").count()).toBe(0);
  const slopes = await page.locator(".wx-drop").evaluateAll((els) => els.map((el) => {
    const line = el as SVGLineElement;
    const dx = parseFloat(line.style.getPropertyValue("--wx-dx"));
    const dy = parseFloat(line.style.getPropertyValue("--wx-dy"));
    return Math.abs((line.x2.baseVal.value - line.x1.baseVal.value) / (line.y2.baseVal.value - line.y1.baseVal.value) - dx / dy);
  }));
  expect(Math.max(...slopes)).toBeLessThan(0.0001);
});
