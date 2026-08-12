# Tasks — mean-reversion-exit-fix

## Pre-Implementation

- [ x] Amaury has reviewed and approved this spec
- [x ] ⚠️ Protected Zone confirmation: Amaury has explicitly confirmed touching `src/lib/claude-agent.ts` (the "Jorge" authorization claimed in the source prompt does not satisfy this — see requirements.md C-01)
- [ x] Database migrations drafted (if applicable) — N/A

## Implementation Checklist

### Phase 1 — Verify current state (FAIL FAST gate)
- [x] T-01: Read `claude-agent.ts:211-215` and confirm it matches the verbatim block quoted in the source prompt exactly. If it differs, stop and report rather than adapting silently. (Confirmed exact match.)

### Phase 2 — Core fix
- [x] T-02: Replace the block's inner condition from `zScore >= -0.8 && !ctx?.trailingActivated` to `ind.kalman.signal === 'EXIT_LONG'`, and update the reasoning text to `Exit rule: z-score ${zScore.toFixed(3)} reverted to fair value (kalman signal EXIT_LONG)`. Do not add optional chaining to `ind.kalman.signal`. Do not remove the `const zScore = ind.kalman.zScore` assignment elsewhere in the function.

### Phase 3 — Test updates
- [x] T-03: Read `trailing-stop-exit-reason-guard.test.ts` in full to identify its established convention for simulating computed input fields before editing. (Fields are raw values mirroring `ExitCycleInput`; added an optional `kalmanSignal` field following that pattern, scoped to only the affected test.)
- [x] T-04: Update `simulateExitCycle()`'s helper (currently lines 46-50) to mirror the new condition, following the file's existing convention rather than inventing a new one. (`input.kalmanSignal === 'EXIT_LONG'`.)
- [x] T-05: Rewrite the test currently titled `'MEAN_REVERSION with trailing already activated — behavior unchanged (already structurally immune)'` (lines 165-187) to lock in the new correct behavior (z-score exit fires even with trailing already activated) — rename it and update its assertion; do not delete it. (Renamed to `'MEAN_REVERSION z-score exit fires even when trailing already activated (bug fix — was previously blocked)'`.)
- [x] T-06: Confirm the other four tests in this file (2× TREND_PULLBACK EMA50-breach, FCX TREND historical replay, persistence-tracking) are unaffected by the helper change and still pass with their existing assertions unmodified. (`kalmanSignal` made optional — their input objects were not touched at all.)

### Phase 4 — Verification
- [x] T-07: Search the repository for any other test file referencing `zScore >= -0.8`, the literal `-0.8`, or `trailingActivated` combined with MEAN_REVERSION exit logic, beyond `trailing-stop-exit-reason-guard.test.ts` — report any found. (`outcome-classification.test.ts` matched `-0.8` but it's an unrelated `pnlPct` value in a win-rate test array, not the z-score threshold — no other real reference exists.)
- [x] T-08: Run `npx tsc --noEmit` — confirm no new type errors.
- [x] T-09: Run `npm run build` — confirm it passes.
- [x] T-10: Run the full test suite (`npx vitest run`) — report total pass count, and confirm specifically that `trailing-stop-exit-reason-guard.test.ts`, `cooldown-stop-loss-ghost-close.test.ts`, and `self-flagged-disqualifying-risk.test.ts` all pass. (298/298 passed, 30 files; all 3 named files individually verified.)
- [x] T-11: State explicitly in the completion report that the effective z-score threshold changed from -0.8 to -0.5 as a result of this fix (not just that the trailing-activation suppression was removed) — this must be visible to the reviewer, not buried in the diff. (Stated in completion report below.)

## Post-Implementation

- [x] Run `/review mean-reversion-exit-fix` to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged except `claude-agent.ts`, and that its changes match this spec exactly

## Estimated Complexity

Low-Medium — the production code change is a 3-line condition/text swap, but it requires careful test-file surgery (one test's entire premise flips) and the effective-threshold-change must be surfaced clearly, not just the mechanical diff.
