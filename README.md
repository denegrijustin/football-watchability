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

Edit **`src/data/slate.json`**, not React components. Set `period`, `snapshotDate`, `broadcastNote`, `provenance`, and replace the `games` array with the new slate. Give each game a unique `id`. Run validation and build, inspect the board, then commit and deploy.

Game fields:

| Field | Contents |
| --- | --- |
| `league`, `conferences` | `NFL` or `CFB`; college conference IDs from the top-level list. A game can belong to multiple conferences. |
| `score`, `tier`, `delta` | Editorial 0–100 watchability, color tier (`elite`, `vgood`, `good`, `watch`, `bg`), change from the prior rating. |
| `matchup`, `meta`, `chips`, `broadcast` | Team matchup, supplied kickoff/venue/line text, rating tags and TV/streaming availability. Include the timezone in kickoff text. |
| `weather` | Icon, outlook title, descriptive detail and impact text. |
| `teams` | Exactly two team objects: `name`, `logoId`, `record`, `rankings`, `playoffOdds`. Both arrays are ordered **now, win, loss**. Odds are numeric percentages (0–100). |
| `narrative`, `narrativeChips` | Expandable watch/skip rationale and supporting tags. |
| `history` | Three labeled boxes for all-time series, recent meetings and key players/units; source attribution. Each box has `label`, `value`, `items`. First meetings must be stated explicitly. |

`src/data/logos.json` maps stable team IDs to the original embedded image data URIs. Add a logo there for a new team. No external image host or font is needed. Images use descriptive surrounding team text with decorative empty alt attributes.

`src/data/index.ts` exports data types and filtering logic. UI components live in `src/components/`; the responsive design lives in `src/styles.css`. There is no injected legacy HTML and no server or secret in the browser bundle.

## Data provenance

The migration preserves **87 games (16 NFL, 71 college), 174 logo images, 87 populated history sections and 87 broadcast entries** from the supplied `football_watchability_full_history_tv.html`. Twelve college controls include All FBS and eleven conference filters. The original file and its SHA-256 are retained for auditability. Six original PNGs had corrupt palette chunks (Missouri, Georgia, Clemson, UConn, Charlotte and Tulsa); their matching ESPN logos were embedded as replacements, with source URLs in `src/data/logo-repairs.json`. All other logo data is unchanged. `node scripts/check-migration.mjs` verifies the initial migration against the source and is intentionally separate from weekly validation. Rerunning the legacy importer restores the corrupt originals; run `node scripts/repair-logos.mjs` afterward to reapply the documented repair (network required). History, player names, schedules, odds and weather were migrated as supplied, not independently verified or refreshed. The original wording may contain inconsistencies. The app labels the board as the **Sept. 24–28, 2026 saved slate** and labels scenario values as projections. There is no live sports feed, automatic refresh or prediction model.

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
