// Turns a contracts export you are licensed to use into the two override files the trade finder reads.
//   node scripts/import-trade-overrides.mjs --contracts path/to/contracts.csv [--cap path/to/cap-space.csv]
//
// contracts.csv columns (any order, header names matched loosely): Player, Team, APY (or Cap Hit), Guaranteed (optional), Years (years left, optional)
// cap-space.csv columns: Team (abbreviation or name), Cap Space (dollars or millions)
//
// Over the Cap and Spotrac forbid copying their data into another site or database, so nothing from them is included in this repo. Use this only with
// data whose licence lets the site show it (a paid data API, or figures you keep yourself), because the output is published with the site.
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z]/g, "").replace(/(jr|sr|ii|iii|iv)$/, "");

/** Parses CSV text (quotes, commas inside quotes, CRLF) into rows of objects keyed by the header. */
export function parseCsv(text) {
  const rows = []; let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim() !== ""));
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

const pick = (row, ...names) => {
  for (const key of Object.keys(row)) if (names.some((n) => norm(key) === norm(n))) return row[key];
  return "";
};
/** "$12,500,000", "12.5M" and "12500000" all mean twelve and a half million dollars. */
export function dollars(x) {
  const s = String(x).trim().replace(/[$,\s]/g, "");
  if (!s || s === "-") return 0;
  const m = /^([\d.]+)([mk]?)$/i.exec(s);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  return m[2].toLowerCase() === "m" ? n * 1e6 : m[2].toLowerCase() === "k" ? n * 1e3 : n;
}

export function contractsFrom(rows) {
  const players = {};
  for (const r of rows) {
    const name = pick(r, "player", "name", "player name");
    const apy = dollars(pick(r, "apy", "cap hit", "average", "avg salary", "cap number"));
    if (!name || !apy) continue;
    players[norm(name)] = { apy, gtd: dollars(pick(r, "guaranteed", "gtd", "total guaranteed")), years: Math.max(1, parseInt(pick(r, "years", "years left", "length", "yrs"), 10) || 1) };
  }
  return players;
}

export function capFrom(rows) {
  const teams = {};
  for (const r of rows) {
    const t = pick(r, "team", "abbr", "abbreviation");
    const space = dollars(pick(r, "cap space", "space", "cap room", "effective cap space"));
    if (!t) continue;
    teams[t.toUpperCase()] = Math.round((space > 1000 ? space / 1e6 : space) * 10) / 10;
  }
  return teams;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file://").href) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith("--") ? [...a, [x.slice(2), all[i + 1]]] : a), []));
  if (!args.contracts && !args.cap) { console.log("Usage: node scripts/import-trade-overrides.mjs --contracts contracts.csv [--cap cap-space.csv]"); process.exit(1); }
  if (args.contracts) {
    const file = new URL("src/data/contract-overrides.json", root);
    const old = JSON.parse(readFileSync(file, "utf8"));
    old.players = contractsFrom(parseCsv(readFileSync(args.contracts, "utf8")));
    writeFileSync(file, JSON.stringify(old, null, 2) + "\n");
    console.log(`${Object.keys(old.players).length} contracts written to src/data/contract-overrides.json`);
  }
  if (args.cap) {
    const file = new URL("src/data/team-cap-overrides.json", root);
    const old = JSON.parse(readFileSync(file, "utf8"));
    old.teams = capFrom(parseCsv(readFileSync(args.cap, "utf8")));
    writeFileSync(file, JSON.stringify(old, null, 2) + "\n");
    console.log(`${Object.keys(old.teams).length} clubs written to src/data/team-cap-overrides.json`);
  }
  console.log("Run `node scripts/build-trade-data.mjs` to rebuild the trade finder's data with them.");
}
