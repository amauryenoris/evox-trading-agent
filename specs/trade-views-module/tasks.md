# Tasks — Pure trade-views module + configurable /api/trades limit (no UI)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (if applicable) — N/A, none touched
- [x] Database migrations drafted (if applicable) — N/A, none needed

## Implementation Checklist

### Phase 1 — Data/Logic Layer (`src/lib/trade-views.ts`)
- [x] T-01: Create `src/lib/trade-views.ts`; import `TradeEvaluation` from `./types` only — no other imports.
- [x] T-02: Export constants `MIN_BUCKET_N = 8`, `LOW_SAMPLE_N = 20`, `SYMBOL_SETUP_WARN_N = 5`.
- [x] T-03: Implement `summarizeTrades(trades: TradeEvaluation[])` — `n`, `wins`, `winRate` (0–1), `avgPnlPct`,
  `medianPnlPct` (even/odd-aware), `worstPnlPct`, `bestPnlPct`; return nulls for stats and `n: 0` on empty input;
  never rescale `pnlPct`.
- [x] T-04: Implement `buildTimeline(trades: TradeEvaluation[])` — sort by `sellTimestamp` desc (tie-break by
  `id`); map `signal_type` null → `'UNKNOWN'`; `lessons` from `lessonsLearned ?? []`; build `fingerprintChips`
  from `stateFingerprint.{adx_bucket,macd_bucket,z_bucket,atr_bucket,market_regime}` as `"adx:VALUE"` etc.,
  omitting null fields and handling a null/undefined `stateFingerprint`.
- [x] T-05: Implement `groupBySymbol(trades: TradeEvaluation[])` — sort by `n` desc then `symbol` asc; per
  symbol: overall `summarizeTrades`, `bySetup` map (summary + `lowSample = n < SYMBOL_SETUP_WARN_N`), trades
  newest-first.
- [x] T-06: Implement `groupBySetup(trades: TradeEvaluation[])` — sort by `n` desc; per setup: overall
  `summarizeTrades`, `tradesWithFingerprint` count, and `buckets` computed one dimension at a time over
  `adx_bucket`, `macd_bucket`, `z_bucket`, `atr_bucket`, `market_regime` — only buckets with `n >= MIN_BUCKET_N`,
  each with `lowSample = n < LOW_SAMPLE_N`, sorted by dimension then `n` desc; never combine dimensions.
- [x] T-07: Implement `clampTradesLimit(raw: string | null): number` — default `50` on missing/non-integer
  input, clamp to `[1, 500]`.
- [x] T-08: Verify no function mutates its `trades` argument or any nested object (use `[...trades]` /
  `.slice()` before sorting; never assign into input objects).

### Phase 2 — API Layer (`src/app/api/trades/route.ts`)
- [x] T-09: Change `GET()` to `GET(request: Request)`; read `limit` via
  `new URL(request.url).searchParams.get('limit')`, following the pattern in
  `src/app/api/performance/route.ts:9-13`.
- [x] T-10: Pass the result through `clampTradesLimit` (imported from `@/lib/trade-views`) into
  `getTradeEvaluations(limit)`.
- [x] T-11: Confirm existing auth/middleware and error handling (`try/catch` → 500 on error) are left untouched.

### Phase 3 — Testing (`src/lib/__tests__/trade-views.test.ts`)
- [x] T-12: Empty-input cases for `summarizeTrades`, `buildTimeline`, `groupBySymbol`, `groupBySetup`.
- [x] T-13: `summarizeTrades` math — win rate, avg, median with both even and odd trade counts, worst/best.
- [x] T-14: `buildTimeline` — sort order (including a `sellTimestamp` tie broken by `id`), chip construction,
  and null-field omission (including a fully-null `stateFingerprint`).
- [x] T-15: `groupBySymbol` — a single-trade symbol flagged `lowSample`, and a symbol with several setups.
- [x] T-16: `groupBySetup` bucket threshold — a bucket with 7 trades excluded, one with 8 included; `lowSample`
  true at 19 trades, false at 20.
- [x] T-17: Legacy data — `signal_type: null` maps to `'UNKNOWN'` everywhere it appears.
- [x] T-18: Non-mutation — assert the input array/objects are unchanged (e.g. deep-equal snapshot or
  `Object.isFrozen`-style check) after calling each exported function.
- [x] T-19: `clampTradesLimit` — default on missing/invalid input, clamp at the low end (e.g. `0` → `1`), clamp
  at the high end (e.g. `9999` → `500`).

### Phase 4 — Verification
- [x] T-20: Run `npx tsc --noEmit` — must be clean.
- [x] T-21: Run the full Vitest suite — must pass, including pre-existing tests.
- [x] T-22: Confirm `GET /api/trades` with no query parameters still calls `getTradeEvaluations(50)` (trace the
  call or add a quick manual check — no new route test is required by scope).

## Post-Implementation

- [x] Run `/review trade-views-module` to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged (`config.ts`, `claude-agent.ts`, `risk-manager.ts`,
  `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts`, any migration)
- [x] Confirm `src/lib/db.ts` and `src/lib/types.ts` unchanged
- [x] Confirm no new npm dependency was added (`package.json` diff empty)

## Estimated Complexity

**Low** — one new pure-function module with no I/O, one small route change following an existing in-repo
pattern (`performance/route.ts`), and no schema, dependency, or Protected Zone changes. The main effort is in
precise test coverage (median/bucket-threshold edge cases), not architecture.
