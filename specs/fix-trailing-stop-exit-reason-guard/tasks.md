# Tasks — Guard Trailing-Stop Exit Reason Against Overwriting an Earlier Exit

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] Protected Zone changes confirmed (if applicable) — `claude-agent.ts`, explicitly authorized
      in the originating request, same file as the prior cooldown fixes this session
- [X] Database migrations drafted (if applicable) — N/A, none needed

## Implementation Checklist

### Phase 1 — Verify before editing
- [x] T-01: Show the exact current lines 296-303 of `claude-agent.ts` verbatim, confirming no
      drift since the diagnostics before making any change.

### Phase 2 — Add the guard
- [x] T-02: At `claude-agent.ts:296`, add `!exitReason &&` as the first clause of the existing
      trailing-stop trigger condition:
      ```
      if (
        !exitReason &&
        trailingActivated &&
        !justActivated &&
        !madeNewHigh &&
        trailingStop !== null &&
        currentPrice <= trailingStop
      ) {
      ```
      No other line in the condition, the message text, or lines 242-295 changes.

### Phase 3 — Testing
- [x] T-03: Test — `signalType='TREND_PULLBACK'` (or any TREND-family/`EMA_RECLAIM` type) with the
      EMA50-breach condition true (sets `exitReason`) and the trailing-stop condition
      independently also true this cycle → `exitReason` remains the EMA50-breach message, not
      overwritten. `src/lib/__tests__/trailing-stop-exit-reason-guard.test.ts`.
- [x] T-04: Test — same setup, EMA50-breach condition false, trailing-stop condition true →
      trailing-stop message fires normally (no regression to the working case). Same file.
- [x] T-05: Test — `MEAN_REVERSION` with trailing already activated → behavior unchanged from
      today (confirms the fix does not alter the already-correctly-immune path). Same file.
- [x] T-06: Test — confirm `highSinceEntry`/`trailingStop`/`trailingActivated` are still updated
      and persisted via `updatePositionContext()` even when `exitReason` was already set by an
      earlier check this cycle (confirms lines 242-295 remain unconditional). Same file.
- [x] T-07: Replay of the FCX 2026-05-14 historical real trailing-stop close against the new
      logic — confirms trailing stop still fires (no competing exit reason, price was above
      EMA50 at close, per the diagnostic). Same file — NVDA/RDW/AAPL share the identical
      "price above EMA50" shape confirmed in the diagnostic, so the same argument (no earlier
      condition could have set `exitReason`) applies to all 4; one representative replay plus the
      general no-regression test (T-04) covers the mechanism.
- [x] T-08: Full test suite run — all previously-passing tests still pass, plus the 5 new cases
      (268 total across 25 files, up from 263 across 24).
- [x] T-09: `npx tsc --noEmit` — passed clean.
- [x] T-10: `npm run build` — passed clean.

## Post-Implementation

- [x] Run `/review fix-trailing-stop-exit-reason-guard` to verify implementation matches spec —
      APPROVED, see `review.md`
- [x] Confirm Protected Zone files unchanged outside `claude-agent.ts` (or changes approved) —
      only `claude-agent.ts` (Protected Zone, authorized) and the new test file were touched;
      diff on `claude-agent.ts` is exactly the single `!exitReason &&` clause the spec called for.

## Estimated Complexity

Low — a single added boolean clause on one existing condition, no control-flow restructuring, no
new files required (though a small additive test is expected), no schema changes. Risk is limited
to correctly verifying the four VERIFY scenarios (overwrite prevented, normal case unaffected,
MEAN_REVERSION unchanged, state-tracking still unconditional) rather than the size of the diff
itself.
