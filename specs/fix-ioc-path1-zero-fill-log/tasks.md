# Tasks — Fix: Path 1 Zero-Fill Agent-Log Visibility

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] Protected Zone confirmed: `src/lib/claude-agent.ts` (authorized by parent spec this session)
- [X] Database migrations: **None required**

## Implementation Checklist

### Phase 1 — Path 1 control-flow restructure (claude-agent.ts)

- [x] T-01: In `src/lib/claude-agent.ts`, locate the current Path 1 zero-fill guard:
  ```ts
  if (filledQty === 0) {
    console.log(`[ORDER] ${symbol} IOC not filled — 0 shares filled at $${limitPrice}`)
    error = `${IOC_NOT_FILLED}: limit buy canceled, 0 shares filled at $${limitPrice}`
    decision.action = 'HOLD'
    continue
  }

  if (filledQty < qty) {
    console.log(`[ORDER] ${symbol} IOC_PARTIAL_FILL: requested ${qty}, filled ${filledQty}`)
  }

  orderId = order.id
  orderExecuted = true
  decision.quantity = filledQty
  openPositionsCount++
  buysToday++
  // ... remainder of filledQty > 0 block ...
  ```
  Replace with the `else` structure:
  ```ts
  if (filledQty === 0) {
    console.log(`[ORDER] ${symbol} IOC not filled — 0 shares filled at $${limitPrice}`)
    error = `${IOC_NOT_FILLED}: limit buy canceled, 0 shares filled at $${limitPrice}`
    decision.action = 'HOLD'
  } else {
    if (filledQty < qty) {
      console.log(`[ORDER] ${symbol} IOC_PARTIAL_FILL: requested ${qty}, filled ${filledQty}`)
    }

    orderId = order.id
    orderExecuted = true
    decision.quantity = filledQty
    openPositionsCount++
    buysToday++
    // ... remainder of filledQty > 0 block, unchanged ...
  }
  ```
  The closing `}` of the new `else` block replaces the closing of the old inline block. Everything after the `else {}` (the `if (isAutoEntry)` watchlist link and the end of the containing execution block) is unchanged.

### Phase 2 — New test (ioc-fill-verification.test.ts)

- [x] T-02: In `src/lib/__tests__/ioc-fill-verification.test.ts`, add a new describe block (or extend the existing `evalZeroFillGuard` describe) with a test that verifies the agent_log visibility contract for Path 1 zero-fill:
  ```ts
  describe('Zero-fill log visibility — agent_log entry produced', () => {
    it('Path 1 zero-fill: evalZeroFillGuard returns errorLabel=IOC_NOT_FILLED and orderExecuted=false — these are the values the entry construction will pick up', () => {
      // Arrange / Act
      const result = evalZeroFillGuard(0)

      // Assert — confirms the values flow correctly into the agent_log entry
      expect(result.orderExecuted).toBe(false)
      expect(result.errorLabel).toBe(IOC_NOT_FILLED)
      // With the `else` restructure (no `continue`), these values reach
      // the entry construction and appear in the decisions array.
    })
  })
  ```
  Alternatively, extend the existing zero-fill test to add the `errorLabel` assertion if not already present. The key assertion is that `result.errorLabel === IOC_NOT_FILLED` and `result.orderExecuted === false` — since `evalZeroFillGuard` replicates the guard's output, these values are exactly what the entry construction at lines ~1929-1953 uses to build the agent_log entry.

### Phase 3 — Verification

- [x] T-03: Run `npx tsc --noEmit` — must pass with zero errors. Clean (after adding `afterEach` to import).
- [x] T-04: Run `npm run build` — must pass successfully. Clean.
- [x] T-05: Run `npx vitest run src/lib/__tests__/ioc-fill-verification.test.ts` — 13/13 tests pass.
- [x] T-06: Run full suite `npx vitest run` — 213/213 tests pass (20 files, 0 regressions).
- [x] T-07: Confirm `git diff --name-only` shows only `src/lib/claude-agent.ts` changed (test file is untracked new — already from parent fix). Path 2 block not in diff.
- [x] T-08: Confirmed: Path 2's zero-fill block (ranking path) unchanged — zero ranking-path lines in `git diff`.
- [x] T-09: Trace confirmed: `filledQty === 0` → `error = IOC_NOT_FILLED`, `decision.action = 'HOLD'` → else block skipped → falls through to entry construction at ~1929 → `entry = { ..., orderExecuted: false, error: 'IOC_NOT_FILLED:...' }` → `decisions.push(entry)` → logged in agent_log. ✅

## Post-Implementation

- [ ] Run `/review fix-ioc-path1-zero-fill-log` to verify implementation matches spec
- [ ] Confirm `src/lib/claude-agent.ts` is the only modified source file

## Estimated Complexity

**Low** — 1 line removed (`continue`), one `else {` + closing `}` added, one new test assertion. The existing test infrastructure is already set up; this closes a single uncovered code path.
