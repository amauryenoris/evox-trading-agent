# Review Report — Bounded Remainder Retry for Partial IOC BUY Fills

**Date**: 2026-09-30
**Reviewer**: Claude (automated)
**Status**: APPROVED

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Attempt 1 identical to today's call sequence | ✅ SATISFIED | `executeIocWithRemainderRetry` (`:1130-1131`): `submitLimitOrder(symbol, requestedQty, 'buy', firstLimitPrice)` → `resolveIocFinalState` — same price/qty/sequence as the pre-change code |
| FR-02 | Retry only when `0 < totalFilled < requested` | ✅ SATISFIED | `if (totalFilledQty > 0)` wraps the entire loop (`:1136`); loop condition also checks `totalFilledQty < requestedQty` (`:1137`) |
| FR-03 | Never retry on a zero fill | ✅ SATISFIED | Same `if (totalFilledQty > 0)` guard — with `totalFilledQty === 0`, the loop body is unreachable |
| FR-04 | No more than `IOC_REMAINDER_RETRY_MAX` retries | ✅ SATISFIED | `for (let retry = 0; retry < IOC_REMAINDER_RETRY_MAX && ...)` (`:1137`) |
| FR-05 | `IOC_REMAINDER_RETRY_MAX = 0` ⇒ identical to today | ✅ SATISFIED | `retry < 0` is false on the first check regardless of state — loop body never runs, `attempts.length` is always 1. Verified by reasoning over the actual code (T-28); no dedicated test sets the constant to 0, but the code path is the same one exercised by the "zero fill" and "full fill" tests with the real `IOC_REMAINDER_RETRY_MAX = 2` — the `retry < N` guard is generic and needs no different code path for N=0 |
| FR-06 | Fresh/spread quote gate before each retry | ✅ SATISFIED | `freshQuote !== null && freshQuote.fresh && freshQuote.spreadBps <= MAX_SPREAD_BPS` (`:1142-1144`) |
| FR-07 | Drift gate vs. attempt 1's price, not previous retry | ✅ SATISFIED | `maxDriftPrice = firstLimitPrice * (1 + IOC_RETRY_MAX_DRIFT_BPS / 10000)` (`:1140`) — `firstLimitPrice` is the function parameter, never reassigned across iterations |
| FR-08 | Remainder notional ≥ `IOC_RETRY_MIN_REMAINDER_USD` | ✅ SATISFIED | `remainder * freshQuote.ask >= IOC_RETRY_MIN_REMAINDER_USD` (`:1146`) |
| FR-09 | Gate failure stops retries, not an error | ✅ SATISFIED | `if (!gateOk) { console.log(...); break }` (`:1148-1151`) — logged, not thrown |
| FR-10 | Retry submit+resolve identical shape to attempt 1 | ✅ SATISFIED | `submitLimitOrder(symbol, remainder, 'buy', freshQuote.ask)` → `resolveIocFinalState` (`:1154-1155`) |
| FR-11 | Aggregated total never exceeds requested | ✅ SATISFIED | `Math.min(totalFilledQty + attempt.qtyFilled, requestedQty)` (`:1158`), and `Math.min(attempts[0].qtyFilled, requestedQty)` for attempt 1 (`:1133`) |
| FR-12 | Retry throw: caught, logged, prior fills preserved | ✅ SATISFIED | `try { ... } catch (err) { console.error(...); break }` (`:1153-1167`) — `attempts`/`totalFilledQty` already updated from prior iterations are untouched by the catch; verified by test (T-22) |
| FR-13 | Weighted `avgFillPrice`, limit-price fallback, zero-weight for zero fills | ✅ SATISFIED | `buildFillAttempt` (`:1093-1105`) and `weightedAvgFillPrice` (`:1107-1111`); verified by 3 dedicated tests (weighted average, null-when-nothing-filled, limit-price fallback) |
| FR-14 | One `attempts[]` entry per order, correct shape | ✅ SATISFIED | `buildFillAttempt` returns exactly `{ orderId, qtyRequested, qtyFilled, limitPrice, avgFillPrice, status }` |
| FR-15 | One shared helper for both BUY paths | ✅ SATISFIED | `executeIocWithRemainderRetry` called at `:2281` (immediate) and `:2464` (ranking) |
| FR-16 | `decision.quantity` = aggregated total | ✅ SATISFIED | `:2295` and `:2478` both set from `fillResult.totalFilledQty` |
| FR-17 | `agent_log.order_id` = attempt 1's order id | ✅ SATISFIED | `:2293` and `:2474`, both `fillResult.firstOrder.id` |
| FR-18 | `fillAttempts` persisted in both `agent_log.indicators` and `open_position_contexts.indicators` | ✅ SATISFIED | Immediate: `:2399` (conditional spread into `indicatorsWithLearning`) + `:2325` (`indicatorsAtBuy.fillAttempts`). Ranking: `:2475` (spread onto `best.entry.indicators`) + `:2508` (`bestIndicatorsAtBuy.fillAttempts`) |
| FR-19 | No separate `orderIds` field | ✅ SATISFIED | Confirmed by grep — no `orderIds` anywhere in the diff |
| FR-20 | Immediate path follows `requestedQty` hoisting pattern | ✅ SATISFIED | `let fillAttempts` hoisted next to `let requestedQty` (`:2188`); same conditional-spread idiom at `:2399` |
| FR-21 | Ranking path attaches via a new object, never mutates | ✅ SATISFIED | `best.entry.indicators = { ...best.entry.indicators, fillAttempts: fillResult.attempts }` (`:2475`) — a fresh object |
| FR-22 | No mutation of any object referenced by `indicatorsCache` | ✅ SATISFIED | Confirmed: all `fillAttempts` assignments target `indicatorsAtBuy`/`bestIndicatorsAtBuy` (already-spread copies) or `best.entry.indicators` (freshly re-spread) — `indicatorsCache` itself (`:1231` area, unchanged per diff) is never referenced by the new code |
| FR-23 | `buyPrice` unchanged | ✅ SATISFIED | Grep confirms `buyPrice: indicators.currentPrice` and `buyPrice: best.indicators.currentPrice` are both absent from the diff — untouched |
| FR-24 | Existing `[ORDER]` lines kept + new summary line | ✅ SATISFIED | Attempt-1 and per-retry `[ORDER]` lines present (`:1134`, `:1159`); summary line `[IOC_REMAINDER_RETRY] ... requested X, attempts N, filled Y` at `:1171` |
| FR-25 | Exactly one stop order, aggregated qty | ✅ SATISFIED | `submitStopWithRetry(symbol, filledQty, ...)` (`:2303`) and `(best.symbol, filledQty, ...)` (`:2486`), each called exactly once, after the helper resolves, where `filledQty = fillResult.totalFilledQty` |
| FR-26 | `fillAttempts` field on `TechnicalIndicators` | ✅ SATISFIED | `types.ts:132`, plus new `FillAttempt` interface (`:135-142`) |

## Non-Functional Requirements

| ID | Requirement | Status | Notes |
|----|------------|--------|-------|
| NFR-01 | `tsc --noEmit` clean | ✅ SATISFIED | Verified independently, exit 0 |
| NFR-02 | Full suite passes, new tests added | ✅ SATISFIED | 49 files / 459 tests (448 baseline + 11 new), verified independently |
| NFR-03 | Sizing/liquidity/spread/hours/risk gates unchanged | ✅ SATISFIED | None of these appear in the diff — all precede the touched lines |
| NFR-04 | `resolveIocFinalState` internals unchanged | ✅ SATISFIED | Zero diff inside that function; reused as-is for every attempt including retries |
| NFR-05 | Order type/TIF unchanged | ✅ SATISFIED | All orders (attempt 1 and retries) go through the unchanged `submitLimitOrder`, which always sets `type: 'limit'`, `time_in_force: 'ioc'` |

## Constraints

| ID | Constraint | Status | Notes |
|----|-----------|--------|-------|
| C-01 | Protected Zone confirmation | ✅ SATISFIED | Explicitly checked in `tasks.md` pre-implementation, separate from spec approval |
| C-02 | No change to `submitStopWithRetry`/`saveOpenPositionContext`/`updatePositionContext`/`db.ts`/`alpaca.ts`/`resolveIocFinalState` internals | ✅ SATISFIED | All 0-diff per `git diff --stat` |
| C-03 | No retry on zero fill | ✅ SATISFIED | Same as FR-03 |
| C-04 | No resting/day orders | ✅ SATISFIED | `submitLimitOrder` unchanged, always IOC |
| C-05 | No price buffer on attempt 1 | ✅ SATISFIED | `firstLimitPrice` passed straight from `quote.ask`/`rankingQuote.ask`, no adjustment |
| C-06 | No BUY-related write before retries conclude | ✅ SATISFIED | `executeIocWithRemainderRetry` is fully awaited before `submitStopWithRetry`/`saveOpenPositionContext`/agent_log construction in both paths |
| C-07 | `risk-manager.ts`/`indicators.ts`/`config.ts`/`learning.ts` untouched | ✅ SATISFIED | 0-diff on all four |
| C-08 | No migration | ✅ SATISFIED | `fillAttempts` rides the existing `indicators` JSONB column |
| C-09 | Attempt-1 quote not re-fetched by this feature | ✅ SATISFIED | `quote`/`rankingQuote` fetch sites unchanged in the diff |
| C-10 | `requestedQty` behavior unchanged | ✅ SATISFIED | Its hoisting, assignment, and spread are untouched; only a new line was added alongside it |
| C-11 | `buyPrice` unchanged | ✅ SATISFIED | Same as FR-23 |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| `src/lib/config.ts` | UNTOUCHED | — |
| `src/lib/claude-agent.ts` | **MODIFIED** | Expected per `design.md` and explicit pre-implementation confirmation (C-01) |
| `src/lib/risk-manager.ts` | UNTOUCHED | — |
| `src/lib/indicators.ts` | UNTOUCHED | — |
| `src/lib/news-intelligence.ts` | UNTOUCHED | — |
| `src/lib/watchlist-monitor.ts` | UNTOUCHED | — |
| `src/lib/learning.ts` | UNTOUCHED | — |

The one Protected Zone modification was explicitly listed in `design.md` → Impact on Existing Files, and separately confirmed in `tasks.md` before implementation started. No unauthorized change.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ➖ N/A | This change is entirely in the post-analysis BUY execution path. `SYSTEM_PROMPT`, Claude's response schema, and the `decision.action` override logic are all absent from the diff — confirmed untouched |
| Supabase patterns | ➖ N/A | No DB query added or modified; `db.ts` untouched |
| TypeScript quality | ⚠️ SEE NOTE | No `any` anywhere in the new code (helper or test file). No mutation of existing objects — every `fillAttempts` attachment either assigns onto an already-freshly-spread copy (`indicatorsAtBuy`/`bestIndicatorsAtBuy`) or re-spreads (`best.entry.indicators`). `executeIocWithRemainderRetry` is ~61 lines (`:1119-1179`), a few lines over the repo's "functions < 50 lines" guideline — the gate-check/submit/log sequence is cohesive and splitting it further would fragment a single conceptual step; `buildFillAttempt`/`weightedAvgFillPrice` were already factored out. Not flagged as a defect. Both touched files stay well under 800 lines. Named constants used throughout — no magic numbers |
| Security | ✅ SATISFIED | No secrets, no SQL, no sensitive data in any new `console.log`/`console.warn`/`console.error` call |

One informational note, not a defect: `executeIocWithRemainderRetry` takes a 4th parameter, `firstSpreadBps`, used only to preserve the exact pre-existing `[ORDER]` log line format (`spread: Xbps`) for attempt 1. This parameter isn't spelled out in `requirements.md`/`design.md` (which describe a 3-arg `(symbol, requestedQty, firstLimitPrice)` shape) — it was added during implementation for log fidelity and disclosed transparently in the implementation report. It doesn't affect any retry decision, gate, or persisted value — purely a logging-fidelity addition.

## Task Checklist

- Completed: 32/32 implementation tasks (T-01 through T-32), plus all 3 pre-implementation checkboxes including the explicit Protected Zone confirmation

## Findings

### CRITICAL (blocks merge)
None.

### HIGH (should fix)
None.

### MEDIUM (consider fixing)
None.

### LOW (optional)
- `executeIocWithRemainderRetry` is ~61 lines, slightly over the project's 50-line function guideline. Cohesive as written; not worth splitting further at this size. (See Pattern Compliance above.)
- The helper's 4th parameter (`firstSpreadBps`) isn't documented in `requirements.md`/`design.md`. Low-risk, log-fidelity-only, already disclosed in the implementation report — worth a one-line mention in `design.md` if this spec is ever revisited, but not worth a spec amendment now.

---

## Decision

**APPROVED** — No CRITICAL, HIGH, or MEDIUM findings. Ready to commit.

Independent verification performed by this review (not just trusting the implementation report): `npx tsc --noEmit` (exit 0), `npm test` (49/49 files, 459/459 tests), a full `git diff` read of every line changed in `claude-agent.ts` and `types.ts`, a `git diff --stat` audit of every Protected-Zone and adjacent file (all 0-diff except the one explicitly authorized), and a line-by-line trace of every FR/NFR/constraint against the actual code rather than the implementation report's claims. As stated in that report and reconfirmed here: no live Alpaca behavior has been exercised — this is static/unit-test verification only, and the first real BUY with a partial fill will be the first live signal on whether the retry sequence behaves as designed.
