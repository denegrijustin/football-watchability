// Downloads raw inputs for a weekly slate from public ESPN and Open-Meteo
// endpoints into data-raw/. Run in GitHub Actions (network required):
//
//   START=20261001 END=20261005 SEASON=2026 node scripts/fetch-slate.mjs
//
// The output is raw material for scripts/build-slate.mjs; nothing here is
// shipped to the site.
import { mkdirSync, writeFileSync } from "node:fs";

const START = process.env.START;
const END = process.env.END;
const SEASON = process.env.SEASON ?? START.slice(0, 4);
const out = new URL("../data-raw/", import.meta.url);
mkdirSync(new URL("summaries/", out), { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, { optional = false } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { "user-agent": "fbwatch-slate-builder" } });
    if (res.ok) return res.json();
    if (res.status === 404 && optional) return null;
    await sleep(800 * (attempt + 1));
  }
  if (optional) return null;
  throw new Error(`GET ${url} failed`);
}
const save = (name, data) =>
  writeFileSync(new URL(name, out), JSON.stringify(data, null, 1));

const SITE = "https://site.api.espn.com/apis/site/v2/sports/football";
const WEB = "https://site.web.api.espn.com/apis";
const CORE = "https://sports.core.api.espn.com/v2/sports/football/leagues";

const leagues = {
  nfl: { path: "nfl", extra: "" },
  cfb: { path: "college-football", extra: "&groups=80&limit=500" },
};

const index = { start: START, end: END, season: SEASON, fetchedAt: new Date().toISOString(), events: [] };

for (const [key, { path, extra }] of Object.entries(leagues)) {
  const board = await get(`${SITE}/${path}/scoreboard?dates=${START}-${END}${extra}`);
  save(`${key}-scoreboard.json`, board);
  console.log(`${key}: ${board.events?.length ?? 0} events`);
  for (const ev of board.events ?? []) {
    const sum = await get(`${SITE}/${path}/summary?event=${ev.id}`, { optional: true });
    if (sum) save(`summaries/${ev.id}.json`, sum);
    index.events.push({ league: key, id: ev.id, name: ev.name, hasSummary: !!sum });
    await sleep(120);
  }
  // Power index (FPI) with playoff projections, standings and rankings.
  save(
    `${key}-fpi.json`,
    await get(`${WEB}/fitt/v3/sports/football/${path}/powerindex?region=us&lang=en&limit=300&season=${SEASON}`, { optional: true }),
  );
  save(
    `${key}-standings.json`,
    await get(`${WEB}/v2/sports/football/${path}/standings?season=${SEASON}${key === "cfb" ? "&group=80" : ""}`, { optional: true }),
  );
}
save("cfb-rankings.json", await get(`${SITE}/college-football/rankings`, { optional: true }));
save("nfl-teams.json", await get(`${SITE}/nfl/teams`));
save("cfb-teams.json", await get(`${SITE}/college-football/teams?limit=1000`));

// Weather: Open-Meteo daily forecast for each outdoor venue on game day.
const seen = new Map();
for (const key of Object.keys(leagues)) {
  const board = (await import(new URL(`${key}-scoreboard.json`, out), { with: { type: "json" } })).default;
  for (const ev of board.events ?? []) {
    const comp = ev.competitions?.[0];
    const addr = comp?.venue?.address ?? {};
    const place = [addr.city, addr.state].filter(Boolean).join(", ");
    if (!place || seen.has(place)) continue;
    const geo = await get(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(addr.city)}&count=5&language=en&format=json&countryCode=US`,
      { optional: true },
    );
    seen.set(place, geo);
    await sleep(80);
  }
}
const places = {};
for (const [place, geo] of seen) {
  const state = place.split(", ")[1];
  const hit = geo?.results?.find((r) => !state || r.admin1_code === state || r.admin1 === state) ?? geo?.results?.[0];
  if (!hit) continue;
  const wx = await get(
    `https://api.open-meteo.com/v1/forecast?latitude=${hit.latitude}&longitude=${hit.longitude}&hourly=temperature_2m,precipitation_probability,precipitation,wind_speed_10m,wind_gusts_10m,relative_humidity_2m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FNew_York&start_date=${START.slice(0, 4)}-${START.slice(4, 6)}-${START.slice(6)}&end_date=${END.slice(0, 4)}-${END.slice(4, 6)}-${END.slice(6)}`,
    { optional: true },
  );
  places[place] = { lat: hit.latitude, lon: hit.longitude, name: hit.name, admin1: hit.admin1, forecast: wx };
  await sleep(80);
}
save("weather.json", places);
save("index.json", index);
console.log(`Saved ${index.events.length} events, weather for ${Object.keys(places).length} places`);
