# Tasks — CHANGE 0d-1: characterization harness, scenarios for exits, stops and ghost-close (tests only)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (not applicable — tests only, `claude-agent.ts` read only)
- [x] Database migrations drafted (not applicable)
- [x] Q-1 to Q-5 answered or defaults accepted

## Implementation Checklist

### Phase 1 — Baseline
- [x] T-01: `git status --short`; SHA-256 of all 18 existing goldens (save the list); SHA-256 of `specs/docs-5-selector-criteria/tasks.md`; CR counts of `world.ts`, `builders.ts`, `mocks.ts`, `record.ts`, `harness.ts` and the characterization test
- [x] T-02: `npx tsc --noEmit`; the characterization file three times (expected 23/23); full `npx vitest run` (expected 1167 in 78 files); `npx eslint` on the harness files and the characterization test
- [x] T-03: Coverage baseline: `npx vitest run --coverage --coverage.include=src/lib/claude-agent.ts src/lib/__tests__/claude-agent.characterization.test.ts`; save statements, branches and the uncovered lines of the exit, stop and ghost-close regions
- [x] T-04: Re-read the code paths of the scenario map (`enforceExitRules`, profit-floor helpers, `enforceStopLosses`, ghost-close block, skip logic) and record `file:line` per branch

### Phase 2 — Harness support (defaults unchanged)
- [x] T-05: `world.ts`: add the optional scripting for sell orders, evaluated trades, open/filled order lists and cancel/stop-submit failures (FR-43 to FR-46)
- [x] T-06: Run the characterization file; the 23 existing tests still pass and all 18 goldens keep their SHA-256

### Phase 3 — Ghost-close and cooldown scenarios
- [x] T-07: (n) ghost-close with a loss: build, record, read the golden against the code, add the raw `until` assertion
- [x] T-08: (o) existing cooldown: `COOLDOWN_SKIP`
- [x] T-09: (p) profit confirmed as trailing stop
- [x] T-10: (q) profit not confirmed (QUIRK `GHOST_CLOSE_PROFIT`)
- [x] T-11: (r) already evaluated
- [x] T-12: (s) same-cycle `GTC_STOP` re-entry protection
- [x] T-13: (t) persistent cooldown skip

### Phase 4 — Profit floor and trailing scenarios
- [x] T-14: (u) profit floor activation (cancel old, submit new, snapshot)
- [x] T-15: (v) profit floor sell-now
- [x] T-16: (w1) cancel fails; (w2) cancel ok, submit fails (naked alert)
- [x] T-17: (x1) ATR trailing for `TREND_PULLBACK_3DAY`; (x2) for `EMA_RECLAIM`

### Phase 5 — Exit-rule scenarios
- [x] T-18: (y) exit rules by setup (packed)
- [x] T-19: (z1) profit target boundaries (packed)
- [x] T-20: (z2a) time stop with no cooldown; (z2b) invalid `buyTimestamp` warning
- [x] T-21: (z3) `enforceStopLosses` (Capa B)
- [x] T-22: (z4a) orphan reconciliation with stop submission; (z4b) with an existing sell order
- [x] T-23: (z5) exit-rules skip without Kalman
- [x] T-24: For any scenario that cannot be built without changing `src/`: stop on it, record the reason, list it as not covered

### Phase 6 — Stability and verification
- [x] T-25: Run the characterization file three times; results identical; `git status` shows no changed golden
- [x] T-26: `npx tsc --noEmit`
- [x] T-27: Full `npx vitest run`; report the count against 1167 plus the new tests
- [x] T-28: `npx eslint` on every touched test file; nothing new against the baseline
- [x] T-29: SHA-256 of the 18 existing goldens equals the baseline; `docs-5` `tasks.md` SHA unchanged
- [x] T-30: `git diff --name-only` and `git status` show only `src/lib/__tests__/**` and the new spec folder
- [x] T-31: Coverage after: same command as T-03; report the delta in statements and branches and the uncovered lines of the exit, stop and ghost-close regions
- [x] T-32: CR counts per touched file (all LF)

### Phase 7 — Report
- [x] T-33: Write `specs/characterization-harness-0d-1/review.md` with the table scenario -> code path (`file:line`) -> what the golden pins -> QUIRK
- [x] T-34: Final report: scenarios added, scenarios not feasible without `src/` changes and why, coverage delta, quirks, anything not verified; do not commit or push

## Post-Implementation

- [ ] Run /review characterization-harness-0d-1 to verify implementation matches spec
- [ ] Confirm Protected Zone files unchanged (or changes approved)

## Estimated Complexity

High — about 22 new goldens, each of which must be read against the code; the harness needs new scripting options without moving any existing golden, and the goldens mask the dates that matter for the cooldown scenarios.
