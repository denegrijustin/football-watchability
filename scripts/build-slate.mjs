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
//   TV/slot), rescaled across the slate. See scoreGame().
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
const espnToLogo = new Map(logoSources.logos.map((l) => [l.espnId, l.logoId]));
const oldSlate = src("slate.json");

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
  if (o && o <= 15) win = Math.min(25, o + 7);
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
const weatherRaw = optRaw("weather.json") ?? {};
function weatherFor(comp, summary, iso, localHour) {
  const venue = comp.venue ?? summary?.gameInfo?.venue ?? {};
  if (venue.indoor)
    return { icon: "🏟️", title: "Indoor / roof", detail: "no weather factor", impact: "none impact", tempF: null };
  let temp = null,
    precip = null,
    gust = null,
    wind = null,
    humidity = null;
  const w = summary?.gameInfo?.weather;
  if (w?.temperature != null) {
    temp = w.temperature;
    precip = w.precipitation ?? null;
    gust = w.gust ?? null;
  }
  const a = venue.address ?? {};
  const place = weatherRaw[[a.city, a.state].filter(Boolean).join(", ")];
  const hourly = place?.forecast?.hourly;
  if (hourly?.time) {
    const et = new Date(iso).toLocaleString("sv-SE", { timeZone: "America/New_York" }).slice(0, 13).replace(" ", "T");
    const i = hourly.time.findIndex((t) => t.startsWith(et));
    if (i >= 0) {
      temp ??= Math.round(hourly.temperature_2m[i]);
      precip ??= hourly.precipitation_probability[i];
      wind = hourly.wind_speed_10m[i];
      gust = Math.max(gust ?? 0, hourly.wind_gusts_10m[i] ?? 0);
      humidity = hourly.relative_humidity_2m[i];
    }
  }
  if (temp == null) return { icon: "❔", title: "Forecast pending", detail: "too far out for a reliable forecast", impact: "low impact", tempF: null };
  const night = localHour >= 19 || localHour < 5;
  if (precip != null && precip >= 50)
    return { icon: "🌧️", title: "Rain likely", detail: `${precip}% chance, ${temp}°F`, impact: "med impact", tempF: temp };
  const g = Math.round(Math.max(gust ?? 0, wind ?? 0));
  if (g >= 25 || (wind ?? 0) >= 16)
    return { icon: "🌬️", title: "Wind watch", detail: `${wind ? `wind ~${Math.round(wind)} mph, ` : ""}gusts to ${g} mph, ${temp}°F`, impact: "med impact", tempF: temp };
  if (temp >= 85 && (humidity ?? 60) >= 55)
    return { icon: "☀️", title: "Warm / humid", detail: `${temp}°F, heat can matter`, impact: "low impact", tempF: temp };
  if (temp <= 40)
    return { icon: "🥶", title: "Cold", detail: `${temp}°F at kickoff`, impact: "low impact", tempF: temp };
  if (precip != null && precip >= 30)
    return { icon: "🌦️", title: "Chance of showers", detail: `${precip}% chance, ${temp}°F`, impact: "low impact", tempF: temp };
  if (night) return { icon: "🌙", title: "Clear night", detail: `${temp}°F at kickoff`, impact: "low impact", tempF: temp };
  return { icon: "⛅", title: temp >= 75 ? "Warm and dry" : "Mild fall weather", detail: `${temp}°F at kickoff`, impact: "low impact", tempF: temp };
}

// ---------- history ----------
function historyFor(eventId, away, home, awayName, homeName, verb = "leads") {
  const ms = history[eventId] ?? [];
  const nameOf = (id) => (id === away.id ? awayName : id === home.id ? homeName : "?");
  const abbrOf = (id) => (id === away.id ? away.abbreviation : home.abbreviation);
  if (!ms.length)
    return {
      boxes: [
        { label: `Series since ${HISTORY_FROM}`, value: `No meetings since ${HISTORY_FROM}`, items: [] },
        { label: "Recent meetings", value: "None on record", items: [] },
      ],
    };
  let a = 0,
    b = 0;
  for (const m of ms) {
    const w = m.teams.find((t) => t.winner);
    if (!w) continue;
    if (w.id === away.id) a++;
    else if (w.id === home.id) b++;
  }
  const value =
    a === b
      ? `Series tied ${a}–${b} since ${HISTORY_FROM}`
      : a > b
        ? `${awayName} ${verb} ${a}–${b} since ${HISTORY_FROM}`
        : `${homeName} ${verb} ${b}–${a} since ${HISTORY_FROM}`;
  const items = ms.slice(0, 5).map((m) => {
    const [x, y] = [...m.teams].sort((p, q) => q.score - p.score);
    const yr = new Date(m.date).getUTCFullYear();
    return `${yr} ${abbrOf(x.id)} ${x.score}–${y.score}${m.type === 3 ? " (postseason)" : ""}`;
  });
  void nameOf;
  return {
    boxes: [
      { label: `Series since ${HISTORY_FROM}`, value, items: [] },
      { label: "Recent meetings", value: "", items },
    ],
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
        logoId: espnToLogo.get(t.id) ?? slug(name),
        espnId: t.id,
        record,
        rankings: league === "NFL" ? nflRanks(t, opp.team) : cfbRanks(t, opp.team, pWin),
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

    const hist = historyFor(ev.id, at, ht, short(at, aName), short(ht, hName), league === "NFL" ? "lead" : "leads");
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
      matchup: `${aName} @ ${hName}`,
      broadcast: (comp.broadcasts ?? []).flatMap((b) => b.names).map((n) => TV[n] ?? n)[0] ?? "TBA",
      weather: { icon: weather.icon, title: weather.title, detail: weather.detail, impact: weather.impact },
      teams: [tA, tH].map(({ _conf, _leaders, ...t }) => t),
      history: {
        ...hist,
        source: `Series and results: ESPN, ${HISTORY_FROM}–present. Key players: ESPN season leaders.`,
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
      broadcast: g.broadcast,
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
    `Playoff odds "now" are ESPN FPI. With-a-win / with-a-loss odds are estimates that keep FPI's number as the weighted average using ESPN's win probability. AP and NFL power-rank moves are rule-of-thumb estimates.`,
    `Series records and recent meetings cover ${HISTORY_FROM}–present (ESPN results), not all-time history.`,
    `Watchability blends team strength (FPI), how close the game projects, playoff stakes, ranked matchups and TV slot, rescaled across the week.`,
  ],
  games,
};
writeFileSync(new URL("src/data/slate.json", root), JSON.stringify(slate, null, 2) + "\n");

// New logos needed?
const logos = src("logos.json");
const missing = [...new Map(games.flatMap((g) => g.teams).filter((t) => !logos[t.logoId]).map((t) => [t.logoId, t])).values()];
writeFileSync(
  new URL("src/data/team-ids.json", root),
  JSON.stringify(Object.fromEntries(games.flatMap((g) => g.teams.map((t) => [t.logoId, { espnId: t.espnId, league: g.league, name: t.name }]))), null, 2) + "\n",
);
console.log(`Built ${games.length} games (${games.filter((g) => g.league === "NFL").length} NFL). Missing logos: ${missing.map((t) => t.logoId).join(", ") || "none"}`);
