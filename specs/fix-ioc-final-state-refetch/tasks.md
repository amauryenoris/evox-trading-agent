# Tasks — Fix: IOC Final-State Re-Fetch

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] Protected Zone reconfirmed: `src/lib/claude-agent.ts` — authorization
      extends from parent `fix-ioc-fill-verification` spec (this session)
- [X] Database migrations: **None required**

---

## Implementation Checklist

### Phase 1 — alpaca.ts: getOrder helper

- [x] T-01: In `src/lib/alpaca.ts`, after the existing `getOrders` function (~line 53),
      add:
      ```ts
      export async function getOrder(orderId: string): Promise<AlpacaOrder> {
        return alpacaFetch<AlpacaOrder>(`${baseUrl()}/v2/orders/${orderId}`)
      }
      ```
      Uses the existing `alpacaFetch` pattern, identical to all other helpers.
      No additional error handling — callers handle errors at their level.

### Phase 2 — claude-agent.ts: IOC_LATE_FILL constant + resolveIocFinalState

- [x] T-02: In `src/lib/claude-agent.ts`, import `getOrder` from `./alpaca` alongside
      the existing import of `submitStopOrder` and other alpaca helpers.

- [x] T-03: Add `IOC_LATE_FILL` constant export near the existing `IOC_NOT_FILLED`
      and `STOP_SUBMIT_FAILED` constants:
      ```ts
      export const IOC_LATE_FILL = 'IOC_LATE_FILL'
      ```

- [x] T-04: Add `resolveIocFinalState` function export after `submitStopWithRetry`
      (module-scoped, same placement pattern):
      ```ts
      export async function resolveIocFinalState(
        syncOrder: AlpacaOrder,
        delayMs = 2000
      ): Promise<AlpacaOrder> {
        const syncFilled = parseInt(syncOrder.filled_qty, 10)
        if (syncOrder.status === 'filled' && syncFilled > 0) {
          return syncOrder
        }
        await new Promise(r => setTimeout(r, delayMs))
        const resolved = await getOrder(syncOrder.id)
        const resolvedFilled = parseInt(resolved.filled_qty, 10)
        if (syncFilled === 0 && resolvedFilled > 0) {
          console.log(
            `[ORDER] ${resolved.symbol} ${IOC_LATE_FILL}: sync=0 final=${resolvedFilled}`
          )
        }
        if (resolved.status !== 'filled' && resolved.status !== 'canceled') {
          console.log(
            `[ORDER] ${resolved.symbol} IOC_STATE_UNRESOLVED: status=${resolved.status} filled=${resolvedFilled} after re-fetch`
          )
        }
        return resolved
      }
      ```

### Phase 3 — claude-agent.ts: call-site substitutions

- [x] T-05: **Path 1** — At lines 1833-1834, replace:
      ```ts
      const order = await submitLimitOrder(symbol, qty, 'buy', limitPrice)
      const filledQty = parseInt(order.filled_qty, 10)
      ```
      With:
      ```ts
      const syncOrder = await submitLimitOrder(symbol, qty, 'buy', limitPrice)
      const order = await resolveIocFinalState(syncOrder)
      const filledQty = parseInt(order.filled_qty, 10)
      ```
      The console.log at line 1835 that already references `order.status` and
      `filledQty` automatically reflects the resolved values — no change needed.
      All downstream references to `order.id` (used as `orderId` for agent_log)
      also automatically reference the resolved order.

- [x] T-06: **Path 2** — At lines 2002-2003, replace:
      ```ts
      const order = await submitLimitOrder(best.symbol, best.qty, 'buy', rankingQuote.ask)
      const filledQty = parseInt(order.filled_qty, 10)
      ```
      With:
      ```ts
      const syncOrder = await submitLimitOrder(best.symbol, best.qty, 'buy', rankingQuote.ask)
      const order = await resolveIocFinalState(syncOrder)
      const filledQty = parseInt(order.filled_qty, 10)
      ```
      Same logic as T-05 — console.log at line 2004 and all downstream `order.*`
      references automatically use the resolved order.

### Phase 4 — Tests

- [x] T-07: In `src/lib/__tests__/ioc-fill-verification.test.ts`, add a mock for
      `getOrder` from `./alpaca` using `vi.hoisted` (same pattern as `mockSubmitStopOrder`):
      ```ts
      const { mockSubmitStopOrder, mockGetOrder } = vi.hoisted(() => ({
        mockSubmitStopOrder: vi.fn(),
        mockGetOrder: vi.fn(),
      }))

      vi.mock('../alpaca', async (importOriginal) => {
        const actual = await importOriginal<typeof import('../alpaca')>()
        return {
          ...actual,
          submitStopOrder: mockSubmitStopOrder,
          getOrder: mockGetOrder,
        }
      })
      ```
      Add `mockGetOrder` to `vi.clearAllMocks()` in `beforeEach`.

- [x] T-08: Add `import { ..., resolveIocFinalState, IOC_LATE_FILL } from '../claude-agent'`
      to the test file imports.

- [x] T-09: Add new `describe('resolveIocFinalState', ...)` block with these tests:

      **Test 1 — fast path (FR-03, FR-13):**
      ```ts
      it('returns sync order immediately when status=filled and filled_qty>0 — no re-fetch', async () => {
        const syncOrder = { id: 'ord-1', symbol: 'AAPL', status: 'filled', filled_qty: '82', ... }
        const result = await resolveIocFinalState(syncOrder, 0)
        expect(mockGetOrder).not.toHaveBeenCalled()
        expect(result).toBe(syncOrder)
        expect(parseInt(result.filled_qty, 10)).toBe(82)
      })
      ```

      **Test 2 — late fill (FR-04, FR-07):**
      ```ts
      it('re-fetches after delay when sync returns 0; logs IOC_LATE_FILL when re-fetch shows fill', async () => {
        const syncOrder = { id: 'ord-2', symbol: 'INTC', status: 'new', filled_qty: '0', ... }
        const resolvedOrder = { id: 'ord-2', symbol: 'INTC', status: 'filled', filled_qty: '82', ... }
        mockGetOrder.mockResolvedValueOnce(resolvedOrder)
        const consoleSpy = vi.spyOn(console, 'log')
        const resultPromise = resolveIocFinalState(syncOrder, 0)
        await vi.runAllTimersAsync()
        const result = await resultPromise
        expect(mockGetOrder).toHaveBeenCalledOnce()
        expect(mockGetOrder).toHaveBeenCalledWith('ord-2')
        expect(parseInt(result.filled_qty, 10)).toBe(82)
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining(IOC_LATE_FILL))
        consoleSpy.mockRestore()
      })
      ```

      **Test 3 — truly canceled (FR-04, no IOC_LATE_FILL):**
      ```ts
      it('re-fetches when sync returns 0; returns 0 and does NOT log IOC_LATE_FILL when re-fetch also 0', async () => {
        const syncOrder = { id: 'ord-3', symbol: 'WULF', status: 'canceled', filled_qty: '0', ... }
        const resolvedOrder = { id: 'ord-3', symbol: 'WULF', status: 'canceled', filled_qty: '0', ... }
        mockGetOrder.mockResolvedValueOnce(resolvedOrder)
        const consoleSpy = vi.spyOn(console, 'log')
        const resultPromise = resolveIocFinalState(syncOrder, 0)
        await vi.runAllTimersAsync()
        const result = await resultPromise
        expect(parseInt(result.filled_qty, 10)).toBe(0)
        expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining(IOC_LATE_FILL))
        consoleSpy.mockRestore()
      })
      ```

      **Test 4 — unresolved state (FR-08):**
      ```ts
      it('logs IOC_STATE_UNRESOLVED when re-fetched status is neither filled nor canceled', async () => {
        const syncOrder = { id: 'ord-4', symbol: 'XOM', status: 'new', filled_qty: '0', ... }
        const resolvedOrder = { id: 'ord-4', symbol: 'XOM', status: 'pending_new', filled_qty: '0', ... }
        mockGetOrder.mockResolvedValueOnce(resolvedOrder)
        const consoleSpy = vi.spyOn(console, 'log')
        const resultPromise = resolveIocFinalState(syncOrder, 0)
        await vi.runAllTimersAsync()
        await resultPromise
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('IOC_STATE_UNRESOLVED'))
        consoleSpy.mockRestore()
      })
      ```

      **Test 5 — partial fill at re-fetch (FR-04, partial path):**
      ```ts
      it('returns re-fetched partially_filled qty when sync returned 0 and re-fetch shows partial fill', async () => {
        const syncOrder = { id: 'ord-5', symbol: 'COP', status: 'new', filled_qty: '0', ... }
        const resolvedOrder = { id: 'ord-5', symbol: 'COP', status: 'filled', filled_qty: '40', ... }
        mockGetOrder.mockResolvedValueOnce(resolvedOrder)
        const resultPromise = resolveIocFinalState(syncOrder, 0)
        await vi.runAllTimersAsync()
        const result = await resultPromise
        expect(parseInt(result.filled_qty, 10)).toBe(40)
      })
      ```

### Phase 5 — Verification

- [x] T-10: Run `npx tsc --noEmit` — must pass with zero errors.
- [x] T-11: Run `npm run build` — must pass successfully.
- [x] T-12: Run `npx vitest run src/lib/__tests__/ioc-fill-verification.test.ts` —
            all tests pass (13 existing + 5 new = 18 tests).
- [x] T-13: Run full suite `npx vitest run` — all 213+ tests pass across all files,
            zero regressions.
- [x] T-14: `git diff --name-only` must show only:
            `src/lib/alpaca.ts`, `src/lib/claude-agent.ts`,
            `src/lib/__tests__/ioc-fill-verification.test.ts`.
            No other source files modified.
- [x] T-15: Verify Path 1 and Path 2 call sites in `claude-agent.ts` each have the
            `syncOrder` / `resolveIocFinalState(syncOrder)` / `order` substitution
            with no downstream `order.*` references changed.

---

## Post-Implementation

- [x] Run `/review fix-ioc-final-state-refetch` to verify implementation matches spec
- [x] Confirm only the three files listed in T-14 are modified

---

## Estimated Complexity

**Low-Medium** — New `getOrder` helper is 3 lines. `resolveIocFinalState` is ~15 lines
with one delay and one re-fetch. Two call-site substitutions are each a 2-line rename.
Five new tests follow the established `vi.hoisted` + `vi.useFakeTimers` pattern already
present in the file. Primary risk is the fake-timer interaction in tests for the async
delay, which is already proven by the `submitStopWithRetry` tests in the same file.
