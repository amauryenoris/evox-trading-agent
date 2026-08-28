# Design — Bounded Polling for IOC Fill Resolution (incident fix, part 1 of 2)

## Architecture Decision

This feature lives entirely in `src/lib/claude-agent.ts`: a rewrite of `resolveIocFinalState()` (currently lines 966–996) from a single fixed-delay snapshot into a bounded polling loop with a forced-cancel fallback, plus a one-line addition to each of the two call sites' post-submission log lines (Path A: normal-mode BUY inside the per-symbol loop, ~lines 2024–2054; Path B: ranking-mode BUY after the loop, ~lines 2200–2227). No new file, no new primitive — `cancelOrder()` and `getOrder()` (both already imported and already used elsewhere in this file) are reused directly.

Verified against current code this session: `resolveIocFinalState()`'s current body (966–996) matches the diagnostic exactly. `cancelOrder` is already imported (line 11) and already used for the existing trailing-stop-limit replacement logic (line 322) — confirming it's a safe, proven primitive in this codebase already, regardless of when it was originally built.

## Data Flow

1. `submitLimitOrder()` posts the IOC order to Alpaca; the synchronous response (`syncOrder`) may or may not already reflect the final fill.
2. `resolveIocFinalState(syncOrder)` is called (both Path A and Path B, unchanged call shape from the caller's perspective — same one argument style, though the underlying signature's defaults change).
3. If `syncOrder` is already `filled` with `filled_qty > 0`, return immediately — no delay (FR-01).
4. Otherwise, poll: wait a fixed delay, `getOrder(syncOrder.id)`, check for a terminal status. Repeat up to the bounded maximum. Return as soon as `filled` or `canceled` is observed (FR-02, FR-03).
5. If polling exhausts without reaching a terminal status, call `cancelOrder(syncOrder.id)` (wrapped in try/catch — a cancel on an order that resolves to filled/canceled in the interim is expected to no-op or error harmlessly, and is not treated as fatal), then do one final `getOrder()` and return that as the definitive result regardless of the cancel's own outcome (FR-04, FR-05).
6. The caller (Path A/Path B) is unchanged: it still reads `parseInt(order.filled_qty, 10)` from whatever `resolveIocFinalState` returns and branches on `filledQty === 0` exactly as today. The only caller-side change is adding `order.id` to the log line (FR-07).

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Bounded polling loop + forced cancel on exhaustion (as specified) | Directly targets the confirmed root cause (single premature snapshot); reuses existing, proven `cancelOrder`/`getOrder` primitives; no new dependencies | Adds up to ~6s + one cancel/getOrder round-trip of latency to an ambiguous BUY attempt | Chosen |
| Keep single re-fetch, just lengthen the delay (e.g. 2000ms → 5000ms) | Simplest possible change | Doesn't address the real problem — an order can in principle stay non-terminal past any single fixed delay; still trusts one snapshot as final; doesn't get a definitive resolution the way a forced cancel does | Rejected |
| Fully async reconciliation (defer resolution to next cycle instead of blocking the BUY flow) | No added latency in the hot path | Bigger design change, effectively the "reconciliation safety net" already planned as a separate follow-up (part 2) — mixing the two would blur scope | Rejected for this change; may be partially covered by the planned follow-up |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY | Replace `resolveIocFinalState()`'s body with the bounded-polling + forced-cancel version. Add `id: ${order.id}` to Path A's and Path B's post-submission `[ORDER] ...` log lines. No other lines change. |
| `src/lib/__tests__/ioc-fill-verification.test.ts` | MODIFY | All 5 `resolveIocFinalState` test cases reviewed and updated for the new signature/behavior (see C-05) — not only the `IOC_STATE_UNRESOLVED` one. |

## Protected Zone Impact

⚠️ **`src/lib/claude-agent.ts` is Protected Zone.** As with every prior change this session, this requires **fresh, explicit confirmation from Amaury** before `/implement` proceeds — see C-01. The claimed "Jorge... confirmed this session for this specific incident" is not accepted as sufficient, regardless of the change being a bug fix for a live incident rather than a new feature — urgency does not substitute for confirmation on a file that moves real trading capital.

`src/lib/alpaca.ts` is **not** touched (see C-02) — no separate authorization needed there since nothing changes.

## Database Changes

None.

## Open Questions

1. **Authorization.** Same unresolved pattern as every prior Protected Zone touch this session: the claimed sign-off is not independently verifiable and is not treated as sufficient. Amaury's own explicit confirmation is required before `/implement`.
2. **Test-signature break (C-05).** The prompt's exact proposed signature breaks the existing test suite's calling convention for 4 of 5 tests, not just the one it names. This needs a decision during implementation: adjust every affected test call site to supply both new parameters correctly (e.g. `resolveIocFinalState(syncOrder, 4, 0)` to preserve "4 attempts, but instant in tests"), or reconsider the parameter shape (e.g. an options object, or keeping delay as the sole/first tunable) for better testability. Flagging this now so it isn't silently missed the way the prompt's own VERIFY section might suggest ("update this test" — singular).
3. **Per-cycle latency budget.** Worst case, an ambiguous order now costs up to ~6s of polling plus a cancel+getOrder round-trip (call it ~7-8s total) before the caller gets a decision, versus ~2s today. If multiple BUY candidates in the same cycle hit this worst case (Path A executes sequentially inside the per-symbol loop), the added latency compounds. Not blocking — the prompt itself asks for this to be reported (NFR-01) — but worth Amaury's awareness given the cron-driven, time-boxed nature of `runAgentCycle()`.
