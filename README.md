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

Each run fetches ESPN and Open-Meteo, runs every build step and the browser smoke checks (tests tagged `@smoke`; they must pass to publish), commits the data to `slate-data` and copies the site files to `main`, which Cloudflare deploys. GitHub runs schedules in UTC from `main`, so the workflow has 13:02 and 14:02 UTC crons and a gate that keeps whichever is 8am in Chicago (daylight or standard time). The full browser suite also runs in the refresh but is advisory there, because `check.yml` already runs it on every push and pull request and a test that happens to depend on this week's games must not hold back fresh data (that is what stopped refreshes for two days in October). Runs can start a few minutes late when GitHub is busy. To run it by hand, use **Run workflow** (optionally with a pretend date and with deploy switched off).

### Conference and overall rank

Every team shows a small rank line, such as "SEC #3 · #7 overall", on game cards and final cards, with a compact "SEC #3 · #7" on the TV grid. Conference rank is ESPN's conference standings order: the AFC/NFC seed order (1–16) for the NFL, the conference standings for college (independents show only the overall rank). Overall rank is the team's ESPN FPI rank (1–32 NFL, about 1–136 FBS). Hovering shows the full wording. For college, the record line drops its old conference place so the two don't disagree.

### TV grid

The **TV grid** view (`src/components/TvGrid.tsx`, data in `src/data/grid.ts`) lays out the week Thursday to Monday, one day at a time. On desktop, networks run down the side and time runs left to right; on phones, networks run across and time runs down. Networks go broadcast first, then ESPN, FOX cable, conference networks, other cable, then streaming, in half-hour steps (Eastern time). Each game is a block spanning its broadcast window (3¼ hours for NFL, 3½ for college), with the away and home team on their team colors. Entertaining games (74+) get a ring in their tier color and a filled score; Background games (below 64) are dimmed. A network with overlapping games (ESPN+) gets extra lanes. Finished games from the current week stay on the grid with the final score, and live games show the score and clock. Tapping a block opens the full game card (the same one as the main board) in a dialog.

### Games board

The **Games** tab is one board in three sections, always in this order: **In progress** (kicked off, not final), **Completed** (finished games, newest week first, each with its forecast vs actual card), then **Upcoming**. A **Status** filter (All, In progress, Completed, Upcoming, each with a count) shows one section on its own; the other filters (league, conference, search, day, watchability) apply across all three. Under **All**, Completed shows its first 12 games with a "Show all" button so Upcoming stays within reach. A game's section comes from the live feed (`useLive` in `src/live.tsx`): in progress, just finished (shown in Completed as a card with its final score until the next refresh archives it), or still ahead. If the feed is unavailable, the clock decides: kicked off within the last 4.5 hours counts as in progress, longer ago as finished. `gameStatus` in `src/live.tsx` is the single rule; `src/components/GameBoard.tsx` builds the sections.

Overlays (Game Center and the TV grid's game detail) open fixed to the screen, scroll inside themselves, lock the page behind them and put the page back where it was on close (`src/modal.ts`). Dialogs are sized with `dvh` so the bottom is never hidden behind a phone's address bar. Don't give `.gc` a `position` rule: the browser's `position: fixed` for modal dialogs is what keeps it on screen.

### Live scores

`functions/api/scores.js` is a Cloudflare Pages Function: `/api/scores?league=nfl|cfb&date=YYYYMMDD` returns trimmed ESPN scores, cached at the edge for 30 seconds while games are live. `src/live.tsx` polls it every minute once a game on the board has kicked off (falling back to ESPN directly, which allows cross-origin requests) and stops when everything that has started is final. Live and just-finished cards show a status row above the team names (a red LIVE pill with the quarter and clock, or FINAL, parsed from ESPN's status text by `src/liveStatus.ts`) and each team's score beside its logo and name; archived completed cards put the final score beside each team name too, followed by the quarter-by-quarter line. Grid blocks show the score. The hourly check in **Scheduled refresh** then rebuilds within the hour of a final, moving the game to **Completed** with its forecast vs actual readout.

### Attendance

Completed game cards show the announced attendance, and when the stadium's capacity is known, the share of capacity as a bar and as text ("93% of 107,601 capacity"; orange under 60%, gold to 90%, green above, and the bar stops at full width for standing-room crowds). Attendance comes from ESPN's game info (`gameInfo.attendance`), recorded when a final is archived (`scripts/build-slate.mjs`). Capacity needs another source: ESPN's venue endpoint names each stadium and gives its city and state but **publishes no capacity** (checked against all 98 stadiums used so far). `scripts/attendance.mjs` therefore reads ESPN for the stadium's name and state, then fills the capacity from `scripts/venue-capacity-seed.json` (capacities keyed by ESPN venue id, taken from roadtocfb.com for college and a published NFL stadium guide; a stadium with a different capacity per league, like Raymond James, is left out) then from `scripts/venue-capacity-alt-sites.json` (overseas, neutral-site and alternate-home stadiums such as Aviva, Cotton Bowl and Yankee Stadium, kept for future games and matched by name or alias, plus state for US sites; ranges, records and stale names are marked `approximate` and never used) and finally from Wikipedia's maintained lists (List of current NFL stadiums, List of NCAA Division I FBS football stadiums, and the FCS list; parsing and matching in `scripts/venue-capacity.mjs`) and saves `public/venues.json` (`{ venueId: { name, city, state, capacity, source } }`), which the page reads at runtime. A stadium is matched by name; a name that several stadiums share (Memorial Stadium, Tiger Stadium) is matched by state; anything without exactly one clear match keeps no capacity and shows the attendance number only, never a guess. The script's log lists the stadiums it couldn't match so they can be reviewed; the card's percentage has a tooltip crediting Wikipedia. The same script fills in attendance for games archived before it was recorded and keeps retrying a game until ESPN publishes a number (or gives up after 3 days). The scheduled refresh runs it; **Actions → Fetch attendance and capacity** runs it on demand.

### Insanity meter

`src/insanity.ts` scores how wild a game is (or was) from its home win-probability line: total swing, lead changes (with a dead band around 50%), how close it stayed late, the winner's worst moment (finals only) and overtime. The result is 0–100 with five tiers (Calm, Restless, Wild, Unhinged, Witching hour), and the busiest tenth of the game is shaded as the "witching hour". Finished games use the archived `wp` series in `results.json` (look-back, shown on Final cards, plus a "wildest" callout on each week header). Live games poll `/api/flow` (`functions/api/flow.js`, ESPN's summary win probability, cached 30 seconds, with a direct-ESPN fallback in `src/live.tsx`) every 45 seconds and add a Heating up / Cooling off trend; the meter appears on a card once the game starts.


**Insanity rankings.** The **Insanity** tab ranks finished games by insanity for NFL and college separately, for one week or the whole season, and lists every week with its average and wildest game (the highest-average week is marked "Most insane week"). It reads `src/data/season.json`, a permanent ledger with one compact row per finished game (score, tier, lead changes, biggest swing, comeback, overtime, witching-hour period). `results.json` only keeps the last two weeks, so each build (`scripts/build-slate.mjs`, via `scripts/season-ledger.mjs`) adds every archived final to the ledger by game id. To fill in weeks from before the archive started, run **Actions → Backfill insanity ledger** (or `START=20260908 END=20260923 node scripts/backfill-insanity.mjs`; START is the Tuesday that opens the first week). It scores every finished NFL and FBS game from ESPN's win-probability line and is safe to re-run. `src/insanity.js` is plain JS (with `insanity.d.ts`) so the site and these scripts share one scoring function.

### Key players

Each upcoming card's **History + key players** section lists both teams' season leaders (passing, rushing, receiving and a pass rusher or tackler) as player cards in team colors: photo, name, position, team logo and abbreviation, jersey number and stat line. They come from ESPN's season leaders in each game summary (`leaderCards` in `build-slate.mjs`), stored as `players` on the Key players box.

### Outlook: rankings and projections

The **Outlook** tab shows a composite college ranking (top 120), the projected 12-team College Football Playoff field, a bowl-eligibility picture and the projected NFL playoff field. Everything comes from the ESPN FPI feeds the refresh already fetches (`data-raw/cfb-fpi.json`, `nfl-fpi.json`), which carry each team's AP, Coaches and CFP rank, projected record and odds, so nothing is simulated here. `scripts/build-outlook.mjs` (rules and maths in `scripts/outlook-lib.mjs`) writes `src/data/outlook.json`.

- **Composite rank:** every FBS team is ranked; the tab lists the top 120 or any one conference (rank within the conference, overall rank, polls and ESPN's conference-title odds). The rank is the average of a team's AP, Coaches and ESPN FPI rank; a team outside a poll's top 25 counts as 30. A poll that has not been published is left out, and when the committee's CFP ranking appears (late in the season) it joins and counts double. This stands in for a CBS-style top 120; CBS's own ranking is not a feed the site can read.
- **College playoff field:** the five highest-ranked projected conference champions (the likeliest champion in each conference by FPI's title odds; the Sun Belt's two ESPN groups count as one; independents cannot win a conference) plus the next best teams, 12 in all, seeded straight by composite rank, with seeds 1-4 getting byes. If the format changes, edit `FORMAT` in `outlook-lib.mjs`.
- **Bowls:** teams already at six wins or with FPI's chance of six wins at 50% or better count as on track; 20-50% are listed as the bubble. Projected bowl-by-bowl matchups are not built because they need each bowl's conference tie-ins, which no feed here provides.
- **NFL seed grid:** each conference is a grid of its 16 teams against seeds 1-7, with the playoff and division odds; the shaded #1 column is the chance at the only first-round bye. The odds come from playing out the rest of the season 20,000 times (`simulateNfl`): the schedule is `data-raw/nfl-schedule.json` (`scripts/fetch-nfl-schedule.mjs`, ESPN's scoreboard by week), each game goes to the better ESPN FPI team with a home-field edge (normal margin, standard deviation 13.5, home edge 2 points), and seeds follow the real format. Tiebreakers are coin flips rather than head-to-head, and the run is skipped (the page falls back to ESPN's own odds and a seeded list) if the schedule does not account for the whole 272-game season. A snapshot built without a schedule is rebuilt as soon as one exists.
- **Refresh:** college is rebuilt once each Sunday after 8am Central and the NFL once each Tuesday after 8am Central (`cycleKey`); any other run keeps the saved snapshot, and an empty feed never replaces one. The cards say which week they were built for.
- **Default league:** the site opens on college. From Sunday 12am Central until the Tuesday 8am refresh it opens on the NFL (`src/league.ts`). `?league=NFL` or `?league=CFB` in the address overrides it.

### Compact cards

Every game card (upcoming, live and completed) opens as a minimal strip about 105px tall: both team logos and names, each team's score once the game has started, the watchability rating, and one small line (kickoff time, or LIVE with the quarter and clock, or FINAL). Everything else is behind the chevron: network, records and ranks, venue, line, weather, announcers, the take, projected score, win probability, injuries, form, the insanity meter, and on completed cards the attendance bar, the quarter-by-quarter line, projected vs final, forecast vs actual and why it scored. A tap anywhere on the strip (or the chevron) opens the card in place; **Less ▴** collapses it, and on an opened card a click on the matchup opens the Game Center. Cards opened from the TV grid start expanded. On narrow screens NFL names show just the nickname (`src/teamName.ts`).

### Filter bar

The persistent bar is one slim row of pop-down menus (league, status, day, watchability, and conference for college) plus search, about 47px on desktop and two short rows (about 91px) on a phone, down from about 180px. Menus are native selects, so they use the phone's own picker, and their text is 16px on phones so iOS doesn't zoom the page. Counts per status are in the heading line under the tabs.

### Announcers

Cards show the broadcast crew on a 🎙️ line under the venue and line, on the compact card too: play-by-play and analysts, then the sideline reporter (hover for each role). Finals keep the crew that called the game. `scripts/fetch-announcers.mjs` reads ESPN's college football commentator schedule (every ESPN-family game, posted early in the week) and Awful Announcing's weekly NFL and college football announcing schedules from its schedules RSS feed (`awfulannouncing.com/category/schedules/feed`, which carries each article's full text), parses each game paragraph ("**Away at Home (time, Network):** Name (play-by-play), Name (analyst), Name (reporter)"), matches it to the ESPN game by both team names within the week, and writes `data-raw/announcers.json`. The NFL list usually posts Wednesday and the college list Thursday, so they land with the Thursday and Friday refreshes (and the game-day rebuilds on Saturday). Games the schedule lists as TBD, or that it doesn't cover, show no crew line. Each announcer gets a small round photo from `scripts/fetch-announcer-photos.mjs`, which tries in order: (1) the lead image of the person's Wikipedia article, if freely licensed (the article's short description is checked so a namesake isn't picked); (2) the network's official press-room headshot (ESPN Press Room, Paramount Press Express for CBS, Fox Sports Press Pass, NBC Sports Pressbox), starting with the network the person works for that week; (3) a Wikimedia Commons file, only when it sits in a broadcasting or football category. Photos are resized to 120×150 in `public/announcers/`, credited in the hover text, and cached in `data-raw/announcer-photos.json` (with a lookup log in `announcer-photos-log.json`). Announcers with no photo show initials; misses are retried every two weeks.

### Injury report

NFL cards have an **Injury report** section (header shows counts per team) listing each team's players who are Out, Doubtful or Questionable with photo, position and injury (for example "Questionable · Josh Allen QB · Left Knee"), plus a line of players on IR or PUP. When a key player (a season leader) is on the report, an **Injury watch** chip appears on the card face. Data comes from each ESPN game summary's injury report, trimmed in `fetch-slate.mjs` and built by `injuriesFor` in `build-slate.mjs`. ESPN doesn't carry college injury reports; college cards use the conference availability reports below.

**College availability reports.** The SEC, ACC, Big Ten and Big 12 require availability reports for conference games. All four publish through HD Intelligence, and `scripts/fetch-availability.mjs` reads the same public feed their sites embed (`app.hdintelligence.com/api/get-publish-public`). It matches each report to the ESPN game by both team names and the date, keeps every player not listed Available, adds ESPN roster headshots (jersey plus last name) and writes `data-raw/availability.json`. The builder (`availabilityFor`) puts those players on the team's `injuries` with the conference's designations: Out, Out (1st half), Doubtful, Questionable, Game-time decision, Probable, and Out for season (exempt). Each game also gets `availability` with the conference, report (Initial, Update 1, Update 2, Game Day) and posting time. Until the first report posts, the section says when it's due. Conferences don't disclose the injury itself, so college rows show the jersey number instead. Reports post each evening from three nights out, and again about two hours before kickoff (90 minutes in the Big 12). The hourly check in `refresh.yml` (`finals-due.mjs`) also rebuilds once 45–105 minutes before each covered kickoff to pick up the game-day report. Non-conference and Group of Five games have no report.

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
- **Top 3 / bottom 3** per team, each player on a card in his team's color with the team logo, abbreviation, jersey number and position (from the team roster, which the Pages Function caches for 12 hours), ranked by a box-score impact score (yards, touchdowns and takeaways add; interceptions, fumbles, sacks taken and missed targets or kicks subtract; bottom 3 only counts involved players). Click a player's ± number to see why. It opens as a summary: the three plays that moved the number most (biggest swing either way), each with play art (run, pass, incomplete pass, touchdown, sack, safety, interception, fumble, field goal, missed kick, tackle, tackle for loss, pass defended, QB hit), its quarter and clock, ESPN's description, the yards and the points it earned, then one chip per kind of play for everything else ("22 completions +9.8", "3 sacks −2.1"). **See all N plays** shows the full list in game order. Summary and full list both add up to the number on the card (`summarizeEvents` in `src/playImpact.ts`); an efficiency adjustment is rolled up, never shown as a top play. `src/playImpact.ts` holds the weights (`W`), the formula (`impact`) and the attribution (`attributePlays`): it reads ESPN's play text ("J.Allen sacked at LAC 26 for -7 yards (sack split by N.Barrett and T.Tuipulotu)") and matches names to the box-score roster, so the card and the list use one set of weights. Credit the play text can't name (special-teams tackles, stats ESPN doesn't spell out in the text) shows as one "Other box-score credit" line instead of being guessed. The game feed (`src/gameTrim.js`) now carries a `log` of every play that can credit a player; older cached responses without it keep the plain number.
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
