# Requirements — trailing-stop-limit-wiring (CHANGE 3b)

## Functional Requirements

FR-01: The system shall provide a `submitStopLimitWithRetry(symbol, filledQty, stopPrice, limitPrice, retryDelayMs)` function that mirrors `submitStopWithRetry()`'s existing shape (2 attempts, 3000ms default delay, `{ stopOrderId, failureReason }` return type).
FR-02: The system shall compute `limitPrice` as `stopPrice * (1 - 0.005)` (0.5% below the stop price) wherever a trailing stop-limit order is submitted.
FR-03: The system shall attempt an order replacement when the trailing stop activates for the first time this cycle (`justActivated`).
FR-04: The system shall attempt an order replacement when the newly computed `trailingStop` is strictly greater than the previously persisted value.
FR-05: The system shall attempt an order replacement (self-heal) when `trailingActivated` is true, activation did not happen this cycle, and no `trailingStopOrderId` is on file for the position.
FR-06: Where no trailing stop-limit order has ever been placed for a position (`trailingStopOrderId` unset) and a Capa A stop order ID is on file, the system shall cancel the Capa A order before submitting the replacement.
FR-07: Where a trailing stop-limit order already exists for a position, the system shall cancel that order (not the Capa A order) before submitting the replacement.
FR-08: Where neither a Capa A order ID nor a trailing stop-limit order ID is on file, the system shall skip the cancel step and proceed directly to order submission.
FR-09: If the cancel attempt throws, the system shall not attempt to submit a replacement order in the same cycle.
FR-10: If the cancel attempt throws, the system shall leave both `trailingStopOrderId` and `stopOrderId` unmodified in Supabase for that cycle.
FR-11: If the cancel attempt throws, the system shall record a queryable `agent_log` alert whose reasoning text is distinguishable from a submit-failure alert and identifies this as a cancel failure.
FR-12: If the cancel succeeds (or was skipped) and the subsequent order submission succeeds, the system shall persist the new order ID as `trailingStopOrderId` via `updatePositionContext()`.
FR-13: If the cancelled order was the Capa A order and the subsequent submission succeeds, the system shall explicitly persist `stopOrderId: null` (not omitted) in the same `updatePositionContext()` call.
FR-14: If the cancel succeeds (or was skipped) but the subsequent order submission fails after retry, the system shall explicitly persist `trailingStopOrderId: null` via `updatePositionContext()`.
FR-15: If the cancelled order was the Capa A order and the subsequent submission then fails, the system shall also explicitly persist `stopOrderId: null` in the same call.
FR-16: If the order submission fails after retry, the system shall record a queryable `agent_log` alert whose reasoning text is distinguishable from a cancel-failure alert, identifies this as a submit failure, and includes the attempted stop/limit price and the underlying error message.
FR-17: Every `agent_log` alert added by this feature shall match the established HOLD-type convention exactly (`decision.action: 'HOLD'`, `quantity: 0`, `confidence: 0`, `indicators`, `portfolioSnapshot`, `orderExecuted: false`, `error: 'trailing_stop_naked'`), wrapped in `.catch()` and never rethrown.
FR-18: On a successful replacement, the system shall not record any additional `agent_log` entry beyond the `updatePositionContext()` write already required by FR-12/13.
FR-19: Where TypeScript rejects an explicit `stopOrderId: null` write against `OpenPositionContext`'s current `string | undefined` type, the system shall widen that field's type to `string | null | undefined` in `types.ts`.

## Non-Functional Requirements

NFR-01: PASO 1, PASO 2, and PASO 5 of the trailing-stop block (`claude-agent.ts`, high-since-entry tracking, ATR-invalid skip, and the Capa B same-cycle exit check) shall remain byte-for-byte unchanged.
NFR-02: The existing `updatePositionContext(...)` call that persists `highSinceEntry`/`trailingStop`/`trailingActivated` shall remain unchanged; new `updatePositionContext()` calls from this feature are additional calls, not replacements.
NFR-03: `submitStopWithRetry()`, `submitStopOrder()`, `closePosition()`, and all entry-time order-submission call sites shall remain unchanged.
NFR-04: The retry pattern (2 attempts, 3000ms default delay) shall match `submitStopWithRetry()` exactly; any deviation must be flagged explicitly during implementation, not introduced silently.
NFR-05: `npx tsc --noEmit` and `npm run build` shall pass, with an explicit report on whether the `types.ts` widening (FR-19) was required.
NFR-06: All existing tests shall pass unmodified, including `trailing-stop-exit-reason-guard.test.ts`, `cooldown-stop-loss-ghost-close.test.ts`, and `self-flagged-disqualifying-risk.test.ts`.
NFR-07: A new unit test shall verify `cancelOrder()` resolves to `undefined` (not throws) on a mocked 204 response, following the `vi.stubGlobal('fetch', ...)` pattern already established in `calendar-helper.test.ts` / `normalize-timestamp-precision.test.ts`.

## Constraints

C-01: `claude-agent.ts` is in the Protected Zone. Per `specs/README.md`, this requires Amaury's explicit confirmation before implementation proceeds, independent of and in addition to normal spec approval. The source prompt for this feature claimed prior authorization from "Jorge" — no such approver is established anywhere in this project's CLAUDE.md or prior session context; that claim is disregarded rather than relied upon, and standard Protected Zone confirmation by Amaury is still required.
C-02: `types.ts` may only be touched for the single, narrow purpose in FR-19 (widening `OpenPositionContext.stopOrderId`) — confirmed necessary by reading the current declaration (`string | undefined` at `types.ts:187`), not merely a contingency to check at implementation time.
C-03: `alpaca.ts` and `db.ts` must not be modified — `submitStopLimitOrder()`, `cancelOrder()`, and the 5-field `updatePositionContext()` already exist and are merged.
C-04: `risk-manager.ts`, `indicators.ts`, and `learning.ts` must not be modified.
C-05: The ghost-close path, the crash-mid-cycle `agent_log` gap, and the four deterministic exit-condition branches (profit target / time stop / z-score / EMA reclaim) must not be touched beyond adding `submitStopLimitWithRetry()` near `submitStopWithRetry()`.
C-06: Submit-then-cancel sequencing must not be used — Alpaca rejects two simultaneous open sell-stop-type orders against the same held quantity ("insufficient qty"), so cancel-then-submit is the only viable sequence.
C-07: If any of `submitStopLimitOrder`, `cancelOrder`, `submitStopWithRetry`, the trailing-stop block, or `updatePositionContext()` differ in shape or location from what's confirmed in this spec at implementation time, implementation must stop and report the discrepancy rather than adapt silently (FAIL FAST).

## Out of Scope

- Modifying the ghost-close duplicate-insert issue (separately tracked).
- Modifying the crash-mid-cycle `agent_log` gap (separately tracked).
- Any change to the four deterministic exit-condition branches beyond the new helper function.
- Any change to `alpaca.ts`, `db.ts`, `risk-manager.ts`, `indicators.ts`, `learning.ts`.
- Submit-then-cancel ordering (explicitly rejected per Alpaca's confirmed simultaneous-order constraint).
