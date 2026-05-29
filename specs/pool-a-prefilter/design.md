# Design — Pool A Pre-Filter

## Architecture Decision

This is a pure in-function transformation inside `selectStocksForAnalysis()` in `src/lib/stock-selector.ts`. No new files, no new DB tables, no new API calls. The pre-filter is a pipeline of array operations applied to the `candidates` array after `getMarketMovers()` returns and before the Claude prompt is built.

The only new external dependency is importing `INSTRUMENT_BLACKLIST` from `./config` — already available in the project, just not imported in this file yet.

---

## Data Flow (before and after)

**Before:**
```
getMarketMovers(30) → candidates (up to 30)
getSelectionEvaluations(50) → selectionEvals
                                          ↓
                         build prompt with candidates.slice(0, 30)
                                          ↓
                              Claude selects 6–8
```

**After:**
```
getMarketMovers(30) → candidates (up to 30)
getSelectionEvaluations(50) → selectionEvals
                                          ↓
               PRE-FILTER PIPELINE (in-place on candidates):
               Step 1: remove INSTRUMENT_BLACKLIST
               Step 2: remove open positions (heldSymbols already computed)
               Step 3: remove |changePercent| >= 15
               Step 4: sort — profitable history first
               Step 5: slice(0, 15)
                                          ↓
                         build prompt with filtered candidates
                                          ↓
                              Claude selects 6–8
```

---

## Step-by-Step Implementation

### Step 1 — Blacklist filter
```ts
import { INSTRUMENT_BLACKLIST } from './config'
// ...
candidates = candidates.filter(c => !INSTRUMENT_BLACKLIST.has(c.symbol))
```
`heldSymbols` already uses a Set, so this mirrors the same pattern.

### Step 2 — Open positions filter
```ts
candidates = candidates.filter(c => !heldSymbols.has(c.symbol))
```
`heldSymbols` is built at line 57 from `positions.map(p => p.symbol)` — available before the filter runs.

### Step 3 — Overbought filter
```ts
candidates = candidates.filter(c => Math.abs(c.changePercent) < 15)
```
`ScreenerStock.changePercent` is always populated by `getMarketMovers()`. Removes news-spike stocks (both up and down) that create statistical noise for the Kalman filter.

### Step 4 — History-based sort
```ts
const goodSymbols = new Set(
  selectionEvals
    .filter(e => e.outcome === 'profitable' || e.pnlPct > 0)
    .map(e => e.symbol)
)
candidates.sort((a, b) => {
  const aGood = goodSymbols.has(a.symbol) ? 1 : 0
  const bGood = goodSymbols.has(b.symbol) ? 1 : 0
  return bGood - aGood
})
```
`selectionEvals` is already fetched at this point (existing call to `getSelectionEvaluations(50)`). The sort is stable within each tier (good/not-good) — original screener order (by volume) is preserved within ties.

### Step 5 — Truncate
```ts
candidates = candidates.slice(0, 15)
```
Reduced from 30 to 15. Claude still has 15 Pool A + N Pool B symbols to choose from — enough variety.

---

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Filter inside Claude prompt (instruct Claude to ignore overbought) | No code change | Claude ignores instructions inconsistently; wastes prompt tokens | Rejected |
| Pre-compute z-scores and filter by z-score > 2 | More precise than % change | z-scores not available at selection time (indicators run after selection) | Rejected |
| Keep 30 candidates, just sort | Minimal change | Overbought stocks still consume Claude's attention in the prompt | Rejected |
| Reduce to 15 with pre-filter (chosen) | Higher signal-to-noise in prompt; deterministic; zero latency | Slightly smaller pool for Claude | **Chosen** |

---

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/stock-selector.ts` | MODIFY | Add `INSTRUMENT_BLACKLIST` import; insert 5-step pre-filter pipeline between `getMarketMovers` result and prompt build; update `screenerLines` to use `candidates.slice(0, 30)` → filtered `candidates` |

---

## Protected Zone Impact

None — `config.ts` is imported read-only (existing export, no modification). No other Protected Zone files are touched.

---

## Database Changes

None.

---

## Open Questions

None — the design is fully determined by the existing data available in `selectStocksForAnalysis()`. No new information is needed from Amaury before implementation.
