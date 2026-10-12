// Writes src/data/team-conferences.json: which conference every team is in, by logo id, from the team list the imperialism map is built on
// (src/data/imperialism.json). College conferences use the ids the slate's Conference filter uses; the NFL has "afc" and "nfc".
// Run it again after a realignment: node scripts/team-conferences.mjs
import { readFileSync, writeFileSync } from "node:fs";

const imp = JSON.parse(readFileSync(new URL("../src/data/imperialism.json", import.meta.url), "utf8"));
const CFB_IDS = {
  "Big 12": "big-12",
  SEC: "sec",
  "Big Ten": "big-ten",
  ACC: "acc",
  American: "american",
  CUSA: "c-usa",
  "C-USA": "c-usa",
  MAC: "mac",
  "Mountain West": "mountain-west",
  "Pac-12": "pac-12",
  "Sun Belt": "sun-belt",
  Independent: "independent",
};
const out = { CFB: {}, NFL: {} };
for (const t of imp.teams.CFB) if (CFB_IDS[t.conf]) out.CFB[t.logoId] = CFB_IDS[t.conf];
for (const t of imp.teams.NFL) if (t.conf === "AFC" || t.conf === "NFC") out.NFL[t.logoId] = t.conf.toLowerCase();
writeFileSync(new URL("../src/data/team-conferences.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
console.log(`${Object.keys(out.CFB).length} college teams, ${Object.keys(out.NFL).length} NFL teams`);
