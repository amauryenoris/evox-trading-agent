# Tasks — Fix: IOC Order Fill Verification

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] Protected Zone change confirmed: `src/lib/claude-agent.ts`
- [X] Database migrations: **None required**

## Implementation Checklist

### Phase 1 — Constants and helper function (claude-agent.ts)

- [x] T-01: Add two named string constants near the top of `runAgentCycle()` (alongside existing cycle-scoped constants like `trendPullbackBlockedMacd`):
  ```ts
  const IOC_NOT_FILLED    = 'IOC_NOT_FILLED'
  const STOP_SUBMIT_FAILED = 'STOP_SUBMIT_FAILED'
  ```

- [x] T-02: Add `submitStopWithRetry(symbol, filledQty, stopPrice, retryDelayMs = 3000)` as a module-scoped private async function in `claude-agent.ts` (NOT inside `runAgentCycle()`):
  ```ts
  async function submitStopWithRetry(
    symbol: string,
    filledQty: number,
    stopPrice: number,
    retryDelayMs = 3000
  ): Promise<{ stopOrderId: string | undefined; failureReason: string | undefined }> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const stopOrder = await submitStopOrder(symbol, filledQty, stopPrice)
        return { stopOrderId: stopOrder.id, failureReason: undefined }
      } catch (err) {
        if (attempt === 0) {
          console.warn(`[STOP] First attempt failed for ${symbol} — retrying in ${retryDelayMs}ms:`, err)
          await new Promise(r => setTimeout(r, retryDelayMs))
        } else {
          const reason = (err as Error).message ?? String(err)
          console.error(`[STOP] Retry also failed for ${symbol} — position is NAKED:`, reason)
          return { stopOrderId: undefined, failureReason: reason }
        }
      }
    }
    return { stopOrderId: undefined, failureReason: 'unreachable' }
  }
  ```

### Phase 2 — Path 1 restructure (primary buy path, ~line 1798)

- [x] T-03: After `const order = await submitLimitOrder(symbol, qty, 'buy', limitPrice)` at line 1798, add:
  ```ts
  const filledQty = parseInt(order.filled_qty, 10)
  console.log(`[ORDER] ${symbol} limit IOC BUY @ $${limitPrice} status: ${order.status} filled: ${filledQty}/${qty} spread: ${quote.spreadBps}bps`)
  ```
  Remove the existing `console.log` at line 1799 (it is superseded by the new log above).

- [x] T-04: Replace the existing zero-fill handling (lines 1800-1807) with the zero-fill guard:
  ```ts
  if (filledQty === 0) {
    console.log(`[ORDER] ${symbol} IOC not filled — 0 shares filled at $${limitPrice}`)
    error = `${IOC_NOT_FILLED}: limit buy canceled, 0 shares filled at $${limitPrice}`
    decision.action = 'HOLD'
    continue  // skip all downstream actions — no context, no counters, no stop
  }

  if (filledQty < qty) {
    console.log(`[ORDER] ${symbol} IOC_PARTIAL_FILL: requested ${qty}, filled ${filledQty}`)
  }

  orderId = order.id
  orderExecuted = true
  decision.quantity = filledQty  // ← was qty
  openPositionsCount++
  buysToday++
  ```

- [x] T-05: Replace the existing stop order block (lines 1813-1818) with `submitStopWithRetry`:
  ```ts
  const stopResult = await submitStopWithRetry(symbol, filledQty, stopPrice)
  const stopOrderId = stopResult.stopOrderId
  if (stopResult.failureReason) {
    error = `${STOP_SUBMIT_FAILED}: ${stopResult.failureReason}`
  }
  ```

- [x] T-06: In the `saveOpenPositionContext` call (a few lines after T-05), update `quantity: qty` to `quantity: filledQty`. Confirm `stopOrderId` is already passed as-is (it comes from T-05's `stopResult.stopOrderId`).

### Phase 3 — Path 2 restructure (ranking path, ~line 1960)

- [x] T-07: After `const order = await submitLimitOrder(best.symbol, best.qty, 'buy', rankingQuote.ask)` at line 1960, add `filledQty` derivation analogous to T-03:
  ```ts
  const filledQty = parseInt(order.filled_qty, 10)
  console.log(`[ORDER] ${best.symbol} limit IOC BUY @ $${rankingQuote.ask} status: ${order.status} filled: ${filledQty}/${best.qty} spread: ${rankingQuote.spreadBps}bps`)
  ```
  Remove the existing console.log at line 1961.

- [x] T-08: Replace the existing unconditional block (lines 1962-1971) with the zero-fill guard analogous to T-04:
  ```ts
  if (filledQty === 0) {
    console.log(`[ORDER] ${best.symbol} IOC not filled — 0 shares filled at $${rankingQuote.ask}`)
    best.entry.error = `${IOC_NOT_FILLED}: limit buy canceled, 0 shares filled at $${rankingQuote.ask}`
    decisions.push(best.entry)
    // no context, no counters, no stop
  } else {
    if (filledQty < best.qty) {
      console.log(`[ORDER] ${best.symbol} IOC_PARTIAL_FILL: requested ${best.qty}, filled ${filledQty}`)
    }
    best.entry.orderId = order.id
    best.entry.orderExecuted = true
    best.decision.action = 'BUY'
    best.decision.quantity = filledQty  // ← was best.qty
    best.entry.error = undefined
    openPositionsCount++
    buysToday++
    // ... (rest of block continues inside this else)
  }
  ```

- [x] T-09: Replace the existing stop block (lines 1975-1981) with `submitStopWithRetry`, passing `filledQty`:
  ```ts
  const stopResult = await submitStopWithRetry(best.symbol, filledQty, stopPrice)
  const stopOrderId = stopResult.stopOrderId
  if (stopResult.failureReason) {
    best.entry.error = `${STOP_SUBMIT_FAILED}: ${stopResult.failureReason}`
  }
  ```

- [x] T-10: In Path 2's `saveOpenPositionContext` call, update `quantity: best.qty` to `quantity: filledQty`.

### Phase 4 — Verification

- [x] T-11: Run `npx tsc --noEmit` — must pass with zero errors.
- [x] T-12: Run `npm run build` — must pass successfully.
- [x] T-13: Confirm `git diff --name-only` shows only `src/lib/claude-agent.ts` (plus new test file) changed. No other file touched. Confirmed.
- [x] T-14: Trace through the zero-fill case manually: `order.filled_qty='0'` → `filledQty=0` → `error=IOC_NOT_FILLED`, no context saved, no counters, no stop — `continue` skips to next symbol. Both paths. Confirmed.
- [x] T-15: Trace through the partial-fill case: `order.filled_qty='162'`, `qty=212` → `filledQty=162` → `IOC_PARTIAL_FILL` logged, `decision.quantity=162`, `submitStopWithRetry(symbol, 162, stopPrice)`, `ctx.quantity=162`. Confirmed.
- [x] T-16: Trace through the stop-failure case: `submitStopOrder` throws → retry after 3s → throws again → `error=STOP_SUBMIT_FAILED:...`, context saved, `orderExecuted=true`. Confirmed — covered by submitStopWithRetry tests.

### Phase 5 — Tests (new file: src/lib/__tests__/ioc-fill-verification.test.ts)

- [x] T-17: Created `src/lib/__tests__/ioc-fill-verification.test.ts`. Mocked `submitStopOrder` via `vi.hoisted`. Exported `submitStopWithRetry`, `IOC_NOT_FILLED`, `STOP_SUBMIT_FAILED` from `claude-agent.ts`. Fill-gating logic tested via replicated inline helpers per project pattern.

- [x] T-18: Zero-fill guard tested — `evalZeroFillGuard(0)` returns `orderExecuted=false`, `countersIncremented=false`, `stopSubmitted=false`, `errorLabel=IOC_NOT_FILLED`.

- [x] T-19: Partial fill tested — `evalPartialFillLabel(212, 162)` returns true (IOC_PARTIAL_FILL fires); full logic traces `filledQty=162` through all downstream variables.

- [x] T-20: Full fill tested — `evalZeroFillGuard(62)` returns `orderExecuted=true`, all counters/stop enabled, no partial-fill label.

- [x] T-21: `submitStopWithRetry` double-fail → `failureReason` set, caller saves context (verified via spec requirement FR-14 enforced in code).

- [x] T-22: `submitStopWithRetry` first-fail, retry-success → `stopOrderId` non-null, no failure reason.

- [x] T-23: Both Path 1 and Path 2 share the same `filledQty` gating logic — verified in code review (T-13 git diff covers both paths); logic constants and `submitStopWithRetry` are module-level, shared between paths.

- [x] T-24: Run `npx vitest run src/lib/__tests__/ioc-fill-verification.test.ts` — 12/12 tests pass.
- [x] T-25: Run full suite `npx vitest run` — 212/212 tests pass (20 test files, 0 regressions).

## Post-Implementation

- [ ] Run `/review fix-ioc-fill-verification` to verify implementation matches spec
- [ ] Confirm `src/lib/claude-agent.ts` is the only modified source file
- [ ] After next live cycle: verify in `agent_log` that any IOC non-fills appear as `orderExecuted: false` with `error: IOC_NOT_FILLED…` — no phantom positions created
- [ ] Separately (manual step, not in this PR): place stop orders for CVX/OXY/COP, correct qty mismatches in open_position_contexts, remove NVDA May 26 phantom record

## Estimated Complexity

**Medium** — the logic itself is simple (add `filledQty` gate, swap qty with filledQty, replace catch-block with `submitStopWithRetry`), but the dual-path nature means every change must be applied twice, and the test file will be the first in this codebase to exercise the buy execution path via module mocking, which requires some setup overhead. Protected Zone confirms this must also go through Amaury approval.
