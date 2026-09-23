# Tasks — Add mrRiskFactors Persisted Observability Tagging

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Amaury has answered Open Question 1 (`design.md`): include `max_positions`/`max_buys` gate-blocked sites? — record answer: YES, include (T-09/T-10 in scope)
- [x] Amaury has answered Open Question 2 (`design.md`): include `EMA_RECLAIM_NEAR`/`TREND_QUALITY_FAIL` intercept sites? — record answer: NO, leave as accepted gap (T-11/T-12 out of scope)
- [x] Protected Zone changes confirmed — ⚠️ REQUIRED: `src/lib/claude-agent.ts` is Protected Zone. Obtain fresh, explicit, in-conversation confirmation from Amaury before starting Phase 2 — separate from, and not satisfied by, spec approval alone. `src/lib/types.ts` needs no such confirmation.
- [x] Database migrations drafted — N/A, none needed (rides in existing `indicators` JSONB)

## Implementation Checklist

### Phase 1 — types.ts

- [x] T-01: Add `mrRiskFactors?: string[] | null` to the `TechnicalIndicators` interface (`src/lib/types.ts`, currently lines 90-128). Do not change any other field, ordering, or comment in the interface.

### Phase 2 — claude-agent.ts (mandatory scope)

- [x] T-02: Re-verify current exact line numbers for `meanReversionSetup` (~1701), the MR_RANGING_ADX_GATE blocked push (~1937-1951), and the `indicatorsWithLearning` construction (~2282-2290) before editing — they may have shifted since this spec was written.
- [x] T-03: Immediately after `const meanReversionSetup = meanReversionSignal && mrRangingAdxGateOk`, add:
  ```ts
  const mrRiskFactors = !meanReversionSignal ? null : [
    hasValidAdx && adxValue < mrRangingAdxFloor ? 'LOW_ADX' : null,
    indicators.marketRegime === 'RANGING' ? 'RANGING' : null,
    indicators.distanceToEma50Pct !== null && indicators.distanceToEma50Pct < -15 ? 'DEEP_EXTENSION' : null,
  ].filter((v): v is string => Boolean(v))
  ```
  Exactly as specified — reuse `hasValidAdx`, `adxValue`, `mrRangingAdxFloor` (no new literal `18`), `indicators.marketRegime`, `indicators.distanceToEma50Pct`. Do not `.join('|')` — keep as `string[] | null`.
- [x] T-04: At the MR_RANGING_ADX_GATE-blocked `decisions.push` (inside `if (mrGateBlocked)`, ~lines 1940-1949), change the `indicators,` field to `indicators: { ...indicators, ...(mrRiskFactors !== null && { mrRiskFactors }) },`. Do not change any other field in that push (`decision`, `portfolioSnapshot`, `orderExecuted`, `error` all unchanged).
- [x] T-05: At the `indicatorsWithLearning` construction (~lines 2282-2290), add one more conditional-spread line matching the existing pattern (`...(decision.learning_note !== undefined && { learning_note: decision.learning_note })`, etc.): `...(mrRiskFactors !== null && { mrRiskFactors }),`. Do not change `effectiveThreshold`, `newsAdjustment`, or any of the other conditional spreads already there.
- [x] T-06: Confirm `emaReclaimRiskFactors` (~1823-1828, ~1830-1854) is byte-for-byte unchanged.
- [x] T-07: Confirm `MR_BLOCKED_RANGING_ADX` console.log (~1758-1766) is byte-for-byte unchanged.
- [x] T-08: Confirm `meanReversionSetup`, `mrRangingAdxGateOk`, and no BUY/HOLD/SELL decision logic anywhere were changed.
- [x] T-09: At the `max_positions` gate push, add `...(mrRiskFactors !== null && { mrRiskFactors })` into the existing spread, before the `as unknown as` cast.
- [x] T-10: Same as T-09 for the `max_buys` gate push.

### Phase 3 — claude-agent.ts (conditional on Open Question answers)

- [x] T-11 — SKIPPED: Amaury answered "No" to Open Question 2. `EMA_RECLAIM_NEAR` push (~1904-1913) left as plain `indicators,` — documented accepted gap.
- [x] T-12 — SKIPPED: Amaury answered "No" to Open Question 2. `TREND_QUALITY_FAIL` push (~1921-1930) left as plain `indicators,` — documented accepted gap.

### Phase 4 — Testing

- [x] T-13: Checked existing test files (`mr-ranging-adx-gate.test.ts`, `mr-gate-rejection-message.test.ts`) — neither covers `mrRiskFactors`. Added new `src/lib/__tests__/mr-risk-factors-tagging.test.ts` following `ema-reclaim-observability.test.ts`'s inline-replica convention (`computeMrRiskFactors()` helper replicating the exact ternary-array logic).
- [x] T-14: All listed test cases covered: (a) all 3 factors firing; (b) 0 factors firing → `[]`; (c) signal=false → `null`; (d) each factor firing independently (LOW_ADX only, RANGING only, DEEP_EXTENSION only); (e) adx=null and adx=NaN do not throw and do not produce LOW_ADX. Plus boundary tests (adx exactly 18, distance exactly -15) and distanceToEma50Pct=null.

## Post-Implementation

- [x] T-15: Run `npx tsc --noEmit` — must pass with zero new errors, and confirm no `as unknown as TechnicalIndicators` cast was needed at any site touched by this change (NFR-03). Confirmed: the two pre-existing `as unknown as TechnicalIndicators` casts at max_positions/max_buys were already there before this change (for `would_execute`/`errors`, still not part of `TechnicalIndicators`); `mrRiskFactors` itself needed no new cast anywhere, including inside those two object literals.
- [x] T-16: Diff confirmed confined to exactly: T-01 (types.ts field), T-03 (computation), T-04 (MR gate push), T-05 (indicatorsWithLearning), T-09/T-10 (max_positions/max_buys). T-11/T-12 correctly absent (skipped per Amaury's answer).
- [x] T-17: Sample JSONB shapes shown in completion report (see below).
- [x] T-18: Full test suite run — 48 files / 448 tests passed, no regressions.
- [ ] Run `/review mr-risk-factors-tagging` to verify implementation matches spec.
- [x] Confirm Protected Zone files unchanged except the explicitly-confirmed `claude-agent.ts` modification.

## Estimated Complexity

**Low-Medium** — the core logic (T-03) is a direct copy of the CHANGE prompt's own expression, and the two mandatory attachment sites (T-04, T-05) are small, well-understood edits following an existing conditional-spread convention. The complexity comes from the discovered multi-site surface (`design.md`'s table of 7 push sites) requiring an explicit scope decision from Amaury before Phase 3 can be scoped precisely — not from the logic itself.
