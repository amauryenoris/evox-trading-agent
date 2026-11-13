# Tasks — CHANGE 0d-3: characterization scenarios for the entry-gate, auto-entry and ranking regions of runAgentCycle (tests only)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (N/A: tests only, no production file is edited)
- [x] Database migrations drafted (N/A: none)
- [x] Q-1 to Q-5 answered or defaults accepted

## Implementation Checklist

### Phase 1 — Baseline
- [x] T-01: `git status --short`, `git rev-parse HEAD`; CR count and line count of the files to touch; SHA-256 of the 61 goldens, of `specs/docs-5-selector-criteria/tasks.md` and of every `src/lib/*.ts`
- [x] T-02: `npx tsc --noEmit`; characterization file x3 (63/63); full `npx vitest run` (1216 in 80 files); ESLint on the files to touch

### Phase 2 — Inventory (read-only)
- [x] T-03: List the existing scenarios (letter, name, golden)
- [x] T-04: V8 coverage of `claude-agent.ts` with the characterization file alone, output outside the repo; list uncovered statements and branches of `runAgentCycle` by region
- [x] T-05: Confirm each candidate as uncovered and reachable, covered (name the scenario) or unreachable (explain); update the table in `design.md`

### Phase 3 — Entry gates
- [x] T-06: (ao) liquidity 999,999 blocked, and (ao-b) 1,000,000 passes
- [x] T-07: (ap-1) no quote, (ap-2) stale quote, (ap-3) spread exactly at the limit passes
- [x] T-08: (aq-1) 9:44 ET, (aq-2) 15:31 ET, (aq-3) 9:45 ET, (aq-4) 15:30 ET, clock set inside each test
- [x] T-09: (ar) 5 buys already today
- [x] T-10: (av) market closed with an open position

### Phase 4 — Setup variants
- [x] T-11: (as) TREND_ZGT125 exclusion
- [x] T-12: (at) TREND_PULLBACK_3DAY with price above SMA5
- [x] T-13: (au) insufficient buying power

### Phase 5 — Auto-entry
- [x] T-14: (aw-1) auto-entry without a setup, with console spy on both lines
- [x] T-15: (aw-2) auto-entry blocked by an entry gate
- [x] T-16: (aw-3) auto-entry with trend z > 1.25

### Phase 6 — Ranking mode
- [x] T-17: (ax-1) no quote at ranking time, (ax-2) zero fill
- [x] T-18: (ax-3) partial fill, (ax-4) stop submission failure
- [x] T-19: (ax-5) different z-scores, (ax-6) same z-score and different confidence
- [x] T-20: (ax-7) stale or wide re-fetched quote still executes ("current behavior")

Each scenario task (T-06 to T-20) follows the same order: arrange, run, observe, write the expectations from the observation, let the first run create the golden (no update flag), run again and compare. A harness extension is added only if strictly needed, with defaults that leave the 61 goldens unchanged.

### Phase 7 — Verification
- [x] T-21: `npx tsc --noEmit`
- [x] T-22: Characterization file x3, identical results; any change in an existing golden stops the work
- [x] T-23: Full `npx vitest run`; report the count against 1216
- [x] T-24: ESLint on every touched file; nothing new against the baseline
- [x] T-25: SHA-256 of every `src/lib/*.ts` identical; SHA-256 of the 61 goldens and of `docs-5` `tasks.md` identical
- [x] T-26: `git diff --name-only` and `git status`: only `src/lib/__tests__/` and `specs/characterization-harness-0d-3/`
- [x] T-27: Re-measure V8 coverage with the characterization file alone; report the change
- [x] T-28: Delete temporary files and coverage output

### Phase 8 — Report
- [x] T-29: Write `specs/characterization-harness-0d-3/review.md` in the usual format, with each new golden and each pending observation
- [x] T-30: Final report: baseline vs final numbers, scenarios built, skipped (covered or unreachable) with reasons, observed behaviours, pending observations, anything not verified; do not commit or push

## Post-Implementation

- [x] Run /review characterization-harness-0d-3 to verify implementation matches spec
- [x] Confirm production files unchanged (SHA-256 before and after)

## Estimated Complexity

Medium — 24 new characterization tests across three regions, one of them time-dependent, and possibly small harness extensions. No production change; the safety net is the 61 existing goldens and the SHA-256 comparison of every production file.
