# Matchup comparison

```tsx
import { MatchupComparison, ExpandableMatchupCard, mockMatchup } from "./MatchupComparison";

// Inside an existing expanded game card:
<MatchupComparison data={apiMatchup} />

// Complete expandable card, with sample data:
<ExpandableMatchupCard data={mockMatchup} />
```

`GameDetails` accepts a `matchup` prop, or reads `game.matchupComparison`. Live cards use the saved ESPN regular-season team snapshot through `matchupForGame`. `/matchup-demo` uses actual board teams; `?sample=1` is a labeled test fixture. Both scheduled refresh and manual fetch update the snapshot.

Use the exported `MatchupData` type as the normalized API contract. Supply `rankedTeams`, the actual national or league ranking pool size, and six metrics per team, each with `offense` and `defense` numeric `value` and `rank`. Unknown values/ranks are `null`. Rank 1 is best within the same league, season and qualification pool. Defensive scoring/yardage/third-down values are allowed statistics. Offensive turnovers are giveaways; defensive turnovers are takeaways, ranked separately. This schema uses season totals rather than turnover margin.

Rank delta is right rank minus left rank. Positive values favor the left; negative values favor the right. An absolute gap greater than 5 shows a green arrow toward the advantaged team. Smaller gaps stay gray. These are descriptive rank comparisons, not game predictions.

Tailwind utilities use the `mc:` prefix and omit Preflight to preserve existing dashboard styles. The crossover layout responds to its container width. Expansion uses CSS grid row transitions, with reduced-motion support and inert collapsed content.

Badges distinguish #1 (Best in League / Best in Nation), Top 5, Top 10, Bottom 10, Bottom 5 and the last rank (Worst). College numbers explicitly say nationally. Bottom thresholds use rankedTeams; sample college data uses an illustrative 136-team pool.

Live ranks use all 32 NFL teams and the FBS teams in the current ESPN FPI pool. Category ranks are calculated from unrounded season values with competition ties (1, 1, 3). NFL passing uses net yards, NCAA rushing includes sack losses as recorded by ESPN. Turnovers use totalGiveaways / totalTakeaways. A failed team fetch preserves the entire previous league snapshot; a missing metric suppresses its category ranks. Each live panel displays the source, pool size and snapshot time. Completed games show the current season snapshot, not frozen pregame statistics.

The first expansion keeps the game overview and forecast. Game Center contains matchup tables, season form, stakes, detailed weather, injuries, score explanations, history and key players. Compact GC shortcuts open it directly. College bottom tiers use rank > 80%, 90% and 95% of the FBS ranking pool, with Worst taking priority for the lowest value (including ties); NFL keeps Bottom 10 / Bottom 5.
