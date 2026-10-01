// One-off: learn where and how the weekly announcer schedules are published.
import { writeFileSync, mkdirSync } from "node:fs";
const dir = new URL("../data-raw/ann-probe/", import.meta.url);
mkdirSync(dir, { recursive: true });
const UA = { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36" };
const log = [];
async function get(name, url, save = true) {
  try {
    const r = await fetch(url, { headers: UA, redirect: "follow" });
    const body = await r.text();
    if (save && r.ok) writeFileSync(new URL(name, dir), body);
    log.push({ name, url, status: r.status, bytes: body.length, final: r.url });
  } catch (e) {
    log.push({ name, url, error: String(e) });
  }
}
await get("cat.html", "https://awfulannouncing.com/category/schedules");
await get("cat-cfb.html", "https://awfulannouncing.com/category/college-football");
await get("cat-nfl.html", "https://awfulannouncing.com/category/nfl");
await get("feed.xml", "https://awfulannouncing.com/category/schedules/feed");
await get("nfl-w4.html", "https://awfulannouncing.com/nfl/week-4-announcing-schedule-2026.html");
await get("cfb-w4.html", "https://awfulannouncing.com/college-football/2026-week-4-announcing-schedule.html");
for (const w of [5, 6]) {
  await get(`nfl-w${w}.html`, `https://awfulannouncing.com/nfl/week-${w}-announcing-schedule-2026.html`);
  await get(`cfb-w${w}a.html`, `https://awfulannouncing.com/college-football/2026-week-${w}-announcing-schedule.html`);
  await get(`cfb-w${w}b.html`, `https://awfulannouncing.com/college-football/2026-week-${w}-announcing-schedule-html.html`);
}
await get("sitemap.xml", "https://awfulannouncing.com/sitemap.xml");
await get("csa.html", "https://collegesportsannouncers.com/category/football/");
writeFileSync(new URL("log.json", dir), JSON.stringify(log, null, 1));
