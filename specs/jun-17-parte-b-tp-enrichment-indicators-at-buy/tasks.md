# Tasks — Jun 17 Parte B: Inline enrichment tp_population_bucket + tp_zscore en indicators_at_buy

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] Amaury has confirmed Protected Zone changes for `src/lib/claude-agent.ts`

---

## Implementation Checklist

### Phase 1 — Add helper function

- [x] T-01: In `src/lib/claude-agent.ts`, find the block of cycle-scoped constants/helpers
        declared inside `runAgentCycle()` before the per-symbol loop (around line 985).
        Add the following function immediately after that block:

        ```ts
        const getTrendPullbackPopulationBucket = (z: number): string =>
          z >= 1.0 ? 'CONTINUATION'
          : z >= 0  ? 'CHOP'
          : 'PULLBACK'
        ```

### Phase 2 — Path 1 enrichment (single BUY, ~line 1702)

- [x] T-02: Find the exact block:
        ```ts
        await saveOpenPositionContext({
          symbol,
          buyTimestamp: timestamp,
          buyPrice: indicators.currentPrice,
          quantity: qty,
          indicators,
          claudeReasoning: decision.reasoning,
          patternIdsUsed: [],
          stopOrderId,
          signalType,
        })
        ```
        Replace with:
        ```ts
        const indicatorsAtBuy = {
          ...indicators,
        } as TechnicalIndicators & Record<string, unknown>

        if (signalType === 'TREND_PULLBACK') {
          const tpZ = typeof zScore === 'number' ? zScore : null
          indicatorsAtBuy.tp_population_bucket =
            tpZ !== null ? getTrendPullbackPopulationBucket(tpZ) : null
          indicatorsAtBuy.tp_zscore = tpZ
        }

        await saveOpenPositionContext({
          symbol,
          buyTimestamp: timestamp,
          buyPrice: indicators.currentPrice,
          quantity: qty,
          indicators: indicatorsAtBuy,
          claudeReasoning: decision.reasoning,
          patternIdsUsed: [],
          stopOrderId,
          signalType,
        })
        ```

### Phase 3 — Path 2 enrichment (ranking BUY, ~line 1833)

- [x] T-03: Find the exact block:
        ```ts
        await saveOpenPositionContext({
          symbol: best.symbol,
          buyTimestamp: timestamp,
          buyPrice: best.indicators.currentPrice,
          quantity: best.qty,
          indicators: best.indicators,
          claudeReasoning: best.decision.reasoning,
          patternIdsUsed: [],
          stopOrderId,
          signalType: best.signalType as 'MEAN_REVERSION' | 'TREND_PULLBACK' | 'TREND_ZLE05' | 'EMA_RECLAIM' | null,
        })
        ```
        Replace with:
        ```ts
        const bestIndicatorsAtBuy = {
          ...best.indicators,
        } as TechnicalIndicators & Record<string, unknown>

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

        await saveOpenPositionContext({
          symbol: best.symbol,
          buyTimestamp: timestamp,
          buyPrice: best.indicators.currentPrice,
          quantity: best.qty,
          indicators: bestIndicatorsAtBuy,
          claudeReasoning: best.decision.reasoning,
          patternIdsUsed: [],
          stopOrderId,
          signalType: best.signalType as 'MEAN_REVERSION' | 'TREND_PULLBACK' | 'TREND_ZLE05' | 'EMA_RECLAIM' | null,
        })
        ```

### Phase 4 — Verification

- [x] T-04: Run `npx tsc --noEmit` — must pass with zero errors.

- [x] T-05: Run `npm run build` — must pass successfully.

- [x] T-06: Verify bucket logic by tracing through `getTrendPullbackPopulationBucket`:
        - z=1.5 → `'CONTINUATION'` ✅
        - z=1.0 → `'CONTINUATION'` ✅  (boundary: ≥ 1.0)
        - z=0.5 → `'CHOP'` ✅
        - z=0.0 → `'CHOP'` ✅  (boundary: ≥ 0)
        - z=-0.3 → `'PULLBACK'` ✅

- [x] T-07: Verify that `git diff --name-only` shows only `src/lib/claude-agent.ts`
        changed (no other files touched).

- [x] T-08: Verify MEAN_REVERSION path: confirm the `if (signalType === 'TREND_PULLBACK')`
        block is NOT entered — `indicators` pass through as-is to `saveOpenPositionContext`
        via `indicatorsAtBuy` spread with no extra fields added.

---

## Post-Implementation

- [x] Run `/review jun-17-parte-b-tp-enrichment-indicators-at-buy` to verify implementation matches spec
- [ ] After first live TREND_PULLBACK trade, run the Supabase verification query from `design.md`
      and confirm `tp_population_bucket` and `tp_zscore` are non-null and all other fields intact

---

## Estimated Complexity

**Low** — 3 targeted edits to a single file. No logic changes, no type changes, no cross-file impact.
TypeScript cast pattern is well-understood. The main risk is inserting the helper in the wrong
scope — it must be inside `runAgentCycle()`, not at module level.
