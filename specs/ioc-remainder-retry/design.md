# Design — Bounded Remainder Retry for Partial IOC BUY Fills

## Architecture Decision

A single new helper, `executeIocWithRemainderRetry()`, lives in `src/lib/claude-agent.ts` immediately next to `resolveIocFinalState()` (which it calls once per order attempt, unchanged). Both existing BUY execution sites — the immediate path (`:2184-2213`) and the ranking-queue path (`:2369-2398`) — replace their duplicated `submitLimitOrder` + `resolveIocFinalState` + `filledQty` block with one call to this helper. Everything downstream of the fill (stop submission, position context, agent_log) is untouched in *logic* — it simply reads the helper's aggregated `totalFilledQty`/`attempts` instead of a single order's `filled_qty`. `types.ts` gains one optional field. This is a Protected Zone change (`claude-agent.ts`) — **⚠️ requires Amaury's explicit confirmation before implementation**, on top of spec approval.

## Data Flow

```
BUY sizing (unchanged) → qty, requestedQty known
       │
       ▼
Immediate path: quote fetched earlier (:2106), limitPrice = quote.ask (:2185, unchanged)
Ranking path:   rankingQuote fetched right before (:2368), limitPrice = rankingQuote.ask (unchanged)
       │
       ▼
executeIocWithRemainderRetry(symbol, requestedQty, firstLimitPrice)
  │
  ├─ Attempt 1 (always): submitLimitOrder(symbol, requestedQty, 'buy', firstLimitPrice)
  │                        → resolveIocFinalState(syncOrder)   [IDENTICAL to today]
  │                        → attempts[0] = { orderId, qtyRequested: requestedQty,
  │                                           qtyFilled, limitPrice: firstLimitPrice,
  │                                           avgFillPrice, status }
  │                        → totalFilledQty = attempts[0].qtyFilled
  │
  ├─ if totalFilledQty === 0 → return now. No retry, ever. (FR-03, C-03)
  │
  ├─ for i in 1..IOC_REMAINDER_RETRY_MAX, while totalFilledQty < requestedQty:
  │     remainder = requestedQty - totalFilledQty
  │     freshQuote = await getQuote(symbol)
  │     gate: freshQuote && freshQuote.fresh && freshQuote.spreadBps <= MAX_SPREAD_BPS
  │           && freshQuote.ask <= firstLimitPrice * (1 + IOC_RETRY_MAX_DRIFT_BPS/10000)
  │           && remainder * freshQuote.ask >= IOC_RETRY_MIN_REMAINDER_USD
  │     if gate fails → break (keep what's filled, no error)
  │     try:
  │       order = submitLimitOrder(symbol, remainder, 'buy', freshQuote.ask)
  │       order = resolveIocFinalState(order)                  [IDENTICAL call, reused]
  │       attempts.push({ orderId, qtyRequested: remainder, qtyFilled, limitPrice: freshQuote.ask, avgFillPrice, status })
  │       totalFilledQty += qtyFilled   (clamped, never > requestedQty — FR-11)
  │     catch (err): log it, break — attempts already recorded are kept (FR-12)
  │
  └─ avgFillPrice = Σ(attempt.avgFillPrice × attempt.qtyFilled) / totalFilledQty   (null if totalFilledQty === 0)
     return { totalFilledQty, avgFillPrice, attempts, firstOrder: attempts[0] }
       │
       ▼
Both BUY paths (unchanged downstream logic, new source of truth):
  decision.quantity = totalFilledQty                    (was: filledQty from the single order)
  agent_log.order_id = firstOrder.id                     (was: order.id — same value, attempt 1's id)
  submitStopWithRetry(symbol, totalFilledQty, stopPrice) (was: filledQty — same call, aggregated qty)
  indicatorsAtBuy.fillAttempts = attempts                 (NEW — follows requestedQty's exact pattern)
  saveOpenPositionContext({ quantity: totalFilledQty, buyPrice: indicators.currentPrice, ... })
                                                           (buyPrice UNCHANGED — see Background)
```

## Per-attempt `avgFillPrice` — resolved interpretation

FR-13's fallback rule ("if an order lacks `filled_avg_price`, use that order's limit price, and log it") is read as applying specifically when `qtyFilled > 0` but `filled_avg_price` is unexpectedly absent — a genuine data-quality edge case worth logging. For an order with `qtyFilled === 0` (a retry that came back fully unfilled, or a `canceled` status with nothing filled), `attempts[i].avgFillPrice` is recorded as `null` — there is no price to report, and because its weight in the aggregate (`qtyFilled`) is 0, this can never skew the weighted average regardless of what value would otherwise be chosen. This is a mechanical, low-risk resolution (the math is identical either way) rather than a design fork, so it's resolved here rather than escalated.

## Attempt 1 vs. retry error handling

"Attempt 1 = exactly today's behavior" (SCOPE) is read to include *error propagation*, not just the request shape: today, any exception during order submission/resolution propagates up to the existing outer `try/catch` at the BUY-execution call site (`error = String(execErr)`, `:2283`/`:2479`) — unchanged by this feature. Only the **retry** attempts (loop iterations 2+) get their own internal `try/catch` inside the helper, per FR-12, so a retry's failure can't erase the `attempts` already accumulated from attempt 1. Attempt 1 itself is not wrapped in an extra try/catch inside the helper — if it throws, the helper throws, exactly as `submitLimitOrder`/`resolveIocFinalState` do today at both call sites.

## Constant placement

SCOPE says "named constants at top of the file." The file already groups its `IOC_*` constants (`IOC_NOT_FILLED`, `STOP_SUBMIT_FAILED`, `IOC_LATE_FILL`, `claude-agent.ts:987-989`) immediately above `resolveIocFinalState()` — not literally at line 1 (which is the import block). `IOC_REMAINDER_RETRY_MAX`, `IOC_RETRY_MAX_DRIFT_BPS`, and `IOC_RETRY_MIN_REMAINDER_USD` are placed alongside that existing group, satisfying both "top of file" (it's the constants section, not buried mid-function) and "next to `resolveIocFinalState()`" (SCOPE item 1) without contradiction.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| One shared helper for both BUY paths | Matches SCOPE item 2 exactly; the two paths' submit+resolve shape is already structurally identical (verified) | None identified | **Chosen** |
| Two near-duplicate helpers, one per path | Would avoid any shared-object risk entirely | Directly violates SCOPE item 2 ("replacing the duplicated submit+resolve blocks" implies one helper); duplicates logic the two paths already share | Rejected |
| Rewire `buyPrice` to the new `avgFillPrice` aggregate | More accurate entry price | Touches a financial field read by code outside this feature's stated scope (P&L, exit evaluations, dashboard); `saveOpenPositionContext` itself is explicitly forbidden from changing, and this would change what's passed into it | Rejected — user decision 2026-09-30, see Background |
| Leave `buyPrice` as `indicators.currentPrice` | Zero ripple risk; matches the `requestedQty` precedent exactly (additive-only observability) | `buyPrice` stays slightly inaccurate relative to real execution price, same as today — not a regression, just not improved by this feature | **Chosen** |
| `attempts[i].avgFillPrice = null` for a zero-fill order | Mechanically correct (zero weight in the aggregate either way); avoids inventing a misleading "price paid" for zero shares | None — the aggregate math is unaffected by this choice | **Chosen** |
| Attempt 1 wrapped in its own try/catch inside the helper (symmetric with retries) | Simpler mental model — "every attempt is guarded" | Changes attempt 1's error-propagation behavior versus today (an exception would now be caught/logged instead of propagating to the existing outer catch) — violates "Attempt 1 = exactly today's behavior" | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY ⚠️ Protected Zone | New `executeIocWithRemainderRetry()` helper + 3 new named constants (next to `resolveIocFinalState()`); both BUY paths call the helper instead of their duplicated submit+resolve blocks; `fillAttempts` threaded into `indicatorsWithLearning`/`indicatorsAtBuy` (immediate path, following the `requestedQty` pattern) and into `best.entry.indicators`/`bestIndicatorsAtBuy` (ranking path, via a fresh spread) |
| `src/lib/types.ts` | MODIFY | Add optional `fillAttempts?: Array<{ orderId, qtyRequested, qtyFilled, limitPrice, avgFillPrice: number \| null, status }>` to `TechnicalIndicators`, immediately after `requestedQty` |
| `src/lib/__tests__/ioc-remainder-retry.test.ts` | CREATE | New test file, inline-replica convention (matching `ema-reclaim-observability.test.ts`'s pattern of replicating pure logic inline rather than importing from `claude-agent.ts`) |

No other file changes. `setups.ts`, `gate-importance.ts`, `db.ts`, `alpaca.ts`, `risk-manager.ts`, `indicators.ts`, `config.ts`, `learning.ts` are all untouched.

## Protected Zone Impact

**⚠️ Requires Amaury confirmation before implementation.** `claude-agent.ts` is on `CLAUDE.md`'s Protected Zone list ("Decision pipeline, signal detection, exit rules, position sizing formula"). This feature touches the BUY execution path specifically — not setup detection, not exit rules, not the sizing formula — but it is still `claude-agent.ts`, and per `specs/README.md`'s rule this needs separate, explicit sign-off even after the spec itself is approved.

## Database Changes

None. `fillAttempts` rides inside the existing `indicators` JSONB column on both `agent_log` and `open_position_contexts`, exactly as `requestedQty` (commit `c4cf2d3`) did — no migration needed.

## Open Questions

None outstanding. The one genuine fork found during spec research (`buyPrice` derivation) was resolved by user decision on 2026-09-30 (see Background): `buyPrice` stays `indicators.currentPrice`, unchanged. The two other FAIL FAST conditions in the CHANGE (shared-helper feasibility, ranking-path object safety) were investigated and are **not** triggered — both are achievable exactly as scoped (see Background, items 1-2).
