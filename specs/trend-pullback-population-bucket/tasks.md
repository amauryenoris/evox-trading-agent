# Tasks — TREND_PULLBACK Population Bucket Attribution

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] Protected Zone change confirmed: `src/lib/claude-agent.ts`

## Implementation Checklist

### Phase 1 — claude-agent.ts (only file touched)

- [x] T-01: In `src/lib/claude-agent.ts`, declare `populationBucket` const immediately after `zBucket` (after line 1173):
  ```ts
  const populationBucket =
    zScore >= 1.0 ? 'CONTINUATION' :
    zScore >= 0   ? 'CHOP' :
                    'PULLBACK'
  ```
- [x] T-02: Extend `[TREND_PULLBACK_ENTRY]` log (lines 1186–1191) to include `population=${populationBucket}` as the second field (after `symbol=`, before `macd=`).

### Phase 2 — Verification

- [x] T-03: Confirm `zBucket` declaration and all its values are unchanged.
- [x] T-04: Confirm `[TREND_PULLBACK_BLOCKED_MACD]` log is unchanged.
- [x] T-05: Confirm no gate conditions (`trendSetup`, `trendPullbackMomentumOk`, etc.) are modified.
- [x] T-06: Run `npm run build` — zero TypeScript errors.

### Phase 3 — Testing

- [x] T-07: No new test file required — `populationBucket` is a pure logging variable with no branching logic that affects behavior. Existing tests for TREND_PULLBACK signal detection remain valid.

## Post-Implementation

- [x] Run `/review trend-pullback-population-bucket` to verify implementation matches spec
- [x] Confirm `src/lib/claude-agent.ts` changes are limited to: one new `const` + one extended `console.log`

## Estimated Complexity

**Low** — 2 lines added, 1 line extended. Zero behavioral change, zero new dependencies.
