// One-off: raw pages for the ESPN / On3 crew schedules, and Wikipedia API answers for announcers we found no photo for.
import { writeFileSync, mkdirSync } from "node:fs";
const dir = new URL("../data-raw/crew-probe/", import.meta.url);
mkdirSync(dir, { recursive: true });
const UA = { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36" };
const WUA = { "user-agent": "fbwatch/1.0 (https://fbwatch.elskatemm.com; github.com/denegrijustin/football-watchability)" };
const log = [];
async function get(name, url, headers = UA) {
  try {
    const r = await fetch(url, { headers, redirect: "follow" });
    const body = await r.text();
    writeFileSync(new URL(name, dir), body);
    log.push({ name, url, status: r.status, bytes: body.length });
  } catch (e) { log.push({ name, url, error: String(e) }); }
}
await get("espn.html", "https://espnpressroom.com/2026-27-espn-college-football-commentators-schedule/");
await get("on3.html", "https://www.on3.com/news/college-football-announcer-schedule-broadcasters-top-week-5-games-2026/");
await get("on3-tag.html", "https://www.on3.com/news/tag/college-football-announcers/");
const names = ["Kaylee Hartung", "Dave Pasch", "Spero Dedes", "Tiffany Blackmon", "Tom Rinaldi", "Kristina Pink", "Chris Lewis", "Kevin Kugler", "Kevin Harlan", "Trent Green", "Melanie Collins", "Andrew Catalon", "AJ Ross", "Melissa Stark"];
const q = (p) => "https://en.wikipedia.org/w/api.php?" + new URLSearchParams({ format: "json", formatversion: "2", ...p });
const out = {};
for (const n of names) {
  const props = { prop: "pageimages|description|pageprops", piprop: "thumbnail|name|original", pithumbsize: "120", redirects: "1" };
  const a = await (await fetch(q({ action: "query", titles: n, ...props }), { headers: WUA })).json();
  const b = await (await fetch(q({ action: "query", generator: "search", gsrsearch: `${n} sportscaster`, gsrlimit: "6", ...props }), { headers: WUA })).json();
  const c = await (await fetch("https://commons.wikimedia.org/w/api.php?" + new URLSearchParams({ format: "json", formatversion: "2", action: "query", list: "search", srnamespace: "6", srsearch: n, srlimit: "8" }), { headers: WUA })).json();
  out[n] = { exact: a.query, search: b.query, commons: c.query?.search?.map((x) => x.title) };
  await new Promise((r) => setTimeout(r, 300));
}
writeFileSync(new URL("wiki.json", dir), JSON.stringify(out, null, 1));
writeFileSync(new URL("log.json", dir), JSON.stringify(log, null, 1));
