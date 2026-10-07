// One-off generator (not part of the refresh): the land the Imperialism Map divides up. Reads the us-atlas county
// shapes and writes counties.json: every county's FIPS code, name and centroid (lat/lon), in FIPS order. The list
// order is the index every other file uses. The pre-projected shapes the browser draws are copied to
// public/geo/counties-albers-10m.json from the same package, so the ids line up.
//   node scripts/imperialism/build-counties.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { geoCentroid } from "d3-geo";
import { feature } from "topojson-client";

const topo = JSON.parse(readFileSync(new URL("../../node_modules/us-atlas/counties-10m.json", import.meta.url), "utf8"));
const albers = JSON.parse(readFileSync(new URL("../../public/geo/counties-albers-10m.json", import.meta.url), "utf8"));
const albersIds = new Set(albers.objects.counties.geometries.map((g) => String(g.id)));
const r3 = (x) => Math.round(x * 1000) / 1000;
const rows = feature(topo, topo.objects.counties)
  .features.filter((f) => albersIds.has(String(f.id)))
  .map((f) => {
    const [lon, lat] = geoCentroid(f);
    return { id: String(f.id), name: f.properties?.name ?? "", lat: r3(lat), lon: r3(lon) };
  })
  .sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(new URL("./counties.json", import.meta.url), JSON.stringify(rows) + "\n");
console.log(`${rows.length} counties`);
