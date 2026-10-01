# Tasks — Bounded Remainder Retry for Partial IOC BUY Fills

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] **Protected Zone changes confirmed** — `src/lib/claude-agent.ts` is touched. Spec approval alone does not satisfy this; needs Amaury's separate, explicit sign-off before `/implement` proceeds, per `specs/README.md`'s Protected Zone rule.
- [x] Database migrations drafted — N/A, none required (`fillAttempts` rides the existing `indicators` JSONB column)

## Implementation Checklist

### Phase 1 — Helper + constants

- [x] T-01: Add `IOC_REMAINDER_RETRY_MAX = 2`, `IOC_RETRY_MAX_DRIFT_BPS = 20`, `IOC_RETRY_MIN_REMAINDER_USD = 300` to `claude-agent.ts`, grouped with the existing `IOC_NOT_FILLED`/`STOP_SUBMIT_FAILED`/`IOC_LATE_FILL` constants (`:987-989`).
- [x] T-02: Implement `executeIocWithRemainderRetry(symbol, requestedQty, firstLimitPrice)` next to `resolveIocFinalState()`. Attempt 1: `submitLimitOrder` + `resolveIocFinalState`, unwrapped (propagates on throw, matching today). If `totalFilledQty === 0` after attempt 1, return immediately — no retry loop entered.
- [x] T-03: Implement the retry loop (up to `IOC_REMAINDER_RETRY_MAX` iterations): per-retry gate (fresh quote exists + fresh + spread ≤ `MAX_SPREAD_BPS` + ask ≤ `firstLimitPrice × (1 + IOC_RETRY_MAX_DRIFT_BPS/10000)` + `remainder × ask ≥ IOC_RETRY_MIN_REMAINDER_USD`); break (keep prior fills) on first failing gate; wrap the submit+resolve call in try/catch, logging and breaking (keeping prior fills) on throw.
- [x] T-04: Implement the `avgFillPrice` aggregate: per-attempt weighted by `qtyFilled`, `filled_avg_price` preferred, limit-price fallback (logged) only when `qtyFilled > 0` and `filled_avg_price` is absent; `null` per-attempt when `qtyFilled === 0`; overall aggregate `null` when `totalFilledQty === 0`.
- [x] T-05: Clamp `totalFilledQty` so it can never exceed `requestedQty` (defensive; should be unreachable given Alpaca's own qty-bound behavior, but required per FR-11).
- [x] T-06: Add the `IOC_REMAINDER_RETRY: requested X, attempts N, filled Y` summary log line, emitted once per BUY after the helper returns, alongside the existing per-attempt `[ORDER]` lines (unchanged).

### Phase 2 — Wire into the immediate-execution BUY path

- [x] T-07: Replace `claude-agent.ts:2186-2189`'s `submitLimitOrder` + `resolveIocFinalState` + `filledQty` block with one call to `executeIocWithRemainderRetry(symbol, qty, quote.ask)`. `decision.quantity = fillResult.totalFilledQty`; zero-fill branch (`:2191-2194`) keyed off `fillResult.totalFilledQty === 0`, unchanged error/HOLD semantics.
- [x] T-08: `orderId = fillResult.firstOrder.id` (`:2200`, unchanged semantics — attempt 1's id); `submitStopWithRetry(symbol, fillResult.totalFilledQty, stopPrice)` (`:2209`, aggregated qty).
- [x] T-09: Hoist `let fillAttempts: FillAttempt[] | undefined` alongside the existing `let requestedQty` (`:2093`); set it from `fillResult.attempts` inside the BUY-success branch; thread it into `indicatorsWithLearning` (`:2294-2304`) via the same conditional-spread pattern as `requestedQty`.
- [x] T-10: Assign `indicatorsAtBuy.fillAttempts = fillResult.attempts` directly (mirroring `indicatorsAtBuy.requestedQty = qty`, `:2230`), before `saveOpenPositionContext` (`:2256`). `buyPrice: indicators.currentPrice` (`:2259`) left untouched.

### Phase 3 — Wire into the ranking-queue BUY path

- [x] T-11: Replace `claude-agent.ts:2370-2373`'s equivalent block with `executeIocWithRemainderRetry(best.symbol, best.qty, rankingQuote.ask)`. `best.decision.quantity = fillResult.totalFilledQty`; zero-fill branch (`:2375-2378`) keyed off `fillResult.totalFilledQty === 0`, unchanged.
- [x] T-12: `best.entry.orderId = fillResult.firstOrder.id` (`:2384`); `submitStopWithRetry(best.symbol, fillResult.totalFilledQty, stopPrice)` (`:2394`, aggregated qty).
- [x] T-13: At the point `best.decision.quantity` is set, reassign `best.entry.indicators = { ...best.entry.indicators, fillAttempts: fillResult.attempts }` — a fresh object, never a mutation of the existing one. Assign `bestIndicatorsAtBuy.fillAttempts = fillResult.attempts` directly (mirroring `bestIndicatorsAtBuy.requestedQty = best.qty`, `:2412`), before `saveOpenPositionContext` (`:2460`). `buyPrice: best.indicators.currentPrice` (`:2463`) left untouched. Confirm no assignment in this phase touches the shared `indicatorsCache` Map (`:1231`) or any object still referenced by it.

### Phase 4 — Types

- [x] T-14: Add `fillAttempts?: Array<{ orderId: string; qtyRequested: number; qtyFilled: number; limitPrice: number; avgFillPrice: number | null; status: string }>` to `TechnicalIndicators` in `types.ts`, immediately after `requestedQty?: number`.

### Phase 5 — Tests

- [x] T-15: Create `src/lib/__tests__/ioc-remainder-retry.test.ts` following the inline-replica convention (`ema-reclaim-observability.test.ts`): replicate the retry-loop's pure decision logic (gate checks, aggregation math, attempts-array construction) inline, with injected/mocked quote-fetch and order-submit functions — not a direct import of `executeIocWithRemainderRetry` from `claude-agent.ts`.
- [x] T-16: Test — full fill on attempt 1: no retry entered, `attempts.length === 1`.
- [x] T-17: Test — partial then full: 2 attempts, correct `qtyRequested`/`qtyFilled` per entry, `totalFilledQty === requestedQty`.
- [x] T-18: Test — partial then zero-fill retry: retry attempted (prior fill was > 0 and < requested), zero-fill retry recorded as its own `attempts[]` entry, `totalFilledQty` keeps the first partial's quantity, no further retry after a zero-fill retry.
- [x] T-19: Test — drift above `IOC_RETRY_MAX_DRIFT_BPS`: no retry submitted, prior fill kept.
- [x] T-20: Test — remainder notional below `IOC_RETRY_MIN_REMAINDER_USD`: no retry submitted, prior fill kept.
- [x] T-21: Test — attempts cap: exactly `IOC_REMAINDER_RETRY_MAX` retries attempted even if still partial after the last one, loop then stops.
- [x] T-22: Test — a retry throws: error caught and logged, fills from prior attempts preserved, `attempts[]` for prior attempts intact.
- [x] T-23: Test — zero fill on attempt 1: no retry loop entered at all, `attempts.length === 1`, `totalFilledQty === 0`.
- [x] T-24: Test — weighted `avgFillPrice`: 2+ attempts with different fill prices/quantities, assert the aggregate matches the fill-quantity-weighted formula.

### Phase 6 — Verification

- [x] T-25: Run `npx tsc --noEmit` — must be clean.
- [x] T-26: Run `npm test` — full suite passes, no regressions.
- [x] T-27: Show the helper in full and both call sites in the implementation report.
- [x] T-28: Explain, with reference to the actual code, why `IOC_REMAINDER_RETRY_MAX = 0` reproduces today's flow exactly (loop bound is 0 iterations → `attempts.length === 1` always).
- [x] T-29: Confirm in the report that the stop order is submitted exactly once per BUY, sized at the aggregated `totalFilledQty`, for both paths.
- [x] T-30: Show a sample resulting `indicators` JSONB shape for (a) a full single-order fill (`fillAttempts.length === 1`) and (b) a partial fill followed by a completing retry (`fillAttempts.length === 2`).
- [x] T-31: State explicitly in the report that no live Alpaca behavior was exercised or verified — everything above is static/unit-test verification only.
- [x] T-32: Run `git diff --stat` — confirm it touches exactly `src/lib/claude-agent.ts`, `src/lib/types.ts`, and the one new test file. No other file.

## Post-Implementation

- [ ] Run `/review ioc-remainder-retry` to verify implementation matches spec
- [ ] Confirm Protected Zone file (`claude-agent.ts`) changes were explicitly approved, not just spec-approved

## Estimated Complexity

**Medium** — no new external dependencies, no schema/migration, no change to sizing/gates/stop logic, but it does restructure a Protected Zone execution path (the two BUY sites) and introduces retry timing/state that didn't exist before. The two BUY paths' required changes are structurally parallel (verified during spec research), which keeps the actual diff contained, but this is real trading-logic-adjacent surface and warrants the explicit Protected Zone sign-off called out above before implementation starts.
