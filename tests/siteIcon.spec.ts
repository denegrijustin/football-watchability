import { expect, test } from "./fixtures";

test("the site has its icon for the address bar, bookmarks and the home screen", async ({ page, request }) => {
  await page.goto("/");
  const links = await page.locator("head link[rel~='icon'], head link[rel='apple-touch-icon'], head link[rel='manifest']").evaluateAll((els) => els.map((e) => ({ rel: e.getAttribute("rel"), href: e.getAttribute("href"), sizes: e.getAttribute("sizes") })));
  expect(links.map((l) => l.href)).toEqual(expect.arrayContaining(["/favicon.ico", "/favicon-32.png", "/favicon-16.png", "/apple-touch-icon.png", "/site.webmanifest"]));
  // Every icon the page and the manifest name is really served, as an image.
  for (const l of links.filter((x) => x.rel !== "manifest")) {
    const r = await request.get(l.href!);
    expect(r.ok(), l.href!).toBe(true);
    expect(r.headers()["content-type"], l.href!).toMatch(/image\//);
  }
  const manifest = await (await request.get("/site.webmanifest")).json();
  expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
  for (const i of manifest.icons) {
    const r = await request.get(i.src);
    expect(r.ok(), i.src).toBe(true);
    expect(r.headers()["content-type"]).toMatch(/image\/png/);
  }
});
