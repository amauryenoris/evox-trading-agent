# Tasks — CHANGE 0d-2: characterization harness, remaining setups, partial fills, stop-submit failure and the branches left over from 0d-1 (tests only)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (not applicable — tests only, `claude-agent.ts` read only)
- [x] Database migrations drafted (not applicable)
- [x] Q-1 to Q-5 answered or defaults accepted

## Implementation Checklist

### Phase 1 — Baseline
- [x] T-01: `git status --short`; SHA-256 of all 39 existing goldens (save the list); SHA-256 of `specs/docs-5-selector-criteria/tasks.md`; CR counts of the harness files and the characterization test
- [x] T-02: `npx tsc --noEmit`; the characterization file three times (expected 44/44); full `npx vitest run` (expected 1188 in 78 files); `npx eslint` on the harness folder and the characterization test
- [x] T-03: Coverage baseline (characterization file only, `claude-agent.ts` only, JSON reporter); save statements, branches and the uncovered statement starts per region
- [x] T-04: Re-read the code paths of the scenario map and record `file:line` per branch

### Phase 2 — Harness support (defaults unchanged)
- [x] T-05: `world.ts`: `fillPlan`, `quoteSequence`, `peakHighs`, `closeErrors`, `contextReadFailures`, `exitReasonOverrides`; export `makeOrder`
- [x] T-06: `mocks.ts`: peak-high hook and the `exit-cooldown` pass-through hook
- [x] T-07: Run the characterization file; the 44 existing tests pass and all 39 goldens keep their SHA-256

### Phase 3 — Buys by setup
- [x] T-08: Builders for the trend, ZLE05 and EMA-reclaim indicators, checked against the setup conditions and the classification priority
- [x] T-09: (aa) TREND_PULLBACK BUY with golden and prompt snapshot; `[TREND_PULLBACK_STATS]` assertion
- [x] T-10: (ab) TREND_ZLE05 BUY with golden and prompt snapshot
- [x] T-11: (ac) EMA_RECLAIM BUY with golden and prompt snapshot; the 0.75 factor
- [x] T-12: (ad-1) MACD-floor near-miss; (ad-2) insufficient-ADX near-miss; (ad-3) `EMA_RECLAIM_NEAR`

### Phase 4 — Order execution
- [x] T-13: (ae) partial fill with a successful remainder retry
- [x] T-14: (af-1) retry skipped on drift; (af-2) retry skipped on the remainder size
- [x] T-15: (ag) stop submission fails (QUIRK check)

### Phase 5 — Skips and leftovers
- [x] T-16: (ah) blacklisted, held and no-indicators skips
- [x] T-17: (ai) ATR trailing-stop exit
- [x] T-18: (aj) ghost-close profit with an existing cooldown
- [x] T-19: (ak) peak-high update
- [x] T-20: (al-1) and (al-2) orphan buy-timestamp lookup
- [x] T-21: (am) `UNKNOWN` exit reason (per Q-1)
- [x] T-22: (an-1) close failure and (an-2) context-fetch failure in `enforceStopLosses`
- [x] T-23: For any scenario that cannot be built without changing `src/`: stop on it, record the reason, list it as not covered

### Phase 6 — Stability and verification
- [x] T-24: Read every new golden against its code path; note what it pins and any QUIRK
- [x] T-25: Run the characterization file three times; results identical; no golden written or changed
- [x] T-26: `npx tsc --noEmit`
- [x] T-27: Full `npx vitest run`; report the count against 1188 plus the new tests
- [x] T-28: `npx eslint` on the harness folder and the characterization test; nothing new against the baseline
- [x] T-29: SHA-256 of the 39 existing goldens equals the baseline; `docs-5` `tasks.md` SHA unchanged
- [x] T-30: `git diff --name-only` and `git status` show only `src/lib/__tests__/**` and the new spec folder
- [x] T-31: Coverage after (same command as T-03); report the delta and the uncovered statements per region, classified as error-handling catch or decision branch
- [x] T-32: CR counts per touched file (all LF)

### Phase 7 — Report
- [x] T-33: Write `specs/characterization-harness-0d-2/review.md` with the table scenario -> code path (`file:line`) -> what the golden pins -> QUIRK
- [x] T-34: Final report: scenarios added, scenarios not feasible without `src/` changes and why, coverage delta, quirks, anything not verified; do not commit or push

## Post-Implementation

- [x] Run /review characterization-harness-0d-2 to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged (or changes approved)

## Estimated Complexity

High — 19 new goldens plus 3 prompt snapshots, indicator sets that must trigger exactly one setup in a classification with five competing setups, new fill and quote scripting, and one branch (`UNKNOWN`) that the real flow cannot reach.
