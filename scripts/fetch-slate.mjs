// Downloads raw inputs for a weekly slate from public ESPN and Open-Meteo
// endpoints into data-raw/. Run in GitHub Actions (network required):
//
//   START=20261001 END=20261005 SEASON=2026 node scripts/fetch-slate.mjs
//
// The output is raw material for scripts/build-slate.mjs; nothing here is
// shipped to the site.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const START = process.env.START;
const END = process.env.END;
const SEASON = process.env.SEASON ?? START.slice(0, 4);
const out = new URL("../data-raw/", import.meta.url);
mkdirSync(new URL("summaries/", out), { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
async function get(url, { optional = false } = {}) {
  let last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 fbwatch-slate-builder" } });
      if (res.ok) return await res.json();
      last = `HTTP ${res.status}`;
      if (res.status === 404) break;
    } catch (e) {
      last = String(e);
    }
    await sleep(800 * (attempt + 1));
  }
  errors.push({ url, error: last, optional });
  return null;
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

async function main() {
for (const [key, { path, extra }] of Object.entries(leagues)) {
  // ESPN rejects date ranges for future weeks, so fetch day by day.
  const board = { events: [] };
  const days = [];
  for (let d = new Date(`${START.slice(0, 4)}-${START.slice(4, 6)}-${START.slice(6)}T12:00:00Z`); ; d.setUTCDate(d.getUTCDate() + 1)) {
    const ymd = d.toISOString().slice(0, 10).replace(/-/g, "");
    days.push(ymd);
    if (ymd >= END) break;
  }
  for (const day of days) {
    const b = await get(`${SITE}/${path}/scoreboard?dates=${day}${extra}`);
    for (const ev of b?.events ?? []) if (!board.events.some((e) => e.id === ev.id)) board.events.push(ev);
    if (b && !board.leagues) board.leagues = b.leagues;
    await sleep(150);
  }
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
  const board = JSON.parse(readFileSync(new URL(`${key}-scoreboard.json`, out), "utf8"));
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
}
try {
  await main();
} catch (e) {
  errors.push({ fatal: String(e?.stack ?? e) });
}
save("index.json", index);
save("errors.json", errors);
console.log(`Saved ${index.events.length} events; ${errors.length} errors`);
