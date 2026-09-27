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

## Weekly data updates

The slate is built from ESPN data rather than typed in by hand. ESPN is fetched by GitHub Actions, because it isn't reachable from every environment.

1. **Fetch.** On the `slate-data` branch, set `data-raw/request.json` to the week's dates (`{"start":"20261001","end":"20261005"}`) and push, or run **Actions → Fetch slate data** with those dates. The workflow runs `scripts/fetch-slate.mjs` (schedules, TV, lines, records, standings, AP poll, FPI, matchup predictor, season leaders, ESPN and Open-Meteo weather) and `scripts/fetch-history.mjs` (head-to-head results since 2004), then commits `data-raw/`.
2. **Build.** `PERIOD="Oct. 1–5, 2026" node scripts/build-slate.mjs` writes `src/data/slate.json` and `src/data/team-ids.json`. Put corrections ESPN hasn't posted yet (a TV network, say) in `src/data/slate-overrides.json`, keyed by ESPN event id.
3. **Logos.** Pushing a changed `team-ids.json` to `slate-data` runs **Upgrade logos**, which fetches only teams that don't have a logo yet. ESPN ids overlap across leagues, so logos are matched by league plus id.
4. **Notes.** Write one-line takes in `src/data/headlines.json` (keyed by ESPN event id), then run `node scripts/write-narratives.mjs` (below).
5. **Check and ship.** `pnpm build`, look at the board, then copy the source changes (not `data-raw/`) to `main`.

How the numbers are made:
- "Now" playoff odds are ESPN FPI. With-a-win and with-a-loss odds are estimated so that their average, weighted by ESPN's win probability, equals FPI.
- AP rank is the current poll. The NFL "PR" is the FPI rank. Rank moves after a win or a loss are rule-of-thumb estimates.
- Watchability blends team strength, projected closeness, playoff stakes, ranked matchups and TV slot, then rescales across the week. See the watchability section of `build-slate.mjs`.

Game fields:

| Field | Contents |
| --- | --- |
| `espnId`, `league`, `conferences` | ESPN event id; `NFL` or `CFB`; college conference ids from the top-level list. |
| `score`, `tier`, `delta` | Watchability 0–100, color tier (`elite`, `vgood`, `good`, `watch`, `bg`), change from the prior rating (`new` for a fresh slate). |
| `matchup`, `meta`, `chips`, `broadcast` | Matchup, kickoff (ET) · tier · line · venue, rating tags, TV/streaming. |
| `weather` | Icon, outlook title, detail and impact text. |
| `teams` | Two teams: `name`, `logoId`, `espnId`, `record`, `rankings`, `playoffOdds` (arrays ordered now, win, loss). |
| `narrative`, `watch`, `skip`, `narrativeChips` | One-line take, why-watch and why-skip reasons, and supporting tags (generated; see below). |
| `history` | Series since 2004, recent meetings, key players (season leaders), and source. |

### Watch / skip notes

Each card's one-line take and its **Why watch / Why skip** lists come from `node scripts/write-narratives.mjs`. The script writes specific reasons from facts already in the slate: spread and total, poll and playoff-odds swings, standings, series history, named players, weather, channel and overlapping kickoffs. Nothing is invented, and phrasing is rotated so cards don't repeat each other. One-line takes are hand-written in `src/data/headlines.json`, keyed by game `id`. Games without an entry get a generated take. After replacing the slate, update or clear `headlines.json`, rerun the script, and check the output. `pnpm validate:data` fails if any game is missing reasons or if any note appears on two cards.

Game fields:

| Field | Contents |
| --- | --- |
| `league`, `conferences` | `NFL` or `CFB`; college conference IDs from the top-level list. A game can belong to multiple conferences. |
| `score`, `tier`, `delta` | Editorial 0–100 watchability, color tier (`elite`, `vgood`, `good`, `watch`, `bg`), change from the prior rating. |
| `matchup`, `meta`, `chips`, `broadcast` | Team matchup, supplied kickoff/venue/line text, rating tags and TV/streaming availability. Include the timezone in kickoff text. |
| `weather` | Icon, outlook title, descriptive detail and impact text. |
| `teams` | Exactly two team objects: `name`, `logoId`, `record`, `rankings`, `playoffOdds`. Both arrays are ordered **now, win, loss**. Odds are numeric percentages (0–100). |
| `narrative`, `watch`, `skip`, `narrativeChips` | One-line take, why-watch and why-skip reasons, and supporting tags (generated; see below). |
| `history` | Three labeled boxes for all-time series, recent meetings and key players/units; source attribution. Each box has `label`, `value`, `items`. First meetings must be stated explicitly. |

`src/data/logos.json` maps stable team IDs to logo files in `public/logos/` (128px WebP built from ESPN's 500px dark-background logos; sources in `src/data/logo-sources.json`). For a new team, add its `logoId` to the slate and run the **Upgrade logos** GitHub workflow (Actions → Upgrade logos → Run workflow), or `node scripts/upgrade-logos.mjs` on a machine with internet access; add an ESPN team ID to `OVERRIDES` in that script if a name is ambiguous. Data-URI logos are still accepted. No external image host or font is needed at runtime. Images use descriptive surrounding team text with decorative empty alt attributes.

`src/data/index.ts` exports data types and filtering logic. UI components live in `src/components/`; the responsive design lives in `src/styles.css`. There is no injected legacy HTML and no server or secret in the browser bundle.

## Data provenance

The migration preserves **87 games (16 NFL, 71 college), 174 logo images, 87 populated history sections and 87 broadcast entries** from the supplied `football_watchability_full_history_tv.html`. Twelve college controls include All FBS and eleven conference filters. The original file and its SHA-256 are retained for auditability. Six original PNGs had corrupt palette chunks (Missouri, Georgia, Clemson, UConn, Charlotte and Tulsa); their matching ESPN logos were embedded as replacements, with source URLs in `src/data/logo-repairs.json`. All other logo data is unchanged. `node scripts/check-migration.mjs` verified the initial migration against the source (it predates the logo upgrade and will now report logo differences) and is intentionally separate from weekly validation. Rerunning the legacy importer restores the corrupt originals; run `node scripts/repair-logos.mjs` afterward to reapply the documented repair (network required). The first slate (Sept. 24–28) was migrated from a supplied file; later slates are built from ESPN data as described above. The original wording may contain inconsistencies. The app labels the board as the **Sept. 24–28, 2026 saved slate** and labels scenario values as projections. There is no live sports feed, automatic refresh or prediction model.

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
