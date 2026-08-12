# Tasks — trailing-stop-limit-wiring (CHANGE 3b)

## Pre-Implementation

- [x ] Amaury has reviewed and approved this spec
- [x ] ⚠️ Protected Zone confirmation: Amaury has explicitly confirmed touching `src/lib/claude-agent.ts` (the "Jorge" authorization claimed in the source prompt does not satisfy this — see requirements.md C-01)
- [x ] Database migrations drafted (if applicable) — N/A, no schema change needed

## Implementation Checklist

### Phase 1 — Alpaca imports and retry helper
- [x] T-01: In `claude-agent.ts`, import `submitStopLimitOrder` and `cancelOrder` from `alpaca.ts` alongside the existing `submitStopOrder` import, without changing how `submitStopOrder` itself is imported or used.
- [x] T-02: Add `submitStopLimitWithRetry(symbol, filledQty, stopPrice, limitPrice, retryDelayMs = 3000)` immediately after `submitStopWithRetry()` (after line 843), mirroring its exact shape (2 attempts, 3000ms default delay, `{ stopOrderId, failureReason }` return type, `[TRAILING]`-prefixed log messages per the source prompt).

### Phase 2 — types.ts widening (confirmed necessary)
- [x] T-03: In `types.ts`, widen `OpenPositionContext.stopOrderId` from `string | undefined` to `string | null | undefined` (FR-19/C-02).

### Phase 3 — Trailing block wiring (inside `if (trailingActivated)`, PASO 3-4)
- [x] T-04: Capture `previousStop = ctx?.trailingStop ?? null` before `trailingStop` is recalculated.
- [x] T-05: After `trailingStop` is finalized, compute `stopIncreased` and `needsSelfHeal`, and determine whether a replacement is needed (`justActivated || stopIncreased || needsSelfHeal`).
- [x] T-06: Determine which order to cancel (Capa A vs. existing trailing order vs. skip), per FR-06/07/08.
- [x] T-07: Implement the cancel attempt (try/catch) and its failure path: no submit this cycle, no Supabase field changes, `console.warn`, cancel-failure `agent_log` alert (FR-09/10/11).
- [x] T-08: Implement the submit attempt via `submitStopLimitWithRetry()` and its success path: persist `trailingStopOrderId`, and `stopOrderId: null` explicitly if the Capa A order was cancelled (FR-12/13).
- [x] T-09: Implement the submit attempt's failure path: persist `trailingStopOrderId: null` explicitly (and `stopOrderId: null` if applicable), then submit-failure `agent_log` alert distinguishable from the cancel-failure text (FR-14/15/16).
- [x] T-10: Confirm no additional `agent_log` entry is added on the success path beyond the `updatePositionContext()` write (FR-18).

### Phase 4 — Testing
- [x] T-11: Add a unit test for `cancelOrder()`'s 204-response path, following the `vi.stubGlobal('fetch', ...)` pattern in `calendar-helper.test.ts` / `normalize-timestamp-precision.test.ts` — mock `{ ok: true, status: 204 }`, assert `cancelOrder()` resolves to `undefined` without throwing. (New file: `src/lib/__tests__/cancel-order-204.test.ts`)
- [x] T-12: Run the full test suite (`npx vitest run`) and confirm `trailing-stop-exit-reason-guard.test.ts`, `cooldown-stop-loss-ghost-close.test.ts`, and `self-flagged-disqualifying-risk.test.ts` specifically still pass. (298/298 passed, 30 files)

### Phase 5 — Verification
- [x] T-13: Trace all three replacement-trigger paths (`justActivated`, `stopIncreased`, `needsSelfHeal`) through the diff. (All three feed `shouldReplaceStopOrder` via OR.)
- [x] T-14: Confirm cancel-failure and submit-failure log entries use distinguishable reasoning text, not a shared generic message. ("CANCEL FAILED" vs "SUBMIT FAILED".)
- [x] T-15: Grep the diff for every new `updatePositionContext()` call and confirm each `trailingStopOrderId`/`stopOrderId` clear uses explicit `null`, never bare `undefined`. (Confirmed — both new calls use explicit `null`.)
- [x] T-16: Confirm PASO 5 (lines 302-317) is byte-for-byte unchanged. (Confirmed — does not appear in the diff.)
- [x] T-17: State explicitly (not assume) that `closePosition()`'s existing `cancel_orders=true` behavior is sufficient to clean up a resting trailing stop-limit order on a normal exit — no new cleanup code needed. (Confirmed — `closePosition()` itself is untouched by this diff and its existing `cancel_orders=true` parameter already handles this.)
- [x] T-18: Run `npx tsc --noEmit` and `npm run build` — report explicitly whether the `types.ts` widening (T-03) was required to pass. (Both passed clean; the widening was required for `contextUpdates.stopOrderId = null` to type-check.)
- [x] T-19: Report the final line count of `claude-agent.ts`. (2257 lines, up from 2151.)

## Post-Implementation

- [x] Run `/review trailing-stop-limit-wiring` to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged except `claude-agent.ts`, and that its changes match this spec exactly

## Estimated Complexity

High — this is the largest and most sensitive of the 3-part CHANGE series: it touches live exit-rules logic for every open position on every cycle, adds branching order-management logic (cancel-then-submit with two distinct failure modes), and requires a Protected Zone confirmation from Amaury beyond normal spec approval.
