# Requirements — Market Daily Briefing (Prompt 1/3: Table + Aggregate Macro Sentiment)

## Functional Requirements

FR-01: The system shall provide a `market_daily_briefings` table capable of persisting one Market Daily Briefing snapshot per trading day.
FR-02: The system shall enforce uniqueness on `briefing_date` in `market_daily_briefings` so that at most one row exists per trading day.
FR-03: The system shall enable Row Level Security on `market_daily_briefings` when the migration is applied.
FR-04: The system shall provide a function `getAggregateMacroSentiment(hours)` that returns counts of BULLISH, BEARISH, and NEUTRAL classifications among MACRO-scope news events observed in the given recent window.
FR-05: The system shall exclude SYMBOL-scope classifications when computing the counts returned by `getAggregateMacroSentiment`.
FR-06: The system shall return `{ bullishCount: 0, bearishCount: 0, neutralCount: 0 }` from `getAggregateMacroSentiment` when no MACRO-scope classifications exist in the window.
FR-07: The system shall derive the input to `getAggregateMacroSentiment` exclusively from `getRecentNewsClassifications(hours)`, without modifying that function.
FR-08: Where `getAggregateMacroSentiment` reads a classification record, the system shall access only the `scope` and `sentiment` fields on that record.

## Non-Functional Requirements

NFR-01: The migration shall be idempotent — re-running it shall not error and shall not duplicate the table, index, or RLS state (`IF NOT EXISTS` guards on table and index).
NFR-02: `getAggregateMacroSentiment` shall follow the existing `news-intelligence.ts` code style: direct `export async function` declaration, no destructured options object, `[NEWS]`-prefixed console logging at key points, helpers interleaved with exports.
NFR-03: New code shall be covered by unit tests reaching the project's 80% minimum coverage bar for the added logic.

## Constraints

C-01: This feature must not modify the Protected Zone (`src/lib/config.ts`, `src/lib/claude-agent.ts`, `src/lib/risk-manager.ts`, `src/lib/indicators.ts`) — no changes are planned there, and none are needed.
C-02: This feature must not modify `getRecentNewsClassifications()`, `buildThresholdMap()`, `newsIntelligenceLayer()`, or any other existing function in `news-intelligence.ts`.
C-03: This feature must not modify the `NewsEvent`/`NewsClassification` type declarations in `src/lib/types.ts`.
C-04: This feature must not modify any table or migration other than the new `market_daily_briefings` migration.
C-05: This feature must not modify `claude-agent.ts` or `stock-selector.ts` — wiring into the agent cycle is out of scope (Prompt 3/3).
C-06: Any change to `src/lib/news-intelligence.ts` or any new database migration requires explicit confirmation from Amaury before implementation, per `specs/README.md`'s protected-zone reminder.

## Out of Scope

- Populating `market_daily_briefings` rows (spx snapshot, sector rotation, narrative) — this prompt only creates the table.
- The Claude-synthesized narrative generation logic (Prompt 2/3).
- The "first cycle of day" detection check against `briefing_date` (Prompt 2/3) — this prompt only creates the unique index that check will rely on.
- Wiring `getAggregateMacroSentiment` or the new table into `runAgentCycle()` or `selectStocksForAnalysis()` (Prompt 3/3).
- VIX proxy and economic-calendar data population — columns are reserved but not filled by this prompt.
- RLS policies — the migration enables RLS but defines no policies, matching the `position_health_snapshots` convention.
