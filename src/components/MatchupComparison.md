# Matchup comparison

```tsx
import { MatchupComparison, ExpandableMatchupCard, mockMatchup } from "./MatchupComparison";

// Inside an existing expanded game card:
<MatchupComparison data={apiMatchup} />

// Complete expandable card, with sample data:
<ExpandableMatchupCard data={mockMatchup} />
```

`GameDetails` accepts a `matchup` prop, or reads `game.matchupComparison`. The current game feed does not supply this dataset; the live cards never use the mock automatically. Preview the sample at `/matchup-demo.html`.

Use the exported `MatchupData` type as the normalized API contract. Supply six metrics per team, each with `offense` and `defense` numeric `value` and `rank`. Unknown values/ranks are `null`. Rank 1 is best within the same league, season and qualification pool. Defensive scoring/yardage/third-down values are allowed statistics. Offensive turnovers are giveaways; defensive turnovers are takeaways, ranked separately. This schema uses season totals rather than turnover margin.

Rank delta is right rank minus left rank. Positive values favor the left; negative values favor the right. An absolute gap greater than 5 shows a green arrow toward the advantaged team. Smaller gaps stay gray. These are descriptive rank comparisons, not game predictions.

Tailwind utilities use the `mc:` prefix and omit Preflight to preserve existing dashboard styles. The crossover layout responds to its container width. Expansion uses CSS grid row transitions, with reduced-motion support and inert collapsed content.
