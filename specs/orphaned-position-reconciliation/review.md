# Review Report — Orphaned-Position Reconciliation Safety Net (incident fix, part 2 of 2)

**Date**: 2026-09-01
**Reviewer**: Claude (automated)
**Status**: APPROVED WITH WARNINGS

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Detect orphaned position (`ctx === undefined`) | ✅ SATISFIED | `claude-agent.ts:201`, `if (!ctx) { ... }`. |
| FR-02 | Check for existing open sell-side order first | ✅ SATISFIED | `claude-agent.ts:204-207`, `getOrders('open', 100)` + `.some(sell)`. |
| FR-03 | Any sell-side open order counts as protected, no price/qty match | ✅ SATISFIED | `.some((o) => o.symbol === position.symbol && o.side === 'sell')` — no price/qty comparison, matches the explicit simplification. |
| FR-04 | Submit new stop only when not already protected | ✅ SATISFIED | `submitStopWithRetry()` call is inside `if (!alreadyProtected)` only (lines 209-218). |
| FR-05 | Stop price uses standard `STOP_LOSS_PCT` formula | ✅ SATISFIED | `parseFloat(process.env.STOP_LOSS_PCT ?? '0.05')`, identical expression to the other 4 call sites in this file. |
| FR-06 | `buyTimestamp` derived from most recent filled buy order | ✅ SATISFIED | Lines 224-230, filters `side === 'buy'`, sorts by `filled_at` descending, takes the most recent. |
| FR-07 | Fallback to cycle timestamp with logged caveat | ✅ SATISFIED | Line 223 initializes `buyTimestamp = timestamp`; line 232 warns when no match found. |
| FR-08 | Context backfilled regardless of stop outcome | ✅ SATISFIED | `saveOpenPositionContext()` (line 238) sits unconditionally after both branches, outside the `if/else`. Independently verified by the "stop submission fails" test still asserting the save happened. |
| FR-09 | `signalType: null`, generic `claudeReasoning`, no `agent_log` lookup | ✅ SATISFIED | Lines 244, 247 — no read of `agent_log` anywhere in the new block. |
| FR-10 | Single HOLD alert distinguishing 3 outcomes, `error: 'orphaned_position_reconciled'` | ✅ SATISFIED | Lines 250-265; the ternary at line 258 covers all three outcomes, verified directly by 3 of the 5 new tests asserting on the exact reasoning substring per branch. |
| FR-11 | `continue` after handling, defer to next cycle | ✅ SATISFIED | Line 269 (`continue`), reached in every path per T-09's verification. |
| FR-12 | Ctx-present path unchanged | ✅ SATISFIED | `git diff` — 73 insertions, 0 deletions; the only pre-existing line touched is the import line, which gained one entry. |
| FR-13 | No `agent_log` recovery of original signal/reasoning | ✅ SATISFIED | Confirmed — no `agent_log` read anywhere in the diff. |
| FR-14 | `enforceStopLosses`/`submitStopWithRetry`/`saveOpenPositionContext`/`getOrders`/`getLatestSellOrder`/`resolveIocFinalState` untouched | ✅ SATISFIED | None of these function bodies appear in the diff — only a new call site into the first three, and a new import for `getOrders`. |

## Non-Functional Requirements

| ID | Requirement | Status | Notes |
|----|------------|--------|-------|
| NFR-01 | Exception-safe, doesn't crash the loop | ✅ SATISFIED | Outer `try/catch` (lines 203-268) wraps the entire block; verified by the "getOrders throws" test, which asserts `enforceExitRules()` still resolves. |
| NFR-02 | `tsc`/`build` clean | ✅ SATISFIED | Re-verified independently during this review. |
| NFR-03 | Tests follow the inline-replica convention | ⚠️ **PARTIAL — deliberate, disclosed deviation, not a defect.** | The requirement as written calls for an inline replica (mirroring `trailing-stop-exit-reason-guard.test.ts`). The implementation instead calls the real exported `enforceExitRules()` with `getOrders`/`submitStopOrder`/`saveOpenPositionContext`/`insertAgentLogEntry` mocked via `vi.mock`. This diverges from NFR-03's literal text, but is well-justified and consistent with actual codebase precedent: `ioc-fill-verification.test.ts` (this same session's CHANGE 1) already established exactly this pattern — calling the real exported async function directly with mocks — for logic too I/O-heavy to safely hand-replicate without risking silent drift from the real implementation. NFR-03 itself over-generalized from a single precedent file without accounting for this second, equally-established one. The deviation is explicitly disclosed in tasks.md T-12 with clear rationale, not silently made. |

## Constraints

| ID | Constraint | Status | Notes |
|----|-----------|--------|-------|
| C-01 | Fresh, explicit Amaury confirmation for `claude-agent.ts` | ✅ SATISFIED | Obtained via an interactive question in this session, independent of the disputed "Jorge" claim — consistent with the pattern established across every prior change this session. |
| C-02 | `enforceStopLosses()` untouched | ✅ SATISFIED | Not present in the diff. |
| C-03 | `db.ts`/`types.ts`/`indicators.ts`/`risk-manager.ts` untouched | ✅ SATISFIED | Confirmed via `git status --short src/`. |
| C-04 | CHANGE 1's `resolveIocFinalState()` / BUY call sites untouched | ✅ SATISFIED | Not present in the diff. |
| C-05 | Import correction honored (no new `saveOpenPositionContext` import; `getOrders` added) | ✅ SATISFIED | Diff shows exactly one new import line (`getOrders`); no changes to the `./learning` import block. |
| C-06 | Cycle-ordering safety property preserved | ➖ NOT TESTABLE (architectural, not code-level) | This is a property of the surrounding cycle structure, which this change doesn't touch — nothing in the diff could have broken it, and it isn't the kind of thing a unit test would exercise. Correctly treated as a documented invariant rather than a test requirement. |

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

No unauthorized Protected Zone changes. `src/lib/alpaca.ts` (not Protected Zone but explicitly called out as "reuse as-is") is confirmed untouched — the diff shows zero changes to it, only a new import reference from `claude-agent.ts`.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | This change is entirely inside exit-rules/reconciliation logic — no interaction with the Claude request/response/action-forcing code. The new HOLD alert mirrors the existing `exit_rules_skip`/`trailing_stop_naked` alert shape exactly (action forced to `'HOLD'`, `quantity: 0`, `confidence: 0`). |
| Supabase patterns | ➖ N/A | `db.ts` not touched directly; the existing `saveOpenPositionContext()`/`insertAgentLogEntry()` wrappers (already error-checked internally) are reused as-is. |
| TypeScript quality | ✅ | No `any`, no mutation of existing objects. The new block is ~68 lines inside `enforceExitRules()` — the function as a whole is already well beyond 50 lines (pre-existing condition, not introduced here), consistent with the same note made in every prior review this session for this file. `claude-agent.ts` is 2423 lines, already well past the 800-line guideline pre-existing this change — not worsened materially by a 73-line addition. Minor style note (non-blocking): `parseFloat(position.avg_entry_price)` and `parseInt(position.qty, 10)` are each computed twice (once inside the `!alreadyProtected` branch, again at the `saveOpenPositionContext()` call) rather than hoisted once — harmless redundancy, not a correctness issue. |
| Security | ✅ | No secrets, no injection surface. Alpaca order IDs and timestamps logged are not sensitive. |

## Task Checklist

- Completed: 17/19 tracked checkboxes were `[x]` at review start (3 pre-implementation + 15 implementation/verification); the 2 remaining Post-Implementation items are being closed out by this review.

## Findings

### CRITICAL (blocks merge)
- None.

### HIGH (should fix)
- None.

### MEDIUM (consider fixing)
- None.

### LOW (optional)
- **Minor redundant computation.** `parseFloat(position.avg_entry_price)` and `parseInt(position.qty, 10)` are each evaluated twice within the same `if (!ctx)` block (once for the stop-submission branch, once for the `saveOpenPositionContext()` call). Purely cosmetic — both calls operate on the same immutable `position` object and produce identical results either time; no behavior risk. Could be hoisted to shared `const`s for tidiness in a future pass, not worth a dedicated change on its own.
- **NFR-03 test-convention deviation** — already covered above under Non-Functional Requirements; noting again here only because it's the one place implementation didn't literally match the spec's wording. Re-classified as acceptable given it matches a stronger, equally-established codebase precedent, and the deviation was explicitly reasoned through and documented rather than silently made.

---

## Decision

**APPROVED WITH WARNINGS** — No CRITICAL, HIGH, or MEDIUM findings. The two LOW notes are cosmetic/informational: a harmless double-computation and a disclosed, well-justified test-strategy deviation from NFR-03's literal wording (in favor of a stronger existing precedent, `ioc-fill-verification.test.ts`). This is the final piece of the GOOGL incident's two-part fix (bounded IOC polling + this reconciliation net) — both now merged and independently reviewed. Ready to commit.
