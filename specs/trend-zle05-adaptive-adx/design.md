# Design — TREND_ZLE05 Adaptive ADX Gate (Bucket A)

## Architecture Decision

All changes are confined to a single Protected Zone file: `src/lib/claude-agent.ts`,
within the setup-detection block inside `runAgentCycle()` (approximately lines
1039–1111). The modification introduces a two-tier ADX gate for `adxOkZLE05` and
updates two existing `console.log` lines. No new functions, no new files, no schema
changes, and no new dependencies are introduced.

---

## Exact Code Changes

### Change 1 — `adxOkZLE05` (replace lines ~1043–1044)

```typescript
// BEFORE
// ZLE05-specific gate — tighter: null rejected, floor raised to 25
const adxOkZLE05 = adxValue !== null && adxValue >= 25

// AFTER
const lowAdxMacdBoost = 0.25

const adxOkZLE05 =
  adxValue !== null &&
  (
    adxValue >= 18 ||
    (adxValue >= 15 && macdHistogram !== null && macdHistogram > lowAdxMacdBoost)
  )
```

Note: `macdHistogram` is already declared on the line above `adxOkZLE05` in the
current code (line ~1071). The order is preserved — `macdHistogram` is in scope.

### Change 2 — `[TREND_ZLE05_ENTRY]` log (replace line ~1105)

```typescript
// BEFORE
console.log(`[TREND_ZLE05_ENTRY] bucket=${zBucket} symbol=${symbol} z=${zScore.toFixed(2)} adx=${adxValue} macd=${macdHistogram?.toFixed(3)}`)

// AFTER
const adxBucket = adxValue >= 18 ? 'normal' : 'low_adx_boost'
console.log(`[TREND_ZLE05_ENTRY] bucket=${adxBucket} symbol=${symbol} z=${zScore.toFixed(2)} adx=${adxValue} macd=${macdHistogram?.toFixed(3)}`)
```

`adxBucket` is declared inside the `if (trendZLE05Setup)` block, immediately before
the log line. The existing `zBucket`, `legacySignals++`, and `expandedSignals++`
lines that feed the STATS log are retained unchanged above it.

### Change 3 — `[TREND_ZLE05_REJECTED_Z]` log (replace line ~1110)

```typescript
// BEFORE
console.log(`[TREND_ZLE05_REJECTED_Z] symbol=${symbol} z=${zScore.toFixed(2)} adx=${adxValue} macd=${macdHistogram?.toFixed(3)} regime=${indicators.marketRegime}`)

// AFTER
console.log(`[TREND_ZLE05_REJECTED_Z] symbol=${symbol} z=${zScore.toFixed(2)} adx=${adxValue} macd=${macdHistogram?.toFixed(3)} adxOkZle=${adxOkZLE05} regime=${indicators.marketRegime}`)
```

---

## Data Flow

```
Symbol loop iteration
        │
        ├─ macdHistogram = indicators.macd?.histogram ?? null      (existing, ~line 1071)
        │
        ├─ lowAdxMacdBoost = 0.25                                  (new constant)
        ├─ adxOkZLE05 = null-check && (>= 18 || [15–17 && > 0.25])(changed)
        ├─ trendQualityOkZLE05 = ema50SlopeOk && adxOkZLE05        (unchanged)
        │
        ├─ adxOk = adxValue === null || adxValue >= 20             (unchanged — TREND_PULLBACK)
        ├─ trendQualityOk = ema50SlopeOk && adxOk                  (unchanged — TREND_PULLBACK)
        │
        ├─ trendZLE05Setup: ... && trendQualityOkZLE05 && macdHistogram > 0
        │       │
        │       ├─ if true → trendZLE05Signals++, zBucket (for STATS), adxBucket (for ENTRY log)
        │       │   [TREND_ZLE05_ENTRY] bucket=adxBucket ...
        │       │
        │       └─ if false && z > 1.25 && wouldPassWithoutZ
        │           [TREND_ZLE05_REJECTED_Z] ... adxOkZle=adxOkZLE05 ...
        │
After all symbols:
        └─ [TREND_ZLE05_STATS] signals=... legacy=... expanded=... rejectedZ=...
```

---

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Keep flat threshold at ADX >= 25 | Simple, conservative | Blocks confirmed edge (FCX May 28/29, MP May 28 profiles) | Rejected |
| Lower flat threshold to ADX >= 18 | Captures normal-ADX edge | Admits noisy low-ADX entries (FCX May 26 profile: ADX 15.8, MACD 0.13) | Rejected |
| Two-tier gate: >= 18 free, 15–17 with MACD > 0.25 | Matches pass/block profile exactly; keeps FCX May 26 blocked | Slightly more complex gate | Chosen |
| Add marketRegime filter | Regime-aligned | `TRENDING` requires ADX > 30, inconsistent with the edge data | Rejected |

---

## Impact on Existing Files

| File | Change Type | Description |
|------|-------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY | Changes 1–3 as described above |

---

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` is in the Protected Zone.
Requires explicit confirmation from Amaury before implementation.

---

## Database Changes

None.

---

## Open Questions

None — the pass/block profile is fully specified by the 21-day analytics data and
Amaury's explicit spec. `macdHistogram` is already in scope at the point of the
`adxOkZLE05` declaration, so no ordering change is needed.
