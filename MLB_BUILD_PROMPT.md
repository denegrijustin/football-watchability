# MLB Watchability: build specification and prompt

Paste everything below the line into a new session (a fresh repo, with the NHL and Football apps cloned read-only for reference).
It is written to be followed in order. Each phase ends at a **gate**: stop, report, and wait for approval before the next phase.

---

## 0. Your role and how to work

You are building **MLB Watchability**: a mobile-first web app that tells a baseball fan which games are worth watching today, why, and what is at stake, with live tracking, team pages, standings and playoff odds, and ratings. It is the baseball counterpart of my **Football Watchability** app (React + TypeScript + Vite, Cloudflare Pages, scheduled GitHub Action that commits generated JSON). The football and NHL apps are cloned read-only next to this repo: **read them for patterns, never copy blindly**; baseball differs (daily games, pitchers, series, 162 games).

**Operating protocol**
1. Work phase by phase. Every phase is its own branch (`phase-N-name`), pushed, with a report. **Never merge, never open a PR, never trigger a deploy until I say "merge"** (then: open the PR with a body that ends with the attribution lines I give you, squash-merge, tell me).
2. Before writing code in a phase, restate the phase's goal and list the files you expect to create. If something is ambiguous and the answer changes what you build, ask once, with a recommended default. Otherwise choose a sensible default, build it, and list it under "Decisions I made" in your report.
3. Every phase report contains: what was built; screenshots at 390px wide (phone) and 1440px wide (desktop) of every new screen; test results (counts, and any failure with whether it is new); budget-check output; "Decisions I made"; "Known gaps". Be plain about failures. Never say "done" with a failing test unexplained.
4. Do not reduce functionality when consolidating. If you move or merge something, the old capability must stay reachable and tested.
5. Commit messages end with the attribution lines I give you. No model identifiers in code, commits or PRs.

## 1. Non-negotiable engineering rules

These are lessons from the football app. Treat them as acceptance criteria for every phase.

**Data**
- Pipeline shape: `scripts/fetch-*.mjs` write raw files to `data-raw/` (git-ignored) → `scripts/build-*.mjs` write `src/data/*.json` → the app reads **only** `src/data/*.json`. The browser never calls a third party for anything the pipeline could have saved, except live scores.
- **A failed or empty fetch never overwrites good data.** Every build step checks its input (row counts, required fields) and keeps the saved snapshot with a log line when the input is bad.
- **Never write nulls over a good snapshot.** If a computation needs the schedule and the schedule is partial (a day with games in progress, a feed outage), keep the last good result rather than saving an empty one. (A football refresh once saved an empty playoff tracker because a floor of "272 games played or left" did not allow for games on the clock.)
- Hand-curated data (logo overrides, name fixes, per-team notes) lives in separate files that the generator never rewrites. The publish step copies **only generated files**, by an explicit list. Add a test that proves a refresh does not touch curated files.
- Accumulating files (team id maps, logo discoveries) merge new entries into the old; they never replace.
- Every data file has a `schema`/`version`, a `builtAt`, and a `contentHash`. A "data check" step validates every JSON file against a schema and fails the run on malformed output.
- Large data lazy-loads (fetch on first use of the view), with a per-file gzip budget.

**Refresh pipeline (GitHub Actions)**
- Daily full refresh at 8:00 AM Central. GitHub cron is UTC, so schedule both offsets (13:02 and 14:02 UTC) and **gate on the actual Chicago offset** so exactly one runs year-round through daylight-saving changes.
- An hourly check (minute :37) that rebuilds and deploys when a game kicked off 3 to 9 hours ago and is not final on the site, or the feed shows a final the site lacks.
- `workflow_dispatch` with inputs: `today` (pretend date, Central) and `deploy` (boolean).
- Data is committed to a `slate-data` branch, then the site files are copied to `main` (Cloudflare deploys `main`). A concurrency group serializes writes.
- On failure: open (or comment on) one tracking issue; close it after a good run.
- **Gate tests in the refresh must be few, robust and date-independent.** A smoke test that hard-codes a team or an opponent will fail the day the schedule moves on and silently block every deploy. Derive expectations from the saved data. Tests that are advisory warn; they never block deploy.
- Keep the app code and the refresh code the same commit on `main` (the refresh checks out current app code), so a fix merged to `main` is picked up by the next run.

**Frontend**
- **Phone first**: design at 390px, verify at 360px. No horizontal page scroll anywhere (test every view at 360px). Touch targets at least 44px. Text never below 12px (use a rem scale). Safe-area insets respected.
- Navigation is **hubs, not features** (see §3). The phone bottom bar has at most five items plus a More sheet.
- Compact by default: the first game card should start high on the screen. Everything above the first card (ticker, header, filters, chips, watch-now) is budgeted in a test (e.g. under 420px on a phone with two live games).
- Motion: animate only `transform` and `opacity`; loops pause when off-screen (IntersectionObserver) or the tab is hidden; an idle governor stops loops after 25 s without input; `html[data-motion="off"]` and `prefers-reduced-motion` disable everything. A test fails if a looping animation animates anything else. (The football app once ran hot on phones because of paint-heavy loops.)
- Accessibility: landmarks, one `h1`, labelled controls, focus order, visible focus, 4.5:1 contrast in dark and light themes, `aria-pressed` on toggles, `role="img"` with a label on charts.
- Theming: CSS variables, dark default, light supported.
- Logos: one manifest and one lookup function; every `<img>` has `alt=""` when decorative; failed images fall back to a lettered badge.
- Every team name or logo anywhere opens that team's page. One component (`TeamOpen`) does this.
- **CSS discipline**: one design-token file; one stylesheet per feature, imported by that feature; no selector defined in two places. (The football app grew an 8,500-line global stylesheet with rules defined two or three times that fought each other.)

**Budgets** (`scripts/check-budget.mjs`, run in CI and in every phase report): total JS gzip, CSS gzip, each data file's gzip, and each lazy chunk. Set them from the first working build plus 15% and raise them only deliberately with a note.

**Tests** (Playwright, projects `desktop` 1440x1000 and `mobile` 390x844 with `isMobile` and `hasTouch`)
- Every feature ships with tests in the same phase. Name tests by behavior.
- **Tests must not depend on today's date, this week's slate, or specific teams.** Derive expected values from the saved JSON. Where the data cannot support a test (no game today, no live game), `test.skip(cond, "reason")` through a shared helper, never fail.
- Use route stubs for live endpoints and `page.clock` for time; pin the clock before the game's start when a test needs a "pre-game" state.
- A test that touches phone layout is tagged `@phone` and runs the real phone layout; untagged mobile tests may lay out inline.
- Pure logic (scoring, simulation, ratings) is unit-tested straight from the JSON, independent of the UI, with an independent recomputation for key figures.
- After any change, run the touched specs; before each phase report, run the **full suite twice**. A test that fails under load but passes alone is a flake: fix it (poll instead of snapshot, settle counts) rather than ignore it.
- Keep a `@smoke` set small (under 25 tests, under 90 s) that the refresh runs before deploying.

## 2. What MLB changes (read before designing)

- **Daily cadence.** Football is weekly; baseball is a game almost every day for 26 weeks. The board is a **day** view with date navigation; "this week" becomes "today / tomorrow / this series". The refresh still runs daily at 8 AM Central, plus the hourly finals check, plus lighter intraday updates for probable pitchers and lineups.
- **Doubleheaders, postponements, suspended games, makeup games, split-squad spring games (ignore), time-zone-late West Coast games.** The data model keys games by an id, never by (date, teams).
- **The starting pitcher is the biggest single factor.** Probable pitchers change late; the score must update when they do and say when a pitcher is "TBD" or changed.
- **Series.** Three- and four-game series are the unit of interest; October is best-of-5/7. Show series status ("BOS leads 2-1").
- **162 games.** One game rarely swings the season, so playoff leverage is small until September: stakes should be real (wild-card race, division clinch, seeding), not manufactured.
- **Playoff format**: 12 teams (6 per league: 3 division winners + 3 wild cards; top two seeds get byes), wild-card best-of-3, division series best-of-5, LCS and World Series best-of-7. Confirm the current format and tiebreakers against official sources in Phase 0, because rules change.
- **Season structure**: spring training (ignore), regular season, All-Star break (no games), trade deadline, September call-ups, postseason, offseason. The app must behave sensibly out of season (no empty broken screens; show the last results and the next opening day).
- **Stats**: runs, hits, errors, innings, pitch counts, count/outs/runners, ERA, WHIP, OPS, wRC+, FIP, WAR where licensed. Park factors matter. Weather (wind, temperature, roof) matters more than in football.
- **Betting data**: moneyline and run line (1.5) and total; the line is mostly informative, so do not build a spread-style "pick" product unless the data supports a defensible edge.

## 3. Information architecture (decide this first, then do not drift)

Phone bottom bar (five): **Games · Teams · Standings · Picks · More**. Desktop: the same hubs as a top row.

| Hub | Contains |
|---|---|
| **Games** | Day board (cards), Watch Now strip, completed-scores strip, TV grid view (by network and time), filters/search, export/calendar menu |
| **Teams** | A list of 30 teams → one page per team: Resumé, Ratings & performance, Injuries (IL), Schedule/results, Rotation |
| **Standings** | Standings (division / league / wild card) and **Playoff picture**: seeds, tracker, leverage, bracket, magic/elimination numbers |
| **Picks** | Picks & parlays (if supported), Simulator, Upset meter, Full ATS/run-line tracker |
| **Ratings** (in More or its own hub) | Team ratings, movement, matchup, compare, outliers, fraud meter, data explorer |
| **More** | Insanity/wildness board, Resumés list, Injuries list, Empire/territory map (optional), About/data |

A Game Center dialog opens from any card, final tile, or live strip (Overview, Box score, Plays, Players, Analysis).

## 4. Data contract (write this down in Phase 0, version it, test it)

Each file: `{ schema, builtAt, ... }`.

- `teams.json`: 30 teams: `id`, `abbr`, `name`, `city`, `nickname`, `league` (AL/NL), `division`, `colors`, `logoId`, `venue`, `espnId`, `mlbId`.
- `slate.json`: games for a window (e.g. yesterday to +7 days): `id`, `date` (UTC ISO), `status` (pre/in/post/postponed/suspended), `teams[2]` (away, home) with record, probable pitcher (`id`, `name`, `hand`, `era`, `whip`, `status: confirmed|probable|tbd|changed`), `venue`, `roof`, `weather`, `broadcast` (national + local), `series` (`game`, `of`, `leader`), `doubleheader` (`1|2|null`), `odds` (ml/runline/total, with source and time), `score` (0-100), `tier`, `breakdown` (each component with points and a human note).
- `results.json`: finals with linescore, winner/loser/save pitchers, forecast score vs what happened.
- `standings.json`: by division, league, wild card; W-L, GB, L10, streak, run differential, home/away, vs division, pythag record.
- `outlook.json`: season simulation: per-team P(playoffs), P(division), P(bye), P(WS), expected wins, seed distribution, leverage (P after win / after loss for each remaining marquee game), magic/elimination numbers, tracker tiers; `sims`, `builtAt`, `cycle`.
- `ratings.json`: per-team rating history by date (offense, pitching, defense if available, overall), with a documented model.
- `injuries.json`: IL by team: player, position, injury, status, expected return, impact tier.
- `pitchers.json`: probable and recent starters with rolling form.
- Curated: `logo-overrides.json`, `name-fixes.json`, `team-ids.json` (accumulating).
- Live (not saved): scoreboard poll and a game-summary endpoint served by a small Pages Function that normalizes the upstream payload (so the client code does not depend on the upstream shape).

Document every field's source and meaning in `docs/data-contract.md`, and generate a JSON-schema check from it.

## 5. The watchability score (the product's core)

Design it in Phase 0, implement it as a **pure function** with a documented breakdown, and calibrate it. Score 0-100, tiers (Must Watch 85+, Entertaining 74+, Watchable 64+, Lower priority below).

Components (each with a cap, a human note, and a unit test), to be validated against past games:
1. **Pitching matchup**: quality of both probable starters (blend season and recent form, FIP-like), plus star power (Cy Young-level arms), plus rookie/debut interest only if grounded in data.
2. **Team strength and balance**: both teams good beats one good; closeness of win probability (a 50/50 game is better than 80/20).
3. **Stakes**: playoff-odds leverage of the game (from the simulation: change in P(playoffs) between a win and a loss for either team), division race, seeding, elimination, clinching; scales up through September.
4. **Series context**: rubber match, sweep on the line, series leader, playoff games (elevate), potential no-hitter/perfect game watch when live.
5. **Rivalry and history**: a small curated list (Yankees-Red Sox, Dodgers-Giants, Cubs-Cardinals, etc.) with an optional note.
6. **Star power and storylines**: injury returns and milestones only from saved data, never invented.
7. **Environment**: weather impact, park (Coors, Fenway quirks), roof state; mention only when it matters.
8. **Pace and offense**: run-environment, expected total from the market line.
9. **Live adjustments**: close-and-late flag (one- or two-run game, 7th inning or later, runners on), no-hitter through N innings, extra innings, comeback size; a game's "heat" rises as it develops; show "▲ up N" when it does.

Rules: show the breakdown in a "Why this score" popover; never hide missing data (say "pitcher TBD"); recompute when a probable pitcher changes; keep the formula in one file; add a calibration test that scores last season's games and checks that high-scoring games had closer finals and higher leverage on average (report the numbers, do not claim more than the data supports).

## 6. Phases

Every phase: branch, build, test, report, **gate**.

### Phase 0: Research, design, plan (no app code)
Deliver `docs/` with: (a) data sources table: for each candidate (ESPN public scoreboard/summary/standings/teams, MLB StatsAPI, Baseball-Savant/Statcast CSVs, FanGraphs, Baseball-Reference, an odds source, weather source), the URL pattern, fields, rate limits, licence/terms, reliability, and whether it can be called from CI; recommend a primary and fallbacks. (b) The data contract (§4) as TypeScript types + JSON Schema. (c) The watchability formula (§5) with each component, weights, and the data it needs; plus a back-test plan. (d) The playoff format and tiebreaker rules verified against current official sources, and the simulation design (Monte Carlo over remaining games with rating-based win probabilities, home-field, starting-pitcher adjustments, doubleheaders). (e) Repo layout, hub IA (§3), screens list, component inventory. (f) A risk register (feed outage mid-season, probable pitcher churn, doubleheader ids, postponed games, off-season behaviour, licensing). (g) A timeline per phase.
**Gate:** I approve the sources, the formula and the IA.

### Phase 1: Skeleton, tokens, CI, and the data pipeline
- Scaffold Vite + React + TS, Playwright (two projects), lint/typecheck, `check-budget`, design tokens (colors, spacing, type scale in rem, radii, shadows, motion durations), dark and light themes, base layout (ticker slot, header, hub nav: bottom bar on phone, top row on desktop, More sheet), error boundary, lazy-view helper with retry-then-reload-once behaviour, `fetchData` with caching, timezone selector (Central default, persisted).
- Fetch scripts: teams, schedule window, standings, results (finals), probable pitchers, injuries, odds (optional), with retries, timeouts, and a request log. Build scripts produce §4 files; a **data-check** script validates them (schemas, row counts, cross-references: every game team exists; ids unique; dates valid; doubleheader pairs).
- Publish script with an explicit allowlist and the "curated files untouched" test.
- Workflows: `refresh.yml` per §1 (dual-offset gate, hourly check, dispatch inputs, slate-data branch, copy to main, failure issue); `ci.yml` on PRs (typecheck, unit, build, budget, smoke).
- Tests: pipeline with fixtures including malformed, empty, partial and doubleheader feeds; "a failed fetch keeps the saved data"; DST gate logic for March and November transitions; allowlist.
**Gate:** a manual `workflow_dispatch` run produces real data and a deploy-ready build (not merged), and the failure-injection tests pass.

### Phase 2: Games board
- Day navigator (yesterday, today, +6), kickoff-time grouping ("7:05 PM slots"), cards, Watch Now strip (best live games, then best soon), status chips on one line, filters (league, division, rating tier, network, favorite team), search (team, city, pitcher), "completed games" strip with upset highlight and a rank/rating indicator.
- Card: logos, names (abbreviate multi-word cities on phone: "NY Yankees"), records, probable pitchers with ERA, time, network chip, venue, weather note only when it matters, score ring + tier, "Why this score" popover, series note, doubleheader tag, injuries strip (impact-ranked), lines strip (ML/RL/total), Details expansion.
- Top-of-page budget: first card starts under 420px on a phone with two live games. Cards: live under 340px, upcoming under 300px.
- TV grid view: networks as lanes, time as columns, blocks legible with record and ratings uncut.
- Export/calendar menu: CSV and an `.ics` of the games above a score.
- Tests: grouping, filters, search, empty states, date navigation, doubleheader display, probable-pitcher "TBD/changed" states, phone layout budgets, no horizontal overflow at 360px, a11y roles.
**Gate:** screenshots for pre-game, live, final, doubleheader, postponed.

### Phase 3: Live engine
- A scoreboard poll (15 s while visible and on screen; slower in background; stops when hidden), served through the Pages Function/edge cache; per-game summary fetched only while the card is on screen (IntersectionObserver); a shared store so cards, strip, ticker and Game Center agree.
- Live status text ("Top 7th, 2 out"), score flash and card pulse on change, base diamond with runners, count and outs, current pitcher/batter, last play.
- **Three slim meters** per live card (win probability, momentum over the last N plate appearances, "deserve to win" from hits, hard-hit, walks, strikeouts, runners left, pitch quality), documented in code, replacing any big graphic.
- Close-and-late flag, no-hitter/perfect-game watch (with an unmissable but non-intrusive banner), extra-innings tag, rain-delay/suspended handling, final and "forecast vs actual".
- Idle governor and motion rules from §1; haptic on game start where supported.
- Tests: stubbed polls with a pinned clock; cadence (15 s) polled not snapshotted; score-first-from-summary shows immediately; rain delay; extra innings; no-hitter banner; battery rule test.
**Gate:** a recorded or fixture-driven replay of a whole game exercises every state.

### Phase 4: Game Center
Dialog (sheet on phone) with tabs: **Overview** (score, win-probability chart, last plays, key moments), **Box score** (linescore, batting and pitching lines), **Plays** (at-bats, filterable by inning), **Players** (leaders, lineups, bullpen usage), **Analysis** (pre-game: matchup and season context; post-game: forecast vs final). Deep links (`?game=ID`), Back button closes, focus trap and restore, scroll lock, no layout shift.
Tests: opens from card, final tile and strip; keyboard; each tab loads from stubs; failed-load state; no overflow at 360px.

### Phase 5: Teams hub
List of 30 (search, league filter). Team page sections: **Resumé** (best wins, worst losses with a "bad loss" rule, strength of schedule, run differential, pythag, last 10, home/road, vs division, one-run games), **Ratings & performance** (rating history chart, offense/pitching/defense splits, rolling form, platoon and bullpen if licensed), **Injuries** (IL with return and impact), **Schedule & results**, **Rotation** (five starters with rolling form). Every logo/name in the app opens this page (`TeamOpen`); deep link `?team=NYY`.
Tests: every team renders without errors; links from card, standings, results, Game Center; opponent links inside a resumé; sections load lazily; 360px fit.

### Phase 6: Standings & Playoffs hub
- **Standings**: division, league, wild-card views with tiebreak footnotes; playoff-line marker.
- **Playoff picture**: seeds table with P(playoffs/division/bye/title), **tracker** (tiers: clinched, safe, thin, on the table, must-win, long shot, out) designed to fit **one phone screen**, **leverage** chart and the biggest-swing games, magic and elimination numbers, bracket (October) with series status, a conference/league toggle. One consolidated control bar on one line.
- **Simulation** (`outlook.json`): Monte Carlo (≥ 20,000 seasons), win probability from ratings + home field + probable-pitcher adjustment, correct tiebreakers (head-to-head, division record, etc.), correct byes and wild-card seeding, doubleheaders, the actual remaining schedule, seeded RNG (reproducible), a documented minimum-games sanity check that **allows games on the clock** and **keeps the last good snapshot** if the run cannot be computed.
- Tests: standings math vs an independent recomputation; tiebreak unit tests from real historical scenarios; simulation sanity (probabilities sum to 1, byes = 2 per league, 6 teams per league make the field, monotone with wins), reproducibility, "no simulation keeps the saved one", tracker fits one phone screen, bracket in October fixtures.
**Gate:** reconcile a few simulated odds against a public source and report the differences.

### Phase 7: Ratings, Picks and the fun boards
- **Ratings**: a documented model (start with a run-differential/Elo hybrid with starting-pitcher adjustment; compare to a public rating and report error), movement over time (risers/fallers), matchup and compare views, outliers, a data explorer, a **fraud meter** (wins above/below what the record implies; state the formula), and a team-performance set (offense, pitching, bullpen, defense, baserunning, situational), each with the question it answers.
- **Picks**: moneyline and run-line picks only if the back-test shows a defensible edge; otherwise present value-free "model vs market" notes. An honest record (graded, with sample size and a break-even line), a parlay builder if you can justify it, a game simulator (play-by-play, thousands of replays, projected score), an upset meter (rating gap vs result), and a "wildness"/Insanity board (comebacks, lead changes, one-run games).
- Tests: model unit tests, calibration, back-test numbers reported, no claims beyond the data, every chart has a labelled text alternative.

### Phase 8: Consolidation and polish
Merge duplicates into the hubs of §3 (one team page, one standings area, one simulator), keeping every capability reachable. Run: a battery audit (all loops off-screen paused, idle governor), a size pass against budgets, an a11y pass (axe-style checks in tests), a light-theme pass, an off-season mode (last results, next opening day, no broken empty states), an in-season "what changed since last refresh" note, and the CSS consolidation (no duplicated selectors; add a test that scans for duplicates in feature files).
**Gate:** full suite three times with zero flakes; final screenshots; handover doc.

### Phase 9: Operations
Runbook (`docs/ops.md`): how the refresh works, how to run it manually, how to pretend a date, what each failure issue means, how to recover a bad snapshot, how data sources can change and what breaks, season rollover checklist (new season id, schedule, rosters, playoff format), and a monitoring step (a daily check that the site's `builtAt` is under 26 hours old, and a notification when it is not).

## 7. Definition of done for the whole project

- All phases merged with my approval; full test suite green three times in a row; budgets pass.
- A manual refresh and the scheduled one both succeed; a deliberately broken fetch leaves the site unchanged; a failing advisory test does not block deploy; a failing smoke test opens a clear issue.
- On a 360px phone: no horizontal scroll in any view; first card within the top-of-page budget; every touch target at least 44px.
- Off-season and no-games-today screens are friendly and tested.
- Docs: data contract, score formula, simulation method, ops runbook, "how to add a feature without breaking the pipeline".

## 8. First message

Start with Phase 0 only. Read the football and NHL apps' `scripts/`, `.github/workflows/`, `src/data/` shapes, and `tests/helpers/` for patterns, then deliver the Phase 0 documents and stop for my approval.
