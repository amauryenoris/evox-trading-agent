# Tasks — SF-B: state_fingerprint Enrichment in indicatorsAtBuy

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] Amaury has confirmed Protected Zone change in `src/lib/claude-agent.ts`

## Implementation Checklist

### Phase 1 — Helper functions (CHANGE 1)

- [x] T-01: Add `getAdxBucket`, `getMacdBucket`, `getZBucket` as module-level functions immediately before `computeSpxSnapshot` at line 779 in `src/lib/claude-agent.ts`. Use the exact implementations from design.md. The `getZBucket` signalType parameter must use the inline union literal, NOT the exported `SignalType` from types.ts.

### Phase 2 — Path 1 enrichment (CHANGE 2)

- [x] T-02: In `src/lib/claude-agent.ts`, locate the block ending with `indicatorsAtBuy.spx_regime = spxSnapshot.spx_regime` (line 1773). Add the `state_fingerprint` assignment immediately after it, before the `if (signalType === 'TREND_PULLBACK')` block:
  ```typescript
  indicatorsAtBuy.state_fingerprint = {
    signal_type:   signalType,
    spx_regime:    spxSnapshot.spx_regime,
    market_regime: indicators.marketRegime ?? null,
    adx_bucket:    getAdxBucket(adxValue),
    z_bucket:      getZBucket(typeof zScore === 'number' ? zScore : null, signalType),
    macd_bucket:   getMacdBucket(macdHistogram),
  }
  ```

### Phase 3 — Path 2 enrichment (CHANGE 3)

- [x] T-03: In `src/lib/claude-agent.ts`, locate the block ending with `bestIndicatorsAtBuy.spx_regime = spxSnapshot.spx_regime` (line 1919). Add the `state_fingerprint` assignment immediately after it, before the `if (best.signalType === 'TREND_PULLBACK')` block:
  ```typescript
  const bestAdxValue = typeof best.indicators.adx === 'number' ? best.indicators.adx : null
  const bestMacdHist = typeof best.indicators.macd?.histogram === 'number' ? best.indicators.macd.histogram : null
  const bestZForFingerprint = typeof best.zScore === 'number'
    ? best.zScore
    : typeof best.indicators.kalman?.zScore === 'number'
      ? best.indicators.kalman.zScore
      : null

  bestIndicatorsAtBuy.state_fingerprint = {
    signal_type:   best.signalType,
    spx_regime:    spxSnapshot.spx_regime,
    market_regime: best.indicators.marketRegime ?? null,
    adx_bucket:    getAdxBucket(bestAdxValue),
    z_bucket:      getZBucket(bestZForFingerprint, best.signalType),
    macd_bucket:   getMacdBucket(bestMacdHist),
  }
  ```

### Phase 4 — Verification

- [x] T-04: Run `npx tsc --noEmit` — must exit 0 with no errors.
- [x] T-05: Run `npm run build` — must pass.
- [x] T-06: Verify bucket logic against test cases:

  | Scenario | Input | Expected state_fingerprint |
  |----------|-------|---------------------------|
  | MEAN_REVERSION | z=-1.81, ADX=13.0, regime=RANGING, macd=-0.51 | `{ signal_type: 'MEAN_REVERSION', market_regime: 'RANGING', adx_bucket: 'LOW', z_bucket: 'DEEP', macd_bucket: 'NEGATIVE' }` |
  | TREND_PULLBACK | z=1.5, ADX=28, macd=+3.2 | `{ z_bucket: 'BREAKOUT', adx_bucket: 'HIGH', macd_bucket: 'POSITIVE' }` |
  | EMA_RECLAIM | any z | `{ z_bucket: null }` |
  | Missing ADX | adx=null | `{ adx_bucket: null }` — no crash |

- [ ] T-07: After a live BUY, confirm via Supabase query:
  ```sql
  SELECT indicators->'state_fingerprint'
  FROM open_position_contexts
  WHERE symbol = '<bought_symbol>'
  ORDER BY created_at DESC LIMIT 1;
  ```
  → JSON object with all 6 fields present.

## Post-Implementation

- [x] Run `/review sf-b-state-fingerprint-enrichment` to verify implementation matches spec
- [x] Confirm only `src/lib/claude-agent.ts` was modified — no other Protected Zone files touched
- [x] Confirm spx_price/sma50/sma200/regime and tp_population_bucket/tp_zscore blocks are unchanged

## Estimated Complexity

**Low** — Three pure helper functions + two assignment blocks following an established inline pattern. No new imports, no schema changes, no conditionals affecting trade logic.
