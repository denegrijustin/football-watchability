import { test, expect } from "./fixtures";
import { bundle, src } from "./ssr";

async function markup(): Promise<string> {
  const render = await bundle("wx", `import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WeatherFx } from "${src("WeatherEffects")}";
export const render = (fx: never) => renderToStaticMarkup(createElement("svg", null, createElement(WeatherFx, { fx, seed: 42 }), createElement(WeatherFx, { fx, seed: 42 })));
`);
  return render(storm as never);
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
