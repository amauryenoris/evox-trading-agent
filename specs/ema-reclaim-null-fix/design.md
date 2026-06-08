# Design — EMA_RECLAIM Null EMA50 Fix + System Prompt Correction

## Architecture Decision

Both changes live entirely in `src/lib/claude-agent.ts`. The null-guard fix touches the `hasPrevData` guard and the `emaReclaimSetup` boolean expression in the signal-detection block (~line 1253). The prompt fix touches the `EMA_RECLAIM` conditional string inside `buildEnrichedPrompt()` (~line 572). No new files, no new functions, no schema changes.

## Current State (confirmed from code read)

```typescript
// Lines 1253–1264 — current (buggy)
const hasPrevData =
  indicators.prevClose != null &&
  indicators.ema50Prev != null            // ema50 itself NOT checked

const emaReclaimSetup =
  hasPrevData &&
  indicators.currentPrice > (indicators.ema50 ?? 0) &&  // null → 0, always true
  indicators.prevClose! <= indicators.ema50Prev! &&
  zScore < 0 &&
  ((indicators.currentPrice - (indicators.ema50 ?? 0)) /
    (indicators.ema50 ?? 1)) > 0.002 &&                 // ?? 0 and ?? 1 both wrong
  momentumOk
```

```typescript
// Lines 572–574 — current (vague, causes misinterpretation)
EMA_RECLAIM: Price just crossed above EMA50 from below.
Edge: Recent cross of EMA50 with z-score below fair value.
Key indicators: cross confirmation, z-score, EMA50 slope.
```

## Data Flow — Fix 1 (null guard)

```
runAgentCycle(symbol)
  → computeIndicators() → { ema50: null | number, ema50Prev: null | number, ... }
  → hasPrevData = prevClose != null && ema50Prev != null && ema50 != null  ← NEW
  → emaReclaimSetup = hasPrevData && currentPrice > ema50! && ...          ← ema50! safe
  → if ema50 was null → hasPrevData = false → emaReclaimSetup = false → trade blocked ✅
```

## Data Flow — Fix 2 (system prompt)

```
buildEnrichedPrompt(signalType = 'EMA_RECLAIM', ...)
  → conditional string for EMA_RECLAIM
  → injected into Claude system prompt
  → Claude interprets setup as trend resumption, not mean-reversion ✅
```

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Add `ema50 != null` to `hasPrevData` + use `ema50!` | Minimal change, TypeScript guarantee, null path fully blocked | Requires Protected Zone edit | Chosen |
| Add runtime `if (!indicators.ema50) return` before emaReclaimSetup | Also blocks the trade | More verbose, duplicates null check already expressed in hasPrevData pattern | Rejected |
| Change `?? 0` to `?? -Infinity` | Would also block the trade | Obscures intent; hasPrevData is the right semantic home for the guard | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY | Extend `hasPrevData` (line ~1253) to include `indicators.ema50 != null`; replace `(indicators.ema50 ?? 0)` and `(indicators.ema50 ?? 1)` with `indicators.ema50!` in `emaReclaimSetup` (~lines 1259–1263) |
| `src/lib/claude-agent.ts` | MODIFY | Replace 3-line EMA_RECLAIM description in `buildEnrichedPrompt()` (~lines 572–574) with the expanded trend-reclaim description |

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` — **requires Amaury confirmation before implementation.**

Both changes are surgical (hasPrevData guard + 3-line string replacement). No signal conditions for any other setup type are touched. No exit rules touched.

## Database Changes

None.

## Open Questions

None — the fixes are fully specified by the bug report and the confirmed current code.
