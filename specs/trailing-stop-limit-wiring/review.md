# Review Report — trailing-stop-limit-wiring (CHANGE 3b)

**Date**: 2026-07-31
**Reviewer**: Claude (automated)
**Status**: APPROVED WITH WARNINGS

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | `submitStopLimitWithRetry()` mirrors `submitStopWithRetry()`'s shape | ✅ SATISFIED | `claude-agent.ts:926-948` — identical 2-attempt/3000ms-default structure, identical return type, `[TRAILING]`-prefixed logs. |
| FR-02 | `limitPrice = stopPrice * (1 - 0.005)` | ✅ SATISFIED | `const limitPrice = targetStop * (1 - 0.005)`, passed into `submitStopLimitWithRetry`. |
| FR-03 | Replacement attempted on `justActivated` | ✅ SATISFIED | `shouldReplaceStopOrder = justActivated \|\| stopIncreased \|\| needsSelfHeal`. |
| FR-04 | Replacement attempted when `trailingStop` strictly increases | ✅ SATISFIED | `stopIncreased = trailingStop !== null && (previousStop === null \|\| trailingStop > previousStop)` — strict `>`, matches spec exactly (equal values do not trigger). |
| FR-05 | Self-heal when activated on a prior cycle with no live trailing order | ✅ SATISFIED | `needsSelfHeal = trailingActivated && !justActivated && !ctx?.trailingStopOrderId`. |
| FR-06 | Cancel Capa A when no trailing order has ever existed and Capa A ID present | ✅ SATISFIED | `cancellingCapaA = !ctx?.trailingStopOrderId && !!ctx?.stopOrderId`; verified all three branches (Capa A / existing trailing / neither) resolve correctly by manual trace. |
| FR-07 | Cancel existing trailing order otherwise | ✅ SATISFIED | `orderIdToCancel = cancellingCapaA ? ctx?.stopOrderId : ctx?.trailingStopOrderId`. |
| FR-08 | Skip cancel when neither ID present | ✅ SATISFIED | `if (orderIdToCancel) { ... }` — falls through to submit directly when both are unset. |
| FR-09 | No submit attempt this cycle if cancel throws | ✅ SATISFIED | Submit call is inside the `else` of `if (cancelFailed)` — structurally unreachable when cancel failed. |
| FR-10 | No Supabase field changes on cancel failure | ✅ SATISFIED | The `cancelFailed` branch only calls `insertAgentLogEntry`, never `updatePositionContext`. |
| FR-11 | Cancel-failure `agent_log` alert, distinguishable text | ✅ SATISFIED | `"...CANCEL FAILED for order ${orderIdToCancel}..."`. |
| FR-12 | Persist new `trailingStopOrderId` on submit success | ✅ SATISFIED | `contextUpdates: Partial<OpenPositionContext> = { trailingStopOrderId: replacement.stopOrderId }`. |
| FR-13 | Explicit `stopOrderId: null` if Capa A was cancelled and submit succeeded | ✅ SATISFIED | `if (cancellingCapaA) contextUpdates.stopOrderId = null` in the success branch. |
| FR-14 | Explicit `trailingStopOrderId: null` on submit failure | ✅ SATISFIED | `{ trailingStopOrderId: null }` in the failure branch. |
| FR-15 | Explicit `stopOrderId: null` if Capa A was cancelled and submit then failed | ✅ SATISFIED | Same `if (cancellingCapaA)` guard applied in the failure branch too. |
| FR-16 | Submit-failure alert distinguishable, includes price + error | ✅ SATISFIED | `"...SUBMIT FAILED after cancelling ${orderIdToCancel ?? 'no prior order'}... stop $.../limit $... — error: ${replacement.failureReason}"`. |
| FR-17 | Log entries match established HOLD-type convention exactly | ✅ SATISFIED | Field-by-field comparison against the two pre-existing HOLD inserts (lines 179-188, 321-330) confirms identical shape: `id/timestamp/symbol/decision{action:'HOLD',symbol,quantity:0,reasoning,confidence:0}/indicators/portfolioSnapshot/orderExecuted:false/error`, wrapped in `.catch()`, never rethrown. |
| FR-18 | No extra log entry on success | ✅ SATISFIED | Success branch (`if (replacement.stopOrderId)`) only calls `updatePositionContext`. |
| FR-19 | Widen `stopOrderId` type if needed | ✅ SATISFIED | `types.ts:187` — `string \| undefined` → `string \| null \| undefined`; confirmed required (build would otherwise reject `contextUpdates.stopOrderId = null`). |

## Non-Functional Requirements

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| NFR-01 | PASO 1/2/5 byte-for-byte unchanged | ✅ SATISFIED | Diff shows zero changes outside PASO 4's `if (trailingActivated)` block and the new `previousStop` line. |
| NFR-02 | Existing `updatePositionContext()` call unchanged, new calls additional | ✅ SATISFIED | Existing 3-field call (`highSinceEntry`/`trailingStop`/`trailingActivated`) untouched; no field overlap with the two new calls, so both can run in the same cycle without conflict. |
| NFR-03 | `submitStopWithRetry`/`submitStopOrder`/`closePosition`/entry call sites unchanged | ✅ SATISFIED | None appear in the diff. |
| NFR-04 | Retry pattern matches exactly (2 attempts, 3000ms) | ✅ SATISFIED | No deviation. |
| NFR-05 | `tsc`/`build` pass, widening requirement reported | ✅ SATISFIED | Both passed; widening confirmed necessary (self-reported and independently verified by reading the diff). |
| NFR-06 | Existing tests pass unmodified, 3 named files pass | ✅ SATISFIED | 298/298 across 30 files; the 3 named files verified individually in this session's tool output. |
| NFR-07 | New `cancelOrder()` 204 unit test, established pattern | ✅ SATISFIED | `cancel-order-204.test.ts` uses the same `vi.stubGlobal('fetch', ...)` + env-var `beforeEach`/`afterEach` scaffolding as `calendar-helper.test.ts`. |

## Constraints

| ID | Constraint | Status | Notes |
|----|-----------|--------|-------|
| C-01 | Protected Zone confirmation from Amaury (not "Jorge") | ✅ SATISFIED | Separate checkbox in `tasks.md` marked, distinct from spec-approval checkbox. |
| C-02 | `types.ts` touch narrow (only `stopOrderId` widening) | ✅ SATISFIED | Diff confirms single-field change; `trailingStopOrderId` and all other fields untouched. |
| C-03 | `alpaca.ts`/`db.ts` untouched | ✅ SATISFIED | Not in `git status --porcelain` output. |
| C-04 | `risk-manager.ts`/`indicators.ts`/`learning.ts` untouched | ✅ SATISFIED | Not in `git status --porcelain` output. |
| C-05 | Ghost-close / crash-mid-cycle gap / 4 deterministic exit branches untouched | ✅ SATISFIED | None appear in the diff. |
| C-06 | Cancel-then-submit only, never submit-then-cancel | ✅ SATISFIED | Code structure enforces cancel completing (or being skipped) before any submit call is reached. |
| C-07 | FAIL FAST on structural drift | ➖ NOT TESTABLE | No drift was encountered — `submitStopLimitOrder`, `cancelOrder`, `submitStopWithRetry`, and `updatePositionContext()` all matched the spec's confirmed shapes, so this clause was never exercised. |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | — |
| src/lib/claude-agent.ts | **MODIFIED** | Listed in design.md's Impact table with explicit ⚠️ flag; separate Protected Zone checkbox confirmed in `tasks.md` before implementation began — expected, not a violation. |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | — |

`src/lib/types.ts` (not Protected Zone) was also modified, exactly matching the narrow, pre-declared scope in design.md.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | This change is entirely in deterministic order-management/exit-rules logic — it does not touch `AgentDecision`, Claude's prompt, or parsing. All new `insertAgentLogEntry` calls force `action: 'HOLD'`, consistent with the existing convention. No new path allows Claude to approve/reject trades — Claude isn't involved in this code path at all. |
| Supabase patterns | ✅ | All new writes go through the existing `updatePositionContext()` in `db.ts` (unmodified) — no raw queries added. No `any` casts. Error handling uses `.catch()` consistent with the established fire-and-forget logging pattern already used by the two pre-existing HOLD inserts. |
| TypeScript quality | ✅ (with one pre-existing caveat) | No `any` types introduced; `err` handling mirrors the exact cast pattern already used by `submitStopWithRetry`. No object mutation — `contextUpdates` is a fresh object per branch. `submitStopLimitWithRetry()` itself is ~20 lines. `enforceExitRules()` was already well over the 50-line guideline before this change and remains so — the spec explicitly prohibited restructuring PASO 1/2/5, so extracting the new logic into a separate function was out of scope; this is a pre-existing condition this change does not make categorically worse (it adds one clearly-delimited, comment-bracketed block). `claude-agent.ts` is 2257 lines, over the 800-line file guideline — also pre-existing (was 2151 before this change) and not something this narrowly-scoped change should address. |
| Security | ✅ | No hardcoded secrets. No SQL injection surface (Supabase client only). Logged data (order IDs, prices, error messages) is operational, not sensitive/PII. |

## Task Checklist

- Completed: 19/19 implementation tasks (T-01 through T-19)
- Pre-implementation checkboxes: all 3 marked, including the Protected-Zone-specific one
- Post-implementation checkboxes: not yet marked (expected — this review is what completes them)

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
- **Cancel-failure vs. "already resolved" ambiguity.** If `cancelOrder()` throws because the target order was already filled or already cancelled on Alpaca's side (e.g., the Capa A hard stop triggered moments before this cycle's replacement attempt) rather than because of a genuine API/network failure, the code currently treats this identically to a real cancel failure: it logs a `trailing_stop_naked` alert and skips submitting a replacement. In that specific scenario the position may actually already be closed (or protected by the just-triggered stop), not naked — but the alert text would read as if it's unprotected. This is a real ambiguity, though it sits squarely in the ghost-close detection space that this spec explicitly placed out of scope ("Do NOT modify the ghost-close path"; `detectClosedPositions()` is the existing mechanism that reconciles this on a later cycle). Flagging for awareness, not as a defect in this change — the existing ghost-close reconciliation should catch the true state on the next cycle regardless.
- **`ctx`-less legacy positions silently never get trailing-order protection.** The `replacementQty = ctx?.quantity` guard (added during implementation, not explicitly specified in the CHANGE steps) means that if `trailingActivated` becomes true for a position with no `open_position_contexts` row at all, no trailing stop-limit order is ever placed for it — every cycle, `justActivated` re-evaluates true (since the untracked `trailingActivated` never persists) but the guard blocks any action. This is consistent with — and no worse than — the pre-existing behavior of PASO 1-4's tracking fields silently no-op-ing for such rows, and was a deliberate, disclosed choice to avoid "guessing an alternate quantity source" per the source prompt's FAIL FAST instruction. Confirmed intentional and reasonable, but worth Amaury's awareness since it means genuinely orphaned positions get zero broker-side trailing protection (Capa B's in-code check still applies).

### LOW (optional)
- None

---

## Decision

**APPROVED WITH WARNINGS** — No CRITICAL or HIGH findings. All 19 requirements verified against the actual diff (not just self-reported), all constraints and Protected Zone boundaries respected, and the cancel-then-submit / null-clearing / self-heal interaction was traced by hand and found correct, including the emergent recovery property where a failed submit's explicit `null` writes correctly set up the next cycle's self-heal retry. The two MEDIUM findings are both edge cases explicitly adjacent to work already declared out of scope by the spec (ghost-close reconciliation, orphaned legacy positions) — worth Amaury's awareness but not blockers for this change.
