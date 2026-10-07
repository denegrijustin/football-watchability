# Imperialism Map: data contract

Everything below is the contract between the Python engine (`scripts/imperialism/`) and the React map
(`src/components/ImperialismMap.tsx`). Do not change it without changing both sides.

## Inputs (read by `build.py`)

* `scripts/imperialism/counties.json` — `[{id: "01001", name, lat, lon}]`, 3,142 US counties sorted by FIPS id. A
  county's **index in this list** is how every other file refers to it. `lat/lon` is the county centroid.
* `scripts/imperialism/stadiums.json` — `{ "CFB": {"<espnTeamId>": {stadium, lat, lon}}, "NFL": {...} }` home-stadium
  coordinates by ESPN team id.
* `data-raw/cfb-teams.json`, `data-raw/nfl-teams.json` — ESPN team lists (`sports[0].leagues[0].teams[].team`: `id`,
  `displayName`, `abbreviation`, `color`, `alternateColor` (hex without `#`), `logos[].href`).
* `data-raw/cfb-fpi.json`, `data-raw/nfl-fpi.json` — each `teams[].team.group` gives the conference (college: `group.name`,
  `shortName`; Sun Belt East/West → one "Sun Belt") or, for the NFL, the division (`group.name` = "NFC West",
  `group.parent.abbreviation` = "NFC"). Use `scripts/imperialism/team-index.json` for the id → name → group list.
* `data-raw/cfb-finals.json`, `data-raw/nfl-finals.json` — `{season, fetchedAt, games: [{id, week, weekLabel, postseason,
  date, home, away, homeScore, awayScore}]}`; `home`/`away` are ESPN team ids; `week` is 1-based and postseason weeks follow the
  regular season. A game whose team id is not in the league's team list (an FCS opponent) is ignored. Ties move no land.

## Output: `src/data/imperialism.json`

```jsonc
{
  "version": 1,
  "season": 2026,
  "generatedAt": "2026-10-07T13:00:00Z",
  "counties": ["01001", "01003", ...],          // FIPS, same order as counties.json
  "teams": {                                    // metadata, per league
    "CFB": [{ "id": "61", "name": "Georgia Bulldogs", "abbr": "UGA", "color": "#ba0c2f", "altColor": "#000000",
              "logo": "https://a.espncdn.com/...", "logoId": "georgia"|null, "conf": "SEC", "division": null,
              "stadium": "Sanford Stadium", "lat": 33.95, "lon": -83.373 }],
    "NFL": [{ ..., "conf": "NFC", "division": "NFC South" }]
  },
  "weeks": {                                    // week 0 is "Start" (the initial split), then one entry per game week
    "CFB": [{ "n": 0, "label": "Start" }, { "n": 1, "label": "Week 1" }, ...],
    "NFL": [...]
  },
  "maps": {
    "CFB": { "national": Layer, "conference": ConferenceLayer },
    "NFL": { "full": Layer, "AFC": Layer, "NFC": Layer }
  }
}
```

`Layer` — one independent logic space:

```jsonc
{
  "id": "national", "label": "National map", "league": "CFB",
  "teams": ["61", ...],                         // team ids in this space
  "home": ["61", "61", ...],                    // original home team id of every county (nearest stadium among `teams`)
  "ledger": [{                                  // chronological; EVERY game between two teams of this space, in order
    "week": 3, "game": "401...", "date": "2026-09-13T16:00Z", "winner": "61", "loser": "99",
    "score": "31-17",
    "transferred": [12, 40, ...]                // county indexes the loser held and the winner absorbed ([] = loser was landless)
  }],
  "weeks": [{                                   // snapshot summary after each week (week 0 = initial split)
    "n": 0, "label": "Start",
    "holdings": { "61": 41, "99": 17 },         // team id -> number of counties held (landless teams omitted)
    "landless": ["03"]                          // team ids holding nothing
  }],
  "current": ["61", "61", "04", ...]            // owner team id of every county after the last game (full state, for fast first paint)
}
```

Any week's full map is `home` plus the ledger entries up to that week (`for t in ledger: owners[c] = t.winner for c in t.transferred`).

`ConferenceLayer` — college only, a *view* of the national run (same ledger and state), with
`{ "id": "conference", "label": "Conference map", "league": "CFB", "base": "national", "native": ["SEC", "Big Ten", ...],
"weeks": [{ "n": 0, "label": "Start", "byConf": { "SEC": { "native": 410, "captured": 12, "held": 398 }, ... } }] }`.
`native[i]` is the conference of county i's original home team. A county is **native-held** when its current owner's conference
equals `native[i]`, otherwise it is **captured out-of-conference**. Per conference: `native` = counties whose home team
belongs to it, `captured` = of those, counties currently held by another conference's team, `held` = native - captured.
Independents count as their own conference "Independent".

## Rules the engine implements

1. Week 0: each county belongs to the layer team whose stadium is nearest (great-circle distance).
2. Games run in date order (then id). Loser's land (all counties it owns at that moment) goes to the winner. A landless loser
   transfers nothing. A landless winner that beats a land-holder takes all of it (that is how teams re-enter).
3. A game only affects a layer if both teams belong to it: CFB national = all FBS teams; NFL full = 32; AFC = the 16 AFC teams
   (only AFC-vs-AFC games); NFC likewise.
