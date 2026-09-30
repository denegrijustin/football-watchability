// One-off: learn the formats of the conference availability reports (round 3).
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
const post = (name, path, body) =>
  get(name, "https://app.hdintelligence.com" + path, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://app.hdintelligence.com", referer: "https://www.secsports.com/" },
    body: JSON.stringify(body),
  });
for (const c of ["SEC", "ACC", "B12", "B10", "B1G"]) {
  await post(`pub-${c}.json`, "/api/get-publish-public", { sport: "Football", organization: c, conference: c });
  await post(`arch-${c}.json`, "/api/get-archive-public", { sport: "Football", organization: c, conference: c });
}
await get("b10-2026.html", "https://bigten.org/fb/article/blt376070b4270ab9d7/");
writeFileSync(new URL("log3.json", dir), JSON.stringify(log, null, 1));
