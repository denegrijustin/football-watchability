// One-off: find Wikimedia Commons logo files for TV networks ESPN has no logo for.
import { writeFileSync, mkdirSync } from "node:fs";
const Q = {
  cbs: "CBS logo", fox: "Fox Broadcasting Company logo", nbc: "NBC logo", "prime-video": "Prime Video logo",
  cbssn: "CBS Sports Network logo", tnt: "TNT logo", btn: "Big Ten Network logo", fs1: "Fox Sports 1 logo",
  "usa-net": "USA Network logo", "mw-plus": "Mountain West Conference logo",
};
const out = {};
for (const [k, q] of Object.entries(Q)) {
  const u = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=8&gsrsearch=${encodeURIComponent(q + " svg")}&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=320`;
  const r = await fetch(u, { headers: { "user-agent": "fbwatch/1.0 (github.com/denegrijustin/football-watchability)" } });
  const j = r.ok ? await r.json() : { error: r.status };
  out[k] = Object.values(j.query?.pages ?? {}).map((p) => ({
    title: p.title, url: p.imageinfo?.[0]?.url, thumb: p.imageinfo?.[0]?.thumburl,
    license: p.imageinfo?.[0]?.extmetadata?.LicenseShortName?.value,
  }));
  await new Promise((r) => setTimeout(r, 400));
}
mkdirSync(new URL("../data-raw/", import.meta.url), { recursive: true });
writeFileSync(new URL("../data-raw/commons-probe.json", import.meta.url), JSON.stringify(out, null, 1));
