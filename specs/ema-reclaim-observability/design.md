# Design — EMA_RECLAIM Observability Logging (Phase 2)

## Architecture Decision

All changes live in `src/lib/claude-agent.ts`, immediately after the `emaReclaimSetup` boolean is evaluated (currently line 1267) and before the `setup_detected` aggregation (currently line 1269). No new files, no new modules, no schema changes. The insertion follows the identical pattern established by `[TREND_PULLBACK_ENTRY]` (line 1192) and `[TREND_ZLE05_ENTRY]` (line 1244).

## Insertion Point (confirmed from code)

```typescript
// CURRENT (lines 1260–1269)
const emaReclaimSetup =
  hasPrevData &&
  indicators.currentPrice > indicators.ema50! &&
  indicators.prevClose! <= indicators.ema50Prev! &&
  zScore < 0 &&
  ((indicators.currentPrice - indicators.ema50!) /
    indicators.ema50!) > 0.002 &&
  momentumOk

// ← INSERT OBSERVABILITY BLOCK HERE

const setup_detected = isAutoEntry || meanReversionSetup || trendSetup || trendZLE05Setup || emaReclaimSetup
```

## Data Flow

```
emaReclaimSetup evaluated (true | false)
  → fmt() helper declared (null-safe number formatter)
  → emaReclaimEma50GtEma200 computed (uses ema50Value, ema200Value)
  → emaReclaimMacdBucket computed (uses macdHistogram)
  → emaReclaimRiskFactors computed (pipe-separated string, type-predicate filter)
  → if (emaReclaimSetup) → [EMA_RECLAIM_ENTRY] log
  → if (hasPrevData && !emaReclaimSetup) → [EMA_RECLAIM_BLOCKED] log
  → setup_detected aggregation continues unchanged
```

## Variables Used (all pre-existing in scope)

| Variable | Type | Source |
|----------|------|--------|
| `ema50Value` | `number` | `indicators.ema50 ?? 0` (line 1090) |
| `ema200Value` | `number` | `indicators.ema200 ?? 0` (line 1091) |
| `macdHistogram` | `number \| null` | `indicators.macd?.histogram ?? null` (line 1118) |
| `zScore` | `number` | `indicators.kalman?.zScore ?? 0` (line 1089) |
| `adxValue` | `number \| null` | `indicators.adx ?? null` (line 1106) |
| `indicators.marketRegime` | `string` | direct field |
| `symbol` | `string` | loop variable |
| `hasPrevData` | `boolean` | line 1255 |
| `emaReclaimSetup` | `boolean` | line 1260 |

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Insert observability block after emaReclaimSetup, before setup_detected | Minimal footprint, uses in-scope variables, no new abstractions | Requires Protected Zone edit | Chosen |
| Extract to a separate `logEmaReclaimObservability()` helper function | Keeps the agent loop cleaner | Over-engineering for 3 variables + 2 console.log calls; inconsistent with existing TREND_PULLBACK_ENTRY pattern | Rejected |
| Persist to Supabase agent_log | Queryable, structured data | Out of scope for Phase 2; current goal is just to surface data in GH Actions logs | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY | Insert observability block (fmt helper + 3 variables + 2 conditional console.log calls) between `emaReclaimSetup` declaration and `setup_detected` aggregation |

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` — **requires Amaury confirmation before implementation.**

The change is additive-only: no existing lines are modified, only new lines inserted. `emaReclaimSetup`, `hasPrevData`, and all other setup conditions are untouched.

## Database Changes

None.

## Open Questions

None — all variables are confirmed in-scope, the insertion point is confirmed, and the exact code is fully specified in the feature request.
