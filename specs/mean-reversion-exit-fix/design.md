# Design — mean-reversion-exit-fix

## Architecture Decision

This is a single-branch fix inside `enforceExitRules()` (`claude-agent.ts`), the same function CHANGE 3b touched. It replaces one deterministic exit condition's triggering logic — from an independently-thresholded, trailing-state-suppressible numeric comparison (`zScore >= -0.8 && !ctx?.trailingActivated`) to a direct read of an already-computed, previously-dead field (`ind.kalman.signal === 'EXIT_LONG'`). No new computation is introduced; `ind.kalman.signal` is already produced every cycle by `calculateAllIndicators()` → `calculateKalman()` and cached in `indicatorsCache`, alongside `zScore`, from the identical Kalman-filter output. This fix only changes which of two pre-existing, already-computed values `enforceExitRules()` reads to decide this one branch.

## Data Flow

1. Per-position loop in `enforceExitRules()` reaches the MEAN_REVERSION branch (after profit-target and time-stop universal exits, before TREND/EMA_RECLAIM branches — order unchanged).
2. Guard: `!exitReason && signalType === 'MEAN_REVERSION'` (unchanged).
3. **Changed inner condition:** `ind.kalman.signal === 'EXIT_LONG'` replaces `zScore >= -0.8 && !ctx?.trailingActivated`.
4. On match, `exitReason` is set to a new reasoning string that still includes `zScore.toFixed(3)` for continuity with existing log conventions, but as descriptive context rather than the trigger.
5. Everything downstream (PASO 1-5, CHANGE 3b's order-replacement logic, the final `!exitReason` HOLD-log fallback, `closePosition()`) is unaffected — none of it reads this branch's internal condition, only the resulting `exitReason` string (already true today).

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Remove only the `!ctx?.trailingActivated` clause, keep `zScore >= -0.8` | Minimal diff, fixes the suppression bug alone | Leaves two independently-thresholded, never-reconciled z-score exit definitions in the codebase (-0.8 here vs. -0.5 in `indicators.ts`'s `EXIT_LONG`) — the exact duplication the user explicitly wants retired | Rejected |
| Switch to `ind.kalman.signal === 'EXIT_LONG'`, remove suppression clause entirely | Single source of truth; retires a previously-dead field into real use; eliminates the threshold split | Effective threshold becomes stricter (-0.5 vs -0.8) — a real behavior change, not just a bug fix, requiring explicit reporting | **Chosen** (user-approved) |
| Make `exitStd` configurable per signal type in `indicators.ts` | Would let MEAN_REVERSION-specific tuning diverge from the generic Kalman computation | Out of scope for this prompt; `indicators.ts` is explicitly untouched | Rejected (out of scope) |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY | Replace the inner condition and reasoning text of the MEAN_REVERSION exit branch (currently lines 211-215). No other branch, guard, or function changes. |
| `src/lib/__tests__/trailing-stop-exit-reason-guard.test.ts` | MODIFY | Update `simulateExitCycle()`'s helper to mirror the new condition (read the file's existing convention for simulating computed fields before adding a new input field); rewrite the `'MEAN_REVERSION with trailing already activated'` test to lock in the new correct behavior instead of the old bug. |

## Protected Zone Impact

⚠️ **`src/lib/claude-agent.ts` is in the Protected Zone.** Per `specs/README.md`, this requires Amaury's explicit confirmation before implementation proceeds, separate from and in addition to the normal spec-approval checkbox — same pattern as CHANGE 3b. The "Jorge" authorization claimed in the source prompt is disregarded per this session's established handling; a dedicated checkbox is required in `tasks.md`.

`trailing-stop-exit-reason-guard.test.ts` is not Protected Zone.

## Database Changes

None.

## Open Questions

None — all design decisions (remove suppression, switch to `kalman.signal`, keep `zScore` in reasoning text as context, effective threshold change explicitly reported) were pre-approved by the user in the source prompt.
