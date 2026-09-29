// Game-window weather for every venue on the slate, from Open-Meteo (free,
// no key). Reads data-raw/*-scoreboard.json, writes data-raw/weather.json.
// Run in GitHub Actions; also callable on its own near game day for a
// fresher look-ahead (Actions → Fetch weather).
//
//   node scripts/fetch-weather.mjs
import { readFileSync, writeFileSync } from "node:fs";

const raw = new URL(`../${process.env.RAW_DIR ?? "data-raw"}/`, import.meta.url);
const read = (n) => JSON.parse(readFileSync(new URL(n, raw), "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
async function get(url) {
  for (let a = 0; a < 3; a++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {}
    await sleep(700 * (a + 1));
  }
  errors.push(url);
  return null;
}

const HOURLY = [
  "temperature_2m",
  "apparent_temperature",
  "precipitation_probability",
  "precipitation",
  "weather_code",
  "cloud_cover",
  "wind_speed_10m",
  "wind_gusts_10m",
  "wind_direction_10m",
  "relative_humidity_2m",
].join(",");

const ymd = (d) => d.toISOString().slice(0, 10);
const places = {};
let first = null,
  last = null;
const venues = new Map();
for (const key of ["nfl", "cfb"]) {
  for (const ev of read(`${key}-scoreboard.json`).events ?? []) {
    const comp = ev.competitions?.[0];
    const a = comp?.venue?.address ?? {};
    const place = [a.city, a.state ?? a.country].filter(Boolean).join(", ");
    if (!a.city) continue;
    const t = new Date(ev.date);
    first = !first || t < first ? t : first;
    last = !last || t > last ? t : last;
    venues.set(place, { city: a.city, state: a.state, country: a.country ?? "USA" });
  }
}
// Cover late kickoffs that finish after midnight ET.
const end = new Date(last.getTime() + 36 * 3600e3);

for (const [place, v] of venues) {
  const us = !v.country || /USA|United States/i.test(v.country);
  const geo = await get(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(v.city)}&count=10&language=en&format=json${us ? "&countryCode=US" : ""}`,
  );
  await sleep(80);
  const hit =
    geo?.results?.find((r) => (v.state ? r.admin1_code === v.state || r.admin1 === v.state : !us)) ??
    geo?.results?.[0];
  if (!hit) {
    errors.push(`geocode ${place}`);
    continue;
  }
  const forecast = await get(
    `https://api.open-meteo.com/v1/forecast?latitude=${hit.latitude}&longitude=${hit.longitude}&hourly=${HOURLY}&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FNew_York&start_date=${ymd(first)}&end_date=${ymd(end)}`,
  );
  places[place] = { lat: hit.latitude, lon: hit.longitude, name: hit.name, admin1: hit.admin1, forecast };
  await sleep(80);
}
writeFileSync(
  new URL("weather.json", raw),
  JSON.stringify({ fetchedAt: new Date().toISOString(), places }, null, 1),
);
writeFileSync(new URL("weather-errors.json", raw), JSON.stringify(errors, null, 1));
console.log(`Weather for ${Object.keys(places).length} venues; ${errors.length} errors`);
