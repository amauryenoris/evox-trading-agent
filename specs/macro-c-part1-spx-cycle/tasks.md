# Tasks — Macro-C Part 1: SPX Snapshot at Cycle Start

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] ⚠️ Protected Zone confirmed: Amaury explicitly approves touching `src/lib/claude-agent.ts`

## Implementation Checklist

### Phase 1 — Helper function (`src/lib/claude-agent.ts`)

- [x] T-01: Add `computeSpxSnapshot()` function immediately before `export async function runAgentCycle()` (line ~779) — exact body from design.md CHANGE 1

### Phase 2 — Cycle start fetch (`src/lib/claude-agent.ts`)

- [x] T-02: Expand the `Promise.all` destructuring to add `spyBars` as the 4th element, with `.catch((err: unknown) => { console.error('[MACRO_SPX] SPY fetch failed:', err); return [] })`
- [x] T-03: Add `const spxSnapshot = computeSpxSnapshot(spyBars)` immediately after the `Promise.all`
- [x] T-04: Add the `[MACRO_SPX]` log block (branching on `spxSnapshot.spx_price !== null`) immediately after `spxSnapshot`

### Phase 3 — Enrich Path 1 (`src/lib/claude-agent.ts`)

- [x] T-05: Add the 4-line SPX enrichment block to `indicatorsAtBuy` immediately after the `{ ...indicators }` spread and before the `if (signalType === 'TREND_PULLBACK')` block (around L1712)

### Phase 4 — Enrich Path 2 (`src/lib/claude-agent.ts`)

- [x] T-06: Add the 4-line SPX enrichment block to `bestIndicatorsAtBuy` immediately after the `{ ...best.indicators }` spread and before the `if (best.signalType === 'TREND_PULLBACK')` block (around L1853)

### Phase 5 — Verification

- [x] T-07: `npx tsc --noEmit` passes with zero errors
- [x] T-08: `npm run build` passes
- [x] T-09: Confirm `tp_population_bucket` and `tp_zscore` enrichment blocks are byte-identical to pre-change
- [x] T-10: Confirm no file other than `src/lib/claude-agent.ts` was modified

## Post-Implementation

- [ ] Run `/review macro-c-part1-spx-cycle` to verify implementation matches spec
- [ ] ⚠️ Confirm Protected Zone change was explicitly approved by Amaury

## Verification Queries (post-BUY)

After the next BUY cycle, run in Supabase:
```sql
SELECT
  symbol,
  indicators->>'spx_price'  AS spx_price,
  indicators->>'spx_sma50'  AS spx_sma50,
  indicators->>'spx_sma200' AS spx_sma200,
  indicators->>'spx_regime' AS spx_regime
FROM open_position_contexts
WHERE symbol = '<bought_symbol>';
```
Expected: all 4 fields present for ALL signal types ✅

## Estimated Complexity

**Low** — 4 targeted insertions into an existing file. No new imports, no schema changes, no new files. Main risk: wrong insertion point for the SPX enrichment lines relative to the `TREND_PULLBACK` block.
