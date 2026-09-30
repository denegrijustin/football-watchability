// One-off: learn the formats of the conference availability reports.
import { writeFileSync, mkdirSync } from "node:fs";
const dir = new URL("../data-raw/avail-probe/", import.meta.url);
mkdirSync(dir, { recursive: true });
const UA = { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36" };
const log = [];
async function get(name, url, opts = {}) {
  try {
    const r = await fetch(url, { headers: { ...UA, ...(opts.headers ?? {}) }, redirect: "follow" });
    const body = await r.text();
    writeFileSync(new URL(name, dir), body);
    log.push({ name, url, status: r.status, type: r.headers.get("content-type"), bytes: body.length, final: r.url });
    return body;
  } catch (e) {
    log.push({ name, url, error: String(e) });
    return "";
  }
}
const pages = {
  "sec-fbreports.html": "https://www.secsports.com/fbreports",
  "sec-reports.html": "https://www.secsports.com/reports",
  "b10-fb.html": "https://bigten.org/fb/",
  "b12-fb.html": "https://big12sports.com/sports/2025/8/14/FBreporting.aspx",
  "acc-fb.html": "https://theacc.com/sports/2025/8/28/availability-reporting-football.aspx",
};
for (const [n, u] of Object.entries(pages)) await get(n, u);

// HD Intelligence app (Big 12 + ACC; maybe others)
for (const src of ["B12", "ACC", "SEC", "B1G", "BIG10"]) {
  const html = await get(`hdi-${src}.html`, `https://app.hdintelligence.com/?source=${src}&sport=Football&conf=${src}&type=report`);
  if (src !== "B12") continue;
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => new URL(m[1], "https://app.hdintelligence.com/").href);
  const hits = new Set();
  let i = 0;
  for (const s of scripts) {
    const js = await get(`hdi-js-${i++}.js`, s);
    for (const m of js.matchAll(/["'`](https?:\/\/[^"'`\s]{6,200})["'`]/g)) hits.add(m[1]);
    for (const m of js.matchAll(/["'`](\/?api\/[^"'`\s]{2,200})["'`]/g)) hits.add(m[1]);
  }
  writeFileSync(new URL("hdi-urls.json", dir), JSON.stringify([...hits], null, 1));
}
// Big Ten news listing for the availability report posts
await get("b10-search.html", "https://bigten.org/news/?q=availability");
writeFileSync(new URL("log.json", dir), JSON.stringify(log, null, 1));
