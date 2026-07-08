# Design — Extract State-Fingerprint Helpers to Shared Module

## Architecture Decision

This is a pure code-motion refactor confined to two files: a new leaf module
`src/lib/state-fingerprint.ts` (no imports, no dependencies — just the four
pure functions), and `src/lib/claude-agent.ts` (Protected Zone), which loses
the four inline definitions and gains one import line. No other layer
(API routes, dashboard, db.ts, scripts) is touched. This mirrors the existing
`scripts/lib/spx-snapshot-helpers.ts` precedent, where SPX-snapshot pure
functions were already extracted-by-copy for reuse by a standalone script —
this spec does the same thing for `claude-agent.ts`'s own state-fingerprint
helpers, but as an extraction-by-move (single source of truth) since these
four are not yet duplicated anywhere.

## Current State (verbatim, pre-change)

`src/lib/claude-agent.ts:781-855`:

```ts
function getAdxBucket(adx: number | null): string | null {
  if (adx === null || !Number.isFinite(adx)) return null
  if (adx < 18) return 'LOW'
  if (adx < 25) return 'MID'
  return 'HIGH'
}

function getMacdBucket(macd: number | null): string | null {
  if (macd === null || !Number.isFinite(macd)) return null
  if (macd > 0) return 'POSITIVE'
  if (macd < -2) return 'DEEP_NEGATIVE'
  return 'NEGATIVE'
}

function getZBucket(
  z: number | null,
  signalType:
    | 'MEAN_REVERSION'
    | 'TREND_PULLBACK'
    | 'TREND_ZLE05'
    | 'EMA_RECLAIM'
    | null
): string | null {
  if (z === null || !Number.isFinite(z)) return null
  if (signalType === 'MEAN_REVERSION') {
    if (z < -1.5) return 'DEEP'
    if (z < -1.2) return 'STANDARD'
    return 'SHALLOW'
  }
  if (signalType === 'TREND_PULLBACK' || signalType === 'TREND_ZLE05') {
    if (z > 1.25) return 'BREAKOUT'
    if (z >= 1.0) return 'CONTINUATION'
    if (z >= 0) return 'CHOP'
    return 'PULLBACK'
  }
  return null
}

function computeSpxSnapshot(bars: { t: string; c: number }[]): {
  spx_price: number | null
  spx_sma50: number | null
  spx_sma200: number | null
  spx_regime: string | null
} {
  if (bars.length < 2) {
    return { spx_price: null, spx_sma50: null, spx_sma200: null, spx_regime: null }
  }

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

## Target State (post-change)

`src/lib/state-fingerprint.ts` (new file — identical bodies, `export` added):

```ts
export function getAdxBucket(adx: number | null): string | null {
  // ...unchanged body
}

export function getMacdBucket(macd: number | null): string | null {
  // ...unchanged body
}

export function getZBucket(
  z: number | null,
  signalType:
    | 'MEAN_REVERSION'
    | 'TREND_PULLBACK'
    | 'TREND_ZLE05'
    | 'EMA_RECLAIM'
    | null
): string | null {
  // ...unchanged body
}

export function computeSpxSnapshot(bars: { t: string; c: number }[]): {
  spx_price: number | null
  spx_sma50: number | null
  spx_sma200: number | null
  spx_regime: string | null
} {
  // ...unchanged body (including its nested smaAt helper)
}
```

`src/lib/claude-agent.ts` — near the top, alongside existing local imports
(after the `./alpaca`, `./indicators`, etc. import block):

```ts
import { getAdxBucket, getMacdBucket, getZBucket, computeSpxSnapshot } from './state-fingerprint'
```

Lines 781-855 (the four inline definitions) are deleted. All 9 call sites
(line 946 for `computeSpxSnapshot`; 1912/2091 for `getAdxBucket`; 1914/2093
for `getMacdBucket`; 1913/1927/2092/2114 for `getZBucket`) are left
byte-for-byte identical — only the symbols' origin changes, from local
function declarations to imported bindings.

## Data Flow

No data flow changes. Before and after, `runAgentCycle()` calls these four
functions with the same arguments at the same points in the same order; the
only difference is where the function bodies are defined.

```
Before: runAgentCycle() → [inline getAdxBucket/getMacdBucket/getZBucket/computeSpxSnapshot]
After:  runAgentCycle() → import from './state-fingerprint' → [same functions, same bodies]
```

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Extract-by-move to `src/lib/state-fingerprint.ts` (this design) | Single source of truth; future Health Monitor script imports directly; no duplication | One-time Protected Zone edit | **Chosen** |
| Add `export` in place, no new file | Smaller diff | A future standalone script would still need `import { ... } from '../src/lib/claude-agent'`, dragging in the entire agent module (Anthropic SDK, Alpaca client, Supabase client) as a side effect of import | Rejected |
| Extract-by-copy (duplicate into a new module, leave `claude-agent.ts` inline copies as-is) | Zero Protected Zone edit | Violates DRY; two sources of truth that can drift, exactly the pattern the project's own `scripts/lib/spx-snapshot-helpers.ts` comment explicitly says to avoid ("not modified — see ... for the shared pure-function copy" implies a single canonical copy is preferred going forward) | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|--------------|
| `src/lib/state-fingerprint.ts` | CREATE | New module with 4 exported pure functions, moved verbatim from `claude-agent.ts` |
| `src/lib/claude-agent.ts` | MODIFY | Remove lines 781-855 (4 inline definitions); add 1 import line; 9 call sites unchanged |

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` is in the Protected Zone. Authorization is
explicitly granted by Amaury as the requester of this spec (see prompt
context: "Protected Zone — authorized by Amaury"). No other Protected Zone
file (`config.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`,
`watchlist-monitor.ts`, `learning.ts`) is touched.

`src/lib/state-fingerprint.ts` is a new file, not in the Protected Zone.

## Database Changes

None.

## Open Questions

None — design is fully specified and confirmed mechanical (move + export +
single import), consistent with the diagnostic already run this session.
