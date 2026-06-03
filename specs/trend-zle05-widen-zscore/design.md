# Design — TREND_ZLE05 Widen Z-Score Window

## Architecture Decision

All changes live in a single Protected Zone file: `src/lib/claude-agent.ts`.
The modification is confined to the setup-detection block inside `runAgentCycle()`
(approximately lines 1034–1165). No new functions, no new files, no schema changes.
The temp logging uses existing `console.log` — no new dependencies.

---

## Exact Code Changes

### Change 1 — `adxOk` (line ~1034)

```typescript
// BEFORE
const adxOk = adxValue === null || adxValue >= 20

// AFTER
const adxOk = adxValue !== null && adxValue >= 25
```

### Change 2 — `trendZLE05Setup` z-score upper bound (line ~1068)

```typescript
// BEFORE
zScore <= 0.5 &&

// AFTER
zScore <= 1.25 &&
```

### Change 3 — `isZLE05Candidate` upper bound (line ~1043)

```typescript
// BEFORE
const isZLE05Candidate = isTrendStructure && zScore > 0 && zScore <= 0.5 && momentumOk

// AFTER
const isZLE05Candidate = isTrendStructure && zScore > 0 && zScore <= 1.25 && momentumOk
```

This keeps the quality-filter rejection gate (line ~1150) consistent with the
widened detection range.

### Change 4 — ⚠️ CRITICAL: `trendSetupRejected` upper bound (line ~1096)

```typescript
// BEFORE
const trendSetupRejected = isTrendStructure && ema50Value > 0 && ema200Value > 0 && zScore > 0.5

// AFTER
const trendSetupRejected = isTrendStructure && ema50Value > 0 && ema200Value > 0 && zScore > 1.25
```

**Why this is critical**: `trendSetupRejected` triggers a `continue` that short-
circuits the entire symbol before `trendZLE05Setup` can fire. Without this change,
every signal in the 0.5–1.25 range would be rejected by the old gate before the
widened detection can accept it. The corresponding log message on line ~1112 must
also be updated from "> 0.5" to "> 1.25".

### Change 5 — Temp logging counters (before the symbol loop)

Declare four counters once, before the `for (const symbol of watchlist)` loop:

```typescript
let trendZLE05Signals = 0
let legacySignals = 0
let expandedSignals = 0
let trendZLE05Rejected = 0
```

### Change 6 — ADX null guard (inside symbol loop, after `macdHistogram` is set)

```typescript
if (adxValue === null && zScore > 0 && zScore <= 1.25 && macdHistogram !== null && macdHistogram > 0) {
  console.log(`[TREND_ZLE05] ${symbol} blocked — ADX null`)
}
```

### Change 7 — `wouldPassWithoutZ` (inside symbol loop, after `trendZLE05Setup`)

Copied from the actual `trendZLE05Setup` expression with only the `zScore <= 1.25`
upper-bound condition removed. Lower bound (`zScore > 0`) is kept.

```typescript
const wouldPassWithoutZ =
  ema50Value > 0 &&
  ema200Value > 0 &&
  indicators.currentPrice > ema50Value &&
  ema50Value > ema200Value &&
  zScore > 0 &&
  momentumOk &&
  trendQualityOk &&
  macdHistogram !== null &&
  macdHistogram > 0
```

### Change 8 — Entry log + counters (inside symbol loop, after `trendZLE05Setup` is evaluated)

```typescript
if (trendZLE05Setup) {
  trendZLE05Signals++
  const zBucket = zScore <= 0.5 ? 'legacy' : 'expanded'
  if (zBucket === 'legacy') legacySignals++
  else expandedSignals++
  console.log(`[TREND_ZLE05_ENTRY] bucket=${zBucket} symbol=${symbol} z=${zScore.toFixed(2)} adx=${adxValue} macd=${macdHistogram?.toFixed(3)}`)
}
```

### Change 9 — Rejection log for next frontier (inside symbol loop)

```typescript
if (!trendZLE05Setup && zScore > 1.25 && zScore <= 2.5 && wouldPassWithoutZ) {
  trendZLE05Rejected++
  console.log(`[TREND_ZLE05_REJECTED_Z] symbol=${symbol} z=${zScore.toFixed(2)} adx=${adxValue} macd=${macdHistogram?.toFixed(3)} regime=${indicators.marketRegime}`)
}
```

### Change 10 — Cycle stats log (once per cycle, after the symbol loop)

```typescript
console.log(`[TREND_ZLE05_STATS] signals=${trendZLE05Signals} legacy=${legacySignals} expanded=${expandedSignals} rejectedZ=${trendZLE05Rejected}`)
```

---

## Data Flow

```
Symbol loop iteration
        │
        ├─ adxOk = adxValue !== null && adxValue >= 25   (changed)
        ├─ trendQualityOk = ema50SlopeOk && adxOk        (unchanged, tighter via adxOk)
        ├─ isZLE05Candidate: z > 0 && z <= 1.25          (updated upper bound)
        │
        ├─ trendZLE05Setup: z > 0 && z <= 1.25 && ...    (widened)
        │
        ├─ trendSetupRejected: z > 1.25                   (updated — was > 0.5)
        │       └─ continue if true (short-circuits)
        │
        ├─ [TREND_ZLE05_ENTRY] log if trendZLE05Setup
        ├─ [TREND_ZLE05_REJECTED_Z] log if z in 1.25–2.5 && wouldPassWithoutZ
        │
After all symbols:
        └─ [TREND_ZLE05_STATS] cycle summary
```

---

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Add `marketRegime === 'TRENDING'` filter | Aligns with regime model | `TRENDING` requires ADX > 30, narrower than ADX >= 25; inconsistent with evidence | Rejected |
| Widen to z <= 2.0 immediately | Captures more alpha | No production data in 1.25–2.0 range yet | Rejected — expand incrementally |
| Keep null pass-through in `adxOk` | Safer | Losers clustered at ADX 20–24; null-pass adds noise | Rejected — data shows null hasn't occurred in 7 days |

---

## Impact on Existing Files

| File | Change Type | Description |
|------|-------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY | Changes 1–10 as described above |

---

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` is in the Protected Zone.
Requires explicit confirmation from Amaury before implementation.

---

## Database Changes

None.

---

## Open Questions

None — all ambiguities resolved by the diagnosis session and Amaury's explicit
spec. The `trendSetupRejected` fix (Change 4) is a required co-change not in the
original brief; it is included because without it the expansion produces zero new
signals.
