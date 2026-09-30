// One-off: learn the formats of the conference availability reports (round 2).
import { writeFileSync, mkdirSync } from "node:fs";
const dir = new URL("../data-raw/avail-probe/", import.meta.url);
mkdirSync(dir, { recursive: true });
const UA = { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36" };
const log = [];
async function get(name, url, opts = {}) {
  try {
    const r = await fetch(url, { ...opts, headers: { ...UA, ...(opts.headers ?? {}) }, redirect: "follow" });
    const body = await r.text();
    writeFileSync(new URL(name, dir), body);
    log.push({ name, url, status: r.status, type: r.headers.get("content-type"), bytes: body.length });
    return body;
  } catch (e) {
    log.push({ name, url, error: String(e) });
    return "";
  }
}
const base = "https://app.hdintelligence.com/assets/";
const chunks = ["PublishScreen-BYgWGkq4.js", "SummaryScreen-Db6czLWK.js", "ArchiveScreen-8d4x-yvg.js", "index-CD_u9Jsu.js", "WindowScreen-BpxqUnD4.js"];
const eps = {};
for (const c of chunks) {
  const js = await get(`chunk-${c}`, base + c);
  eps[c] = [...new Set([...js.matchAll(/["'`](\/api\/[^"'`\s]{2,120})["'`]/g)].map((m) => m[1]))];
}
writeFileSync(new URL("chunk-endpoints.json", dir), JSON.stringify(eps, null, 1));
const post = (name, path, body) =>
  get(name, "https://app.hdintelligence.com" + path, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://app.hdintelligence.com", referer: "https://www.secsports.com/" },
    body: JSON.stringify(body),
  });
for (const c of ["SEC", "ACC", "B12", "B10"]) {
  await post(`pl-${c}.json`, "/api/public-load", { conference_param: c, sport_param: "Football", type_param: "report", referrer: "", source: c });
  await post(`teams-${c}.json`, "/api/get-conference-teams", { conference: c, sport: "Football" });
}
// Big Ten: current news listing
await get("b10-home.html", "https://bigten.org/");
await get("b10-news.html", "https://bigten.org/news/");
writeFileSync(new URL("log2.json", dir), JSON.stringify(log, null, 1));
