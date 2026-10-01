// One-off (round 3): network press-room bio pages for announcer headshots.
import { writeFileSync, mkdirSync } from "node:fs";
const dir = new URL("../data-raw/crew-probe/", import.meta.url);
mkdirSync(dir, { recursive: true });
const UA = { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36" };
const out = [];
const people = ["Dave Pasch", "Kevin Harlan", "Spero Dedes", "Andrew Catalon", "AJ Ross", "Melanie Collins", "Tiffany Blackmon", "Chris Lewis", "Kristina Pink", "Kevin Kugler", "Melissa Stark", "Kaylee Hartung", "Sean McDonough", "Mike Monaco", "Brad Nessler", "Al Michaels"];
const s = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
for (const n of people) {
  const [first, ...rest] = n.split(" ");
  const last = rest.join(" ");
  const urls = {
    espn: `https://espnpressroom.com/bio/${s(last).replace(/-/g, "")}_${s(first).replace(/-/g, "")}/`,
    cbs: `https://www.paramountpressexpress.com/cbs-sports/talent/?view=${s(n)}`,
    fox: `https://www.foxsports.com/presspass/bios/on-air/${s(n)}`,
    nbc: `https://www.nbcsports.com/pressbox/bios/${s(n)}`,
  };
  for (const [k, u] of Object.entries(urls)) {
    try {
      const r = await fetch(u, { headers: UA, redirect: "follow" });
      const h = await r.text();
      const og = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i.exec(h)?.[1] ?? /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image/i.exec(h)?.[1] ?? null;
      const title = /<title>([^<]*)/i.exec(h)?.[1]?.trim();
      const imgs = [...h.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]).filter((x) => new RegExp(first, "i").test(x) || new RegExp(last.split(" ").pop(), "i").test(x)).slice(0, 4);
      out.push({ n, k, status: r.status, final: r.url, title, og, imgs });
      if (k === "cbs" && n === "Kevin Harlan") writeFileSync(new URL("cbs-harlan.html", dir), h);
      if (k === "espn" && n === "Dave Pasch") writeFileSync(new URL("espn-pasch.html", dir), h);
    } catch (e) { out.push({ n, k, error: String(e) }); }
    await new Promise((r) => setTimeout(r, 300));
  }
}
writeFileSync(new URL("press.json", dir), JSON.stringify(out, null, 1));
