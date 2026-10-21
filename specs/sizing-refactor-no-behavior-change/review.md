# Review Report — Sizing Refactor With No Behavior Change

**Date**: 2026-10-21
**Reviewer**: Claude (automated)
**Status**: APPROVED (no CRITICAL or HIGH findings; 1 MEDIUM, 3 LOW)

Evidence: `tsc --noEmit` clean · full Vitest suite 820/820 · `npm run build` green · `position-sizing.ts` 100% statements, branches, functions and lines · 13/13 reconstructed entries identical before and after · 100,000+ combinations identical against the frozen pre-refactor code. No live order was placed; the live cycle (`runAgentCycle`) was not run end to end.

Before/after quantities for the 13 reconstructed entries (production `requestedQty` = output of the old code, versus `computeBuyQuantity`): MP 10-13 250/250 · MP 10-20 272/272 · SOFI 735/735 · FCX 159/159 · UUUU 1265/1265 · CRWV 10-16 173/173 · CRWV 10-20 183/183 · INTC 10-07 48/48 · INTC 10-13 27/27 · NVDA 14/14 · TSLA 11/11 · EWZ 62/62 · NKE 318/318 — **0 differences**.

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Same quantity as today for every input (switch on) | ✅ | golden + differential grid, compared with `Object.is` |
| FR-02 | Base `floor(equity × RISK_PCT / (price × STOP_LOSS_PCT))` | ✅ | `cappedBaseShares` |
| FR-03 | Zero base when risk per share is 0 | ✅ | unit test (`stopLossPct: 0`, `price: 0`) |
| FR-04 | Regime multipliers and 1.0 default | ✅ | table test against the frozen copy |
| FR-05 | Floor after the regime multiplier | ✅ | |
| FR-06 | Halve (floor) on NEUTRAL or missing Kalman | ✅ | test chosen so the cap does not hide it (100 → 50) |
| FR-07 | Cap at `floor(0.95 × buying power / price)` | ✅ | |
| FR-08 | Cap at `floor(MAX_POSITION_EQUITY_FRACTION × equity / price)` | ✅ | |
| FR-09 | Never a negative base | ✅ | tested |
| FR-10 | `round(base × max(0.50, min(confidence, 1)))` | ✅ | tested, including the 0.5 minimum and the upper bound |
| FR-11 | z ≤ −2.0 returns the capped base (switch true) | ✅ | grid covers −2.0001, −2, −1.9999 |
| FR-12 | EMA_RECLAIM ×0.75 with rounding | ✅ | TSLA case gives 11 |
| FR-13 | Same final quantity for order, `requestedQty` and queue | ✅ | `qty = sizing.quantity` feeds the unchanged lines; verified by diff, not executed end to end |
| FR-14 | `[BUY SIZING]` log unchanged | ✅ | the log line is not in the diff; its three variables come from the breakdown |
| FR-15 | Prompt multiplier text unchanged | ✅ | prompt call kept, now on the imported function; table test against the frozen copy |
| FR-16 | `MAX_POSITION_EQUITY_FRACTION = 0.10` | ✅ | asserted |
| FR-17 | Used where the literal 0.10 capped equity | ✅ | the only sizing literal; prompt literals (`:876`, `:930`) are `MAX_POSITION_SIZE` defaults, out of scope |
| FR-18 | `Z_SIZING_OVERRIDE_ENABLED = true` | ✅ | asserted |
| FR-19 | Exported from one module only | ✅ | `position-sizing.ts` |
| FR-20 | Switch false applies the confidence step to everyone | ✅ | MP case: `round(250 × 0.5)` |
| FR-21 | Ranking sort z test independent of the switch | ✅ | `:2664-2665` not in the diff |
| FR-22 | No env, clock or network in the function | ✅ | scan of the module finds none; a test changes the env and the result does not move |
| FR-23 | Returns quantity and breakdown | ✅ | |
| FR-24 | Breakdown fields | ✅ | all nine requested plus `adjustedShares` (O-2, approved) |
| FR-25 | Deterministic | ✅ | tested |
| FR-26 | No input mutation | ✅ | frozen input test |
| FR-27 | Called from the single sizing site | ✅ | one call site; ranking reuses the queued quantity (`:2483`, `:2681` untouched) |
| FR-28 | Ranking executes the queued quantity unchanged | ➖ | code unchanged and outside the diff; not executable without the full cycle |
| FR-29 | `RISK_PCT`/`STOP_LOSS_PCT` parsed at the call site with the same defaults | ✅ | |
| FR-30 | Breakdown not persisted | ✅ | used only by the log line |
| FR-31 | Order type, IOC, retries, stops, gates unchanged | ✅ | outside the diff |
| FR-32 | No new dependency | ✅ | |

NFR-01 ✅ (golden = production outputs recorded before any edit, plus the frozen copy) · NFR-02 ✅ · NFR-03 ✅ (100%) · NFR-04 ✅ (largest function 30 lines) · NFR-05 ✅.

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | — |
| src/lib/claude-agent.ts | MODIFIED | Authorized and listed in design.md: +15 / −70 lines, all in the sizing code — `regimeMultiplier` and `calculateBuyQuantity` removed, the sizing block replaced by one `computeBuyQuantity` call, one import added. `[BUY SIZING]` log, queue, ranking, IOC execution, stops and gates are not in the diff |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | — |

`db.ts`, `types.ts`, dashboard, workflows and migrations are untouched.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | Only the quantity arithmetic moved; Claude's prompt, output schema and action override are untouched |
| Supabase patterns | ✅ | N/A — no database code |
| TypeScript quality | ✅ | No `any`; immutable pure function; every literal named (including the extra ones, O-3); functions 3, 9 and 30 lines; module 97 lines |
| Security | ✅ | No secrets, no logging added |

## Task Checklist

- Implementation tasks T-01…T-14: 14/14 completed
- Post-Implementation: this review and the Protected Zone confirmation, ticked by this report

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
1. **The call site is the only part of the change not executed by a test.** The new `computeBuyQuantity({...})` argument mapping inside `runAgentCycle` (for example `kalmanSignal: indicators.kalman?.signal`, `regime: indicators.marketRegime`, `zScore`) is type-checked but never run, because the project does not run that function in tests. A transposed or wrong field would compile only if the types matched, and the types do match for the likely mistakes, but the first live entry is the first real execution. Mitigation already in place: compare every new entry's `[BUY SIZING]` and `requestedQty` with the formula on the first live day.

### LOW (optional)
1. The differential grid does not include a zero or negative price, or a zero stop percentage; those cases are covered by unit tests only (the quantity is 0 in both versions).
2. The frozen "verbatim" legacy copy keeps the logic and operators exactly, but drops the original comments and uses renamed functions.
3. The golden data assumes buying power was not binding (it is not stored in the log); the buying-power cap is covered by synthetic tests instead.

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. Ready to commit. Nothing has been committed.
