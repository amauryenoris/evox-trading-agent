# Design — Macro-C Part 1: SPX Snapshot at Cycle Start

## Architecture Decision

All changes are confined to `src/lib/claude-agent.ts`. The SPX snapshot is computed once per cycle and stored as a closure variable (`spxSnapshot`) that flows into both BUY execution paths. No new imports are needed — `getBars` is already imported. The enrichment pattern mirrors `tp_population_bucket` (Parte B): inline assignment to the `indicatorsAtBuy` / `bestIndicatorsAtBuy` objects immediately before `saveOpenPositionContext()`.

## STEP 0 — Current Code State (verified 2026-06-17)

### Promise.all block (L788–792)

```ts
// L787
const [account, positions, clock] = await Promise.all([
  getAccount(),
  getPositions(),
  getClock(),
])
```

### Path 1 — indicatorsAtBuy + saveOpenPositionContext (L1709–1730)

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

### Path 2 — bestIndicatorsAtBuy + saveOpenPositionContext (L1850–1875)

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
  ...
})
```

## Data Flow

```
runAgentCycle() start
        │
        ▼
Promise.all([getAccount(), getPositions(), getClock(), getBars('SPY','1Day',260).catch(→[])])
        │
        ▼
computeSpxSnapshot(spyBars)
  → refIndex = bars.length - 2   (previous confirmed close)
  → spx_price = bars[refIndex].c
  → spx_sma50  = smaAt(bars, refIndex, 50)
  → spx_sma200 = smaAt(bars, refIndex, 200)
  → spx_regime = BULL | CAUTION | BEAR
  → null on insufficient data
        │
        ▼
[MACRO_SPX] log → price=N sma50=N sma200=N regime=X  (or "unavailable")
        │
        ▼
  ... cycle runs ...
        │
  BUY path (Path 1 or Path 2)
        │
        ▼
indicatorsAtBuy.spx_price  = spxSnapshot.spx_price
indicatorsAtBuy.spx_sma50  = spxSnapshot.spx_sma50
indicatorsAtBuy.spx_sma200 = spxSnapshot.spx_sma200
indicatorsAtBuy.spx_regime = spxSnapshot.spx_regime
        │
        ▼
saveOpenPositionContext({ indicators: indicatorsAtBuy })
  → open_position_contexts.indicators JSON blob now includes 4 SPX fields
```

## Change Details

### CHANGE 1 — Add `computeSpxSnapshot()` helper before `runAgentCycle()`

Add immediately before `export async function runAgentCycle()` (L779):

```ts
function computeSpxSnapshot(bars: { t: string; c: number }[]): {
  spx_price: number | null
  spx_sma50: number | null
  spx_sma200: number | null
  spx_regime: string | null
} {
  if (bars.length < 2) {
    return { spx_price: null, spx_sma50: null, spx_sma200: null, spx_regime: null }
  }

  // bars.length - 2 = previous confirmed close (no lookahead bias)
  // bars.length - 1 = current day partial bar (excluded)
  const refIndex = bars.length - 2
  const spx_price = bars[refIndex].c

  function smaAt(
    arr: { c: number }[],
    idx: number,
    period: number
  ): number | null {
    if (idx < period - 1) return null
    const slice = arr.slice(idx - period + 1, idx + 1)
    return slice.reduce((a, b) => a + b.c, 0) / period
  }

  const spx_sma50  = smaAt(bars, refIndex, 50)
  const spx_sma200 = smaAt(bars, refIndex, 200)

  if (spx_sma50 === null || spx_sma200 === null) {
    return { spx_price, spx_sma50: null, spx_sma200: null, spx_regime: null }
  }

  const spx_regime =
    spx_price > spx_sma200 ? 'BULL'
    : spx_price > spx_sma50 ? 'CAUTION'
    : 'BEAR'

  return { spx_price, spx_sma50, spx_sma200, spx_regime }
}
```

### CHANGE 2 — Expand Promise.all + log at cycle start (L788–792)

Replace:
```ts
const [account, positions, clock] = await Promise.all([
  getAccount(),
  getPositions(),
  getClock(),
])
```

With:
```ts
const [account, positions, clock, spyBars] = await Promise.all([
  getAccount(),
  getPositions(),
  getClock(),
  getBars('SPY', '1Day', 260).catch((err: unknown) => {
    console.error('[MACRO_SPX] SPY fetch failed:', err)
    return []
  }),
])

const spxSnapshot = computeSpxSnapshot(spyBars)

if (spxSnapshot.spx_price !== null) {
  console.log(
    `[MACRO_SPX] price=${spxSnapshot.spx_price}` +
    ` sma50=${spxSnapshot.spx_sma50?.toFixed(2) ?? 'null'}` +
    ` sma200=${spxSnapshot.spx_sma200?.toFixed(2) ?? 'null'}` +
    ` regime=${spxSnapshot.spx_regime ?? 'null'}`
  )
} else {
  console.log('[MACRO_SPX] unavailable')
}
```

### CHANGE 3 — Enrich indicatorsAtBuy (Path 1, after L1711, before L1713)

After the spread `{ ...indicators }`, before the `TREND_PULLBACK` block:
```ts
indicatorsAtBuy.spx_price  = spxSnapshot.spx_price
indicatorsAtBuy.spx_sma50  = spxSnapshot.spx_sma50
indicatorsAtBuy.spx_sma200 = spxSnapshot.spx_sma200
indicatorsAtBuy.spx_regime = spxSnapshot.spx_regime
```

### CHANGE 4 — Enrich bestIndicatorsAtBuy (Path 2, after L1852, before L1854)

After the spread `{ ...best.indicators }`, before the `TREND_PULLBACK` block:
```ts
bestIndicatorsAtBuy.spx_price  = spxSnapshot.spx_price
bestIndicatorsAtBuy.spx_sma50  = spxSnapshot.spx_sma50
bestIndicatorsAtBuy.spx_sma200 = spxSnapshot.spx_sma200
bestIndicatorsAtBuy.spx_regime = spxSnapshot.spx_regime
```

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Fetch SPY once per cycle in Promise.all | No added latency; parallel with existing calls | Slightly more destructuring | **Chosen** |
| Fetch SPY per symbol inside the loop | Simpler scoping | N HTTP calls; rate-limit risk; wasteful | Rejected |
| Add SPX fields to TechnicalIndicators type | Type-safe | Requires types.ts change (C-2 scope) | Deferred to Part 3 |
| Export `computeSpxSnapshot` for reuse | Testable in isolation | No current test infrastructure for it | Rejected — keep inline |

## Impact on Existing Files

| File | Change Type | Description |
|------|-------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY | Add `computeSpxSnapshot()` helper + expand Promise.all + enrich indicatorsAtBuy in Path 1 and Path 2 |

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` — **requires explicit confirmation from Amaury before implementation.**

## Database Changes

None. SPX fields flow into `open_position_contexts.indicators` (existing JSON column) without any schema change.

## Open Questions

None.
