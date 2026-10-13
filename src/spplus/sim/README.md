# Matchup simulator

Everything here has no React, DOM or network code (`calibrate.ts` takes the tool's `Model`; `engine.ts` and `rng.ts` import nothing).

## What it does

For two FBS teams, a venue and a rating week it plays the game N times and returns expected points for each team, win probabilities, the distribution of the margin, total and final scores, and probabilities against a spread and an over/under.

### Inputs (all from the sheet's week tabs)

| Field | Sheet column | Meaning |
| --- | --- | --- |
| `off` | Off. SP+ | points scored against an average defense |
| `def` | Def. SP+ | points allowed against an average offense (lower is better) |
| `st` | ST SP+ | special-teams points |
| `sp` | SP+ | overall; the sheet's identity is `sp = off - def + st` (max gap 0.1 across the sheet) |

### Model

1. `margin = sp_A - sp_B + home field`. Home field is 2.5 points: the sheet's own number, recovered from its projected margins (slope 1.000, intercept 2.50 over every non-neutral game).
2. `total = alpha + beta * (off_A + def_B + off_B + def_A - 2 * leagueAvg)`, with `alpha`, `beta` fitted by least squares to the played games. The fit is `beta ≈ 0.34`: totals regress hard toward the mean, so the unshrunk formula overstates both high- and low-scoring games.
3. `points_A = (total + margin) / 2`, `points_B = (total - margin) / 2`. These analytic numbers are the "expected score".
4. Each simulated game draws margin and total from a bivariate normal around those two means. Spreads (`sigmaMargin ≈ 15.3`, `sigmaTotal ≈ 15.6`) and correlation (`rho ≈ 0.04`) are measured on the played games. Scores are rounded to whole numbers (a 1 becomes 0 or 2) and a tie goes to overtime (+3 or +7 to the winner).

All constants are fitted by `paramsFor(model, week)` every time the snapshot changes. Nothing is hard-coded except the fallback in `DEFAULT_PARAMS`, used when fewer than 60 games have been played.

## How well it works (out of sample)

`backtest(model)` predicts every played FBS-vs-FBS game (329 so far, weeks 0-6) from the ratings that were current before kickoff, fitting the constants on the *other* weeks:

| | Simulator | Sheet |
| --- | --- | --- |
| Average margin miss | 11.8 | 11.8 (same formula) |
| Average total miss | 12.6 | 12.6 |
| Brier score, win probability | 0.159 | 0.159 |
| Picked the winner | 76% | |
| Margin inside the model's 50% / 80% range | 52% / 81% | |
| Total inside the model's 50% / 80% range | 48% / 80% | |

The margin is the sheet's formula by design; what this adds is a calibrated spread, scores, totals and line probabilities. Tested and left out: a team's own scoring tendency from earlier games (total error 15.63 → 15.61 points: no gain).

## API

```ts
import { paramsFor, ratingsFor, expectation, simulate, backtest } from "./sim";

const params = paramsFor(model, week);               // fitted constants for that rating week
const A = ratingsFor(model, "Ohio State", week);     // { name, sp, off, def, st } | null
const B = ratingsFor(model, "Indiana", week);
expectation(params, A, B, "b-home");                 // { margin, total, ptsA, ptsB, winProbA, parts }   instant, no randomness
simulate(params, A, B, "b-home", { n: 20000, seed: 1, lineA: 3.5, totalLine: 51.5 });
```

`venue` is `"a-home" | "b-home" | "neutral"`. `lineA` is the spread from A's side (positive = A favored). The same `seed` always gives the same result.

## In FB Watch

The Game Center's **SP+ simulated score** (`src/components/SpPlusProjection.tsx`) calls `projectGame` in `src/spplus/lite.ts`, which runs this engine on ratings from `/data/spplus-lite.json` (built at build time from `src/data/spplus.json` by `src/spplus/liteBuild.ts`, which also fits the constants with `paramsFor`). Expected points are the mean of 6,000 simulated games; the same function is what the CFB SP+ tab's simulator uses, so the two always agree. The companion command-line tools (`npm run sim`, `npm run export-sim`) live in the standalone SP+ data explorer project.

## Known limits

- FBS vs FBS only. No injuries, weather, rest or pace: SP+ is the only input.
- Normal tails: real margins are slightly heavier-tailed (kurtosis 3.7), so extreme blowouts are a touch under-weighted.
- The overtime rule is an approximation (about 2.5% of games), not a drive-by-drive model.
- 329 games is a small sample; constants move as weeks are added, and the fit always uses everything played so far.
