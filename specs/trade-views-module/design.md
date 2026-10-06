# Design — Pure trade-views module + configurable /api/trades limit (no UI)

## Architecture Decision

This change adds one new file, `src/lib/trade-views.ts`, alongside the existing `src/lib/` utility layer. It
exports pure functions over `TradeEvaluation[]` (imported from `./types`, unmodified) and performs no I/O —
it does not call Supabase, Alpaca, or Claude, and takes no dependency on `db.ts`. `src/app/api/trades/route.ts`
stays a thin handler: it reads the `limit` query parameter, delegates parsing/clamping to a pure helper, and
calls the existing `getTradeEvaluations(limit)`. This mirrors the pattern already used by
`src/app/api/performance/route.ts`, which reads `since` from `new URL(request.url).searchParams` and passes it
straight through to `getTradeEvaluations(200, since)`.

The limit-parsing/clamping logic is extracted into `trade-views.ts` as its own exported pure function
(`clampTradesLimit(raw: string | null): number`) rather than written inline in the route. Reason: the spec's
test file (`src/lib/__tests__/trade-views.test.ts`) imports the module directly and must cover "the limit
parsing helper if you extract one (default, invalid, clamp low and high)" — testing it as a pure function avoids
mocking `NextRequest`/`NextResponse` just to exercise four branches of integer parsing, consistent with this
repo's existing constraint of no `@testing-library` and no component-level test harness.

Because this CHANGE builds only the data/logic layer, `trade-views.ts`'s grouping and summarizing functions
(`summarizeTrades`, `buildTimeline`, `groupBySymbol`, `groupBySetup`) have no caller yet outside the test file.
They are intentionally unwired — the next CHANGEs will call them from dashboard components that fetch
`/api/trades` and transform the result client-side (or from a future server-rendered view). This keeps the
module trivially testable in isolation now and avoids speculative UI work ahead of the CHANGEs that define it.

## Data Flow

```
Supabase trade_evaluations table
          │
          ▼
getTradeEvaluations(limit, startDate?)   [src/lib/db.ts — UNCHANGED]
          │  returns TradeEvaluation[]
          ▼
GET /api/trades?limit=N                  [src/app/api/trades/route.ts — MODIFIED]
   1. const { searchParams } = new URL(request.url)
   2. const limit = clampTradesLimit(searchParams.get('limit'))   ← from trade-views.ts
   3. const trades = await getTradeEvaluations(limit)
   4. return NextResponse.json(trades)                            ← shape unchanged
          │
          ▼
(Future CHANGEs only) summarizeTrades / buildTimeline / groupBySymbol / groupBySetup
   consume the same TradeEvaluation[] client-side or server-side — not wired in this CHANGE.
```

No new network calls, no new Supabase queries, no schema changes. The only behavioral change to the route is
that `limit` becomes caller-controlled instead of hardcoded, with the hardcoded value (50) preserved as the
default.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Inline limit parsing directly in `route.ts` | Fewer files; matches `performance/route.ts`'s inline `since` parsing | Can't unit-test the four parsing branches (default/invalid/clamp-low/clamp-high) without mocking `Request`/`NextResponse`, which this repo has no pattern for on pure validation logic | Rejected |
| Extract `clampTradesLimit` into `trade-views.ts` | Pure, directly unit-testable with Vitest exactly as the spec's test list requires; keeps route.ts a thin passthrough | One more exported symbol in a module that is otherwise about trade aggregation, not HTTP parsing | **Chosen** |
| Compute aggregates (summaries/buckets) in a Supabase view or SQL query | Pushes computation to the DB; smaller payload | Forbidden by scope (no migration, no `db.ts` change); dataset is capped at 500 rows so in-memory computation is cheap; keeps logic framework-agnostic and testable without a live DB | Rejected |
| Combine fingerprint dimensions (e.g. `adx_bucket` × `macd_bucket`) into `groupBySetup` buckets | Finer-grained pattern discovery | Explicitly forbidden by spec ("Never combine dimensions"); combinatorial buckets fragment already-small sample sizes further, undermining the `MIN_BUCKET_N`/`LOW_SAMPLE_N` sample-size safeguards | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/trade-views.ts` | CREATE | Pure functions: `summarizeTrades`, `buildTimeline`, `groupBySymbol`, `groupBySetup`, `clampTradesLimit`; constants `MIN_BUCKET_N`, `LOW_SAMPLE_N`, `SYMBOL_SETUP_WARN_N` |
| `src/lib/__tests__/trade-views.test.ts` | CREATE | Vitest coverage per FR list below |
| `src/app/api/trades/route.ts` | MODIFY | Read `limit` from `request.url` query string, clamp via `clampTradesLimit`, pass to `getTradeEvaluations(limit)`; no-parameter behavior unchanged |

No other file is read or written by this change. `src/lib/db.ts`, `src/lib/types.ts`, and every Protected Zone
file are untouched.

## Protected Zone Impact

None — this feature does not require Protected Zone changes. `trade-views.ts` and the `/api/trades` route are
both in the "touch freely" column of the file permission matrix in `CLAUDE.md`.

## Database Changes

None. No new table, column, index, or RLS policy. `getTradeEvaluations`'s existing signature
(`limit = 200, startDate?: string`) already accepts the `limit` this change needs — confirmed by reading
`src/lib/db.ts:290`.

## Pre-Implementation Verification (FAIL FAST check — already performed)

- `TradeEvaluation.stateFingerprint` field names (`src/lib/types.ts:231-239`): `adx_bucket`, `macd_bucket`,
  `z_bucket`, `atr_bucket`, `market_regime` — **match** the spec exactly. No STOP condition triggered.
- `getTradeEvaluations(limit = 200, startDate?: string)` (`src/lib/db.ts:290`) — **already accepts** a `limit`
  parameter. No STOP condition triggered.

## Open Questions

- None. All FAIL FAST conditions were checked against the current codebase and passed; no clarification is
  needed from Amaury before implementation.
