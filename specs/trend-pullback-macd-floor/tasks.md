# Tasks — TREND_PULLBACK MACD Floor Gate

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] Amaury has confirmed Protected Zone change to `src/lib/claude-agent.ts`

## Implementation Checklist

### Phase 1 — Signal gate (claude-agent.ts)

- [x] T-01: Declare `trendPullbackBlockedMacd = 0` before the symbol loop
      alongside the existing ZLE05 counters (~line 943)

- [x] T-02: Declare `trendPullbackMacdFloor = -2.0` and
      `trendPullbackMomentumOk` immediately before `trendSetup` (~line 1067)

- [x] T-03: Append `&& trendPullbackMomentumOk` as the final condition of
      `trendSetup` (~line 1068–1075)

- [x] T-04: Declare `wouldPassWithoutMacdFloor` immediately after `trendSetup`
      (the original 7-condition expression, no MACD gate)

### Phase 2 — Temp instrumentation (claude-agent.ts, remove ~Jun 17)

- [x] T-05: Add `zBucket` ternary with `Number.isFinite` guard after
      `wouldPassWithoutMacdFloor`

- [x] T-06: Add `[TREND_PULLBACK_BLOCKED_MACD]` log block — fires only when
      `!trendSetup && wouldPassWithoutMacdFloor && !trendPullbackMomentumOk`

- [x] T-07: Add `[TREND_PULLBACK_ENTRY]` log block — fires when `trendSetup`

- [x] T-08: Add `[TREND_PULLBACK_HIGH_VOL]` log block — fires when
      `trendSetup && marketRegime === 'HIGH_VOLATILITY'`

- [x] T-09: Add `[TREND_PULLBACK_STATS]` log after symbol loop, near the
      existing `TREND_ZLE05_STATS` line (~1526)

### Phase 3 — Verify isolation

- [x] T-10: Confirm `trendZLE05Setup` is unchanged (no `trendPullbackMomentumOk`
      reference)

- [x] T-11: Confirm `momentumOk`, `trendQualityOk`, `adxOk` are unchanged

- [x] T-12: Run `npm run build` — zero TypeScript errors

### Phase 4 — Testing

- [x] T-13: Write unit tests covering:
      - COP MACD -1.69 → `trendPullbackMomentumOk = true` (> -2.0)
      - NVDA MACD -1.42 → `trendPullbackMomentumOk = true`
      - UUUU MACD -0.05 → `trendPullbackMomentumOk = true`
      - GOOGL MACD -5.84 → `trendPullbackMomentumOk = false` (blocked)
      - MACD = null → `trendPullbackMomentumOk = false`
      - MACD = -2.0 exactly → `trendPullbackMomentumOk = false` (strict >)

- [x] T-14: Verify `wouldPassWithoutMacdFloor` is `true` for the GOOGL case
      (all 7 original conditions pass, only MACD gate differs)

- [x] T-15: Verify `BLOCKED_MACD` condition fires only when
      `!trendPullbackMomentumOk` is the sole blocker (not when other
      conditions also fail)

- [x] T-16: Verify 80% coverage on new code paths

## Post-Implementation

- [ ] Run `/review trend-pullback-macd-floor` to verify implementation matches spec
- [ ] Confirm `trendZLE05Setup` and all ZLE05 variables are unchanged in diff
- [ ] Confirm no exit logic changed in diff

## Estimated Complexity

**Low** — 4 new variable declarations + 1 condition appended to an existing
boolean + 4 temp log blocks. All changes are inside one function in one file.
No schema changes, no API changes, no new files.
