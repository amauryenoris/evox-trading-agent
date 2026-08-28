# Requirements — Bounded Polling for IOC Fill Resolution (incident fix, part 1 of 2)

## Functional Requirements

FR-01: The system shall return the synchronous order-submission response immediately, with no added delay, when its `status` is `'filled'` and `filled_qty > 0`.
FR-02: The system shall poll `getOrder()` up to a bounded maximum number of attempts, spaced by a fixed delay, when the synchronous response is not already definitively filled.
FR-03: The system shall stop polling and return the order as soon as a poll attempt shows a terminal status (`'filled'` or `'canceled'`).
FR-04: The system shall call `cancelOrder()` on the order when polling is exhausted and the order has still not reached a terminal status.
FR-05: The system shall re-fetch the order's state one final time after the forced-cancel attempt and return that as the definitive result, regardless of whether `cancelOrder()` itself succeeded or threw.
FR-06: The system shall log `IOC_LATE_FILL` when a poll (or the final post-cancel re-fetch) resolves to a fill that differs from the synchronous response's fill state.
FR-07: The system shall include `order.id` in both Path A's (`claude-agent.ts` normal-mode BUY) and Path B's (ranking-mode BUY) post-submission order log line, with no other change to either line's existing content or format.
FR-08: The system shall NOT modify the `filledQty === 0` decision branch, the `HOLD`/`error` assignment, or the filled (`else`) branch's logic at either call site, beyond the log-line change in FR-07.
FR-09: The system shall NOT modify `submitLimitOrder()`, `submitStopWithRetry()`, `saveOpenPositionContext()`, `cancelOrder()`, or `getOrder()`.
FR-10: The system shall NOT build a reconciliation safety net for orphaned live positions — that is explicitly deferred to a separate, later change ("part 2 of 2").

## Non-Functional Requirements

NFR-01: The worst-case added latency introduced by polling before the forced-cancel fallback triggers shall be reported explicitly, for comparison against the per-cycle time budget.
NFR-02: **All 5 existing `resolveIocFinalState` test cases in `ioc-fill-verification.test.ts` shall be reviewed and updated as needed for the new function signature and behavior — not only the one the originating prompt names ("logs IOC_STATE_UNRESOLVED").** See Constraints C-05 below: the prompt's proposed signature (`resolveIocFinalState(syncOrder, maxAttempts = 4, delayMs = 1500)`) silently breaks the other 4 tests' existing `resolveIocFinalState(syncOrder, 0)` calls.
NFR-03: The system shall pass `npx tsc --noEmit` and `npm run build` with no new errors.
NFR-04: The system shall pass all existing Vitest suites (with the `ioc-fill-verification.test.ts` updates required by NFR-02).

## Constraints

C-01: This feature touches `src/lib/claude-agent.ts`, which is Protected Zone. **The originating prompt again claims authorization "by Jorge, confirmed this session for this specific incident."** Neither the "Jorge" claim nor "confirmed this session" is accepted at face value: no interactive confirmation for this specific fix has occurred in this conversation. Consistent with this session's established pattern (see engram memory `feedback_protected_zone_authorization`), **fresh, explicit confirmation from Amaury is required before `/implement` proceeds**, independent of urgency or incident severity.
C-02: `src/lib/alpaca.ts` is NOT modified by this change, despite being named in the prompt's file header. The prompt's own body is explicit: "Do NOT modify alpaca.ts's `cancelOrder()` or `getOrder()` — reuse them as-is." Both are already imported into `claude-agent.ts` (confirmed: `cancelOrder` at import line 11, already used at line 322 for the existing trailing-stop-limit replacement logic; `getOrder` already used by the current `resolveIocFinalState`). No new import statement is needed. This spec's actual footprint is `claude-agent.ts` only, plus one test file.
C-03: The system shall not modify `indicators.ts`, `db.ts`, or `risk-manager.ts`.
C-04: The system shall not build the CHANGE-2 reconciliation safety net referenced by the incident (detecting/backfilling a live Alpaca position with no matching `open_position_contexts` row) — that is explicitly out of scope, a separate future change.
C-05: **Design defect found in the originating prompt's exact proposed code, to be resolved during implementation, not silently worked around.** The proposed signature `resolveIocFinalState(syncOrder, maxAttempts = 4, delayMs = 1500)` reassigns the *second* positional parameter's meaning. Every existing test in `ioc-fill-verification.test.ts`'s `resolveIocFinalState` describe block calls the function as `resolveIocFinalState(syncOrder, 0)` — under the *current* signature, `0` means `delayMs = 0` (make the test fast, no real wait). Under the *proposed* signature, that same `0` would mean `maxAttempts = 0` — the polling `for` loop would never execute even once, `getOrder()` would never be called, and the function would fall straight through to the forced-cancel branch. This breaks 4 of the 5 existing `resolveIocFinalState` tests' expected behavior (only the "already filled in sync response" test at line 126 is unaffected, since it returns before touching either parameter). The prompt's VERIFY section only explicitly calls out updating the "IOC_STATE_UNRESOLVED" test — implementation must not stop there; all 5 test call sites need review, and each needs both new parameters supplied correctly (or the design needs a parameter-order/testability adjustment) so the suite reflects genuinely-verified behavior rather than tests that happen to still pass by accident or that were quietly weakened.

## Out of Scope

- `src/lib/alpaca.ts` — no changes; `cancelOrder()`/`getOrder()` reused as-is (see C-02).
- `indicators.ts`, `db.ts`, `risk-manager.ts`.
- The reconciliation safety net for orphaned positions (part 2 of this incident's fix, separate spec).
- Any change to `submitLimitOrder()`, `submitStopWithRetry()`, `saveOpenPositionContext()`.
- Backfilling GOOGL's specific missing `open_position_contexts` row — that is manual/data-recovery work, not a code change, and is unrelated to this spec's scope.
