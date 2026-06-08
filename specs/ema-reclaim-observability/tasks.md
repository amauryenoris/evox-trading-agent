# Tasks — EMA_RECLAIM Observability Logging (Phase 2)

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] Protected Zone change confirmed (`src/lib/claude-agent.ts`)

## Implementation Checklist

### Phase 1 — Observability block insertion (`claude-agent.ts` after line ~1267)

- [x] T-01: Declare `fmt` helper inline: `const fmt = (v?: number | null): string => typeof v === 'number' ? v.toFixed(2) : 'NA'`
- [x] T-02: Declare `emaReclaimEma50GtEma200` using existing `ema50Value` and `ema200Value`
- [x] T-03: Declare `emaReclaimMacdBucket` ternary chain using existing `macdHistogram` (4 buckets: `NO_DATA`, `POSITIVE`, `MODERATE_NEG`, `DEEP_NEG`)
- [x] T-04: Declare `emaReclaimRiskFactors` array with type predicate filter `(v): v is string => Boolean(v)` and `.join('|') || 'NONE'`
- [x] T-05: Add `if (emaReclaimSetup)` log block emitting `[EMA_RECLAIM_ENTRY]` with all 8 fields
- [x] T-06: Add `if (hasPrevData && !emaReclaimSetup)` log block emitting `[EMA_RECLAIM_BLOCKED]` with all 8 fields

### Phase 2 — Verification

- [x] T-07: Run `npm run build` — confirm zero TypeScript errors
- [x] T-08: Verify `fmt()` declared once, not duplicated
- [x] T-09: Verify `emaReclaimSetup` and `hasPrevData` conditions are unchanged (no lines modified, only inserted)
- [x] T-10: Verify `[EMA_RECLAIM_ENTRY]` log includes: symbol, z, macd, macdBucket, adx, ema50GtEma200, regime, riskFactors
- [x] T-11: Verify `[EMA_RECLAIM_BLOCKED]` log includes the same 8 fields
- [x] T-12: Verify no variable redeclarations (fmt, ema50Value, ema200Value, macdHistogram, zScore, adxValue all pre-existing)

### Phase 3 — Testing

- [x] T-13: Write unit test: `[EMA_RECLAIM_ENTRY]` emits correct fields when `emaReclaimSetup === true`
- [x] T-14: Write unit test: `[EMA_RECLAIM_BLOCKED]` emits when `hasPrevData === true` and `emaReclaimSetup === false`
- [x] T-15: Write unit test: `emaReclaimMacdBucket` returns `NO_DATA` when `macdHistogram === null`
- [x] T-16: Write unit test: `emaReclaimMacdBucket` returns correct bucket for each of the 3 non-null cases
- [x] T-17: Write unit test: `emaReclaimRiskFactors` returns `NONE` when no risk dimensions apply
- [x] T-18: Write unit test: `emaReclaimRiskFactors` returns pipe-separated tokens for each active dimension

## Post-Implementation

- [ ] Run `/review ema-reclaim-observability` to verify implementation matches spec
- [ ] Confirm `emaReclaimSetup`, `hasPrevData`, `enforceExitRules()`, and position sizing unchanged

## Estimated Complexity

**Low** — Additive-only insertion in one file: 4 variable declarations + 2 conditional console.log blocks. No existing lines modified. All variables are already in scope.
