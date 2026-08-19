# Design — Market Daily Briefing (Prompt 1/3: Table + Aggregate Macro Sentiment)

## Architecture Decision

This prompt lays the persistence and data-aggregation foundation for the larger Market Daily Briefing feature, without touching decision logic. It has two independent halves:

1. A Supabase migration creating `market_daily_briefings`, following the exact structural convention of the `position_health_snapshots` migration (`supabase/migrations/20260708191525_create_position_health_snapshots.sql`): `IF NOT EXISTS` table guard, `uuid` PK via `gen_random_uuid()`, a targeted index, RLS enabled with no policies in the same migration.
2. A new pure aggregation function `getAggregateMacroSentiment(hours)` added to `src/lib/news-intelligence.ts`, which composes the existing, unmodified `getRecentNewsClassifications(hours)` from `src/lib/db.ts`. It performs client-side filtering/counting only — no new SQL, no new `db.ts` function.

The design deliberately keeps the two halves decoupled: the table is not read from or written to by `getAggregateMacroSentiment` in this prompt. That wiring (writing a daily row, reading it back for "already ran today" detection) is deferred to Prompt 2/3, once narrative generation exists to fill the row.

## Data Flow

```
news_events table (Supabase)
        │
        │  db.ts: getRecentNewsClassifications(hours)
        │  .select('scope, symbol, sentiment, impact, threshold_adjustment')
        ▼
NewsEvent[]  (runtime shape: only scope/symbol/sentiment/impact/threshold_adjustment
              are populated — other NewsEvent fields are undefined at runtime
              despite the type; verified against db.ts:590-599)
        │
        │  news-intelligence.ts: getAggregateMacroSentiment(hours)
        │  filter(c => c.scope === 'MACRO')
        │  count by c.sentiment
        ▼
MacroSentimentSummary { bullishCount, bearishCount, neutralCount }
```

`market_daily_briefings` is created but not written to or read from in this data flow — it exists as a destination for Prompt 2/3's narrative-assembly step.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Add a new `db.ts` function that runs a `GROUP BY scope, sentiment` query in SQL | Fewer rows transferred over the wire | New `db.ts` surface to test/maintain; duplicates filtering logic already implicit in `getRecentNewsClassifications`; breaks the "read-only consumer" constraint on `db.ts` | Rejected |
| Compute the aggregate in-memory in `news-intelligence.ts` on top of `getRecentNewsClassifications` | Reuses existing, already-tested data access function; matches file's existing pattern (`newsIntelligenceLayer` already reshapes `getRecentNewsClassifications` output at line 187-198); watchlist-independent | Slightly more data transferred than a SQL aggregate (bounded by recent-hours window, already small) | Chosen |
| Time-of-day heuristic for "first cycle of day" detection | No new column/index needed | Fragile against cron misfires, manual triggers, DST — explicitly rejected in prior diagnostic | Rejected (not part of this prompt, but the unique-index-based alternative is what this prompt's schema supports) |
| Row-existence check on `briefing_date` via unique index | Robust against misfires/manual triggers/reruns | Requires a dedicated column + unique index | Chosen (schema only — check logic itself is Prompt 2/3) |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `supabase/migrations/{timestamp}_create_market_daily_briefings.sql` | CREATE | New migration: `market_daily_briefings` table, unique index on `briefing_date`, RLS enabled |
| `src/lib/news-intelligence.ts` | MODIFY | Add `MacroSentimentSummary` interface and `getAggregateMacroSentiment(hours)` function; add `getRecentNewsClassifications` to the existing `db.ts` import list |
| `src/lib/__tests__/` | CREATE | New test file for `getAggregateMacroSentiment` (mixed scope/sentiment, empty input, all-one-sentiment) |

No files outside this list are touched. `db.ts`, `types.ts`, `claude-agent.ts`, `stock-selector.ts`, and all other `news-intelligence.ts` functions are unchanged.

## Protected Zone Impact

None of `config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts` (the CLAUDE.md hard Protected Zone) are touched.

⚠️ However, per `specs/README.md`'s protected-zone reminder (which additionally lists `news-intelligence.ts` and "any DB migration"), this spec **does** touch both `src/lib/news-intelligence.ts` and a new database migration. **Requires Amaury's explicit confirmation before implementation**, even after this spec is approved.

## Database Changes

New table `market_daily_briefings` (see requirements.md FR-01–FR-03 for behavioral requirements):

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | `gen_random_uuid()` default |
| `briefing_date` | `text NOT NULL` | Unique-indexed; drives Prompt 2/3's first-cycle-of-day check |
| `created_at` | `timestamptz NOT NULL` | `now()` default |
| `spx_price`, `spx_sma50`, `spx_sma200` | `double precision` | Nullable — filled by a later prompt |
| `spx_regime` | `text` | Nullable — filled by a later prompt |
| `gdx_relative_strength_pct`, `xle_relative_strength_pct`, `xlk_relative_strength_pct` | `double precision` | Nullable — sector rotation inputs, filled by a later prompt |
| `macro_sentiment_bullish_count`, `macro_sentiment_bearish_count`, `macro_sentiment_neutral_count` | `integer` | Nullable — populated from `getAggregateMacroSentiment` output in Prompt 2/3 |
| `narrative` | `text` | Nullable — filled by Prompt 2/3 |
| `vix_proxy_change` | `double precision` | Nullable — reserved for a deferred input, per the additive-design decision |
| `upcoming_events_note` | `text` | Nullable — reserved for a deferred input, per the additive-design decision |

Indexes: `UNIQUE INDEX idx_market_daily_briefings_date ON market_daily_briefings (briefing_date)`.

RLS: enabled on the table; no policies defined in this migration (matches `position_health_snapshots` convention — policies, if any, are added separately).

## Open Questions

- None. All design decisions were resolved in the prior 2-round diagnostic per the prompt's stated context.
