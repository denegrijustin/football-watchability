// Builds src/data/slate.json for a new week from data-raw/ (see
// scripts/fetch-slate.mjs and scripts/fetch-history.mjs).
//
//   PERIOD="Oct. 1–5, 2026" node scripts/build-slate.mjs
//
// Sources and method (also shown in the site footer):
// - Schedule, TV, venue, lines, records, standings, season leaders, ESPN
//   matchup predictor and game-day weather: ESPN.
// - Playoff odds "now": ESPN FPI. The with-a-win / with-a-loss split is an
//   estimate that keeps FPI's number as the probability-weighted average.
// - AP poll: ESPN rankings feed. NFL "PR" is the FPI rank. Rank moves with a
//   win or loss are rule-of-thumb estimates.
// - Series history: ESPN results since 2004 (not all-time).
// - Watchability score: a transparent formula (quality, closeness, stakes,
//   TV/slot), rescaled across the slate.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const root = new URL("..", import.meta.url);
const raw = (n) => JSON.parse(readFileSync(new URL(`data-raw/${n}`, root), "utf8"));
const optRaw = (n) => (existsSync(new URL(`data-raw/${n}`, root)) ? raw(n) : null);
const src = (n) => JSON.parse(readFileSync(new URL(`src/data/${n}`, root), "utf8"));

const PERIOD = process.env.PERIOD ?? "Oct. 1–5, 2026";
const index = raw("index.json");
const history = optRaw("history.json") ?? {};
const HISTORY_FROM = 2004;
const rankingsFeed = raw("cfb-rankings.json");
const ap = rankingsFeed.rankings.find((r) => /AP/.test(r.name));
const apRank = new Map(ap.ranks.map((r) => [r.team.id, r.current]));
const apVotes = new Set((ap.others ?? []).map((r) => r.team.id));
const logoSources = src("logo-sources.json");
// ESPN ids overlap between leagues (Jaguars 30 = USC 30), so key by league.
const nflNames = new Set(
  (raw("nfl-teams.json").sports?.[0]?.leagues?.[0]?.teams ?? []).map((t) => t.team.displayName),
);
const espnToLogo = new Map(
  logoSources.logos.map((l) => [`${l.league ?? (nflNames.has(l.team) ? "NFL" : "CFB")}:${l.espnId}`, l.logoId]),
);
const oldSlate = src("slate.json");
// Hand corrections keyed by ESPN event id (e.g. a network ESPN hasn't posted).
const overrides = existsSync(new URL("src/data/slate-overrides.json", root)) ? src("slate-overrides.json") : {};

// ---------- FPI ----------
function fpiMap(file) {
  const f = raw(file);
  const m = new Map();
  for (const t of f.teams ?? []) {
    const cat = (name) => {
      const i = f.categories.findIndex((c) => c.name === name);
      const c = t.categories.find((x) => x.name === name);
      if (i < 0 || !c) return {};
      return Object.fromEntries(f.categories[i].names.map((n, j) => [n, c.values[j]]));
    };
    const fpi = cat("fpi");
    const proj = { ...fpi, ...cat("projections") };
    m.set(t.team.id, { fpi: fpi.fpi, rank: fpi.fpirank, playoffs: proj.probmakeplayoffs });
  }
  return m;
}
const FPI = { NFL: fpiMap("nfl-fpi.json"), CFB: fpiMap("cfb-fpi.json") };
const nFbs = FPI.CFB.size || 136;

// ---------- lookups ----------
const CONF = {
  1: ["acc", "ACC"],
  4: ["big-12", "Big 12"],
  5: ["big-ten", "Big Ten"],
  8: ["sec", "SEC"],
  9: ["pac-12", "Pac-12"],
  12: ["c-usa", "C-USA"],
  15: ["mac", "MAC"],
  17: ["mountain-west", "Mountain West"],
  18: ["independent", "Independent"],
  37: ["sun-belt", "Sun Belt"],
  151: ["american", "American"],
};
const CONF_LONG = {
  "Southeastern Conference": "SEC",
  "Atlantic Coast Conference": "ACC",
  "Big Ten Conference": "Big Ten",
  "Big 12 Conference": "Big 12",
  "American Athletic Conference": "American",
  "American Conference": "American",
  "Conference USA": "C-USA",
  "Mid-American Conference": "MAC",
  "Mountain West Conference": "Mountain West",
  "Pac-12 Conference": "Pac-12",
  "Sun Belt Conference": "Sun Belt",
  "FBS Independents": "Independent",
};
const TV = {
  CBS: "CBS / Paramount+",
  FOX: "FOX / FOX One",
  NBC: "NBC / Peacock",
  ABC: "ABC / ESPN App",
  ESPN: "ESPN / ESPN App",
  ESPN2: "ESPN2 / ESPN App",
  ESPNU: "ESPNU / ESPN App",
  "SEC Network": "SEC Network / ESPN App",
  "SEC Network+": "SEC Network+ / ESPN App",
  "ACC Network": "ACC Network / ESPN App",
  "ACCN": "ACC Network / ESPN App",
  BTN: "BTN / FOX One",
  FS1: "FS1 / FOX One",
  CBSSN: "CBS Sports Network",
  CW: "The CW",
  "USA Net": "USA Network",
  "MW+": "Mountain West Network (MW+)",
  "NFL Net": "NFL Network",
  "Prime Video": "Prime Video",
  "ESPN+": "ESPN+",
  TNT: "TNT",
  Peacock: "Peacock",
};
const NATIONAL = /^(CBS|FOX|NBC|ABC|ESPN|ESPN2|Prime Video|NFL Net|TNT)$/;
const STREAM_ONLY = /^(ESPN\+|MW\+|SEC Network\+|ACCNX)$/;

const slug = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-/, "");
const ordinal = (n) =>
  `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));

function etParts(iso) {
  const d = new Date(iso);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  const hour24 = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(d),
  );
  return { day: parts.weekday, time: `${parts.hour}:${parts.minute}`, hour24 };
}

// Team display name used across the site.
function teamName(team, league) {
  if (league === "NFL") return team.displayName;
  if (team.id === "2390") return "Miami (FL)";
  return team.location;
}

// ---------- standings ----------
function winPct(rec) {
  const [w, l, t = 0] = (rec ?? "0-0").split("-").map(Number);
  return w + l + t ? (w + t / 2) / (w + l + t) : 0.5;
}
function standingFor(summary, teamId, league) {
  const groups = (summary?.standings?.groups ?? []).flatMap((g) => (g.divisions ? g.divisions : [g]));
  for (const g of groups) {
    const entries = g.standings?.entries ?? [];
    if (!entries.some((e) => e.id === teamId)) continue;
    const stat = (e, type) => e.stats.find((s) => s.type === type)?.summary;
    const key = (e) => (league === "NFL" ? winPct(stat(e, "total")) : winPct(stat(e, "vsconf")) + winPct(stat(e, "total")) / 100);
    const me = entries.find((e) => e.id === teamId);
    const better = entries.filter((e) => key(e) > key(me) + 1e-9).length;
    const tied = entries.filter((e) => Math.abs(key(e) - key(me)) < 1e-9).length > 1;
    const header = (g.header ?? "").replace(/^\d{4}\s+/, "").replace(/\s+Standings$/, "").replace(" - ", " ");
    return { pos: `${tied ? "T-" : ""}${ordinal(better + 1)}`, group: header };
  }
  return null;
}

// ---------- playoff scenarios ----------
// Split FPI's playoff probability P into with-win / with-loss values such
// that p*Pw + (1-p)*Pl = P and logit(Pw) - logit(Pl) = k.
function splitOdds(P, p, k) {
  if (P == null) return [0, 0, 0];
  const Pn = clamp(P / 100, 0.001, 0.999);
  let lo = -12,
    hi = 12;
  for (let i = 0; i < 60; i++) {
    const L = (lo + hi) / 2;
    const v = p * sigmoid(L + (1 - p) * k) + (1 - p) * sigmoid(L - p * k);
    if (v > Pn) hi = L;
    else lo = L;
  }
  const L = (lo + hi) / 2;
  const r = (x) => clamp(Math.round(x * 100), 0, 100);
  return [r(Pn), r(sigmoid(L + (1 - p) * k)), r(sigmoid(L - p * k))];
}

// ---------- rank scenarios (rule of thumb) ----------
function cfbRanks(me, opp, pWin) {
  const r = apRank.get(me.id),
    o = apRank.get(opp.id);
  const fmt = (x) => (x && x <= 25 ? `AP #${x}` : "AP NR");
  if (r) {
    const up = r === 1 ? 0 : o ? (o < r ? Math.min(r - 1, Math.ceil((r - o) / 2) + 2) : 1) : pWin < 0.5 ? 2 : 0;
    const down = o ? (o < r ? 4 : 7) : pWin > 0.85 ? 12 : 9;
    return [fmt(r), `▲ ${fmt(Math.max(1, r - up))}`, `▼ ${fmt(r + down)}`];
  }
  let win = null;
  if (o && o <= 15) win = Math.min(25, Math.max(18, o + 7));
  else if (o) win = 25;
  else if (apVotes.has(me.id) && pWin < 0.6) win = 25;
  return ["AP NR", `▲ ${fmt(win)}`, "▼ AP NR"];
}
function nflRanks(me, opp) {
  const r = FPI.NFL.get(me.id)?.rank,
    o = FPI.NFL.get(opp.id)?.rank;
  if (!r) return ["PR —", "▲ PR —", "▼ PR —"];
  const win = Math.max(1, r - (o < r ? 3 : 1));
  const loss = Math.min(32, r + (o > r ? 4 : 2));
  return [`PR #${r}`, `▲ PR #${win}`, `▼ PR #${loss}`];
}

// ---------- weather ----------
// Game-window forecast (kickoff + 3 hours) from Open-Meteo, with an impact
// rating and plain-language effects. ESPN's kickoff forecast is a fallback.
const weatherFile = optRaw("weather.json") ?? {};
const weatherPlaces = weatherFile.places ?? weatherFile;
const weatherFetched = new Date(weatherFile.fetchedAt ?? index.fetchedAt);
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const compass = (deg) => (deg == null ? "" : COMPASS[Math.round(deg / 45) % 8]);
function wmo(code, night) {
  if (code >= 95) return ["⛈️", "Thunderstorms"];
  if (code >= 71 && code <= 77) return ["🌨️", "Snow"];
  if (code >= 85 && code <= 86) return ["🌨️", "Snow showers"];
  if ((code >= 61 && code <= 67) || code === 82) return ["🌧️", "Rain"];
  if ((code >= 51 && code <= 57) || (code >= 80 && code <= 81)) return ["🌦️", "Showers"];
  if (code === 45 || code === 48) return ["🌫️", "Fog"];
  if (code === 3) return ["☁️", "Cloudy"];
  if (code === 1 || code === 2) return [night ? "🌙" : "⛅", night ? "Partly cloudy night" : "Partly cloudy"];
  return [night ? "🌙" : "☀️", night ? "Clear night" : "Sunny"];
}
const LEVELS = ["none", "low", "moderate", "high"];

function weatherFor(comp, summary, iso, localHour) {
  const venue = comp.venue ?? summary?.gameInfo?.venue ?? {};
  if (venue.indoor)
    return { icon: "🏟️", title: "Indoor / roof", detail: "no weather factor", impact: "none impact", indoor: true };
  const a = venue.address ?? {};
  const place = weatherPlaces[[a.city, a.state ?? a.country].filter(Boolean).join(", ")] ?? weatherPlaces[[a.city, a.state].filter(Boolean).join(", ")];
  const H = place?.forecast?.hourly;
  const et = new Date(iso).toLocaleString("sv-SE", { timeZone: "America/New_York" }).slice(0, 13).replace(" ", "T");
  const i0 = H?.time?.findIndex((t) => t.startsWith(et)) ?? -1;
  const daysOut = (new Date(iso) - weatherFetched) / 864e5;
  const confidence = daysOut <= 1.5 ? "High" : daysOut <= 3.5 ? "Medium" : "Low";
  const confText = `${confidence} confidence · forecast ${Math.max(0, Math.round(daysOut))} day${Math.round(daysOut) === 1 ? "" : "s"} out`;

  if (i0 < 0) {
    const w = summary?.gameInfo?.weather;
    if (w?.temperature == null)
      return { icon: "❔", title: "Forecast pending", detail: "too far out for a reliable forecast", impact: "low impact", confidence: confText };
    return {
      icon: (w.precipitation ?? 0) >= 50 ? "🌧️" : "⛅",
      title: (w.precipitation ?? 0) >= 50 ? "Rain likely" : "Forecast",
      detail: `${w.temperature}°F at kickoff${w.precipitation != null ? `, ${w.precipitation}% rain` : ""}`,
      impact: (w.precipitation ?? 0) >= 50 ? "moderate impact" : "low impact",
      confidence: confText,
    };
  }

  // Four readings across the game window: roughly one per quarter.
  const hours = [0, 1, 2, 3]
    .map((k) => i0 + k)
    .filter((i) => i < H.time.length)
    .map((i, k) => {
      const hr = Number(H.time[i].slice(11, 13));
      const night = hr >= 19 || hr < 6;
      const [icon, sky] = wmo(H.weather_code[i], night);
      return {
        label: `Q${k + 1}`,
        time: `${((hr + 11) % 12) + 1}${hr < 12 ? "a" : "p"}`,
        icon,
        sky,
        tempF: Math.round(H.temperature_2m[i]),
        feelsF: Math.round(H.apparent_temperature?.[i] ?? H.temperature_2m[i]),
        precip: H.precipitation_probability?.[i] ?? 0,
        rainIn: H.precipitation?.[i] ?? 0,
        windMph: Math.round(H.wind_speed_10m[i]),
        gustMph: Math.round(H.wind_gusts_10m[i]),
        dir: compass(H.wind_direction_10m?.[i]),
        code: H.weather_code[i],
        humidity: H.relative_humidity_2m?.[i],
      };
    });
  const max = (k) => Math.max(...hours.map((h) => h[k]));
  const min = (k) => Math.min(...hours.map((h) => h[k]));
  const gust = max("gustMph"),
    wind = max("windMph"),
    pop = max("precip"),
    rain = hours.reduce((t, h) => t + h.rainIn, 0),
    hot = max("feelsF"),
    cold = min("feelsF");
  const windDir = hours.reduce((p, h) => (h.gustMph >= p.gustMph ? h : p)).dir;
  const thunder = hours.some((h) => h.code >= 95);
  const snow = hours.some((h) => (h.code >= 71 && h.code <= 77) || h.code === 85 || h.code === 86);

  const factors = [];
  const add = (level, key, text) => factors.push({ level, key, text });
  if (thunder) add(3, "storm", `Lightning risk: thunderstorms in the forecast could force a delay.`);
  if (snow) add(3, "snow", `Snow in the forecast — footing, ball handling and kicking all get harder.`);
  const windText = gust > wind + 3 ? `winds near ${wind} mph, gusts to ${gust}` : `winds near ${Math.max(wind, gust)} mph`;
  if (wind >= 22 || gust >= 35)
    add(3, "wind", `Passing and kicking: ${windText}${windDir ? ` from the ${windDir}` : ""} — deep shots and long field goals become a gamble.`);
  else if (wind >= 16 || gust >= 25)
    add(2, "wind", `Kicking game: ${windText}${windDir ? ` from the ${windDir}` : ""} can push long field goals and punts off line.`);
  else if (gust >= 18 || wind >= 12) add(1, "wind", `A steady breeze (${windText}) — only a minor effect on kicks.`);
  if (pop >= 60 && rain >= 0.15)
    add(3, "rain", `Ball security: rain likely (${pop}%) with about ${rain.toFixed(2)}" during the game — expect a run-heavy, sloppier script.`);
  else if (pop >= 50)
    add(2, "rain", `Wet ball: ${pop}% chance of rain during the game — fumbles and drops become more likely.`);
  else if (pop >= 30) add(1, "rain", `Scattered showers possible (${pop}% at worst).`);
  if (hot >= 95) add(2, "heat", `Stamina: feels like ${hot}°F — expect heavy rotation and late-game fatigue.`);
  else if (hot >= 88) add(1, "heat", `Warm: feels like ${hot}°F at its peak.`);
  if (cold <= 20) add(2, "cold", `Cold: feels like ${cold}°F — tougher to catch, throw and kick.`);
  else if (cold <= 32) add(1, "cold", `Chilly: feels like ${cold}°F late.`);
  factors.sort((x, y) => y.level - x.level);
  const level = factors[0]?.level ?? 0;

  const top = factors[0];
  const k0 = hours[0];
  const title =
    top && top.level >= 2
      ? { storm: "Thunderstorms possible", snow: "Snow possible", wind: "Windy", rain: "Rain likely", heat: "Hot", cold: "Cold" }[top.key]
      : top?.key === "rain"
        ? "Chance of showers"
        : k0.sky;
  const icon =
    top && top.level >= 2
      ? { storm: "⛈️", snow: "🌨️", wind: "🌬️", rain: "🌧️", heat: "🥵", cold: "🥶" }[top.key]
      : k0.icon;
  const last = hours[hours.length - 1];
  const bits = [`${k0.tempF}°F at kickoff${last.tempF !== k0.tempF ? `, ${last.tempF}°F late` : ""}`];
  if (pop >= 20) bits.push(k0.precip === pop ? `${pop}% rain` : `rain ${k0.precip}%→${pop}%`);
  if (gust >= 18) bits.push(`gusts ${gust} mph`);
  return {
    icon,
    title,
    detail: bits.join(", "),
    impact: `${LEVELS[level]} impact`,
    level: LEVELS[level],
    effects: factors.filter((f) => f.level >= 1).map((f) => f.text),
    hours: hours.map(({ label, time, icon, tempF, feelsF, precip, windMph, gustMph, dir }) => ({ label, time, icon, tempF, feelsF, precip, windMph, gustMph, dir })),
    confidence: confText,
  };
}

// ---------- history ----------
// All-time head-to-head: Winsipedia (college) and FiveThirtyEight (NFL,
// 1920–2017), merged with ESPN results from HISTORY_FROM on so recent
// seasons are always present.
const ALLTIME = new URL("data-raw/alltime/", root);
const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

// Winsipedia pages that exist but list no games mean the teams never met.
const fetchLog = existsSync(new URL("fetch-log.json", ALLTIME)) ? JSON.parse(readFileSync(new URL("fetch-log.json", ALLTIME), "utf8")) : [];
const foundPages = existsSync(new URL("found.json", ALLTIME)) ? JSON.parse(readFileSync(new URL("found.json", ALLTIME), "utf8")) : {};
function winsipediaGames(eventId, away, home, awayName, homeName) {
  const f = new URL(`cfb-${eventId}.html`, ALLTIME);
  if (!existsSync(f)) {
    const slugs = [awayName, homeName].map((n) => norm(n));
    const pageExisted = foundPages[eventId] && fetchLog.some(
      (l) => l.status === 200 && /winsipedia\.com\/games\//.test(l.url) && slugs.every((sl) => norm(l.url).includes(sl)),
    );
    return pageExisted ? [] : null;
  }
  const h = readFileSync(f, "utf8").replace(/\\"/g, '"');
  const t1 = /"team1Name":"([^"]*)"/.exec(h)?.[1];
  const t2 = /"team2Name":"([^"]*)"/.exec(h)?.[1];
  const byId = new Map();
  for (const m of h.matchAll(/\{"date":"\d{4}-\d{2}-\d{2}"[^{}]*?"hasDetail":(?:true|false)\}/g)) {
    try {
      const o = JSON.parse(m[0]);
      byId.set(o.gameId, o);
    } catch {}
  }
  if (!byId.size) return [];
  // Which of our teams is Winsipedia's team1?
  const match = (wn, n) => norm(wn) === norm(n) || norm(n).startsWith(norm(wn)) || norm(wn).startsWith(norm(n));
  const awayIsT1 = match(t1, awayName) ? true : match(t2, awayName) ? false : match(t2, homeName);
  return [...byId.values()].map((o) => {
    const s1 = Number(o.team1Score), s2 = Number(o.team2Score);
    const w = o.winner === "tie" ? null : o.winner === "team1" ? (awayIsT1 ? "away" : "home") : awayIsT1 ? "home" : "away";
    return {
      date: o.date,
      season: o.year,
      awayScore: awayIsT1 ? s1 : s2,
      homeScore: awayIsT1 ? s2 : s1,
      winner: w,
      post: o.bowlGame && o.bowlGame !== "$undefined",
      vacated: !!o.vacated,
      forfeited: !!o.forfeited,
    };
  });
}

// FiveThirtyEight franchise codes by ESPN abbreviation.
const FIVE38 = { WSH: "wsh", LV: "oak", LAR: "lar", LAC: "lac" };
let nflCsv = null;
function nflGames(away, home) {
  const f = new URL("nfl_elo.csv", ALLTIME);
  if (!existsSync(f)) return null;
  if (!nflCsv) {
    const [head, ...lines] = readFileSync(f, "utf8").trim().split("\n");
    const cols = head.split(",");
    nflCsv = lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i], v])));
  }
  const ca = FIVE38[away.abbreviation] ?? away.abbreviation.toLowerCase();
  const ch = FIVE38[home.abbreviation] ?? home.abbreviation.toLowerCase();
  return nflCsv
    .filter((r) => Number(r.season) < HISTORY_FROM && ((r.team1 === ca && r.team2 === ch) || (r.team1 === ch && r.team2 === ca)))
    .map((r) => {
      const aScore = Number(r.team1 === ca ? r.score1 : r.score2);
      const hScore = Number(r.team1 === ca ? r.score2 : r.score1);
      return {
        date: r.date,
        season: Number(r.season),
        awayScore: aScore,
        homeScore: hScore,
        winner: aScore === hScore ? null : aScore > hScore ? "away" : "home",
        post: !!r.playoff,
      };
    });
}

function espnGames(eventId, away, home) {
  return (history[eventId] ?? []).map((m) => {
    const A = m.teams.find((t) => t.id === away.id),
      H = m.teams.find((t) => t.id === home.id);
    return {
      date: m.date.slice(0, 10),
      season: m.season,
      awayScore: A?.score ?? 0,
      homeScore: H?.score ?? 0,
      winner: A?.winner ? "away" : H?.winner ? "home" : null,
      post: m.type === 3,
    };
  });
}

function historyFor(eventId, league, away, home, awayName, homeName, verb = "leads") {
  const base = league === "NFL" ? nflGames(away, home) : winsipediaGames(eventId, away, home, awayName, homeName);
  const espn = espnGames(eventId, away, home);
  const allTime = base != null;
  const games = [...(base ?? [])];
  // Add ESPN results the all-time source is missing (newer seasons).
  for (const e of espn) {
    const dup = games.some(
      (g) =>
        Math.abs(new Date(g.date) - new Date(e.date)) < 4 * 864e5 ||
        (g.season === e.season && g.awayScore === e.awayScore && g.homeScore === e.homeScore),
    );
    if (!dup && (league === "NFL" ? e.season >= HISTORY_FROM : true)) games.push(e);
  }
  games.sort((x, y) => y.date.localeCompare(x.date));
  const scope = allTime ? "All-time series" : `Series (ESPN records since ${HISTORY_FROM})`;
  if (!games.length)
    return {
      boxes: [
        { label: scope, value: allTime ? "First meeting" : `No meetings since ${HISTORY_FROM}`, items: [] },
        { label: "Recent meetings", value: "None on record", items: [] },
      ],
      games: [],
    };
  let aw = 0, hw = 0, ties = 0;
  for (const g of games) {
    if (!g.winner) ties++;
    else if (g.vacated) continue;
    else if (g.winner === "away") aw++;
    else hw++;
  }
  const vacated = games.filter((g) => g.vacated).length;
  const t = ties ? `–${ties}` : "";
  const tail = allTime ? "" : ` since ${HISTORY_FROM}`;
  const value =
    aw === hw
      ? `Series tied ${aw}–${hw}${t}${tail}`
      : aw > hw
        ? `${awayName} ${verb} ${aw}–${hw}${t}${tail}`
        : `${homeName} ${verb} ${hw}–${aw}${t}${tail}`;
  const abbr = (side) => (side === "away" ? away.abbreviation : home.abbreviation);
  const fmt = (g) => {
    const hi = Math.max(g.awayScore, g.homeScore), lo = Math.min(g.awayScore, g.homeScore);
    const tags = [g.post && "postseason", g.vacated && "vacated", g.forfeited && "forfeit"].filter(Boolean);
    const score = g.winner ? `${abbr(g.winner)} ${g.winner === "away" ? g.awayScore : g.homeScore}–${g.winner === "away" ? g.homeScore : g.awayScore}` : `Tie ${hi}–${lo}`;
    return `${g.season} ${score}${tags.length ? ` (${tags.join(", ")})` : ""}`;
  };
  const first = games[games.length - 1];
  const summary = [
    `${games.length} meeting${games.length === 1 ? "" : "s"}${allTime ? "" : ` since ${HISTORY_FROM}`}`,
    ...(allTime ? [`First meeting: ${fmt(first)}`] : []),
    ...(vacated ? [`${vacated} vacated result${vacated > 1 ? "s" : ""} not counted`] : []),
  ];
  return {
    boxes: [
      { label: scope, value, items: summary },
      { label: "Recent meetings", value: "", items: games.slice(0, 5).map(fmt) },
    ],
    games: games.map(fmt),
  };
}

function leadersFor(summary, teamId) {
  const block = (summary?.leaders ?? []).find((l) => l.team?.id === teamId);
  const out = [];
  for (const cat of block?.leaders ?? []) {
    if (!/passingYards|rushingYards|receivingYards/.test(cat.name)) continue;
    const top = cat.leaders?.[0];
    if (top?.athlete?.displayName) out.push(top.athlete.displayName);
  }
  return out;
}

// ---------- season trends ----------
const trendsFile = optRaw("trends.json") ?? { teams: {} };
function trendFor(league, id) {
  const gs = trendsFile.teams[`${league === "NFL" ? "nfl" : "cfb"}:${id}`];
  if (!gs?.length) return null;
  const games = gs.map((g) => ({
    wk: g.week,
    opp: g.opp.abbr ?? g.opp.name,
    oppName: g.opp.name,
    oppRank: g.opp.rank,
    home: g.home,
    neutral: g.neutral,
    pf: g.pf,
    pa: g.pa,
    post: g.type === 3,
  }));
  const n = games.length;
  const sum = (f) => games.reduce((t, g) => t + f(g), 0);
  const ppg = sum((g) => g.pf) / n,
    oppg = sum((g) => g.pa) / n;
  const res = (g) => (g.pf > g.pa ? "W" : g.pf < g.pa ? "L" : "T");
  let k = n - 1;
  const last = res(games[k]);
  while (k > 0 && res(games[k - 1]) === last) k--;
  const recent = games.slice(-3);
  const r1 = (x) => Math.round(x * 10) / 10;
  return {
    games,
    ppg: r1(ppg),
    oppg: r1(oppg),
    margin: r1(ppg - oppg),
    streak: `${last}${n - k}`,
    last3Margin: n >= 4 ? r1(recent.reduce((t, g) => t + g.pf - g.pa, 0) / recent.length) : null,
  };
}

// ---------- TV network logos ----------
const networkIds = {};
const netSlug = (name) => slug(String(name).replace(/\+/g, " plus"));

// ---------- scoring ----------
function strength(league, id) {
  const f = FPI[league].get(id);
  if (!f?.rank) return 0;
  const n = league === "NFL" ? 32 : nFbs;
  return 1 - (f.rank - 1) / (n - 1);
}

// ---------- build ----------
const built = [];
for (const [key, league] of [
  ["nfl", "NFL"],
  ["cfb", "CFB"],
]) {
  const board = raw(`${key}-scoreboard.json`);
  for (const ev of board.events) {
    const comp = ev.competitions[0];
    const summary = optRaw(`summaries/${ev.id}.json`);
    const away = comp.competitors.find((c) => c.homeAway === "away");
    const home = comp.competitors.find((c) => c.homeAway === "home");
    const at = away.team,
      ht = home.team;
    const aName = teamName(at, league),
      hName = teamName(ht, league);
    const short = (t, n) => (league === "NFL" ? t.name : n);

    // Win probability: ESPN predictor, else from the spread.
    const odds = summary?.pickcenter?.[0] ?? comp.odds?.[0] ?? null;
    let pHome = Number(summary?.predictor?.homeTeam?.gameProjection);
    let pAway = Number(summary?.predictor?.awayTeam?.gameProjection);
    if (Number.isFinite(pHome) && Number.isFinite(pAway) && pHome + pAway > 0) pHome = pHome / (pHome + pAway);
    else if (odds?.spread != null) {
      const homeFav = odds.homeTeamOdds?.favorite;
      const s = Math.abs(odds.spread);
      pHome = sigmoid((homeFav ? 1 : -1) * s / (league === "NFL" ? 6 : 8));
    } else {
      const sa = strength(league, at.id),
        sh = strength(league, ht.id);
      pHome = clamp(0.5 + (sh - sa) * 0.9 + 0.04, 0.03, 0.97);
    }
    pAway = 1 - pHome;

    // Line text: "Alabama -6 • O/U 59.5"
    let line = null,
      spread = null,
      total = null;
    if (odds?.details && !/^EVEN/i.test(odds.details)) {
      const favHome = odds.homeTeamOdds?.favorite ?? odds.details.startsWith(ht.abbreviation);
      const favName = favHome ? short(ht, hName) : short(at, aName);
      spread = Math.abs(Number(odds.spread ?? odds.details.split(" ").pop()));
      total = odds.overUnder ?? null;
      line = `${favName} -${spread}${total ? ` • O/U ${total}` : ""}`;
    } else if (/^EVEN/i.test(odds?.details ?? "")) {
      spread = 0;
      total = odds.overUnder ?? null;
      line = `Pick'em${total ? ` • O/U ${total}` : ""}`;
    }

    const { day, time, hour24 } = etParts(ev.date);
    const addr = comp.venue?.address ?? {};
    const venue = [addr.city, addr.state ?? addr.country].filter(Boolean).join(", ");
    const neutral = comp.neutralSite ? " (neutral site)" : "";
    const weather = weatherFor(comp, summary, ev.date, hour24);
    const media = (comp.geoBroadcasts ?? []).find((b) => b.market?.type === "National" && b.type?.shortName !== "Radio")?.media
      ?? (comp.geoBroadcasts ?? [])[0]?.media;
    let network = null;
    if (media?.shortName && (media.darkLogo || media.logo)) {
      network = netSlug(media.shortName);
      networkIds[network] ??= { name: media.shortName, logo: media.logo, darkLogo: media.darkLogo };
    }

    const team = (c, t, name, opp, pWin) => {
      const conf = CONF[t.conferenceId];
      const st = standingFor(summary, t.id, league);
      const rec = c.records?.find((r) => r.type === "total")?.summary ?? "0-0";
      let record;
      if (league === "NFL") {
        const div = st?.group ?? "";
        record = `${rec} · ${div.split(" ")[0] || "—"} · ${div || "—"} · ${st?.pos ?? "—"}`;
      } else if (!conf) {
        record = `${rec} · FCS · —`;
      } else {
        const grp = st?.group ? CONF_LONG[st.group] ?? st.group.replace(/ Conference$/, "") : conf[1];
        const sub = /(East|West)$/.exec(st?.group ?? "")?.[1];
        record = `${rec} · ${conf[1]}${sub && conf[1] === "Sun Belt" ? ` ${sub}` : ""} · ${conf[0] === "independent" ? "Independent" : `${st?.pos ?? "—"}${sub ? ` ${sub}` : ""}`}`;
        void grp;
      }
      const fpi = FPI[league].get(t.id);
      const P = fpi?.playoffs ?? (conf || league === "NFL" ? null : null);
      const playoffOdds = splitOdds(P, pWin, league === "NFL" ? 1.7 : 2.4);
      return {
        name,
        logoId: espnToLogo.get(`${league}:${t.id}`) ?? slug(name),
        espnId: t.id,
        abbr: t.abbreviation,
        record,
        rankings: league === "NFL" ? nflRanks(t, opp.team) : cfbRanks(t, opp.team, pWin),
        trend: trendFor(league, t.id),
        playoffOdds,
        _conf: conf,
        _leaders: leadersFor(summary, t.id),
      };
    };
    const tA = team(away, at, aName, home, pAway);
    const tH = team(home, ht, hName, away, pHome);

    // ---- watchability (raw) ----
    const sA = strength(league, at.id),
      sH = strength(league, ht.id);
    const quality = (sA + sH) / 2;
    const top = Math.max(sA, sH);
    const close = 1 - Math.abs(2 * pHome - 1);
    const swing = (t) => t.playoffOdds[1] - t.playoffOdds[2];
    const stakes = clamp((swing(tA) + swing(tH)) / (league === "NFL" ? 70 : 60), 0, 1);
    const net = (comp.broadcasts?.[0]?.names ?? [])[0] ?? "";
    let bonus = 0;
    const rA = apRank.get(at.id),
      rH = apRank.get(ht.id);
    if (league === "CFB" && rA && rH) bonus += 0.08 + (rA <= 10 || rH <= 10 ? 0.04 : 0);
    else if (league === "CFB" && (rA || rH) && close > 0.6) bonus += 0.04;
    if (NATIONAL.test(net)) bonus += 0.03;
    if (STREAM_ONLY.test(net)) bonus -= 0.04;
    if (hour24 >= 19 && NATIONAL.test(net)) bonus += 0.02;
    if (!tA._conf && league === "CFB") bonus -= 0.1;
    if (!tH._conf && league === "CFB") bonus -= 0.1;
    const rawScore = 0.38 * quality + 0.12 * top + 0.28 * close + 0.22 * stakes + bonus;

    const hist = historyFor(ev.id, league, at, ht, short(at, aName), short(ht, hName), league === "NFL" ? "lead" : "leads");
    const players = [...new Set([...tA._leaders.slice(0, 2), ...tH._leaders.slice(0, 2)])];
    hist.boxes.push({
      label: "Key players / units",
      value: "",
      items: players.length ? players : [`${aName} offense`, `${hName} offense`],
    });

    built.push({
      espnId: ev.id,
      league,
      date: ev.date,
      conferences: [...new Set([tA._conf?.[0], tH._conf?.[0]].filter(Boolean))],
      rawScore,
      _day: day,
      _time: time,
      _line: line,
      _venue: venue + neutral,
      _net: net,
      _network: network,
      matchup: `${aName} @ ${hName}`,
      broadcast: (comp.broadcasts ?? []).flatMap((b) => b.names).map((n) => TV[n] ?? n)[0] ?? "TBA",
      weather,
      teams: [tA, tH].map(({ _conf, _leaders, ...t }) => t),
      history: {
        ...hist,
        source: league === "NFL" ? `Series: FiveThirtyEight NFL game data (1920–2003) and ESPN (${HISTORY_FROM}–present), playoffs included. Key players: ESPN season leaders.` : `Series: Winsipedia game-by-game results, plus ESPN for the latest seasons. Key players: ESPN season leaders.`,
      },
    });
  }
}

// ---------- rescale scores and assign tiers ----------
const TIERS = [
  ["elite", 90, "Must Watch"],
  ["vgood", 82, "Very Good"],
  ["good", 74, "Good"],
  ["watch", 64, "Watchable"],
  ["bg", 0, "Background"],
];
for (const league of ["NFL", "CFB"]) {
  const gs = built.filter((g) => g.league === league);
  const xs = gs.map((g) => g.rawScore).sort((a, b) => a - b);
  const lo = xs[0],
    hi = xs[xs.length - 1];
  const [floor, ceil] = league === "NFL" ? [60, 97] : [42, 97];
  for (const g of gs) g.score = Math.round(floor + (ceil - floor) * ((g.rawScore - lo) / (hi - lo || 1)));
}
const games = built
  .sort((a, b) => (a.league === b.league ? b.score - a.score : a.league === "NFL" ? -1 : 1))
  .map((g, i, all) => {
    const n = all.slice(0, i + 1).filter((x) => x.league === g.league).length;
    const [tier, , label] = TIERS.find(([, min]) => g.score >= min);
    const rankView = g.league === "NFL" ? "PR impact view" : "AP impact view";
    const meta = [`${g._day} ${g._time} ET`, label, ...(g._line ? [g._line] : []), g._venue].join(" · ");
    return {
      id: `${g.league.toLowerCase()}-${n}`,
      espnId: g.espnId,
      league: g.league,
      conferences: g.conferences,
      score: g.score,
      tier,
      delta: "new",
      matchup: g.matchup,
      meta,
      chips: [label, rankView],
      broadcast: overrides[g.espnId]?.broadcast ?? g.broadcast,
      network: overrides[g.espnId]?.network ?? g._network,
      weather: g.weather,
      teams: g.teams,
      narrative: "",
      narrativeChips: [],
      history: g.history,
    };
  });

const slate = {
  ...oldSlate,
  period: PERIOD,
  snapshotDate: index.fetchedAt.slice(0, 10),
  provenance: {
    file: "data-raw (ESPN, Open-Meteo)",
    note: `Built ${index.fetchedAt.slice(0, 10)} from ESPN schedules, lines, records, AP poll, FPI and matchup predictor, plus game-day forecasts. Lines and forecasts move during the week.`,
  },
  broadcastNote: `TV/streaming reflects ESPN's listings for ${PERIOD}. Local NFL availability varies by market; subscription access may be required.`,
  footerNotes: [
    `Weather: Open-Meteo hourly forecast for each game window (about one reading per quarter), fetched ${weatherFetched.toISOString().slice(0, 16).replace("T", " ")} UTC. Impact ratings weigh wind, rain, storms, snow and heat or cold; forecasts sharpen as kickoff nears.`,
    `Playoff odds "now" are ESPN FPI. With-a-win / with-a-loss odds are estimates that keep FPI's number as the weighted average using ESPN's win probability. AP and NFL power-rank moves are rule-of-thumb estimates.`,
    `Series records are all-time: Winsipedia for college (vacated wins not counted), FiveThirtyEight's NFL game file through 2003 plus ESPN since, playoffs included.`,
    `Watchability blends team strength (FPI), how close the game projects, playoff stakes, ranked matchups and TV slot, rescaled across the week.`,
  ],
  games,
};
writeFileSync(new URL("src/data/slate.json", root), JSON.stringify(slate, null, 2) + "\n");

writeFileSync(new URL("src/data/network-ids.json", root), JSON.stringify(networkIds, null, 2) + "\n");

// New logos needed?
const logos = src("logos.json");
const missing = [...new Map(games.flatMap((g) => g.teams).filter((t) => !logos[t.logoId]).map((t) => [t.logoId, t])).values()];
writeFileSync(
  new URL("src/data/team-ids.json", root),
  JSON.stringify(Object.fromEntries(games.flatMap((g) => g.teams.map((t) => [t.logoId, { espnId: t.espnId, league: g.league, name: t.name }]))), null, 2) + "\n",
);
console.log(`Built ${games.length} games (${games.filter((g) => g.league === "NFL").length} NFL). Missing logos: ${missing.map((t) => t.logoId).join(", ") || "none"}`);
