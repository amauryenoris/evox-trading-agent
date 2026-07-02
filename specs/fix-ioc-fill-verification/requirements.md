# Requirements — Fix: IOC Order Fill Verification (Phantom Positions, Partial Fills, Silent Stop Failures)

## STEP 0 Verification Findings (informs requirements below — do not re-verify)

**Finding 1 — Both post-order blocks confirmed:**
- Primary path: [claude-agent.ts:1797-1818](src/lib/claude-agent.ts#L1797-L1818) — `orderExecuted = true` at line 1804, `decision.quantity = qty` at 1805, `submitStopOrder(symbol, qty, stopPrice)` at 1814 — all use original requested `qty` unconditionally.
- Ranking path: [claude-agent.ts:1960-1981](src/lib/claude-agent.ts#L1960-L1981) — `best.entry.orderExecuted = true` at 1966, `best.decision.quantity = best.qty` at 1968, `submitStopOrder(best.symbol, best.qty, stopPrice)` at 1977 — same pattern.

**Finding 2 — `AlpacaOrder.filled_qty` is available on the submit response directly:**
`types.ts:54`: `filled_qty: string` (a string-encoded number). For IOC orders, the `submitLimitOrder` response already reflects the final fill state — no follow-up GET needed. `filled_qty` must be read as `parseInt(order.filled_qty, 10)`.

**Finding 3 — No generic retry helper exists:**
`callClaudeWithRetry` ([claude-agent.ts:629-651](src/lib/claude-agent.ts#L629-L651)) is Claude-API-specific (filters on HTTP 429/529). No general retry utility is available. A new small inline helper is needed for the stop-order retry path.

**Finding 4 — `saveOpenPositionContext` receives qty via `OpenPositionContext.quantity`:**
`db.ts:162`: `quantity: ctx.quantity`. The quantity flows through the `OpenPositionContext` object constructed in `claude-agent.ts`. No change to `db.ts` is required — only the caller's object construction.

**Finding 5 — No existing tests cover the buy execution block:**
19 test files exist; none test `submitLimitOrder`, `orderExecuted`, `submitStopOrder`, or `saveOpenPositionContext` in the execution path. The new test file will be the first.

---

## Functional Requirements

FR-01: The system shall determine the actual filled quantity of an IOC limit buy order by reading `parseInt(order.filled_qty, 10)` from the synchronous `submitLimitOrder` response — without making a follow-up GET /v2/orders/{id} request.

FR-02: When a limit IOC buy order fills zero shares (`parseInt(order.filled_qty, 10) === 0`), the system shall not set `orderExecuted = true`.

FR-03: When a limit IOC buy order fills zero shares, the system shall not increment `openPositionsCount`.

FR-04: When a limit IOC buy order fills zero shares, the system shall not increment `buysToday`.

FR-05: When a limit IOC buy order fills zero shares, the system shall not submit a GTC stop order.

FR-06: When a limit IOC buy order fills zero shares, the system shall not save a position context to `open_position_contexts`.

FR-07: When a limit IOC buy order fills zero shares, the system shall persist an agent_log entry with `orderExecuted: false` and an `error` field containing the string `IOC_NOT_FILLED`.

FR-08: When a limit IOC buy order fills a non-zero quantity, the system shall use the actual filled quantity (not the originally requested quantity) as `decision.quantity`.

FR-09: When a limit IOC buy order fills a non-zero quantity, the system shall use the actual filled quantity as the `quantity` field of the position context saved to `open_position_contexts`.

FR-10: When a limit IOC buy order fills a non-zero quantity, the system shall pass the actual filled quantity to `submitStopOrder`.

FR-11: When a limit IOC buy order fills a partial quantity (greater than zero but less than requested), the system shall log a console line containing `IOC_PARTIAL_FILL` and both the requested and filled quantities.

FR-12: Where a GTC stop order submission fails (initial attempt throws or rejects), the system shall retry the stop submission exactly once after a delay of 3 seconds.

FR-13: When a GTC stop order submission fails on both the initial attempt and the retry, the system shall set the agent_log entry's `error` field to a string containing `STOP_SUBMIT_FAILED` and the failure reason.

FR-14: When a GTC stop order submission fails on both the initial attempt and the retry, the system shall still save the position context to `open_position_contexts` (the position is real and must be tracked even without stop protection).

FR-15: When a GTC stop order submission succeeds (either on the first or retry attempt), the system shall persist the resulting `stopOrderId` into the position context as it does today.

FR-16: The system shall apply FR-01 through FR-15 to BOTH the primary buy path (Path 1) and the ranking/best-candidate buy path (Path 2).

FR-17: The system shall not alter any gate condition, signal detection, position sizing, or exit-rules logic.

## Non-Functional Requirements

NFR-01: After implementation, `npx tsc --noEmit` shall produce zero errors.

NFR-02: After implementation, `npm run build` shall complete successfully.

NFR-03: All existing 200 tests shall continue to pass unmodified.

NFR-04: The change shall touch exactly two files: `src/lib/claude-agent.ts` (Protected Zone) and the new test file.

NFR-05: The `IOC_NOT_FILLED` and `STOP_SUBMIT_FAILED` error strings shall be defined as named string constants (not inline literals) so they are greppable and reusable in tests.

## Constraints

C-01: This feature must not modify the Protected Zone without explicit confirmation from Amaury. `src/lib/claude-agent.ts` IS in the Protected Zone — confirmation required before implementation.

C-02: `src/lib/db.ts`, `src/lib/learning.ts`, `src/lib/risk-manager.ts`, `src/lib/indicators.ts`, `src/lib/news-intelligence.ts`, `src/lib/types.ts`, and `src/lib/alpaca.ts` shall not be modified.

C-03: The stop price formula (`currentPrice × (1 − STOP_LOSS_PCT)`) shall not change.

C-04: IOC limit order type and limit-at-ask logic shall not change.

C-05: The exit-rules / ghost_close detection path (`learning.ts`) shall not change.

C-06: Existing open positions data in Supabase (`open_position_contexts`) shall not be modified by this code change — data cleanup for existing phantom/partial-fill records (OXY 212→162, COP 102→62, NVDA May 26 phantom) is a separate manual step.

## Out of Scope

- Fixing the existing corrupted position records (OXY, COP qty mismatches, NVDA May 26 phantom) — separate manual cleanup.
- Placing stop orders for the 3 currently unprotected positions (CVX, OXY, COP) — separate urgent manual action.
- Any change to the ghost_close detection logic in `learning.ts` — eliminated at source, this path will naturally return to handling only genuine external closes.
- Dashboard surfacing of `IOC_NOT_FILLED` or `STOP_SUBMIT_FAILED` events — the `error` field in `agent_log` is already visible in the Agent Decisions dashboard; no new UI work needed.
- Changing `submitLimitOrder`'s signature or adding response validation inside `alpaca.ts`.
