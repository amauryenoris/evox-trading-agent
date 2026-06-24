# Design — SF-B: state_fingerprint Enrichment in indicatorsAtBuy

## Architecture Decision

This feature is a pure enrichment step inside `runAgentCycle()` in `src/lib/claude-agent.ts`. It follows the same inline pattern already established by `spx_price/sma50/sma200/regime` (Macro-C Part 1) and `tp_population_bucket/tp_zscore` (jun-17-parte-b). Three stateless module-level helper functions compute the bucket values; their results are assigned to the `indicatorsAtBuy` / `bestIndicatorsAtBuy` objects before they are passed to `saveOpenPositionContext`. No new imports, no new abstractions beyond the three helpers.

## Data Flow

```
BUY execution
    │
    ├─ Path 1 (single BUY)
    │       indicatorsAtBuy = { ...indicators }
    │       indicatorsAtBuy.spx_* = spxSnapshot.*        (existing)
    │       indicatorsAtBuy.state_fingerprint = {         (NEW)
    │           signal_type:   signalType,
    │           spx_regime:    spxSnapshot.spx_regime,
    │           market_regime: indicators.marketRegime,
    │           adx_bucket:    getAdxBucket(adxValue),
    │           z_bucket:      getZBucket(zScore, signalType),
    │           macd_bucket:   getMacdBucket(macdHistogram),
    │       }
    │       indicatorsAtBuy.tp_*  = ...                   (existing, TREND_PULLBACK only)
    │       → saveOpenPositionContext(indicatorsAtBuy)
    │
    └─ Path 2 (ranked BUY)
            bestIndicatorsAtBuy = { ...best.indicators }
            bestIndicatorsAtBuy.spx_* = spxSnapshot.*     (existing)
            bestIndicatorsAtBuy.state_fingerprint = {      (NEW)
                signal_type:   best.signalType,
                spx_regime:    spxSnapshot.spx_regime,
                market_regime: best.indicators.marketRegime,
                adx_bucket:    getAdxBucket(bestAdxValue),
                z_bucket:      getZBucket(bestZForFingerprint, best.signalType),
                macd_bucket:   getMacdBucket(bestMacdHist),
            }
            bestIndicatorsAtBuy.tp_* = ...                 (existing, TREND_PULLBACK only)
            → saveOpenPositionContext(bestIndicatorsAtBuy)
```

`saveOpenPositionContext` stores the `indicators` jsonb column in `open_position_contexts`. Because `indicatorsAtBuy` is typed as `TechnicalIndicators & Record<string, unknown>`, the `state_fingerprint` key is accepted without TypeScript errors.

`state_fingerprint` is also read back via `trade_evaluations.state_fingerprint` (separate column, SF-A migration already applied).

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Inline assignment (same pattern as spx_*, tp_*) | Consistent with existing enrichment blocks; no new abstractions | Repeats the 6-field object in two places | **Chosen** — consistency > DRY for this case |
| Shared helper `buildStateFingerprint(...)` | DRY across Path 1 and Path 2 | Adds an abstraction not asked for; paths have different variable names for same data | **Rejected** — YAGNI |
| Named exported type `StateFingerprint` in types.ts | Better typing | Scope is SF-C; not this spec | **Deferred** to SF-C |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY | Add 3 module-level helpers before `computeSpxSnapshot` (line 779); add `state_fingerprint` assignment after `spx_regime` in Path 1 (after line 1773) and Path 2 (after line 1919) |

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` — Protected Zone. Requires explicit confirmation from Amaury before implementation.

## Database Changes

None in this spec. The `state_fingerprint jsonb` column on `trade_evaluations` was added in SF-A. The `indicators` jsonb column in `open_position_contexts` already accepts arbitrary keys via `Record<string, unknown>`.

## Helper Function Signatures

```typescript
// Placed immediately before computeSpxSnapshot (line 779)

function getAdxBucket(adx: number | null): string | null {
  if (adx === null || !Number.isFinite(adx)) return null
  if (adx < 18) return 'LOW'
  if (adx < 25) return 'MID'
  return 'HIGH'
}

function getMacdBucket(macd: number | null): string | null {
  if (macd === null || !Number.isFinite(macd)) return null
  if (macd > 0) return 'POSITIVE'
  if (macd < -2) return 'DEEP_NEGATIVE'
  return 'NEGATIVE'
}

function getZBucket(
  z: number | null,
  signalType:
    | 'MEAN_REVERSION'
    | 'TREND_PULLBACK'
    | 'TREND_ZLE05'
    | 'EMA_RECLAIM'
    | null
): string | null {
  if (z === null || !Number.isFinite(z)) return null
  if (signalType === 'MEAN_REVERSION') {
    if (z < -1.5) return 'DEEP'
    if (z < -1.2) return 'STANDARD'
    return 'SHALLOW'
  }
  if (signalType === 'TREND_PULLBACK' || signalType === 'TREND_ZLE05') {
    if (z > 1.25) return 'BREAKOUT'
    if (z >= 1.0) return 'CONTINUATION'
    if (z >= 0) return 'CHOP'
    return 'PULLBACK'
  }
  return null
}
```

Note: the inline union in `getZBucket` matches the type inferred for `signalType` at line 1461 and `best.signalType`. The exported `SignalType` from `types.ts` (line 131) uses `TREND_FOLLOWING`/`PULLBACK_EMA50` and is incompatible — do not import it.

## Open Questions

None — bucket definitions, field list, and variable names are all frozen by the spec context.
