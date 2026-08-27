# Review Report — TREND_PULLBACK_3DAY Data Layer (CHANGE 1 of 3)

**Date**: 2026-08-27
**Reviewer**: Claude (automated)
**Status**: APPROVED WITH WARNINGS

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Compute `sma5` inside `calculateAllIndicators()` | ✅ SATISFIED | `sma5: calculateSMA(bars, 5)` at indicators.ts:345, reuses the existing generic helper. |
| FR-02 | `sma5` optional `number \| null` on `TechnicalIndicators` | ✅ SATISFIED | Implemented as `sma5?: number \| null` (types.ts:124). Deviates from the spec's original wording ("non-optional, matching sma50/sma200's style") — see WARNING below. |
| FR-03 | Compute `closeMinus2` (2 days prior, needs ≥3 bars) | ✅ SATISFIED | `bars.length >= 3 ? bars[bars.length - 3].c : null` at indicators.ts:351. |
| FR-04 | Compute `closeMinus3` (3 days prior, needs ≥4 bars) | ✅ SATISFIED | indicators.ts:352, matches spec. |
| FR-05 | Compute `closeMinus4` (4 days prior, needs ≥5 bars) | ✅ SATISFIED | indicators.ts:353, matches spec. |
| FR-06 | Return `null` when bars insufficient | ✅ SATISFIED | All three fields use ternary bounds checks; no other failure mode. |
| FR-07 | Existing fields unchanged (value + computation) | ✅ SATISFIED | `git diff` confirms only new lines added; no existing line altered in either file. |
| FR-08 | No entry-gate/exit/classification logic added | ✅ SATISFIED | Diff contains only field additions to a return object and an interface — no branching, no gate logic. |

## Non-Functional Requirements

| ID | Requirement | Status | Notes |
|----|------------|--------|-------|
| NFR-01 | Same bounds-check convention as `prevClose` | ✅ SATISFIED | Identical `bars.length >= N ? bars[bars.length - N].c : null` shape, N incrementing from `prevClose`'s N=2. |
| NFR-02 | `calculateAllIndicators()` signature + existing fields preserved | ✅ SATISFIED | Signature unchanged; confirmed via diff. |
| NFR-03 | `tsc --noEmit` and `npm run build` pass | ✅ SATISFIED | Re-verified independently during this review: `tsc --noEmit` clean, `npm run build` succeeded (compiled, typechecked, all routes generated). |
| NFR-04 | Existing Vitest suites pass unmodified | ✅ SATISFIED | Re-run during this review: 40 test files, 366 tests, all passed. `git status` confirms zero test files touched. |

## Constraints

| ID | Constraint | Status | Notes |
|----|-----------|--------|-------|
| C-01 | Protected Zone touch requires explicit Amaury confirmation | ✅ SATISFIED | Explicit confirmation obtained via interactive question before any indicators.ts edit (transcript-verifiable), not inferred from spec approval alone — matches the process design.md's Open Question called for. |
| C-02 | No changes to claude-agent.ts / db.ts / alpaca.ts / risk-manager.ts | ✅ SATISFIED | `git status --short src/` shows only `types.ts` and `indicators.ts` modified. |
| C-03 | `calculateSMA()` and existing sma50/sma200/prevClose computation unchanged | ✅ SATISFIED | Diff shows `calculateSMA()` body untouched; the pre-existing `sma50`/`sma200`/`prevClose` lines are byte-identical, only new lines inserted around them. |
| C-04 | No test file assertions modified | ✅ SATISFIED | Zero test files appear in `git status`. |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | — |
| src/lib/claude-agent.ts | UNTOUCHED | — |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | MODIFIED | Listed in design.md's Impact table and Protected Zone Impact section; explicit Amaury authorization obtained in-session before implementation. Expected and authorized. |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | — |

No unauthorized Protected Zone changes.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ➖ N/A | `claude-agent.ts` not touched by this change (correctly out of scope — that's CHANGE 2). |
| Supabase patterns | ➖ N/A | `db.ts` not touched. |
| TypeScript quality | ✅ | No `any` types introduced. No mutation — new fields added to a freshly-constructed return object literal, not mutated in place. `calculateAllIndicators()` is 49 lines (315–363), under the 50-line guideline. Both files (406 and 363 lines) well under the 800-line cap. |
| Security | ✅ | No secrets, no injection surface — pure numeric computation over already-fetched bar data. |

## Task Checklist

- Completed: 10/10 tracked tasks in tasks.md (3 pre-implementation, 3 Phase 1, 5 Phase 2/post-implementation) — all checked `[x]`, one remaining `[ ]` is this review step itself, now being closed out.

## Findings

### CRITICAL (blocks merge)
- None.

### HIGH (should fix)
- None.

### MEDIUM (consider fixing)
- None.

### LOW (optional)
- **FR-02 deviation from originating prompt.** The feature request that seeded this spec explicitly asked for `sma5: number | null` (non-optional, mirroring `sma50`/`sma200`). Implementing it that way broke `tsc` in `claude-agent.ts` and `db.ts` — both out of scope for this change — plus 4 test fixtures, because those files build `TechnicalIndicators` object literals that already omit other optional fields (e.g. `prevClose`) in fallback/error paths. The team pivoted to `sma5?: number | null` mid-implementation, with Amaury's explicit sign-off captured in the requirements.md deviation note. This is a **downstream implication for CHANGE 2**: whatever consumes `sma5` (the uptrend/pullback gate logic) must null-check it the same way it will presumably null-check `closeMinus2/3/4`, rather than assuming presence the way `sma50`/`sma200` can be assumed present. Worth a one-line callback in CHANGE 2's spec so this isn't rediscovered as a surprise.

---

## Decision

**APPROVED WITH WARNINGS** — No CRITICAL or HIGH findings. The single LOW finding is informational and already fully resolved/documented in this change; it's flagged only so CHANGE 2's spec accounts for `sma5`'s optionality. Ready to commit.
