import { test, expect } from "./fixtures";
import { bundle, src } from "./ssr";
import { readFileSync } from "node:fs";
import { actFor, NFL_ACTS } from "../src/halftimeLogic";

const css = readFileSync("src/styles.css", "utf8");
const idFor = (act: string) => {
  for (let i = 1; i < 500; i++) if (actFor(String(i)).id === act) return String(i);
  throw new Error(`No sample id for ${act}`);
};
let scene: (id: string) => string;
test.beforeAll(async () => {
  const render = await bundle("nfl-halftime", `import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HalftimeAct } from "${src("nflHalftime")}";
export const render = (id: string) => renderToStaticMarkup(createElement(HalftimeAct, { espnId: id, home: { name: "Home", color: "#134e6f" }, away: { name: "Away", color: "#8b2930" } }));
`);
  scene = render as never;
});

test("all seven NFL acts retain their identity and have equipment or movement detail", async ({ page }) => {
  for (const act of NFL_ACTS) {
    await page.setContent(`<style>${css}</style>${scene(idFor(act.id))}`);
    await expect(page.locator(".halftime-act")).toHaveAttribute("data-act", act.id);
    if (["shoe", "inflatable", "dizzy", "cash", "slingshot"].includes(act.id)) expect(await page.locator(".ha-person-foot").count()).toBeGreaterThan(0);
    if (["cash", "slingshot"].includes(act.id)) expect(await page.locator(".ha-flight-shadow").count()).toBeGreaterThan(0);
    if (act.id === "slingshot") await expect(page.locator(".ha-cannon-wheel")).toHaveCount(2);
    if (act.id === "wiener") await expect(page.locator(".ha-dog-leg")).toHaveCount(32);
    if (act.id === "tron") await expect(page.locator(".ha-light-pool")).toHaveCount(3);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const active = await page.locator(".ha-scene *").evaluateAll((els) => els.filter((el) => getComputedStyle(el).animationName !== "none").length);
    expect(active).toBe(0);
    await page.emulateMedia({ reducedMotion: "no-preference" });
  }
});
