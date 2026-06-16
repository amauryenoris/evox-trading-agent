# Design — Jun 17 Parte B: Inline enrichment tp_population_bucket + tp_zscore en indicators_at_buy

## Architecture Decision

The enrichment lives entirely inside `runAgentCycle()` in `src/lib/claude-agent.ts`,
at the two points where `saveOpenPositionContext()` is called after a BUY executes.
No layer boundary is crossed: `indicators_at_buy` is a `jsonb` column; the JSONB
object is assembled in `claude-agent.ts` before being passed to `saveOpenPositionContext()`,
which forwards it unchanged to `db.ts`. Adding fields to that object before the call
requires no changes downstream.

The `TechnicalIndicators` type does not include `tp_*` fields, so a local cast
`as TechnicalIndicators & Record<string, unknown>` is used to widen the spread copy
before assigning the extra fields. This avoids TS2345 while leaving the canonical type untouched.

---

## Data Flow

```
per-symbol loop (Path 1 — immediate BUY)
  zScore [in scope from setup detection]
  signalType === 'TREND_PULLBACK'?
    → spread indicators → indicatorsAtBuy (TechnicalIndicators & Record<string, unknown>)
    → getTrendPullbackPopulationBucket(zScore) → indicatorsAtBuy.tp_population_bucket
    → indicatorsAtBuy.tp_zscore = zScore
  saveOpenPositionContext({ ..., indicators: indicatorsAtBuy })
    → learning.ts → db.ts → trade_evaluations.indicators_at_buy (JSONB)

ranking phase (Path 2 — best winner BUY)
  best.zScore [direct field on buyQueue item — confirmed line 1763]
  best.signalType === 'TREND_PULLBACK'?
    → spread best.indicators → bestIndicatorsAtBuy
    → rawBestZ = best.zScore ?? best.indicators.kalman?.zScore ?? null
    → getTrendPullbackPopulationBucket(rawBestZ) → bestIndicatorsAtBuy.tp_population_bucket
    → bestIndicatorsAtBuy.tp_zscore = rawBestZ
  saveOpenPositionContext({ ..., indicators: bestIndicatorsAtBuy })
    → learning.ts → db.ts → trade_evaluations.indicators_at_buy (JSONB)
```

---

## Helper function

```ts
const getTrendPullbackPopulationBucket = (z: number): string =>
  z >= 1.0 ? 'CONTINUATION'
  : z >= 0  ? 'CHOP'
  : 'PULLBACK'
```

Placement: declared once inside `runAgentCycle()`, before the per-symbol loop.
Used by both Path 1 and Path 2 — no duplication.

Thresholds:
| z-score range | bucket |
|---------------|--------|
| z ≥ 1.0 | `CONTINUATION` — price above fair value, trend extension |
| 0 ≤ z < 1.0 | `CHOP` — at or slightly above fair value |
| z < 0 | `PULLBACK` — below fair value, canonical pullback zone |

---

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Add `tp_population_bucket` to `TechnicalIndicators` type | Fully typed, no cast needed | Pollutes canonical type with a TREND_PULLBACK-specific field; requires types.ts change | Rejected |
| Compute bucket in `saveOpenPositionContext()` | No change to claude-agent.ts call sites | Would require passing zScore + signalType separately, changing the function signature (learning.ts) | Rejected |
| Duplicate bucket logic in Path 1 and Path 2 | No helper needed | DRY violation; threshold drift risk across two call sites | Rejected |
| Cast `TechnicalIndicators & Record<string, unknown>` (this spec) | No type changes, no signature changes, single source of truth for thresholds | Requires TS cast | Chosen |
| Use `?? 0` fallback for missing zScore | Simple | Silently produces wrong bucket for a missing z — CONTINUATION or CHOP instead of null | Rejected — null is the correct signal |

---

## Affected Code Locations

All line numbers reference `claude-agent.ts` as of the post-Parte-A state (commit d4c30b4).

| Location | Action |
|----------|--------|
| ~line 985 (after cycle-scoped constants, before per-symbol loop) | Add `getTrendPullbackPopulationBucket` helper |
| ~lines 1702–1714 (Path 1 `saveOpenPositionContext` call) | Wrap in `indicatorsAtBuy` enrichment block |
| ~lines 1833–1844 (Path 2 `saveOpenPositionContext` call) | Wrap in `bestIndicatorsAtBuy` enrichment block |

---

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY | Add helper + enrich indicators before both saveOpenPositionContext() calls |

---

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` is in the Protected Zone.
**Requires Amaury confirmation before implementation.**

---

## Database Changes

None. `indicators_at_buy` is already `jsonb` in `trade_evaluations`. JSONB is schemaless —
no migration is needed. The two new keys (`tp_population_bucket`, `tp_zscore`) will be
present in new TREND_PULLBACK rows and absent in all prior rows.

Post-trade verification query (run manually after first live TREND_PULLBACK):
```sql
SELECT
  signal_type,
  indicators_at_buy->>'tp_population_bucket' AS bucket,
  (indicators_at_buy->>'tp_zscore')::float   AS zscore,
  (indicators_at_buy->>'adx')::float          AS adx,
  indicators_at_buy->'kalman'->>'zScore'       AS kalman_z,
  indicators_at_buy->>'marketRegime'           AS regime
FROM trade_evaluations
WHERE signal_type = 'TREND_PULLBACK'
ORDER BY buy_timestamp DESC
LIMIT 1;
```

Expected: `bucket` and `zscore` non-null; `adx`, `kalman_z`, `regime` still present (spread intact).

---

## Open Questions

None — all design decisions are explicit.
