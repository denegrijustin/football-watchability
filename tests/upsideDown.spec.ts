import { test, expect } from "./fixtures";

test("Texas, Kansas, Broncos, Chargers and Raiders logos are upside down wherever they appear, and no other logo is", async ({ page }) => {
  await page.goto("/?league=CFB");
  const rot = await page.evaluate(() => {
    const out: Record<string, string> = {};
    for (const name of ["texas", "kansas", "denver-broncos", "los-angeles-chargers", "las-vegas-raiders", "texas-tech", "texas-a-m", "kansas-state", "kansas-city-chiefs", "alabama"]) {
      const img = document.createElement("img");
      img.src = `/logos/${name}.webp`;
      document.body.append(img);
      out[`img:${name}`] = getComputedStyle(img).rotate;
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      const im = document.createElementNS("http://www.w3.org/2000/svg", "image");
      im.setAttribute("href", `/logos/${name}.webp`);
      svg.append(im);
      document.body.append(svg);
      out[`svg:${name}`] = getComputedStyle(im).rotate;
    }
    return out;
  });
  for (const kind of ["img", "svg"]) {
    expect(rot[`${kind}:texas`]).toBe("180deg");
    expect(rot[`${kind}:kansas`]).toBe("180deg");
    for (const flipped of ["denver-broncos", "los-angeles-chargers", "las-vegas-raiders"]) expect(rot[`${kind}:${flipped}`]).toBe("180deg");
    for (const other of ["texas-tech", "texas-a-m", "kansas-state", "kansas-city-chiefs", "alabama"]) expect(rot[`${kind}:${other}`]).toBe("none");
  }
  // Real logos on the page: any Texas or Kansas logo currently rendered carries the flip.
  const real = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLImageElement>('img[src*="/logos/texas.webp"], img[src*="/logos/kansas.webp"], img[src*="/logos/denver-broncos.webp"], img[src*="/logos/los-angeles-chargers.webp"], img[src*="/logos/las-vegas-raiders.webp"]')].filter((i) => i.isConnected && !i.dataset.test).map((i) => getComputedStyle(i).rotate),
  );
  for (const r of real) expect(r).toBe("180deg");
});
