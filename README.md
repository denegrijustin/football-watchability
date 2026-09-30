# Football Watchability

A static Vite + React + TypeScript dashboard, ready for Cloudflare Pages. One responsive codebase provides a three-column desktop board (two columns on smaller laptops) and single-column mobile cards. A sticky filter bar holds league, search, day, watchability and conference controls. Each card leads with kickoff, TV, both teams and the score/tier badge, then a one-line take and an "At stake" table of projected rank and playoff odds (now / with a win / with a loss). A collapsible "How to read a card" panel explains the scale.

## Run locally

Requires Node 22.12+ and pnpm 11.19.0 (the lockfile is committed).

```sh
pnpm install --frozen-lockfile
pnpm dev
```

On this Mac, the bundled Codex Node runtime can be used without installing system developer tools:

```sh
./scripts/local.sh dev
```

`local.sh` uses installed tools when available and falls back to Codex's bundled runtime. It does not change shell settings. Development listens on localhost only.

## Commands

- `pnpm dev` — development server with hot reload.
- `pnpm validate:data` — check every game, conference, embedded logo, history field and projection.
- `pnpm build` — data validation, strict TypeScript checking and production build in `dist/`.
- `pnpm preview` — serve the production build locally.
- `pnpm test` — browser tests against the production build at desktop and mobile sizes. First run `pnpm exec playwright install chromium`.
- `pnpm import:legacy` — recreate JSON from `source/original.html`; **overwrites weekly data edits**. Intended only for migration recovery.
- `pnpm deploy` — build and upload to the existing Cloudflare Pages project `football-watchability` after authentication.

## Automatic refresh

**Actions → Scheduled refresh** (`.github/workflows/refresh.yml`) updates the board at 8am Central on Tuesday, Thursday, Friday, Sunday and Monday. A week runs Tuesday through Monday (`scripts/slate-window.mjs`):

- **Tuesday** starts the new week. It first archives last week's late finals (Monday night) with `ARCHIVE_ONLY=1`.
- **Thursday** refreshes lines, weather and the forecasts.
- **Friday, Sunday and Monday** move finished games (Thursday's, Saturday's, Sunday's) to **Final**.

Each run fetches ESPN and Open-Meteo, runs every build step and the browser tests, commits the data to `slate-data` and copies the site files to `main`, which Cloudflare deploys. GitHub runs schedules in UTC from `main`, so the workflow has 13:02 and 14:02 UTC crons and a gate that keeps whichever is 8am in Chicago (daylight or standard time). Runs can start a few minutes late when GitHub is busy. To run it by hand, use **Run workflow** (optionally with a pretend date and with deploy switched off).

### Conference and overall rank

Every team shows a small rank line, such as "SEC #3 · #7 overall", on game cards and final cards, with a compact "SEC #3 · #7" on the TV grid. Conference rank is ESPN's conference standings order: the AFC/NFC seed order (1–16) for the NFL, the conference standings for college (independents show only the overall rank). Overall rank is the team's ESPN FPI rank (1–32 NFL, about 1–136 FBS). Hovering shows the full wording. For college, the record line drops its old conference place so the two don't disagree.

### TV grid

The **TV grid** view (`src/components/TvGrid.tsx`, data in `src/data/grid.ts`) lays out the week Thursday to Monday, one day at a time. On desktop, networks run down the side and time runs left to right; on phones, networks run across and time runs down. Networks go broadcast first, then ESPN, FOX cable, conference networks, other cable, then streaming, in half-hour steps (Eastern time). Each game is a block spanning its broadcast window (3¼ hours for NFL, 3½ for college), with the away and home team on their team colors. Entertaining games (74+) get a ring in their tier color and a filled score; Background games (below 64) are dimmed. A network with overlapping games (ESPN+) gets extra lanes. Finished games from the current week stay on the grid with the final score, and live games show the score and clock. Tapping a block opens the full game card (the same one as the main board) in a dialog.

### Live scores

`functions/api/scores.js` is a Cloudflare Pages Function: `/api/scores?league=nfl|cfb&date=YYYYMMDD` returns trimmed ESPN scores, cached at the edge for 30 seconds while games are live. `src/live.tsx` polls it every minute once a game on the board has kicked off (falling back to ESPN directly, which allows cross-origin requests) and stops when everything that has started is final. Cards show a Live or Final strip, and grid blocks show the score. The hourly check in **Scheduled refresh** then rebuilds within the hour of a final, moving the game to **Final** with its forecast vs actual readout.

### Insanity meter

`src/insanity.ts` scores how wild a game is (or was) from its home win-probability line: total swing, lead changes (with a dead band around 50%), how close it stayed late, the winner's worst moment (finals only) and overtime. The result is 0–100 with five tiers (Calm, Restless, Wild, Unhinged, Witching hour), and the busiest tenth of the game is shaded as the "witching hour". Finished games use the archived `wp` series in `results.json` (look-back, shown on Final cards, plus a "wildest" callout on each week header). Live games poll `/api/flow` (`functions/api/flow.js`, ESPN's summary win probability, cached 30 seconds, with a direct-ESPN fallback in `src/live.tsx`) every 45 seconds and add a Heating up / Cooling off trend; the meter appears on a card once the game starts.


**Insanity rankings.** The **Insanity** tab ranks finished games by insanity for NFL and college separately, for one week or the whole season, and lists every week with its average and wildest game (the highest-average week is marked "Most insane week"). It reads `src/data/season.json`, a permanent ledger with one compact row per finished game (score, tier, lead changes, biggest swing, comeback, overtime, witching-hour period). `results.json` only keeps the last two weeks, so each build (`scripts/build-slate.mjs`, via `scripts/season-ledger.mjs`) adds every archived final to the ledger by game id. To fill in weeks from before the archive started, run **Actions → Backfill insanity ledger** (or `START=20260908 END=20260923 node scripts/backfill-insanity.mjs`; START is the Tuesday that opens the first week). It scores every finished NFL and FBS game from ESPN's win-probability line and is safe to re-run. `src/insanity.js` is plain JS (with `insanity.d.ts`) so the site and these scripts share one scoring function.

### Insanity tab cards

Each ranked game on the **Insanity** tab is a compact card, shaded from the away team's color to the home team's, with both logos, the score, the insanity score and tier, a one-to-two sentence story of why it was wild (or flat), and the game's MVP (photo, position, team logo and stat line). Clicking a card opens its Game Center for the full detail, including games from earlier weeks that are no longer on the board (their details load live from ESPN). The MVP comes from ESPN's game leaders (passing, rushing, receiving, sacks, tackles for each team) by a simple impact score with a 25% edge for the winning side (`mvpOf` in `scripts/season-ledger.mjs`), and is stored with each game in `src/data/season.json`. **Backfill insanity ledger** can also be started by pushing `data-raw/backfill-request.json` to `slate-data`.
### Game Center

Clicking a game card's matchup (or its **Game Center** button) opens a full overlay for that game (`src/components/GameCenter.tsx`). Before kickoff it shows the projected score and winner with how the projection is built, both win-probability sources, and the season's advanced stats. From kickoff it loads the live game every 15 seconds from `functions/api/game.js` (a Cloudflare Pages Function that trims ESPN's game summary with `src/gameTrim.js`, cached 15 seconds at the edge, with ESPN directly as a fallback) and adds:

- **Scoreboard**: score, clock, down and distance, who has the ball, and the linescore.
- **Win probability** chart, play by play.
- **Momentum**: the win-probability swing over the last 12 plays and points over the last 6 drives.
- **Who's tilting the field**: each offense's share of snaps in enemy territory, overall and by quarter, plus time of possession (time on the field).
- **Team stats**: yards, yards per play, passing, rushing, first downs, turnovers, 3rd down, red zone, penalties.
- **Drive chart**: every drive as a bar from start to finish on the field, with its result.
- **Top 3 / bottom 3** per team, each player on a card in his team's color with the team logo, abbreviation, jersey number and position (from the team roster, which the Pages Function caches for 12 hours), ranked by a box-score impact score (yards, touchdowns and takeaways add; interceptions, fumbles, sacks taken and missed targets or kicks subtract; bottom 3 only counts involved players).
- **Player tracker**: passing, rushing, receiving and defense lines for each team.
- **Play-by-play** and scoring summary.

The NFL doesn't publish snap counts live, so time of possession stands in for time on the field. Finished games open the same view with the final data.

### Advanced stats

`scripts/fetch-advanced.mjs` saves NFL Next Gen Stats (passing, rushing and receiving statboards) and ESPN QBR for the NFL and FBS to `data-raw/advanced.json`. The builder adds each team's FPI efficiencies (overall, offense, defense, special teams, each with a rank), NFL EPA per game, strength-of-schedule and game-control ranks, the starting QB's QBR and rank, and for the NFL the QB's completion % over expected, time to throw and aggressiveness, the lead rusher's rush yards over expected, and the lead receiver's separation. Cards show a one-line **Matchup** (each offense's rank against the other defense's) and an **Advanced stats + rankings** panel, with the better side highlighted; final cards have the panel too. College has no public tracking data, so QBR and FPI efficiencies stand in for Next Gen Stats.

### Weekend export

`scripts/export-slate.mjs` (run in the refresh after the notes) writes `public/exports/watch-slate.csv` (every game Thursday–Monday by kickoff: TV, watchability, tier, projected score, win probability, line, venue, weather, take, and finals with actual watchability) and `public/exports/entertaining.ics` (a calendar of the 74+ games). On the **TV grid**, **Download JPG** saves the current day, or the **Full weekend**, as an image of the grid itself (`src/exportJpg.ts`), following the grid's league and "Entertaining only" filters and the viewer's time zone. The weekend image uses one time axis for every day, so a given kickoff time is the same column on Thursday through Monday (8 PM Saturday sits directly above 8 PM Sunday).

### Time zone

Times show in Central by default. The clock menu in the header switches to Eastern, Mountain, Arizona, Pacific, Alaska or Hawaii (`src/tz.ts`); the choice is remembered in that browser. Cards, finals, the weather strip, the TV grid and the JPG all follow it. The written notes and the spreadsheet use Central.

### Forecast vs actual

`scripts/score.mjs` scores every game on one absolute 0–100 scale, before and after:

- **Forecast:** 35 base points, plus team quality (FPI, up to 27), competitiveness (win probability, 19), playoff stakes (15), marquee matchup (ranked vs ranked, or NFL records and division games, 6) and TV window (3). Each FCS team costs 12.
- **Actual:** 35 base points, plus the finish (final margin and overtime, 21), drama (lead changes and ESPN's win-probability swings, 17), late tension (how much of the 4th quarter was in doubt, 11), stakes and quality carried from the forecast (10), surprise (upset or comeback, 7) and fireworks (combined points, 4).

The last forecast before kickoff is frozen in `src/data/forecasts.json` with its take. Once a game is final, the builder writes `src/data/results.json` (the two most recent weeks). It holds the final score and linescore, forecast and actual scores with their component breakdowns, a readout explaining the gap, and a thinned win-probability line. The Sept. 24–28 forecasts are the scores published at the time. They came from the older rescaled formula, so they have no breakdown.

## Manual data updates

The slate is built from ESPN data rather than typed in by hand. ESPN is fetched by GitHub Actions, because it isn't reachable from every environment.

1. **Fetch.** On the `slate-data` branch, set `data-raw/request.json` to the week's dates (`{"start":"20261001","end":"20261005"}`) and push, or run **Actions → Fetch slate data** with those dates. The workflow runs `scripts/fetch-slate.mjs` (schedules, TV, lines, records, standings, AP poll, FPI, matchup predictor, season leaders, ESPN and Open-Meteo weather) and `scripts/fetch-history.mjs` (ESPN head-to-head results since 2004), then commits `data-raw/`. Then run **Actions → Fetch all-time history** (or push `data-raw/alltime/phase.txt` containing `full`). It runs `scripts/fetch-alltime.mjs`, which saves each college matchup's Winsipedia page and FiveThirtyEight's NFL game file (every game from 1920 to 2017). The builder merges these with ESPN results so every series is complete through the latest season.
2. **Build.** `node scripts/build-slate.mjs` (the period label comes from the game dates; `RAW_DIR` builds from another folder) writes `src/data/slate.json` and `src/data/team-ids.json`. Put corrections ESPN hasn't posted yet (a TV network, say) in `src/data/slate-overrides.json`, keyed by ESPN event id.
3. **Logos.** Pushing a changed `team-ids.json` to `slate-data` runs **Upgrade logos**, which fetches only teams that don't have a logo yet. ESPN ids overlap across leagues, so logos are matched by league plus id.
4. **Notes.** Write one-line takes in `src/data/headlines.json` (keyed by ESPN event id), then run `node scripts/write-narratives.mjs` (below).
**Weather look-ahead:** `scripts/fetch-weather.mjs` pulls Open-Meteo's hourly forecast for each venue. It takes a few seconds, so run **Actions → Fetch weather** the day before games, rebuild, and ship. Each outdoor card shows four readings across the game window (about one per quarter): temperature, rain chance and wind or gusts. It also shows an impact rating (none, low, moderate or high) based on wind, rain, thunderstorms, snow, and heat or cold, plus plain-language effects (kicking, ball security, stamina) and how confident the forecast is based on days out.
**Season trends:** `scripts/fetch-trends.mjs` (in the weather job and the full fetch) saves every team's completed games this season from ESPN. Cards show a "Form this season" chart (scoring margin per game, wins above the line in blue and losses below in red, on one scale for both teams, with a tooltip per game). A **Season trends** panel adds points for and against per game, average margin, last-3 margin, a larger chart and a game-by-game table. Hot offenses, stingy defenses, streaks and margin gaps also feed the watch/skip notes.

**Network logos:** the builder records each game's network in `src/data/network-ids.json`. **Upgrade logos** fetches missing ones: ESPN's logo when it has one, otherwise a public-domain file from Wikimedia Commons (mapped in `COMMONS` inside `upgrade-logos.mjs`). Logos show on a light chip; a network with no reliable logo (currently BTN) keeps the TV icon.
5. **Check and ship.** `pnpm build`, look at the board, then copy the source changes (not `data-raw/`) to `main`.

How the numbers are made:
- "Now" playoff odds are ESPN FPI. With-a-win and with-a-loss odds are estimated so that their average, weighted by ESPN's win probability, equals FPI.
- AP rank is the current poll. The NFL "PR" is the FPI rank. Rank moves after a win or a loss are rule-of-thumb estimates.
- Projected score blends the betting line (spread and over/under, 65%) with season scoring (each offense's points per game against the other defense's points allowed, shrunk toward the league average early in the season, 35%). It adds home field to the season part (NFL 1.8, college 2.8 points of margin) and takes points off the total for wind, rain, snow, storms, cold and heat. The blend is then rounded to the nearest pair of standard football scores (made of touchdowns and field goals, like 17, 20, 23, 24 or 27 but not 22, 25 or 29) that keeps the projected winner. Each card's "How it's built" lists the pieces. It is frozen at kickoff; after the game, **Score: projected vs final** grades the call (winner, margin miss, total miss, each team's points, the quarter where it broke, and whether the favorite covered and the over or under hit).
- Pregame win probability shows ESPN's matchup predictor and the sportsbook moneyline with the vig removed, plus how it has moved since the first refresh of the week (`wpHistory` in `forecasts.json`).
- Watchability is an absolute score; see **Forecast vs actual** above and `scripts/score.mjs`. Hand-written takes whose numbers no longer match the data are replaced with generated ones.

Game fields:

| Field | Contents |
| --- | --- |
| `espnId`, `league`, `conferences` | ESPN event id; `NFL` or `CFB`; college conference ids from the top-level list. |
| `score`, `tier`, `delta`, `breakdown` | Watchability forecast 0–100, color tier (`elite`, `vgood`, `good`, `watch`, `bg`), change since the previous refresh (`new` for a fresh slate), and the base plus components behind the score. |
| `matchup`, `meta`, `chips`, `broadcast`, `network` | Matchup, kickoff (ET) · tier · line · venue, rating tags, TV/streaming. |
| `weather` | Icon, title, detail, `impact`/`level`, `effects` (plain-language impacts), `hours` (four game-window readings) and `confidence`. |
| `teams` | Two teams: `name`, `logoId`, `espnId`, `abbr`, `record`, `rankings`, `playoffOdds` (arrays ordered now, win, loss), `trend` (this season's games and averages). |
| `narrative`, `watch`, `skip`, `narrativeChips` | One-line take, why-watch and why-skip reasons, and supporting tags (generated; see below). |
| `history` | All-time series (record, meeting count, first meeting), last five meetings, key players (season leaders), `games` (every meeting, newest first) and source. |

### Watch / skip notes

Each card's one-line take and its **Why watch / Why skip** lists come from `node scripts/write-narratives.mjs`. The script writes specific reasons from facts already in the slate: spread and total, poll and playoff-odds swings, standings, series history, named players, weather, channel and overlapping kickoffs. Nothing is invented, and phrasing is rotated so cards don't repeat each other. One-line takes are hand-written in `src/data/headlines.json`, keyed by game `id`. Games without an entry get a generated take. After replacing the slate, update or clear `headlines.json`, rerun the script, and check the output. `pnpm validate:data` fails if any game is missing reasons or if any note appears on two cards.

Game fields:

| Field | Contents |
| --- | --- |
| `league`, `conferences` | `NFL` or `CFB`; college conference IDs from the top-level list. A game can belong to multiple conferences. |
| `score`, `tier`, `delta` | Editorial 0–100 watchability, color tier (`elite`, `vgood`, `good`, `watch`, `bg`), change from the prior rating. |
| `matchup`, `meta`, `chips`, `broadcast`, `network` | Team matchup, supplied kickoff/venue/line text, rating tags and TV/streaming availability. Include the timezone in kickoff text. |
| `weather` | Icon, outlook title, descriptive detail and impact text. |
| `teams` | Exactly two team objects: `name`, `logoId`, `record`, `rankings`, `playoffOdds`. Both arrays are ordered **now, win, loss**. Odds are numeric percentages (0–100). |
| `narrative`, `watch`, `skip`, `narrativeChips` | One-line take, why-watch and why-skip reasons, and supporting tags (generated; see below). |
| `history` | Three labeled boxes for all-time series, recent meetings and key players/units; source attribution. Each box has `label`, `value`, `items`. First meetings must be stated explicitly. |

`src/data/logos.json` maps stable team IDs to logo files in `public/logos/` (128px WebP built from ESPN's 500px dark-background logos; sources in `src/data/logo-sources.json`). For a new team, add its `logoId` to the slate and run the **Upgrade logos** GitHub workflow (Actions → Upgrade logos → Run workflow), or `node scripts/upgrade-logos.mjs` on a machine with internet access; add an ESPN team ID to `OVERRIDES` in that script if a name is ambiguous. Data-URI logos are still accepted. No external image host or font is needed at runtime. Images use descriptive surrounding team text with decorative empty alt attributes.

`src/data/index.ts` exports data types and filtering logic. UI components live in `src/components/`; the responsive design lives in `src/styles.css`. There is no injected legacy HTML and no server or secret in the browser bundle.

## Data provenance

The migration preserves **87 games (16 NFL, 71 college), 174 logo images, 87 populated history sections and 87 broadcast entries** from the supplied `football_watchability_full_history_tv.html`. Twelve college controls include All FBS and eleven conference filters. The original file and its SHA-256 are retained for auditability. Six original PNGs had corrupt palette chunks (Missouri, Georgia, Clemson, UConn, Charlotte and Tulsa); their matching ESPN logos were embedded as replacements, with source URLs in `src/data/logo-repairs.json`. All other logo data is unchanged. `node scripts/check-migration.mjs` verified the initial migration against the source (it predates the logo upgrade and will now report logo differences) and is intentionally separate from weekly validation. Rerunning the legacy importer restores the corrupt originals; run `node scripts/repair-logos.mjs` afterward to reapply the documented repair (network required). The first slate (Sept. 24–28) was migrated from a supplied file; later slates are built from ESPN data as described above. The original wording may contain inconsistencies. The app labels the board as the **Sept. 24–28, 2026 saved slate** and labels scenario values as projections. There is no live sports feed; the board refreshes on the schedule above.

## Cloudflare Pages

The build configuration is in `wrangler.jsonc`; Pages response headers are in `public/_headers`. The app uses only static assets and does not require paid services, bindings or environment secrets.

### GitHub-connected deployment (recommended)

1. In Cloudflare, open **Workers & Pages → Create application → Pages → Import an existing Git repository**.
2. Select this repository, branch `main`, root directory `/`.
3. Set build command `pnpm build`, output directory `dist`, and `NODE_VERSION=22` if needed. Save and deploy.

The committed `packageManager` pins pnpm. Cloudflare rebuilds on pushes; pull requests receive preview deployments. If the GitHub connection asks for repository access, grant access to this repository only.

### Direct upload alternative

```sh
pnpm exec wrangler login
pnpm exec wrangler pages project create football-watchability --production-branch main
pnpm deploy
```

Choose either Git integration or direct upload when creating the Cloudflare project. A direct-upload project cannot later be converted to Git integration; create a separate project if switching workflows. Git integration is preferable for weekly updates. Do not put API tokens in the repository.

References: [Cloudflare Vite build settings](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/), [Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/), [Direct upload](https://developers.cloudflare.com/pages/get-started/direct-upload/).

## Validation

Browser tests cover all conference filters, both leagues, searching, empty-state recovery, closed-by-default and expandable details, embedded image decoding, responsive column counts, mobile sticky controls and horizontal overflow. Production bundles are inspected at 1440px desktop and 390px mobile; narrow phones should also be checked after layout changes. Test output is ignored by Git. The GitHub workflow repeats validation, build and browser tests.
