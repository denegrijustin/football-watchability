// One-off (round 2): 506 Sports weekly pages, and Wikidata / Commons photo lookups.
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
await get("506-cfb5.html", "https://506sports.com/ncaaf.php?yr=2026&wk=5");
await get("506-nfl.html", "https://506sports.com/nfl.php?yr=2026&wk=4");
const names = ["Kaylee Hartung", "Dave Pasch", "Spero Dedes", "Tiffany Blackmon", "Kristina Pink", "Chris Lewis (sportscaster)", "Kevin Kugler", "Kevin Harlan", "Trent Green", "Melanie Collins", "Andrew Catalon", "AJ Ross", "Melissa Stark"];
const api = async (host, p) => (await fetch(`https://${host}/w/api.php?` + new URLSearchParams({ format: "json", formatversion: "2", ...p }), { headers: WUA })).json();
const out = {};
for (const n of names) {
  const page = await api("en.wikipedia.org", { action: "query", titles: n, prop: "pageprops", redirects: "1" });
  const qid = page.query?.pages?.[0]?.pageprops?.wikibase_item;
  let p18 = null;
  if (qid) {
    const wd = await (await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`, { headers: WUA })).json();
    p18 = wd.entities?.[qid]?.claims?.P18?.map((c) => c.mainsnak?.datavalue?.value) ?? null;
  }
  const base = n.replace(/\s*\(.*\)$/, "");
  const intitle = await api("commons.wikimedia.org", { action: "query", list: "search", srnamespace: "6", srsearch: `intitle:"${base}"`, srlimit: "10" });
  const cat = await api("commons.wikimedia.org", { action: "query", list: "categorymembers", cmtitle: `Category:${base}`, cmtype: "file", cmlimit: "10" });
  out[n] = { qid, p18, intitle: intitle.query?.search?.map((x) => x.title), category: cat.query?.categorymembers?.map((x) => x.title) };
  await new Promise((r) => setTimeout(r, 300));
}
writeFileSync(new URL("wiki2.json", dir), JSON.stringify(out, null, 1));
writeFileSync(new URL("log2.json", dir), JSON.stringify(log, null, 1));
