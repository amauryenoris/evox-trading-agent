# Tasks — TREND_ZLE05 Population Bucket Enrichment

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] OQ-01 resolved (dedicated `zle05_population_bucket`/`zle05_zscore` fields confirmed wanted, vs. relying on existing `state_fingerprint.z_bucket`)
- [X] Protected Zone change confirmed: `src/lib/claude-agent.ts`
- [X] Database migrations: **None required**

## Implementation Checklist

### Phase 1 — Path 1 enrichment (single BUY, ~line 1840)

- [x] T-01: In `src/lib/claude-agent.ts`, locate the existing block:
  ```ts
  if (signalType === 'TREND_PULLBACK') {
    const tpZ = typeof zScore === 'number' ? zScore : null
    indicatorsAtBuy.tp_population_bucket =
      tpZ !== null ? getTrendPullbackPopulationBucket(tpZ) : null
    indicatorsAtBuy.tp_zscore = tpZ
  }
  ```
  Add immediately after it (same `indicatorsAtBuy` object, no new spread/cast):
  ```ts
  if (signalType === 'TREND_ZLE05') {
    const zle05Z = typeof zScore === 'number' ? zScore : null
    indicatorsAtBuy.zle05_population_bucket =
      zle05Z !== null ? getZBucket(zle05Z, 'TREND_ZLE05') : null
    indicatorsAtBuy.zle05_zscore = zle05Z
  }
  ```

### Phase 2 — Path 2 enrichment (ranking BUY, ~line 2004)

- [x] T-02: Locate the existing block:
  ```ts
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
  Add immediately after it (same `bestIndicatorsAtBuy` object):
  ```ts
  if (best.signalType === 'TREND_ZLE05') {
    const rawBestZle05Z = typeof best.zScore === 'number'
      ? best.zScore
      : typeof best.indicators.kalman?.zScore === 'number'
        ? best.indicators.kalman.zScore
        : null
    bestIndicatorsAtBuy.zle05_population_bucket =
      rawBestZle05Z !== null ? getZBucket(rawBestZle05Z, 'TREND_ZLE05') : null
    bestIndicatorsAtBuy.zle05_zscore = rawBestZle05Z
  }
  ```

### Phase 3 — Verification

- [x] T-03: Run `npx tsc --noEmit` — must pass with zero errors.
- [x] T-04: Run `npm run build` — must pass successfully.
- [x] T-05: Trace `getZBucket(z, 'TREND_ZLE05')` through the new blocks for boundary values:
  - z=1.30 → `'BREAKOUT'` (structurally unreachable today — `trendZLE05Setup` caps at z<=1.25 — confirms no regression if the gate's upper bound widens later)
  - z=1.25 → `'CONTINUATION'` (upper gate boundary)
  - z=1.0 → `'CONTINUATION'`
  - z=0.5 → `'CHOP'`
  - z=0.01 → `'CHOP'` (lower gate boundary, exclusive)

  All confirmed by direct trace of the function's existing (unmodified) branches — matches expected values exactly.
- [x] T-06: Verify `git diff --name-only` shows only `src/lib/claude-agent.ts` changed. Confirmed.
- [x] T-07: Verify the existing TREND_PULLBACK blocks (`tp_population_bucket`/`tp_zscore`) and `getZBucket()` itself are byte-for-byte unchanged. Confirmed via `git diff` — both new blocks are pure additions immediately after the existing TREND_PULLBACK blocks; nothing else in the diff.
- [x] T-08: Verify MEAN_REVERSION/EMA_RECLAIM paths: confirm neither new `if` block is entered — `indicatorsAtBuy`/`bestIndicatorsAtBuy` pass through with no `zle05_*` keys added. Confirmed — both new blocks are strictly gated on `signalType === 'TREND_ZLE05'` / `best.signalType === 'TREND_ZLE05'`.

### Phase 4 — Testing

- [x] T-09: No new test file required — both new blocks are pure data-enrichment with no branching that affects trading behavior, identical in risk profile to the TREND_PULLBACK precedent (which also added no new test file). Existing TREND_ZLE05 setup-detection tests (`trend-zle05-setup.test.ts`) and TREND_PULLBACK tests (`trend-pullback-macd-floor.test.ts`) re-run — 48/48 passing, confirming no regression.

## Post-Implementation

- [ ] Run `/review trend-zle05-population-bucket` to verify implementation matches spec
- [ ] After the first live TREND_ZLE05 trade post-implementation, run the Supabase verification query from `design.md` and confirm `zle05_population_bucket`/`zle05_zscore` are non-null and match `state_fingerprint.z_bucket`

## Estimated Complexity

**Low** — 2 small, symmetric `if` blocks added to a single file, reusing an already-existing, already-correct function (`getZBucket`). No new helper, no type changes, no migration. Slightly lower risk than the TREND_PULLBACK precedent, which had to introduce a brand-new helper function from scratch.
