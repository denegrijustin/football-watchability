// Small headshots of this week's announcers.
//
// For each name in data-raw/announcers.json, in order:
//  1. Wikipedia: the person's article (exact title, else a "<name>
//     sportscaster" search), checked against its short description so a
//     namesake isn't picked, and its lead image only if freely licensed.
//  2. The network's press-room headshot (ESPN Press Room, Paramount Press
//     Express for CBS, Fox Sports Press Pass, NBC Sports Pressbox), trying
//     the network the person is working for this week first. These are the
//     official talent photos the networks publish for media use; each is
//     credited to the network.
//  3. Wikimedia Commons: the Wikidata image (P18) for that article, else a
//     Commons file titled with the person's name that sits in a broadcasting
//     or football category (or the person's own, when an article confirmed
//     who they are).
// Each photo is resized to a 120px square-ish thumbnail in public/announcers/.
// Results (with credit) are cached in data-raw/announcer-photos.json; misses
// are retried after two weeks, or when the lookup logic version changes.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const RAW = new URL(`../${process.env.RAW_DIR ?? "data-raw"}/`, import.meta.url);
const PUB = new URL("../public/announcers/", import.meta.url);
const VERSION = 8;
const diag = {};
const note = (name, msg) => (diag[name] ??= []).push(msg);
const UA = "fbwatch/1.0 (https://fbwatch.elskatemm.com; github.com/denegrijustin/football-watchability)";
const BROWSER = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const SPORTS =
  /broadcast|sports?caster|sportcaster|sports|commentator|announcer|analyst|reporter|journalist|television|radio|football|quarterback|coach|basketball|baseball|sideline/i;
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
    .replace(/&#0?39;|&rsquo;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const httpLog = [];
// Press rooms rate-limit (ESPN answers 429): one request per host every 1.5s,
// backing off and retrying on 429.
const lastHit = new Map();
async function getText(url, ua = BROWSER) {
  const host = new URL(url).host;
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = (lastHit.get(host) ?? 0) + 1500 - Date.now();
    if (wait > 0) await sleep(wait);
    lastHit.set(host, Date.now());
    try {
      const res = await fetch(url, { headers: { "user-agent": ua, accept: "text/html,application/xhtml+xml", "accept-language": "en-US,en;q=0.9" }, redirect: "follow" });
      if (res.status === 429) {
        httpLog.push(`429 ${url} (retrying)`);
        await sleep(10000 * (attempt + 1));
        continue;
      }
      if (!res.ok) httpLog.push(`${res.status} ${url}`);
      return res.ok ? await res.text() : null;
    } catch (e) {
      httpLog.push(`${e} ${url}`);
      return null;
    }
  }
  return null;
}
async function api(host, params) {
  const url = `https://${host}/w/api.php?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;
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

// ---------- 1. Wikipedia ----------
const PROPS = { prop: "pageimages|description|pageprops", piprop: "thumbnail|name", pithumbsize: "160", pilicense: "free", redirects: "1" };
const isPerson = (p, name) =>
  p &&
  !p.missing &&
  p.pageprops?.disambiguation === undefined &&
  norm(p.title.replace(/\s*\(.*\)$/, "")) === norm(name) &&
  SPORTS.test(p.description ?? "");
async function wikiPage(name) {
  const exact = await api("en.wikipedia.org", { action: "query", titles: name, ...PROPS });
  const p = exact?.query?.pages?.[0];
  if (isPerson(p, name)) return p;
  const search = await api("en.wikipedia.org", { action: "query", generator: "search", gsrsearch: `${name} sportscaster`, gsrlimit: "6", ...PROPS });
  const hits = (search?.query?.pages ?? []).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return hits.find((h) => isPerson(h, name)) ?? null;
}
async function commonsFile(file) {
  const j = await api("commons.wikimedia.org", { action: "query", titles: `File:${file}`, prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "160" });
  const info = j?.query?.pages?.[0]?.imageinfo?.[0];
  if (!info?.thumburl) return null;
  const m = info.extmetadata ?? {};
  const credit = [strip(m.Artist?.value), strip(m.LicenseShortName?.value)].filter(Boolean).join(", ");
  return { url: info.thumburl, credit: `Photo: ${credit ? `${credit}, ` : ""}via Wikimedia Commons` };
}

// ---------- 2. Commons ----------
const COMMONS_OK = /broadcast|sportscaster|sports commentator|announcer|American football|NFL|college football|ESPN|CBS Sports|Fox Sports|NBC Sports|sideline reporter/i;
async function commonsPhoto(name, page) {
  const qid = page?.pageprops?.wikibase_item;
  if (qid) {
    try {
      const res = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`, { headers: { "user-agent": UA } });
      const wd = res.ok ? await res.json() : null;
      const file = wd?.entities?.[qid]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
      if (file) return await commonsFile(file);
    } catch {
      /* fall through */
    }
  }
  const s = await api("commons.wikimedia.org", { action: "query", list: "search", srnamespace: "6", srsearch: `intitle:"${name}"`, srlimit: "10" });
  // Only files named for the person alone: "Kristina Pink (36317080144).jpg", "Name 2019.jpg", "Name (cropped).jpg".
  const re = new RegExp(`^File:${esc(name)}(\\s*\\((\\d+|cropped)\\))?(\\s*(19|20)\\d\\d)?(\\s*\\(cropped\\))?\\.(jpe?g|png)$`, "i");
  // A bare filename match isn't enough for common names ("Taylor Davis" the
  // baseball player): the file must sit in the person's own category or a
  // broadcasting / football category.
  for (const t of (s?.query?.search ?? []).map((x) => x.title).filter((t) => re.test(t))) {
    const c = await api("commons.wikimedia.org", { action: "query", titles: t, prop: "categories", cllimit: "50", clshow: "!hidden" });
    const cats = (c?.query?.pages?.[0]?.categories ?? []).map((x) => x.title.replace(/^Category:/, ""));
    // The person's own category counts only when a Wikipedia article confirmed who they are.
    if (cats.some((k) => COMMONS_OK.test(k) || (page && norm(k) === norm(name)))) return commonsFile(t.replace(/^File:/, ""));
    note(name, `commons: skipped ${t} (categories: ${cats.slice(0, 5).join("; ")})`);
  }
  return null;
}

// ---------- 3. Network press rooms ----------
const og = (h) =>
  /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i.exec(h)?.[1] ??
  /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image/i.exec(h)?.[1] ??
  null;
const titleOf = (h) => strip(/<title>([^<]*)/i.exec(h)?.[1]);
const startsWithName = (t, name) => norm(t).startsWith(norm(name));
const PRESS = {
  espn: async (name) => {
    const [first, ...rest] = name.split(" ");
    // Bio URLs come in two shapes: /bio/pasch_dave/ and /bio/mike-monaco/.
    for (const path of [`${norm(rest.join(""))}_${norm(first)}`, slug(name), `${slug(rest.join(" "))}_${slug(first)}`]) {
      const h = await getText(`https://espnpressroom.com/bio/${path}/`);
      if (!h || !startsWithName(titleOf(h), name)) continue;
      const img = og(h);
      if (img && !/ESPN-CFB-cam|default|logo/i.test(img)) return { url: img, credit: "Photo: ESPN Press Room" };
      note(name, `espn: page ${path} has no headshot (${img})`);
    }
    return null;
  },
  cbs: async (name) => {
    const h = await getText(`https://www.paramountpressexpress.com/cbs-sports/talent/?view=${slug(name)}`);
    // The page has more than one photo-name field (one commented out, holding a
    // filename link); the talent's name is in the one with plain text.
    const shown = [...(h ?? "").matchAll(/class="photo-name">([^<]+)</g)].map((m) => strip(m[1])).find((t) => norm(t) === norm(name)) ?? "";
    note(name, `cbs: page ${h ? h.length : "failed"}, photo-name "${shown}"`);

    if (!h || norm(shown) !== norm(name)) return null;
    const img = /<img[^>]+src="(https:\/\/private-assets-pressexpress\.s3\.amazonaws\.com\/assets\/photos\/[^"]+)"/.exec(h)?.[1];
    note(name, `cbs: img ${img ? img.slice(0, 120) : "none"}`);
    return img ? { url: img.replace(/&amp;/g, "&"), credit: "Photo: CBS Sports (Paramount Press Express)" } : null;
  },
  fox: async (name) => {
    const h = await getText(`https://www.foxsports.com/presspass/bios/on-air/${slug(name)}`);
    if (!h || !startsWithName(titleOf(h), name)) return null;
    const img = og(h);
    return img ? { url: img, credit: "Photo: FOX Sports Press Pass" } : null;
  },
  nbc: async (name) => {
    const h = await getText(`https://www.nbcsports.com/pressbox/bios/${slug(name)}`);
    if (!h || !startsWithName(titleOf(h), name)) return null;
    const imgs = [...h.matchAll(/<img[^>]+src="(https:\/\/nbcsports\.brightspotcdn\.com\/[^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
    const img = imgs.find((u) => /resize\/1\d\dx1\d\d!/.test(u) && !/logo|property-1/i.test(u)) ?? (og(h) && !/logo/i.test(og(h)) ? og(h) : null);
    return img ? { url: img, credit: "Photo: NBC Sports Pressbox" } : null;
  },
};
const pressFor = (network = "") =>
  /ABC|ESPN|SEC Network|ACC Network|Disney|LHN/i.test(network)
    ? "espn"
    : /CBS|Paramount/i.test(network)
      ? "cbs"
      : /NBC|Peacock|USA/i.test(network)
        ? "nbc"
        : /Fox|FS1|Big Ten Network|BTN/i.test(network)
          ? "fox"
          : null;
async function pressPhoto(name, networks) {
  const order = [...new Set([...networks.map(pressFor).filter(Boolean), "espn", "cbs", "fox", "nbc"])];
  for (const k of order) {
    const hit = await PRESS[k](name);
    await sleep(250);
    if (hit) return hit;
  }
  return null;
}

// ---------- save ----------
let sharp = null;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.log("sharp not installed: saving photos without resizing");
}
async function save(name, url) {
  const res = await fetch(url, { headers: { "user-agent": /wikimedia|wikipedia/.test(url) ? UA : BROWSER } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const file = `${slug(name)}.jpg`;
  const out = sharp
    ? await sharp(buf).resize(120, 150, { fit: "cover", position: "top" }).flatten({ background: "#1d2a35" }).jpeg({ quality: 82 }).toBuffer()
    : buf;
  writeFileSync(new URL(file, PUB), out);
  return `/announcers/${file}`;
}

async function main() {
  const games = Object.values(read("announcers.json")?.games ?? {});
  const networks = new Map();
  for (const g of games) for (const c of g.crew ?? []) networks.set(c.name, [...(networks.get(c.name) ?? []), g.network]);
  const cache = read("announcer-photos.json") ?? {};
  const checkpoint = () => writeFileSync(new URL("announcer-photos.json", RAW), JSON.stringify(cache, null, 1));
  mkdirSync(PUB, { recursive: true });
  const tally = { wikipedia: 0, commons: 0, press: 0 };
  let looked = 0;
  for (const name of networks.keys()) {
    const hit = cache[name];
    // A saved image is permanent: changes to lookup logic must not repeatedly
    // download or discard photos already shipped with the app.
    if (hit?.file && existsSync(new URL(hit.file.replace(/^\/announcers\//, ""), PUB))) continue;
    if (hit && !hit.file && hit.v === VERSION && Date.now() - Date.parse(hit.checkedAt) < RETRY_MS) continue;
    looked++;
    let found = null,
      via = null;
    const page = await wikiPage(name);
    await sleep(200);
    if (page?.pageimage && page.thumbnail) {
      found = await commonsFile(page.pageimage);
      via = "wikipedia";
    }
    // Official network headshots before Commons: Commons photos are often
    // candid crowd shots, and a bare name match there can be a namesake.
    if (!found) {
      found = await pressPhoto(name, networks.get(name));
      via = "press";
    }
    if (!found) {
      found = await commonsPhoto(name, page);
      via = "commons";
    }
    if (!found) {
      cache[name] = { file: null, v: VERSION, checkedAt: new Date().toISOString() };
      checkpoint();
      continue;
    }
    try {
      cache[name] = {
        file: await save(name, found.url),
        credit: found.credit,
        source: via,
        page: page ? `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}` : null,
        v: VERSION,
        checkedAt: new Date().toISOString(),
      };
      tally[via]++;
    } catch (e) {
      console.error(`${name}: ${e}`);
      note(name, `save failed (${via}): ${e} ${String(found.url).slice(0, 120)}`);
      cache[name] = { file: null, v: VERSION, checkedAt: new Date().toISOString() };
    }
    checkpoint();
    await sleep(200);
  }
  writeFileSync(new URL("announcer-photos.json", RAW), JSON.stringify(cache, null, 1));
  writeFileSync(new URL("announcer-photos-log.json", RAW), JSON.stringify({ diag, http: httpLog.filter((l) => !/^404 /.test(l)).slice(0, 80) }, null, 1));
  const names = [...networks.keys()];
  const have = names.filter((n) => cache[n]?.file).length;
  console.log(
    `announcer photos: looked up ${looked} (new: ${tally.wikipedia} Wikipedia, ${tally.commons} Commons, ${tally.press} press room); ${have} of ${names.length} have a photo`,
  );
  const missing = names.filter((n) => !cache[n]?.file);
  if (missing.length) console.log(`no photo found: ${missing.join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
