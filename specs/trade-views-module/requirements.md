# Requirements — Pure trade-views module + configurable /api/trades limit (no UI)

## Context

STEP 0 (2026-10-06) confirmed: `/api/trades` (`src/app/api/trades/route.ts`) calls `getTradeEvaluations(50)` and
returns the full `TradeEvaluation` shape untouched. `getTradeEvaluations(limit, startDate?)` in `src/lib/db.ts`
already accepts a `limit` parameter. `TradeEvaluation.stateFingerprint` (`src/lib/types.ts:231-239`) has fields
`adx_bucket`, `macd_bucket`, `z_bucket`, `atr_bucket`, `market_regime` — matching the field names required below.
No `@testing-library` package is installed and no component tests exist in this repo, so all new logic must be
pure functions tested with Vitest. This is CHANGE 1 of a multi-change effort; later changes will build a
chronological trade timeline, a per-symbol view, and a per-setup view on top of this data layer — no UI is built
in this change.

## Functional Requirements

FR-01: The system shall export a `summarizeTrades(trades)` pure function from `src/lib/trade-views.ts` that
computes `{ n, wins, winRate, avgPnlPct, medianPnlPct, worstPnlPct, bestPnlPct }` over an array of
`TradeEvaluation`.

FR-02: The system shall compute `winRate` as a 0–1 fraction (`wins / n`), not a percentage.

FR-03: The system shall treat `pnlPct` as already expressed in percent units and shall not rescale it anywhere
in `trade-views.ts`.

FR-04: The system shall return `{ n: 0, wins: 0, winRate: null, avgPnlPct: null, medianPnlPct: null,
worstPnlPct: null, bestPnlPct: null }` when `summarizeTrades` is called with an empty array.

FR-05: The system shall compute `medianPnlPct` as the average of the two middle values when `n` is even and as
the single middle value when `n` is odd.

FR-06: The system shall export a `buildTimeline(trades)` pure function that returns one `TimelineEntry` per
input trade, sorted by `sellTimestamp` descending, with ties broken by `id`.

FR-07: Where a trade's `signal_type` is `null` or `undefined`, the system shall map it to `'UNKNOWN'` in the
`setup` field of its `TimelineEntry`.

FR-08: The system shall populate `TimelineEntry.lessons` from `lessonsLearned` and shall default to `[]` when
`lessonsLearned` is absent.

FR-09: The system shall build `TimelineEntry.fingerprintChips` from `stateFingerprint` as strings in the form
`"adx:<value>"`, `"macd:<value>"`, `"z:<value>"`, `"atr:<value>"`, `"regime:<value>"`, reading `adx_bucket`,
`macd_bucket`, `z_bucket`, `atr_bucket`, `market_regime` respectively.

FR-10: The system shall omit a chip from `fingerprintChips` when its source field is `null`, `undefined`, or
`stateFingerprint` itself is `null`/`undefined`.

FR-11: The system shall export a `groupBySymbol(trades)` pure function that returns one `SymbolGroup` per
distinct `symbol`, sorted by trade count (`n`) descending, with ties broken alphabetically by `symbol`.

FR-12: Each `SymbolGroup` shall include an overall `summarizeTrades` result, a `bySetup` breakdown keyed by
setup (each value a `summarizeTrades` result plus `lowSample`), and that symbol's trades in chronological order
(newest first).

FR-13: Where a `SymbolGroup.bySetup[setup].n` is less than `SYMBOL_SETUP_WARN_N` (5), the system shall set
`lowSample: true` for that setup entry.

FR-14: The system shall export a `groupBySetup(trades)` pure function that returns one `SetupGroup` per
distinct setup, sorted by trade count (`n`) descending.

FR-15: Each `SetupGroup` shall include an overall `summarizeTrades` result and `tradesWithFingerprint` — the
count of that setup's trades with a non-null `stateFingerprint`.

FR-16: The system shall compute `SetupGroup.buckets` one fingerprint dimension at a time — `adx_bucket`,
`macd_bucket`, `z_bucket`, `atr_bucket`, `market_regime` — and shall never combine two dimensions into a single
bucket key.

FR-17: The system shall include a bucket in `SetupGroup.buckets` only when that bucket's trade count is greater
than or equal to `MIN_BUCKET_N` (8).

FR-18: Where a bucket's trade count is less than `LOW_SAMPLE_N` (20), the system shall set `lowSample: true` on
that bucket.

FR-19: The system shall sort `SetupGroup.buckets` by dimension, then by trade count (`n`) descending.

FR-20: The system shall export the constants `MIN_BUCKET_N = 8`, `LOW_SAMPLE_N = 20`, and
`SYMBOL_SETUP_WARN_N = 5` from `src/lib/trade-views.ts`.

FR-21: The system shall treat a missing or `null` `stateFingerprint` on a trade as contributing to no bucket in
`groupBySetup`.

FR-22: The system shall leave the input `trades` array and its elements unmodified by every exported function in
`trade-views.ts`.

FR-23: `GET /api/trades` shall accept an optional `limit` query parameter and shall pass the parsed value to
`getTradeEvaluations`.

FR-24: The system shall default `limit` to `50` when the query parameter is missing, non-numeric, or not an
integer.

FR-25: The system shall clamp a supplied `limit` to the inclusive range `1..500`.

FR-26: `GET /api/trades` called with no query parameters shall behave exactly as it does today, calling
`getTradeEvaluations(50)`.

## Non-Functional Requirements

NFR-01: Every exported function in `src/lib/trade-views.ts` shall be pure — no I/O, no `Date.now()`, no
`Math.random()` or other non-deterministic input, and no reliance on ambient state.

NFR-02: `npx tsc --noEmit` shall report zero errors after this change.

NFR-03: The full Vitest suite shall pass after this change, including the existing `/api/trades`-adjacent tests
if any exist.

NFR-04: New code shall follow the project's existing error-handling and naming conventions (`camelCase`
functions/variables, `UPPER_SNAKE_CASE` constants, no silent error swallowing).

## Constraints

C-01: This feature must not modify the Protected Zone (`src/lib/config.ts`, `src/lib/claude-agent.ts`,
`src/lib/risk-manager.ts`, `src/lib/indicators.ts`, `src/lib/news-intelligence.ts`,
`src/lib/watchlist-monitor.ts`, `src/lib/learning.ts`) without explicit confirmation from Amaury.

C-02: This feature must not modify `src/lib/db.ts`, `src/lib/types.ts`, or any Supabase migration.

C-03: This feature must not introduce any new npm dependency.

C-04: This feature must not add, change, or remove any UI component (`page.tsx`, `DashboardTabs.tsx`,
`PatternLibraryCard.tsx`, `AgentReasoningLog.tsx`, or any other dashboard component).

C-05: `pnlPct` must never be rescaled (multiplied or divided) anywhere in `trade-views.ts`.

C-06: Dollar-denominated totals (`pnlUSD` sums) must not be surfaced as a headline/primary metric in any
summary shape — `summarizeTrades` reports percentage-based stats only.

C-07: The existing auth/middleware behavior of `/api/trades` must remain unchanged.

## Out of Scope

- Any UI rendering of the timeline, per-symbol, or per-setup views (future CHANGEs).
- Adding tests for the `/api/trades` route handler itself (only the limit-parsing helper, if extracted into
  `trade-views.ts`, needs direct unit coverage per the VERIFY section).
- Combining more than one fingerprint dimension into a single bucket (e.g. `adx_bucket` × `macd_bucket`).
- Pagination, cursors, or any change to `getTradeEvaluations`'s existing signature or behavior.
- Backfilling `stateFingerprint` for trades evaluated before 2026-06-22.
