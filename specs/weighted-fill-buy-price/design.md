# Design — Record the real weighted fill price as buy_price (forward only)

## Architecture Decision

This is a minimal, surgical correction inside the existing BUY execution flow in
`src/lib/claude-agent.ts` (Protected Zone, explicitly authorized for this narrow scope). No new function,
module, or file is introduced in source. At each of the two places that call `saveOpenPositionContext`, a
single local `const` is computed immediately above the call, resolving which price to record, and the
existing `buyPrice: indicators.currentPrice` field is replaced with that resolved value. Everything else at
both call sites — `fillResult.attempts`, `firstOrder.id`, `totalFilledQty`, the stop submission, the state
fingerprint construction — is untouched.

`executeIocWithRemainderRetry`, `buildFillAttempt`, and `weightedAvgFillPrice` already compute exactly the
value needed (`fillResult.avgFillPrice`); this change only decides, at the point of use, whether to trust it
or fall back.

## Data Flow

```
executeIocWithRemainderRetry(symbol, qty, limitPrice, spreadBps)
        │  (UNCHANGED)
        ▼
fillResult = { totalFilledQty, avgFillPrice, attempts, firstOrder }
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│ NEW — computed inline, right before each                  │
│ saveOpenPositionContext(...) call:                         │
│                                                             │
│ const buyPrice =                                           │
│   fillResult.avgFillPrice !== null &&                      │
│   Number.isFinite(fillResult.avgFillPrice) &&               │
│   fillResult.avgFillPrice > 0                               │
│     ? fillResult.avgFillPrice                               │
│     : indicators.currentPrice   // or best.indicators.currentPrice │
└───────────────────────────────────────────────────────────┘
        │
        ▼
saveOpenPositionContext({ ..., buyPrice, ... })   ← MODIFIED (was buyPrice: indicators.currentPrice)
        │
        ▼
open_position_contexts.buy_price (Supabase)   — now the real weighted fill, going forward
        │
        ▼
learning.ts's evaluateClosedTrade() / db.ts's insertTradeEvaluation()  — UNCHANGED, read whatever
buyPrice they're given, same as before
```

The orphaned-position reconciliation path (`claude-agent.ts:~247`) is a structurally separate branch inside
`enforceStopLosses()` — a different function entirely from the BUY execution loop — and is untouched by this
diagram or this change.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Extract a new named helper (e.g. `resolveBuyPrice(avgFillPrice, currentPrice)`) near `weightedAvgFillPrice` | Slightly more reusable; easier to unit-test in isolation | Adds a third edited location in a Protected Zone file, beyond the explicitly authorized "only the two call sites" | Rejected |
| Inline local `const` immediately above each call site | Stays literally within the authorized scope (two call sites, nothing else); trivially readable; still independently testable by replicating the expression in the test file, matching this codebase's existing convention | Two near-identical small blocks instead of one shared helper | **Chosen** |
| Change `executeIocWithRemainderRetry` to return `buyPrice` directly pre-resolved | Fewer call-site changes | Would require editing the function itself, outside the authorized scope, and would blur a pure "fill reporting" function with a "what do we record" policy decision | Rejected |
| Re-anchor stop/trailing logic to the corrected price in the same change | "Fixes" the side effect proactively | Explicitly forbidden — changing live risk-control math deserves its own sign-off, and the side effect is already in the safe direction | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY | Two call sites only: add one local `const buyPrice = ...` immediately above each `saveOpenPositionContext` call (~2386, ~2591); replace `buyPrice: indicators.currentPrice` / `buyPrice: best.indicators.currentPrice` with `buyPrice` (the resolved value) |
| `src/lib/__tests__/ioc-remainder-retry.test.ts` | MODIFY | Add a new `describe` block replicating the resolution expression inline (same convention as the rest of the file), covering: full fill, the 41@113.78 + 7@113.77 retry/weighted-average case, and the fallback-when-missing case |

No other file is read or written by this change. `src/lib/learning.ts`, `src/lib/db.ts`, `src/lib/types.ts`,
every dashboard component, every API route, and every other Protected Zone file are untouched. Line ~247 of
`claude-agent.ts` (orphaned-position reconciliation) is untouched.

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` is touched — **already explicitly authorized by Amaury in this conversation**,
scoped to exactly the two `saveOpenPositionContext` call sites (~2386, ~2591). No other Protected Zone file
is touched.

## Database Changes

None. `open_position_contexts.buy_price` and `trade_evaluations.entry_price` keep their existing types and
meaning — only the *value* written going forward changes, via the exact same `saveOpenPositionContext`
plumbing (`db.ts:161-171`, unchanged). No migration, no backfill (explicitly forbidden — see
`requirements.md` → Constraints).

## Pre-Implementation Verification (FAIL FAST check — already performed)

- **Is `fillResult` in scope at both call sites?** Yes. At the normal-mode site, `fillResult` is declared at
  `claude-agent.ts:2316` and already used at lines 2328/2331 inside the same `else` block that contains the
  `saveOpenPositionContext` call at line 2386. At the ranking-mode site, `fillResult` is declared at line
  2501 and already used at lines 2513-2514 inside the same `else` block containing the call at line 2591. No
  STOP condition triggered.
- **Does `avgFillPrice`'s type fit a `!== null && Number.isFinite(...) && > 0` check without a cast?** Yes —
  `executeIocWithRemainderRetry` declares `avgFillPrice: number | null` (`claude-agent.ts:1145`), so the
  check needs no `as`/`any`.
- **Is line ~247 a different call to `saveOpenPositionContext`, structurally isolated from the two targeted
  sites?** Yes — it is inside `enforceStopLosses()`'s orphaned-position branch (lines 207-254), a wholly
  separate function from the BUY execution loop (`runAgentCycle()`'s normal-mode and ranking-mode branches).
  No STOP condition triggered.

## Open Questions

- None. Both FAIL FAST conditions were checked against the current codebase and passed; the authorization
  for the Protected Zone touch was given explicitly in this conversation, scoped exactly as implemented.
