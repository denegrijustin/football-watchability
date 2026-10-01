// Small photos of this week's announcers, from Wikipedia / Wikimedia Commons.
//
// For each name in data-raw/announcers.json, finds the person's Wikipedia
// article (exact title, else a "<name> sportscaster" search) whose short
// description says broadcaster, sportscaster, commentator, analyst, reporter,
// journalist or football player/coach, takes its lead image only if it is
// freely licensed (pilicense=free), downloads a 120px thumbnail to
// public/announcers/<slug>.<ext> and records the author and license for the
// photo credit. Results (including "no photo") are cached in
// data-raw/announcer-photos.json; misses are retried after two weeks.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const RAW = new URL(`../${process.env.RAW_DIR ?? "data-raw"}/`, import.meta.url);
const PUB = new URL("../public/announcers/", import.meta.url);
const UA = "fbwatch/1.0 (https://fbwatch.elskatemm.com; github.com/denegrijustin/football-watchability)";
const WP = "https://en.wikipedia.org/w/api.php";
const SPORTS =
  /broadcast|sportscaster|commentator|announcer|analyst|reporter|journalist|television (host|personality)|radio (host|personality)|football|quarterback|coach|basketball|baseball|sideline/i;
const RETRY_MS = 14 * 86400e3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (n) => (existsSync(new URL(n, RAW)) ? JSON.parse(readFileSync(new URL(n, RAW), "utf8")) : null);

export const slug = (name) =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const norm = (s) => slug(s).replace(/-/g, "");
const strip = (h) =>
  String(h ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

async function api(params) {
  const url = `${WP}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA } });
      if (res.ok) return await res.json();
      if (res.status === 429) await sleep(5000);
    } catch {
      /* retry */
    }
    await sleep(1000 * (attempt + 1));
  }
  return null;
}

const PROPS = { prop: "pageimages|description|pageprops", piprop: "thumbnail|name", pithumbsize: "120", pilicense: "free", redirects: "1" };
const fits = (p, name) =>
  p &&
  !p.missing &&
  p.pageprops?.disambiguation === undefined &&
  norm(p.title.replace(/\s*\(.*\)$/, "")) === norm(name) &&
  SPORTS.test(p.description ?? "");

/** The person's Wikipedia page with a free lead image, or null. */
async function findPage(name) {
  const exact = await api({ action: "query", titles: name, ...PROPS });
  const p = exact?.query?.pages?.[0];
  if (fits(p, name)) return p;
  const search = await api({ action: "query", generator: "search", gsrsearch: `${name} sportscaster`, gsrlimit: "6", ...PROPS });
  const hits = (search?.query?.pages ?? []).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return hits.find((h) => fits(h, name)) ?? null;
}

async function credit(file) {
  const j = await api({ action: "query", titles: `File:${file}`, prop: "imageinfo", iiprop: "extmetadata" });
  const m = j?.query?.pages?.[0]?.imageinfo?.[0]?.extmetadata ?? {};
  return {
    author: strip(m.Artist?.value) || null,
    license: strip(m.LicenseShortName?.value) || null,
  };
}

async function main() {
  const names = [
    ...new Set(Object.values(read("announcers.json")?.games ?? {}).flatMap((g) => (g.crew ?? []).map((c) => c.name))),
  ];
  const cache = read("announcer-photos.json") ?? {};
  mkdirSync(PUB, { recursive: true });
  let found = 0,
    looked = 0;
  for (const name of names) {
    const hit = cache[name];
    if (hit?.file && existsSync(new URL(hit.file.replace(/^\/announcers\//, ""), PUB))) continue;
    if (hit && !hit.file && Date.now() - Date.parse(hit.checkedAt) < RETRY_MS) continue;
    looked++;
    const page = await findPage(name);
    await sleep(250);
    const thumb = page?.thumbnail?.source;
    if (!thumb) {
      cache[name] = { file: null, checkedAt: new Date().toISOString() };
      continue;
    }
    try {
      const res = await fetch(thumb, { headers: { "user-agent": UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ext = /\.png($|\?)/i.test(thumb) ? "png" : "jpg";
      const file = `${slug(name)}.${ext}`;
      writeFileSync(new URL(file, PUB), Buffer.from(await res.arrayBuffer()));
      cache[name] = {
        file: `/announcers/${file}`,
        page: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
        ...(await credit(page.pageimage)),
        checkedAt: new Date().toISOString(),
      };
      found++;
    } catch (e) {
      console.error(`${name}: ${e}`);
      cache[name] = { file: null, checkedAt: new Date().toISOString() };
    }
    await sleep(250);
  }
  writeFileSync(new URL("announcer-photos.json", RAW), JSON.stringify(cache, null, 1));
  const have = names.filter((n) => cache[n]?.file).length;
  console.log(`announcer photos: looked up ${looked}, found ${found} new; ${have} of ${names.length} announcers have a photo`);
  const missing = names.filter((n) => !cache[n]?.file);
  if (missing.length) console.log(`no free photo: ${missing.join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
