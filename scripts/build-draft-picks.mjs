// Builds src/data/draft-picks.json: which club owns which picks in the next NFL draft, from nflverse's trades list (every trade, with the picks in it).
//   node scripts/build-draft-picks.mjs      (network required; run in Actions)
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { nextDraftSeason, ownership, parseCsv } from "./trade/picks.mjs";

const OUT = new URL("../src/data/draft-picks.json", import.meta.url);
const URL_ = "https://github.com/nflverse/nflverse-data/releases/download/trades/trades.csv";
const res = await fetch(URL_);
if (!res.ok) throw new Error(`trades.csv ${res.status}`);
const rows = parseCsv(await res.text());
if (rows.length < 3000) throw new Error(`trades.csv has only ${rows.length} rows`);
const season = nextDraftSeason();
const { byTeam, conditional, asOf } = ownership(rows, season);
const total = Object.values(byTeam).reduce((a, l) => a + l.length, 0);
if (total !== 224) throw new Error(`expected 224 picks, found ${total}`);
const out = { version: 1, season, asOf, builtAt: new Date().toISOString(), source: "nflverse trades list", byTeam, conditional };
if (existsSync(OUT)) { const old = JSON.parse(readFileSync(OUT, "utf8")); out.builtAt = JSON.stringify({ ...old, builtAt: 0 }) === JSON.stringify({ ...out, builtAt: 0 }) ? old.builtAt : out.builtAt; }
writeFileSync(OUT, JSON.stringify(out));
console.log(`draft-picks: ${season} draft, trades through ${asOf}, ${conditional.length} conditional picks left out`);
for (const t of ["KC", "SF", "LA"]) console.log(t, byTeam[t].map((p) => `R${p.round}${p.from === t ? "" : `(${p.from})`}`).join(" "));
