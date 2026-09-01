# Tasks — Orphaned-Position Reconciliation Safety Net (incident fix, part 2 of 2)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed — Amaury's own explicit confirmation for touching `claude-agent.ts` in this session (the claimed "Jorge... confirmed this session" is NOT accepted as sufficient — see design.md Open Question 1)
- [x] Database migrations drafted (N/A — none needed)

## Implementation Checklist

### Phase 1 — Reconciliation Block
- [x] T-01: In `claude-agent.ts`'s `enforceExitRules()`, immediately after the ctx lookup (`claude-agent.ts:198`), add the `if (!ctx) { ... continue }` block: open-order check (side='sell' → already protected), conditional `submitStopWithRetry()` call using the standard `STOP_LOSS_PCT` formula, `buyTimestamp` derivation from filled buy-order history with a logged fallback, `saveOpenPositionContext()` backfill (always called), and the `orphaned_position_reconciled` HOLD alert whose reasoning distinguishes the three outcomes. Wrap the whole block in try/catch per NFR-01.
- [x] T-02: Add `getOrders` to the existing `./alpaca` import block (`claude-agent.ts:3-22`). Confirm `saveOpenPositionContext` needs no new import (already available via `./learning`, per C-05). (Confirmed — only `getOrders` added.)

### Phase 2 — Verification
- [x] T-03: Confirm the existing ctx-present code path (everything below the new block) is byte-for-byte unchanged. (Confirmed via `git diff` — pure additions, 73 insertions, 0 deletions.)
- [x] T-04: Confirm the "already protected" check correctly short-circuits a duplicate stop submission when an open sell order already exists for the symbol. (Confirmed — lines 205-207, 219-220.)
- [x] T-05: Confirm `submitStopWithRetry()` is called only in the not-already-protected branch, using the existing, unmodified function. (Confirmed — lines 209-218, inside `if (!alreadyProtected)` only.)
- [x] T-06: Confirm `saveOpenPositionContext()` is reached in all three outcomes (already protected / stop submitted / stop submission failed) — the context backfill must not be conditional on stop success. (Confirmed — line 238, unconditional, outside the protection-check branching.)
- [x] T-07: Confirm the alert's reasoning text distinguishes all three outcomes, and that `error: 'orphaned_position_reconciled'` is set. (Confirmed — line 258 ternary covers all three; line 264 sets the error label.)
- [x] T-08: Confirm the entire block is exception-safe — an unexpected error (e.g. `getOrders()` network failure) is caught and logged, not propagated to crash the loop for other symbols. (Confirmed — outer try/catch wraps the full block.)
- [x] T-09: Confirm `continue` is reached at the end of the block in every code path (success, partial failure, caught exception). (Confirmed — single `continue` after the try/catch, unconditionally reached.)
- [x] T-10: Run `npx tsc --noEmit` — must pass with no new errors. (Passed.)
- [x] T-11: Run `npm run build` — must pass.
- [x] T-12: Add test coverage for the new branch, following the codebase's inline-replica convention (per NFR-03) — cover: already-protected skip, successful new-stop submission, stop-submission failure (context still backfilled), buyTimestamp derived from a matching filled order, buyTimestamp fallback to cycle timestamp when no matching order exists, and an unexpected exception being caught rather than propagated. Decide file placement per design.md Open Question 2 and record the choice. **Placement decision: new dedicated file `orphaned-position-reconciliation.test.ts`, NOT an extension of `trailing-stop-exit-reason-guard.test.ts`.** Rationale: this branch involves real async I/O (2x `getOrders`, `submitStopWithRetry`'s real retry logic, `saveOpenPositionContext`) rather than pure synchronous decision logic — a hand-copied inline replica would risk silently drifting from the real implementation. Instead, the test calls the actual exported `enforceExitRules()` with `getOrders`/`submitStopOrder`/`saveOpenPositionContext`/`insertAgentLogEntry` mocked via `vi.mock`, mirroring `ioc-fill-verification.test.ts`'s established precedent for testing this same file's async logic directly rather than replicating it. Fake timers used to avoid `submitStopWithRetry`'s real 3000ms retry delay. 5 tests, all passing.
- [x] T-13: Run the full Vitest suite — report which test files ran and confirm no existing test's behavior changed. (42 test files, 386 tests, all passed — 41 pre-existing files unmodified in behavior, plus the 1 new file.)
- [x] T-14: Confirm `db.ts`, `types.ts`, `indicators.ts`, `risk-manager.ts`, and `alpaca.ts`'s `getOrders()`/`getLatestSellOrder()`/`cancelOrder()`/`getOrder()` bodies are untouched (`git status --short src/` plus a diff check on `alpaca.ts` showing only the import-adjacent area, if touched at all — it shouldn't need any body changes). (Confirmed — `alpaca.ts` itself was never touched at all; `db.ts`, `types.ts`, `indicators.ts`, `risk-manager.ts` also untouched.)
- [x] T-15: Report the final line count of `claude-agent.ts`. (2423 lines.)

## Post-Implementation

- [x] Run `/review orphaned-position-reconciliation` to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged beyond `claude-agent.ts` (or changes approved) — confirmed, no other Protected Zone file touched.

## Estimated Complexity

**Medium** — the block itself is a well-isolated, self-contained addition reusing three existing unmodified primitives, with no changes to the surrounding ctx-present logic. Complexity is mostly in (a) the Protected Zone re-authorization (same standing requirement as every prior change this session), and (b) writing thorough test coverage for a branch with five-plus distinct outcomes (already-protected, stop-success, stop-failure, timestamp-found, timestamp-fallback, exception-caught) rather than the implementation logic itself, which is straightforward sequential async code.
