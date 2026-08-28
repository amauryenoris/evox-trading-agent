# Tasks — Bounded Polling for IOC Fill Resolution (incident fix, part 1 of 2)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed — Amaury's own explicit confirmation for touching `claude-agent.ts` in this session (the claimed "Jorge... confirmed this session" is NOT accepted as sufficient — see design.md Open Question 1)
- [x] Amaury has been made aware of the test-signature break in the originating prompt's exact proposed code (design.md Open Question 2 / requirements.md C-05) and agrees implementation should fix it rather than only updating the one test the prompt names
- [x] Database migrations drafted (N/A — none needed)

## Implementation Checklist

### Phase 1 — resolveIocFinalState rewrite
- [x] T-01: Replace `resolveIocFinalState()` (claude-agent.ts:966–996) with the bounded-polling version: early-return unchanged for already-filled sync response; loop up to `maxAttempts` polls spaced `delayMs` apart, returning as soon as a terminal status (`filled`/`canceled`) is observed; on exhaustion, call `cancelOrder(syncOrder.id)` (try/catch, non-fatal on failure) then one final `getOrder()` as the definitive return value.
- [x] T-02: Resolve the C-05 signature/testability issue before or during this task — decide and implement how the new parameters are exposed such that fast, deterministic tests remain possible without ambiguity between "zero attempts" and "zero delay." Document the choice made. **Resolution: kept `delayMs` as the second positional parameter (its historical position/meaning), added `maxAttempts` as the third with a sensible default (4).** This means every existing `resolveIocFinalState(syncOrder, 0)` call continues to mean "zero delay, default attempt bound" exactly as before — no ambiguity, no silent behavior change for the simple/already-passing test cases. Only the tests that exercise the *new* looping/forced-cancel behavior need new assertions (see T-10).
- [x] T-03: Confirm no new import is needed for `cancelOrder` (already imported at claude-agent.ts:11) or `getOrder` (already used by the current function). Confirmed — both already in scope, no import changes made.

### Phase 2 — Call-site log lines
- [x] T-04: Add `order.id` to Path A's post-submission `[ORDER] ...` log line (~claude-agent.ts:2030), no other change to that line.
- [x] T-05: Add `order.id` to Path B's post-submission `[ORDER] ...` log line (~claude-agent.ts:2210), no other change to that line.

### Phase 3 — Verification
- [x] T-06: Confirm the `filledQty === 0` decision branches, `HOLD`/`error` assignment, and the filled (`else`) branch's logic at both call sites are byte-for-byte unchanged apart from the two log-line edits. (Confirmed via `git diff` — only 3 hunks total: the function rewrite and the two log lines.)
- [x] T-07: Confirm `cancelOrder()` is only reached after polling is exhausted and the order is still non-terminal — never called on an already-filled or already-canceled order. (Confirmed by code structure — the `for` loop returns immediately on any terminal status; the `cancelOrder()` call is unreachable unless the loop completes all `maxAttempts` iterations without ever seeing `filled`/`canceled`.)
- [x] T-08: Run `npx tsc --noEmit` — must pass with no new errors. (Passed.)
- [x] T-09: Run `npm run build` — must pass. (Passed.)
- [x] T-10: Update all affected `resolveIocFinalState` tests in `ioc-fill-verification.test.ts` (review all 5, not only "IOC_STATE_UNRESOLVED" — see C-05) so each asserts genuinely-verified behavior against the new implementation, using fake timers as the existing tests already do. **Result: only 1 of the 5 pre-existing tests needed changes** — the delayMs-position-preserving fix (T-02) meant the other 4 kept passing unmodified, confirmed by running the suite before making any test edits (17/18 passed, only "IOC_STATE_UNRESOLVED" failed with a clear `TypeError` from calling the exhausted single-value mock a 2nd time). Rewrote that one test into "polling exhausts — forces cancel and returns the final post-cancel getOrder() result" (verifies exactly `maxAttempts`+1 `getOrder()` calls, one `cancelOrder()` call, correct final result). Added one new test: "cancelOrder throws — still returns the final getOrder() result" (covers FR-05 explicitly, which the prompt itself never named as needing a test). Added `mockCancelOrder` to the file's `alpaca` mock.
- [x] T-11: Run the full Vitest suite — report which test files ran, and confirm the updated `ioc-fill-verification.test.ts` assertions make sense against the new implementation (not just "pass"). (41 test files, 381 tests, all passed. `ioc-fill-verification.test.ts` itself: 19/19 — each assertion in the two new/rewritten tests checks a specific, meaningful outcome (call counts, which mock's return value flows through, the exact log/warn text) rather than just "no throw.")
- [x] T-12: Report the worst-case added latency per BUY attempt under the new logic (polling bound + forced-cancel round-trip) against the per-cycle time budget. **Worst case: 4 × 1500ms = 6000ms of polling, plus one `cancelOrder()` call and one final `getOrder()` call (2 additional Alpaca API round-trips, typically well under 1s each but not bounded by this code) — call it ~6.5–8s total in the worst case per ambiguous BUY, versus ~2s today.** Path A executes this inline, sequentially, inside the per-symbol loop — if multiple candidates hit this worst case in the same cycle, the added latency compounds linearly. This is unchanged from the estimate already flagged in design.md's Open Question 3; not addressed by this change (out of scope — see C-04), surfaced here for visibility only.
- [x] T-13: Confirm `indicators.ts`, `db.ts`, `risk-manager.ts`, and `alpaca.ts` are untouched (`git status --short src/`). (Confirmed — only `claude-agent.ts` and the test file changed.)

## Post-Implementation

- [x] Run `/review ioc-fill-bounded-polling` to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged beyond `claude-agent.ts` (or changes approved) — confirmed, no other Protected Zone file touched.

## Estimated Complexity

**Medium** — the polling/cancel logic itself is a contained, well-scoped rewrite of one already-isolated function plus two one-line log additions. The complexity is in (a) the Protected Zone re-authorization (same standing requirement as every prior change this session, not waivable for incident urgency), and (b) correctly resolving the test-signature break found in the originating prompt's exact proposed code — this needs real engineering judgment during implementation, not a copy-paste of the snippet as given.
