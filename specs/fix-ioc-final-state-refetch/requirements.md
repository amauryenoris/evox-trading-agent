# Requirements — Fix: IOC Final-State Re-Fetch

## Background

Alpaca paper trading's IOC order submission response is not guaranteed to
reflect the final fill outcome. The HTTP response returns `filled_qty` and
`status` at the moment the response is generated; the paper matching engine
continues resolving the order asynchronously. Confirmed cases: INTC (Jul 6
16:53Z) and WULF (Jul 6 18:22Z) — sync response `filled_qty="0"`, paper
engine subsequently filled, position materialized without a context or stop.

The current fix (commit 6c83395) gates on `filledQty === 0` from the sync
response only. This spec closes the remaining gap by re-fetching the order
once after a short delay whenever the sync response is not definitively final.

---

## Functional Requirements

### getOrder helper

FR-01: The system shall export a function `getOrder(orderId: string): Promise<AlpacaOrder>` from `src/lib/alpaca.ts` that fetches a single Alpaca order via `GET /v2/orders/{orderId}` using the existing `alpacaFetch` pattern.

### resolveIocFinalState helper

FR-02: The system shall export a function `resolveIocFinalState` from `src/lib/claude-agent.ts` that accepts a sync `AlpacaOrder` response and an optional `delayMs` parameter (default: 2000) and returns `Promise<AlpacaOrder>`.

FR-03: Where the sync order has `status === 'filled'` and `parseInt(filled_qty, 10) > 0`, the system shall return the sync order immediately without performing a re-fetch or any delay.

FR-04: Where the sync order does not meet the definitively-filled condition (FR-03), the system shall wait `delayMs` milliseconds, then call `getOrder(syncOrder.id)` exactly once, and return the re-fetched order.

FR-05: The system shall perform at most one re-fetch per IOC submission regardless of the re-fetched order's status — if the re-fetched state is still non-final, the re-fetched order is returned as-is for downstream processing.

### IOC_LATE_FILL logging

FR-06: The system shall export a string constant `IOC_LATE_FILL = 'IOC_LATE_FILL'` from `src/lib/claude-agent.ts`.

FR-07: Where the sync order's `filled_qty` was `"0"` but the re-fetched order's `parseInt(filled_qty, 10) > 0`, the system shall emit a `console.log` containing the string `IOC_LATE_FILL` and both the sync qty and the resolved qty before returning the re-fetched order.

### IOC_STATE_UNRESOLVED logging

FR-08: Where the re-fetched order's `status` is not one of the terminal states (`'filled'` or `'canceled'`), the system shall emit a `console.log` containing the string `IOC_STATE_UNRESOLVED`, the re-fetched status value, and the re-fetched `filled_qty` value.

### Integration — Path 1 (immediate buy, ~line 1833)

FR-09: In the immediate-buy path of `runAgentCycle()`, the system shall pass the raw `submitLimitOrder` response through `resolveIocFinalState` before computing `filledQty`, such that `filledQty = parseInt(resolvedOrder.filled_qty, 10)`.

FR-10: Where `resolveIocFinalState` performed a re-fetch for Path 1, the system shall use `resolvedOrder.id` as the `orderId` for the agent_log entry (not the sync order id, which is the same, but the reference must come from the resolved order).

### Integration — Path 2 (ranking buy, ~line 2002)

FR-11: In the ranking-buy path of `runAgentCycle()`, the system shall pass the raw `submitLimitOrder` response through `resolveIocFinalState` before computing `filledQty`, such that `filledQty = parseInt(resolvedOrder.filled_qty, 10)`.

### Downstream invariance

FR-12: The system shall derive all downstream values — the zero-fill guard, the partial-fill label, the stop order quantity, the open-position context quantity, the `orderExecuted` flag, and the `buysToday`/`openPositionsCount` counters — from the `filledQty` of the resolved order, with no other changes to that logic.

FR-13: Where `resolveIocFinalState` returns a definitively-filled order (FR-03, fast path), the system shall behave identically to the behavior merged in commit 6c83395 for the same filled order — no regression.

---

## Non-Functional Requirements

NFR-01: The re-fetch delay (`delayMs`) shall default to 2000 ms and shall not exceed 3000 ms in production paths — keeping the total added latency per buy attempt under 3 seconds.

NFR-02: `resolveIocFinalState` shall be independently testable via mock injection of `getOrder` (same decoupling pattern as `submitStopWithRetry` / `submitStopOrder`).

NFR-03: The `IOC_LATE_FILL` log line shall be distinct enough to be queryable in the GitHub Actions workflow logs via a simple grep — e.g. `[ORDER] SYMBOL IOC_LATE_FILL: sync=0 final=N`.

---

## Constraints

C-01: `src/lib/claude-agent.ts` is in the Protected Zone. Authorization extends from the parent `fix-ioc-fill-verification` spec approved this session — this must be reconfirmed before `/implement`.

C-02: `src/lib/alpaca.ts` is not in the Protected Zone but is used by Protected Zone files. The new `getOrder` export must not alter any existing export signatures or break callers.

C-03: The downstream IOC handling logic (zero-fill guard, partial-fill label, stop formula, context save, counters, `IOC_NOT_FILLED` / `STOP_SUBMIT_FAILED` constants, agent_log entry construction) merged in commit 6c83395 must not change — only the inputs to that logic change.

C-04: No changes to exit rules, gate logic, signal detection, `enforceExitRules`, or `getPositions`.

C-05: No database schema changes.

C-06: `tsc --noEmit` zero errors, `npm run build` clean, all 213 existing tests pass.

---

## Out of Scope

- INTC and WULF orphan data cleanup (separate manual task)
- GTC stop reconstruction for existing orphan positions
- Polling loops beyond one re-fetch
- Environment-based live/paper branching (fix applies to both; re-fetch is harmless for live since `'filled'` sync responses take the fast path)
- Changes to spread gate, stop price formula, or IOC order type
- Any changes to `enforceExitRules`, `getPositions`, or `open_position_contexts` read path
