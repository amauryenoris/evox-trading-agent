# Review Report — Bounded Polling for IOC Fill Resolution (incident fix, part 1 of 2)

**Date**: 2026-08-28
**Reviewer**: Claude (automated)
**Status**: APPROVED

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Return sync response immediately when already `filled`/`filled_qty>0` | ✅ SATISFIED | claude-agent.ts:977–980, unchanged early-return, no delay added. |
| FR-02 | Poll up to a bounded max, fixed delay apart | ✅ SATISFIED | `for (let attempt = 0; attempt < maxAttempts; attempt++)` loop, `await new Promise(r => setTimeout(r, delayMs))` per iteration. |
| FR-03 | Stop polling on first terminal status | ✅ SATISFIED | `if (order.status === 'filled' || order.status === 'canceled') { ... return order }` inside the loop. |
| FR-04 | Call `cancelOrder()` when polling exhausts without a terminal status | ✅ SATISFIED | Reached only after the loop completes without returning; verified unreachable otherwise by code structure. |
| FR-05 | Final re-fetch after forced cancel, regardless of cancel outcome | ✅ SATISFIED | `try { await cancelOrder(...) } catch (err) { console.warn(...) }` followed unconditionally by `return getOrder(syncOrder.id)` — confirmed by the new "cancelOrder throws" test. |
| FR-06 | Log `IOC_LATE_FILL` when a resolved fill differs from sync | ✅ SATISFIED | `if (syncFilled === 0 && filled > 0)` inside the terminal-status branch, matching the original function's condition style. |
| FR-07 | `order.id` added to both log lines, nothing else changed | ✅ SATISFIED | Confirmed via diff — both lines gained exactly `id: ${order.id}`, same position, no other text changed. |
| FR-08 | `filledQty === 0` branch / HOLD-error / filled branch unchanged | ✅ SATISFIED | `git diff` shows exactly 3 hunks: the function body, and the two single-line log edits. Nothing else in either call site touched. |
| FR-09 | No changes to `submitLimitOrder`/`submitStopWithRetry`/`saveOpenPositionContext`/`cancelOrder`/`getOrder` | ✅ SATISFIED | None of these functions appear in the diff; `alpaca.ts` untouched (see Protected Zone Audit). |
| FR-10 | No reconciliation safety net built | ✅ SATISFIED | Diff contains only the polling rewrite and two log lines — no new detection/backfill logic anywhere. |

## Non-Functional Requirements

| ID | Requirement | Status | Notes |
|----|------------|--------|-------|
| NFR-01 | Worst-case latency reported | ✅ SATISFIED | tasks.md T-12: ~6.5–8s worst case (4×1500ms + cancel + final getOrder), reported against Path A's sequential per-symbol-loop execution. |
| NFR-02 | All 5 existing tests reviewed/updated, not just the named one | ✅ SATISFIED | Verified directly: ran the suite *before* any test edits and confirmed only 1 of 5 failed (the exhausted-mock `TypeError`), consistent with tasks.md's account. The parameter-order fix (T-02) is the reason the other 4 needed no changes — a deliberate design choice, not an oversight. |
| NFR-03 | `tsc`/`build` clean | ✅ SATISFIED | Re-verified independently during this review. |
| NFR-04 | Full suite passes | ✅ SATISFIED | Re-verified independently: 41 files, 381 tests, all passing. |

## Constraints

| ID | Constraint | Status | Notes |
|----|-----------|--------|-------|
| C-01 | Fresh, explicit Amaury confirmation for `claude-agent.ts` | ✅ SATISFIED | Obtained via an interactive question in this session, not inferred from the "Jorge"/carryover claim or from spec-approval alone — consistent with the pattern established across every prior change this session. |
| C-02 | `alpaca.ts` untouched, `cancelOrder`/`getOrder` reused as-is | ✅ SATISFIED | `git status --short src/` confirms `alpaca.ts` not in the changed-files list. |
| C-03 | No changes to `indicators.ts`/`db.ts`/`risk-manager.ts` | ✅ SATISFIED | Confirmed via `git status`. |
| C-04 | No reconciliation safety net | ✅ SATISFIED | Confirmed — out of scope, not built. |
| C-05 | Test-signature defect resolved, not silently worked around | ✅ SATISFIED | Resolved via the delayMs-position-preserving signature choice, explicitly documented in tasks.md T-02, and verified by this review's own before/after test run rather than taken on faith. |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | — |
| src/lib/claude-agent.ts | MODIFIED | Listed in design.md's Impact table; explicitly authorized in-session. Expected. |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | — |

No unauthorized Protected Zone changes. `src/lib/alpaca.ts` — not Protected Zone but explicitly called out as "must remain untouched" by the spec — is confirmed untouched, matching C-02 exactly.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | This change is entirely inside order-fill resolution — no interaction with the Claude request/response/action-forcing code, confirmed via the isolated diff. |
| Supabase patterns | ➖ N/A | `db.ts` not touched. |
| TypeScript quality | ✅ | No `any`, no mutation (the local `order` variable is reassigned across loop iterations to the latest fetched snapshot — a plain local loop variable, not a mutation of a shared/passed-in object; `syncOrder` itself is never mutated). `resolveIocFinalState()` is 36 lines — under the 50-line guideline. No new magic numbers: `1500`/`4` are named as default parameter values with clear semantic names (`delayMs`, `maxAttempts`), consistent with how the pre-existing `retryDelayMs = 3000` default is handled in `submitStopWithRetry` just above it in the same file. |
| Security | ✅ | No secrets, no injection surface. `order.id` added to logs is an Alpaca order identifier, not sensitive (and its absence was itself flagged as an incident-response gap in the diagnostic that motivated this spec). |

## Task Checklist

- Completed: 17/19 tracked checkboxes were `[x]` at review start (4 pre-implementation + 13 implementation/verification); the 2 remaining Post-Implementation items are being closed out by this review.

## Findings

### CRITICAL (blocks merge)
- None.

### HIGH (should fix)
- None.

### MEDIUM (consider fixing)
- None.

### LOW (optional)
- **Residual race window, inherent to the design, not a defect.** Even with bounded polling and a forced cancel, a fill could in principle land in the small window between the last poll's `getOrder()` and the `cancelOrder()`/final-`getOrder()` sequence. The spec and design.md are explicit that this change *reduces, not eliminates* the race, with the reconciliation safety net (part 2) intended to bound whatever residual exposure remains — so this is a correctly-scoped and correctly-documented limitation, not a gap in this implementation. Noting only so it isn't rediscovered as a surprise when part 2 is scoped.

---

## Decision

**APPROVED** — No CRITICAL, HIGH, or MEDIUM findings. The implementation matches the spec exactly, the C-05 test-signature defect was resolved cleanly (verified independently by this review, not just taken from the implementation's own report), and all Protected Zone/out-of-scope boundaries held. Ready to commit.
