# Review Report — Outlier Guard on the 1-Minute High + Split `applyProfitFloor`

**Date**: 2026-10-20
**Reviewer**: Claude (automated)
**Status**: APPROVED (no CRITICAL or HIGH findings; 1 MEDIUM note)

Evidence: `tsc --noEmit` clean · full Vitest suite 756/756 · `npm run build` green · `peak-high.ts` coverage 100% lines, 98% statements, 88.9% branches. No live order was placed; Alpaca and Supabase are mocked.

Decision recorded during implementation: O-1 = **B (reject)**. FR-08, FR-09 and FR-17 were updated in `requirements.md` accordingly before coding.

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Ignore zero-volume bars | ✅ | `cappedHigh` returns null for `v <= 0`; tested |
| FR-02 | Ignore bars with non-finite high/close/volume | ✅ | tested (NaN high, NaN close) |
| FR-03 | Cap bar high at close × ratio | ✅ | 105 vs close 100 → 101; tested |
| FR-04 | `PEAK_CLOSE_CAP_RATIO` = 1.01 named constant | ✅ | asserted |
| FR-05 | Regular session only | ✅ | existing session tests still pass |
| FR-06 | Null when no valid bar remains | ✅ | tested |
| FR-07 | `PEAK_MAX_JUMP_PP` = 10, same module | ✅ | asserted |
| FR-08 | Ignore candidates above `stored + 10 pp × entry` (keep valid ones) | ✅ | per-bar rejection; tested incl. exact-limit acceptance and mixed bars |
| FR-09 | One warn with symbol, rejected candidate, stored, entry, limit | ✅ | tested for content and a single call |
| FR-10 | Candidate within limit unchanged | ✅ | tested |
| FR-11 | No warn within limit | ✅ | tested |
| FR-12 | `highSinceEntry` = max(stored, guarded peak) | ✅ | unchanged `peakHigh > highSinceEntry` at the call site; tested with a never-lowers case |
| FR-13 | Current-price sample outside the guard | ✅ | `madeNewHigh` logic untouched |
| FR-14 | Skip guard without stored high/entry | ✅ | tested for absent, NaN stored, zero entry |
| FR-15 | Pass stored high (or current price) | ✅ | tested both cases |
| FR-16 | Pass entry (`avg_entry_price`, fallback buy price) | ✅ | tested both cases via `resolveEntryPrice` |
| FR-17 | Bad print in the window across checks does not raise the high | ✅ | 4-check sequence stays at 108 |
| FR-18 | ≤1 extra bars request per MR position per check | ✅ | unchanged single call |
| FR-19 | Null on bars failure | ✅ | tested |
| FR-20 | MR positions only | ✅ | call remains inside `isProfitFloorSetup` |
| FR-21 | Floor parameters unchanged | ✅ | `protective-stop.ts` not in the diff |
| FR-22 | Original 3-argument call still valid | ✅ | existing tests unchanged and passing |
| FR-23 | `sell_now` in its own function | ✅ | `handleFloorSellNow` |
| FR-24 | Same persisted state on `sell_now` | ✅ | same `activeState` passed through; existing floor tests pass |
| FR-25 | Same exit text | ✅ | exact string still asserted by the existing test |
| FR-26 | No exit reason when another exit already fired | ✅ | by code (`exitAlreadySet`); no dedicated `sell_now` + prior-exit test (LOW-1) |
| FR-27 | Functions ≤ 50 lines | ✅ | `applyProfitFloor` 52 → 44; `handleFloorSellNow` 13; `resolveEntryPrice` 4 |

NFR-01 ✅ · NFR-02 ✅ (existing floor tests have 0 deletions; 24 lines only added) · NFR-03 ✅ · NFR-04 ✅ · NFR-05 ✅ · NFR-06 ✅ (no new request).

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | — |
| src/lib/claude-agent.ts | MODIFIED | Authorized: call-site argument, `resolveEntryPrice`, `handleFloorSellNow`; no change to entries, sizing, Capa A/B, prompt or output schema. Imports only `getPeakHighSinceLastCheck` from `peak-high.ts` (C-04) |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | — |

Not touched either: `db.ts`, `types.ts`, `protective-stop.ts`, dashboard components, migrations, workflows.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | Only the deterministic exit path changed |
| Supabase patterns | ✅ | N/A — no database code in this change |
| TypeScript quality | ✅ | No `any`; pure helpers; constants named; functions ≤ 50 lines; `peak-high.ts` is 102 lines |
| Security | ✅ | No secrets; the warn prints only symbol and prices |

## Task Checklist

- Implementation tasks T-01…T-14: 14/14 completed
- Post-Implementation: this review and the Protected Zone confirmation ticked by this report

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
1. **A genuine fast move can be partly missed.** A real 1-minute high more than 10 pp above the stored high within one check is rejected, not capped. The current-price sample still catches the real price, and the next check measures from the higher stored value, so the effect is a lag of at most one check on the intrabar excursion. This is the accepted consequence of option B.

### LOW (optional)
1. No dedicated test for `sell_now` when another exit already fired in the same run (FR-26); the branch is a one-line conditional carried over unchanged.
2. `peak-high.ts` and the two test files are saved with LF while most of the repo is CRLF; git warns and converts on the next touch. Same as the earlier change.
3. A stored high that was already inflated before this guard shipped stays inflated, because the high never lowers. This change does not repair existing rows.
4. The warn repeats on each check while the bad bar stays in the 18 h window (O-4 default, accepted).

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. Ready to commit. Nothing has been committed.
