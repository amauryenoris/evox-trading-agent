# Tasks — Record the real weighted fill price as buy_price (forward only)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed — `src/lib/claude-agent.ts`, scoped to the two
  `saveOpenPositionContext` call sites (~2386, ~2591) only; authorized explicitly in this conversation
- [x] Database migrations drafted (if applicable) — N/A, none needed

## Implementation Checklist

### Phase 1 — Normal-mode BUY path (`src/lib/claude-agent.ts:~2386`)
- [x] T-01: Immediately above the `saveOpenPositionContext({...})` call, add:
  `const buyPrice = fillResult.avgFillPrice !== null && Number.isFinite(fillResult.avgFillPrice) && fillResult.avgFillPrice > 0 ? fillResult.avgFillPrice : indicators.currentPrice`
- [x] T-02: Replace `buyPrice: indicators.currentPrice` in that call with `buyPrice` (the resolved local).
- [x] T-03: Confirm no other field in that call (`symbol`, `buyTimestamp`, `quantity`, `indicators`,
  `claudeReasoning`, `patternIdsUsed`, `stopOrderId`, `signalType`) changes.

### Phase 2 — Ranking-mode BUY path (`src/lib/claude-agent.ts:~2591`)
- [x] T-04: Immediately above that `saveOpenPositionContext({...})` call, add the equivalent:
  `const buyPrice = fillResult.avgFillPrice !== null && Number.isFinite(fillResult.avgFillPrice) && fillResult.avgFillPrice > 0 ? fillResult.avgFillPrice : best.indicators.currentPrice`
- [x] T-05: Replace `buyPrice: best.indicators.currentPrice` in that call with `buyPrice`.
- [x] T-06: Confirm no other field in that call changes.

### Phase 3 — Confirm nothing else moved
- [x] T-07: Diff `src/lib/claude-agent.ts` and confirm the only changed lines are the two new `const`
  declarations and the two `buyPrice` field values — no change to `executeIocWithRemainderRetry`,
  `buildFillAttempt`, `weightedAvgFillPrice`, the stop-price computations (~2337, ~2523, ~392, ~966), or the
  orphaned-position reconciliation block (~207-254, including line ~247).

### Phase 4 — Tests (`src/lib/__tests__/ioc-remainder-retry.test.ts`)
- [x] T-08: Add a new `describe` block replicating the resolution expression inline (per this file's
  existing convention), with cases:
  - Full single-order fill (`avgFillPrice` present, > 0) → resolved price equals the fill, not the quote.
  - Retry path: 41 shares @ 113.78 + 7 shares @ 113.77 → weighted average computed by the existing
    `weightedAvgFillPrice` replica → resolved price equals that weighted average, not the quote.
  - Fallback: `avgFillPrice` is `null` → resolved price equals the supplied fallback (quote/currentPrice).
  - Fallback: `avgFillPrice` is `0` or not finite (defensive case) → resolved price equals the fallback.

### Phase 5 — Verification
- [x] T-09: Run `npx tsc --noEmit` — must be clean.
- [x] T-10: Run the full Vitest suite — must pass.
- [x] T-11: Show the diff — expect only `src/lib/claude-agent.ts` (two small hunks) and
  `src/lib/__tests__/ioc-remainder-retry.test.ts`.
- [x] T-12: Explicitly confirm line ~247 (orphaned-position reconciliation) is byte-for-byte unchanged.
- [x] T-13: State plainly anything that could not be run (e.g., no live trading-cycle smoke test in this
  environment — this is a static code + unit-test verification only).

## Post-Implementation

- [x] Run `/review weighted-fill-buy-price` to verify implementation matches spec
- [x] Confirm Protected Zone touch stayed within the two authorized call sites — no other line of
  `claude-agent.ts`, and no other Protected Zone file, changed
- [x] Confirm `src/lib/learning.ts`, `src/lib/db.ts`, `src/lib/types.ts`, and every dashboard component are
  unchanged
- [x] Confirm no backfill/migration was written
- [x] Report the known side effect (trailing floor / Capa-B stop shift tighter) plainly, as required by
  `requirements.md`

## Estimated Complexity

**Low** — a 2-line behavioral change duplicated at two call sites in one Protected Zone file, with no new
exported surface, no schema change, and no dependency change. The only real effort is in getting the test
coverage right for the retry/weighted-average case the spec calls out by name, and in keeping the diff
honest about touching nothing else in a sensitive file.
