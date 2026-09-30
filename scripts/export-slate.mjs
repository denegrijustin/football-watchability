// Weekend export of the watch slate (Thursday–Monday), written to
// public/exports/ so the site can offer it for download:
//   watch-slate.csv       every game, by kickoff, with watchability and more
//   entertaining.ics      calendar of games rated 74+ (Entertaining)
// Run after build-slate.mjs and write-narratives.mjs.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const src = (n) => JSON.parse(readFileSync(new URL(`../src/data/${n}`, import.meta.url), "utf8"));
const slate = src("slate.json");
const results = src("results.json");
const out = new URL("../public/exports/", import.meta.url);
mkdirSync(out, { recursive: true });

const TIER = { elite: "Must watch", vgood: "Very good", good: "Good", watch: "Watchable", bg: "Background" };
const et = (iso, o) => new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", ...o });
const csvCell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const rankText = (r) =>
  r ? [r.conf && r.confName ? `${r.confName} #${r.conf}` : null, r.overall ? `#${r.overall} overall` : null].filter(Boolean).join(" · ") : "";

const rows = [];
for (const g of slate.games) {
  const [a, h] = g.teams;
  const meta = g.meta.split(" · ");
  rows.push({
    date: g.date,
    status: "Upcoming",
    league: g.league === "NFL" ? "NFL" : "College",
    away: a.name,
    home: h.name,
    awayRank: rankText(a.ranks),
    homeRank: rankText(h.ranks),
    network: g.broadcast,
    score: g.score,
    tier: TIER[g.tier],
    entertaining: g.score >= 74 ? "Yes" : "",
    projected: g.projected ? `${a.abbr} ${g.projected.away}–${g.projected.home} ${h.abbr}` : "",
    winProb: g.winProb ? `${a.abbr} ${Math.round(100 - g.winProb.home)}% / ${h.abbr} ${Math.round(g.winProb.home)}%` : "",
    line: meta.length > 3 ? meta.slice(2, -1).join(" · ") : "",
    venue: meta[meta.length - 1],
    weather: `${g.weather.title} · ${g.weather.detail}${g.weather.level && g.weather.level !== "none" && g.weather.level !== "low" ? ` (${g.weather.impact})` : ""}`,
    take: g.narrative,
    final: "",
    actual: "",
  });
}
for (const r of results.games.filter((x) => x.week === slate.period)) {
  const [a, h] = r.teams;
  rows.push({
    date: r.date,
    status: "Final",
    league: r.league === "NFL" ? "NFL" : "College",
    away: a.name,
    home: h.name,
    awayRank: rankText(a.ranks),
    homeRank: rankText(h.ranks),
    network: r.broadcast,
    score: r.forecast.score,
    tier: TIER[r.forecast.tier],
    entertaining: r.forecast.score >= 74 ? "Yes" : "",
    projected: r.scoreCheck ? `${a.abbr} ${r.scoreCheck.projected.away}–${r.scoreCheck.projected.home} ${h.abbr}` : "",
    winProb: "",
    line: r.forecast.line ?? "",
    venue: r.venue,
    weather: "",
    take: r.readout.headline,
    final: `${a.abbr} ${a.score}–${h.score} ${h.abbr}${r.final.overtime ? " (OT)" : ""}`,
    actual: r.actual.score,
  });
}
rows.sort((x, y) => x.date.localeCompare(y.date) || y.score - x.score);

const cols = [
  ["Day", (r) => et(r.date, { weekday: "short" })],
  ["Date", (r) => et(r.date, { month: "short", day: "numeric" })],
  ["Kickoff (ET)", (r) => et(r.date, { hour: "numeric", minute: "2-digit" })],
  ["League", (r) => r.league],
  ["Away", (r) => r.away],
  ["Away rank", (r) => r.awayRank],
  ["Home", (r) => r.home],
  ["Home rank", (r) => r.homeRank],
  ["TV", (r) => r.network],
  ["Watchability", (r) => r.score],
  ["Tier", (r) => r.tier],
  ["Entertaining (74+)", (r) => r.entertaining],
  ["Projected score", (r) => r.projected],
  ["Win probability (ESPN)", (r) => r.winProb],
  ["Line", (r) => r.line],
  ["Venue", (r) => r.venue],
  ["Weather", (r) => r.weather],
  ["Take", (r) => r.take],
  ["Status", (r) => r.status],
  ["Final", (r) => r.final],
  ["Actual watchability", (r) => r.actual],
];
const csv = [cols.map(([h]) => h), ...rows.map((r) => cols.map(([, f]) => f(r)))]
  .map((line) => line.map(csvCell).join(","))
  .join("\r\n");
writeFileSync(new URL("watch-slate.csv", out), "﻿" + csv + "\r\n");

// Calendar of entertaining upcoming games.
const stamp = (iso) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s) => String(s).replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Football Watchability//Watch slate//EN", `X-WR-CALNAME:Entertaining games ${slate.period}`];
for (const g of slate.games.filter((x) => x.score >= 74)) {
  const end = new Date(Date.parse(g.date) + (g.league === "NFL" ? 195 : 210) * 60e3).toISOString();
  ics.push(
    "BEGIN:VEVENT",
    `UID:${g.espnId}@fbwatch.elskatemm.com`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(g.date)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(`${g.matchup} (${g.score}) · ${g.broadcast.split(" / ")[0]}`)}`,
    `DESCRIPTION:${esc(`${TIER[g.tier]} · ${g.narrative}`)}`,
    `LOCATION:${esc(g.broadcast)}`,
    "END:VEVENT",
  );
}
ics.push("END:VCALENDAR");
writeFileSync(new URL("entertaining.ics", out), ics.join("\r\n") + "\r\n");
console.log(`Exported ${rows.length} games (${slate.games.filter((x) => x.score >= 74).length} entertaining in the calendar).`);
