# Design — TREND_ZLE05 Population Bucket Enrichment

## Architecture Decision

The enrichment lives entirely inside `runAgentCycle()` in `src/lib/claude-agent.ts`, at the
same two `saveOpenPositionContext()` call sites already enriched for TREND_PULLBACK
(`indicatorsAtBuy` / `bestIndicatorsAtBuy`, both already cast as
`TechnicalIndicators & Record<string, unknown>`). Unlike the TREND_PULLBACK precedent —
which introduced its own 3-bucket helper (`getTrendPullbackPopulationBucket`) before
`getZBucket()` existed — this feature reuses the **existing** `getZBucket(z, signalType)`
function, which already branches on `signalType === 'TREND_PULLBACK' || signalType === 'TREND_ZLE05'`
identically. No new bucket-threshold logic is introduced.

## Data Flow

```
per-symbol loop (Path 1 — immediate BUY)
  zScore [in scope from setup detection]
  signalType === 'TREND_ZLE05'?
    → indicatorsAtBuy already exists (spread of indicators, shared with TREND_PULLBACK block)
    → zle05Z = typeof zScore === 'number' ? zScore : null
    → getZBucket(zle05Z, 'TREND_ZLE05') → indicatorsAtBuy.zle05_population_bucket
    → indicatorsAtBuy.zle05_zscore = zle05Z
  saveOpenPositionContext({ ..., indicators: indicatorsAtBuy })
    → learning.ts → db.ts → trade_evaluations.indicators_at_buy (JSONB)

ranking phase (Path 2 — best winner BUY)
  best.zScore [direct field on buyQueue item]
  best.signalType === 'TREND_ZLE05'?
    → bestIndicatorsAtBuy already exists (spread of best.indicators, shared with TREND_PULLBACK block)
    → rawBestZle05Z = best.zScore ?? best.indicators.kalman?.zScore ?? null
    → getZBucket(rawBestZle05Z, 'TREND_ZLE05') → bestIndicatorsAtBuy.zle05_population_bucket
    → bestIndicatorsAtBuy.zle05_zscore = rawBestZle05Z
  saveOpenPositionContext({ ..., indicators: bestIndicatorsAtBuy })
    → learning.ts → db.ts → trade_evaluations.indicators_at_buy (JSONB)
```

Both new `if (signalType === 'TREND_ZLE05')` / `if (best.signalType === 'TREND_ZLE05')` blocks
sit as siblings, immediately after the existing TREND_PULLBACK blocks at each call site —
same `indicatorsAtBuy`/`bestIndicatorsAtBuy` object, no new spread, no new cast.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Reuse existing `getZBucket()` | No duplicated threshold logic; already proven correct for TREND_ZLE05 today (via `state_fingerprint.z_bucket`) | Returns `'BREAKOUT'`/`'CONTINUATION'`/`'CHOP'`/`'PULLBACK'` (4 buckets) instead of the 3-bucket TREND_PULLBACK scheme | **Chosen** |
| Write a new `getZle05PopulationBucket()` mirroring `getTrendPullbackPopulationBucket` | Exact 3-bucket symmetry with TREND_PULLBACK's field name semantics | Duplicates `getZBucket()`'s already-correct TREND_ZLE05 branch a second time — the same duplication problem TREND_PULLBACK already has, just propagated further | Rejected |
| Don't add new fields — read `state_fingerprint.z_bucket` directly for analysis | Zero code change; data already exists today | Breaks symmetry with TREND_PULLBACK's flat, directly-queryable `tp_zscore`/`tp_population_bucket` pair; requires a JSON path traversal (`indicators_at_buy->'state_fingerprint'->>'z_bucket'`) instead of a flat column reference for every future analysis query | Rejected — flagged as Open Question below in case Amaury prefers this |
| Add fields to `TechnicalIndicators` type | Fully typed, no cast needed | Pollutes the canonical type with a TREND_ZLE05-specific field; same rejection reasoning as the TREND_PULLBACK precedent | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY | Add 2 new `if (signalType === 'TREND_ZLE05')` blocks (Path 1 + Path 2), each calling the existing `getZBucket()` |

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` is in the Protected Zone.
Change is additive (new JSONB keys for TREND_ZLE05 entries only) and does not touch any gate, sizing, or exit logic — but the file requires **Amaury confirmation before `/implement` runs**.

## Database Changes

None. `indicators` (open_position_contexts) / `indicators_at_buy` (trade_evaluations) are already JSONB — schemaless, no migration needed. The two new keys (`zle05_population_bucket`, `zle05_zscore`) will be present in new TREND_ZLE05 rows going forward and absent in the 5 existing historical rows (see Out of Scope — backfill deferred).

Post-trade verification query (run manually after the first live TREND_ZLE05 trade post-implementation):
```sql
SELECT
  signal_type,
  indicators_at_buy->>'zle05_population_bucket' AS bucket,
  (indicators_at_buy->>'zle05_zscore')::float    AS zscore,
  (indicators_at_buy->>'adx')::float             AS adx,
  indicators_at_buy->'kalman'->>'zScore'          AS kalman_z,
  indicators_at_buy->'state_fingerprint'->>'z_bucket' AS state_fingerprint_z_bucket
FROM trade_evaluations
WHERE signal_type = 'TREND_ZLE05'
ORDER BY buy_timestamp DESC
LIMIT 1;
```
Expected: `bucket` and `zscore` non-null, `bucket` matching `state_fingerprint_z_bucket` exactly (both derived from the same `getZBucket()` call), `adx`/`kalman_z` still present (spread intact).

## Open Questions

- **OQ-01**: Confirm whether a dedicated `zle05_population_bucket`/`zle05_zscore` pair is actually wanted, given the same bucket value is already available today at `state_fingerprint.z_bucket` (and the raw z-score at `kalman.zScore`) for every TREND_ZLE05 entry. This spec assumes "yes" — for query ergonomics and exact symmetry with the TREND_PULLBACK precedent — but it is a real duplication of already-present data, not a gap-fill of missing data (unlike the original TREND_PULLBACK case, where the bucket genuinely didn't exist before `d5a5418`).
