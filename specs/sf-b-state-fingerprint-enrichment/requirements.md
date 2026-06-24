# Requirements — SF-B: state_fingerprint Enrichment in indicatorsAtBuy

## STEP 0 — Pre-implementation observations (DO NOT MODIFY)

### Path 1 — indicatorsAtBuy (lines 1764–1781, claude-agent.ts)

```typescript
// Save buy context for future learning
const entryLogId = randomUUID()
const indicatorsAtBuy = {
  ...indicators,
} as TechnicalIndicators & Record<string, unknown>

indicatorsAtBuy.spx_price  = spxSnapshot.spx_price
indicatorsAtBuy.spx_sma50  = spxSnapshot.spx_sma50
indicatorsAtBuy.spx_sma200 = spxSnapshot.spx_sma200
indicatorsAtBuy.spx_regime = spxSnapshot.spx_regime

if (signalType === 'TREND_PULLBACK') {
  const tpZ = typeof zScore === 'number' ? zScore : null
  indicatorsAtBuy.tp_population_bucket =
    tpZ !== null ? getTrendPullbackPopulationBucket(tpZ) : null
  indicatorsAtBuy.tp_zscore = tpZ
}
```

### Path 2 — bestIndicatorsAtBuy (lines 1911–1930, claude-agent.ts)

```typescript
const entryLogId = randomUUID()
const bestIndicatorsAtBuy = {
  ...best.indicators,
} as TechnicalIndicators & Record<string, unknown>

bestIndicatorsAtBuy.spx_price  = spxSnapshot.spx_price
bestIndicatorsAtBuy.spx_sma50  = spxSnapshot.spx_sma50
bestIndicatorsAtBuy.spx_sma200 = spxSnapshot.spx_sma200
bestIndicatorsAtBuy.spx_regime = spxSnapshot.spx_regime

if (best.signalType === 'TREND_PULLBACK') {
  const rawBestZ = typeof best.zScore === 'number'
    ? best.zScore
    : typeof best.indicators.kalman?.zScore === 'number'
      ? best.indicators.kalman.zScore
      : null
  bestIndicatorsAtBuy.tp_population_bucket =
    rawBestZ !== null ? getTrendPullbackPopulationBucket(rawBestZ) : null
  bestIndicatorsAtBuy.tp_zscore = rawBestZ
}
```

### signalType union at line ~1461

```typescript
const signalType = meanReversionSetup
  ? 'MEAN_REVERSION'
  : trendSetup
  ? 'TREND_PULLBACK'
  : trendZLE05Setup
  ? 'TREND_ZLE05'
  : emaReclaimSetup
  ? 'EMA_RECLAIM'
  : null
```

TypeScript infers: `'MEAN_REVERSION' | 'TREND_PULLBACK' | 'TREND_ZLE05' | 'EMA_RECLAIM' | null`

**This is inline — NOT imported from types.ts.** The exported `SignalType` at types.ts:131 uses different values (`TREND_FOLLOWING`, `PULLBACK_EMA50`) and must NOT be reused here. The helper functions must redeclare the union inline, matching exactly these four literals.

---

## Functional Requirements

FR-01: The system shall add three module-level bucket helper functions (`getAdxBucket`, `getMacdBucket`, `getZBucket`) to `src/lib/claude-agent.ts`, placed immediately before `computeSpxSnapshot` (line 779).

FR-02: The system shall compute `adx_bucket` as `'LOW'` when ADX < 18, `'MID'` when 18 ≤ ADX < 25, and `'HIGH'` when ADX ≥ 25.

FR-03: The system shall return `null` for `adx_bucket` when the ADX value is `null` or non-finite.

FR-04: The system shall compute `macd_bucket` as `'POSITIVE'` when MACD histogram > 0, `'DEEP_NEGATIVE'` when histogram < -2, and `'NEGATIVE'` otherwise.

FR-05: The system shall return `null` for `macd_bucket` when the MACD histogram value is `null` or non-finite.

FR-06: The system shall compute `z_bucket` for `MEAN_REVERSION` signals as `'DEEP'` when z < -1.5, `'STANDARD'` when -1.5 ≤ z < -1.2, and `'SHALLOW'` when z ≥ -1.2.

FR-07: The system shall compute `z_bucket` for `TREND_PULLBACK` and `TREND_ZLE05` signals as `'BREAKOUT'` when z > 1.25, `'CONTINUATION'` when 1.0 ≤ z ≤ 1.25, `'CHOP'` when 0 ≤ z < 1.0, and `'PULLBACK'` when z < 0.

FR-08: The system shall return `null` for `z_bucket` when the signal type is `EMA_RECLAIM`, `null`, or any value not handled by FR-06 or FR-07.

FR-09: The system shall return `null` for `z_bucket` when the z-score value is `null` or non-finite, regardless of signal type.

FR-10: The system shall assign a `state_fingerprint` object to `indicatorsAtBuy` (Path 1) immediately after the `spx_regime` enrichment line and before the `TREND_PULLBACK` block, for all signal types.

FR-11: The `state_fingerprint` written in Path 1 shall contain exactly the fields: `signal_type`, `spx_regime`, `market_regime`, `adx_bucket`, `z_bucket`, `macd_bucket`.

FR-12: The system shall assign a `state_fingerprint` object to `bestIndicatorsAtBuy` (Path 2) immediately after the `spx_regime` enrichment line and before the `TREND_PULLBACK` block, for all signal types.

FR-13: The `state_fingerprint` written in Path 2 shall contain exactly the same six fields as FR-11, derived from `best.indicators` and `best.signalType`.

FR-14: The system shall not modify any other enrichment blocks (spx_price/sma50/sma200/regime, tp_population_bucket/tp_zscore) in either path.

## Non-Functional Requirements

NFR-01: The `getZBucket` function's `signalType` parameter type shall be the inline union `'MEAN_REVERSION' | 'TREND_PULLBACK' | 'TREND_ZLE05' | 'EMA_RECLAIM' | null`, matching the type inferred for `signalType` at line 1461 — NOT the exported `SignalType` from `types.ts`.

NFR-02: `npx tsc --noEmit` shall pass with zero errors after the change.

NFR-03: `npm run build` shall pass after the change.

## Constraints

C-01: This feature touches `src/lib/claude-agent.ts` (Protected Zone) — requires explicit confirmation from Amaury before implementation.

C-02: No other files shall be modified (types.ts, db.ts, learning.ts are handled in SF-C and SF-D).

C-03: No changes to any setup detection logic, exit rules, or risk parameters.

C-04: The `state_fingerprint` assignment must be outside any signal-type conditional — it applies to ALL signal types.

## Out of Scope

- Adding `state_fingerprint` to `types.ts` or `TechnicalIndicators` (SF-C)
- Persisting `state_fingerprint` via `db.ts` or `learning.ts` (SF-D)
- Backfilling `state_fingerprint` on historical rows
- Any dashboard display of `state_fingerprint`
- Modifying `computeSpxSnapshot`, `getTrendPullbackPopulationBucket`, or any other existing function
