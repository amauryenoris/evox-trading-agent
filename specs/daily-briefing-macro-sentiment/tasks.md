# Tasks — Market Daily Briefing (Prompt 1/3: Table + Aggregate Macro Sentiment)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (news-intelligence.ts modification + new DB migration — per specs/README.md reminder)
- [x] Database migration drafted (see design.md → Database Changes)

## Implementation Checklist

### Phase 1 — Database
- [x] T-01: Create `supabase/migrations/{timestamp}_create_market_daily_briefings.sql` with the `market_daily_briefings` table (14 columns), the `IF NOT EXISTS` guard, the unique index on `briefing_date`, and `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` — matching the `position_health_snapshots` migration's structure exactly
- [x] T-02: Apply the migration locally/remotely and confirm it applies cleanly with no errors

### Phase 2 — Aggregation Function
- [x] T-03: In `src/lib/news-intelligence.ts`, add `getRecentNewsClassifications` to the existing `./db` import (already present in the existing import list — no change needed)
- [x] T-04: Add the `MacroSentimentSummary` interface (`bullishCount`, `bearishCount`, `neutralCount`, all `number`)
- [x] T-05: Add `export async function getAggregateMacroSentiment(hours: number): Promise<MacroSentimentSummary>` that calls `getRecentNewsClassifications(hours)`, filters to `scope === 'MACRO'`, and counts by `sentiment`, touching only `.scope` and `.sentiment` on each record

### Phase 3 — Testing
- [x] T-06: Add a test for `getAggregateMacroSentiment` with a mixed MACRO/SYMBOL, mixed-sentiment input — verify SYMBOL-scope records are excluded and counts are correct
- [x] T-07: Add a test for empty input — verify the function returns `{ bullishCount: 0, bearishCount: 0, neutralCount: 0 }` without throwing
- [x] T-08: Add a test for all-one-sentiment input — verify the other two counts are `0`
- [x] T-09: Grep the new code to confirm no property other than `.scope`/`.sentiment` is accessed on the classification loop variable

### Phase 4 — Verification
- [x] T-10: Run `npx tsc --noEmit` — must pass
- [x] T-11: Run `npm run build` — must pass
- [x] T-12: Confirm the migrated table has all 14 columns, the unique index, and RLS enabled (actual migration DDL — copied verbatim from the spec — has 16 columns; spec's "14 columns" figure was a miscount, not an implementation gap)

## Post-Implementation

- [ ] Run `/review daily-briefing-macro-sentiment` to verify implementation matches spec
- [ ] Confirm `getRecentNewsClassifications()`, `buildThresholdMap()`, `newsIntelligenceLayer()`, `types.ts`, `claude-agent.ts`, and `stock-selector.ts` are unchanged

## Estimated Complexity

Low — one additive migration following an existing template, and one small pure function composed on top of an existing, unmodified data-access function. No control-flow, decision-logic, or Protected-Zone (CLAUDE.md hard list) changes. The only friction is the required Amaury confirmation for touching `news-intelligence.ts` and adding a DB migration, per repo convention.
