# Design — Fix: checkAutoEntry() Bypasses MR_RANGING_ADX_GATE

## Architecture Decision

The fix lives entirely inside `checkAutoEntry()` in `src/lib/watchlist-monitor.ts`. It adds
two new local boolean checks evaluated per-entry, inside the existing `for (const entry of
activeEntries)` loop, using data already available as function parameters (`currentIndicators`)
or already-fetched local variables (`regime`, `entry.signal_type`). No new fetch, no new
parameter, no signature change. `claude-agent.ts` is not touched — the gate this fix mirrors
(`mrRangingAdxGateOk`) is left exactly as-is; this fix gives `checkAutoEntry()` its own
independent enforcement of the same condition, since the two functions live in different
modules and the auto-entry path was never routed through the main loop's gate.

## Data Flow

```
checkAutoEntry(thresholdMap, currentIndicators, openPositionsCount, maxPositions)
  for each entry in activeEntries:
    currentZScore = currentIndicators[entry.symbol]?.kalman?.zScore
    [existing] skip if currentZScore == null

    regime = currentIndicators[entry.symbol]?.marketRegime
    threshold = thresholdMap[entry.symbol] ?? ZSCORE_ENTRY_THRESHOLD
    [existing] regimeOk = signal_type === 'MEAN_REVERSION' ? regime === 'RANGING' : true

    [NEW] adxValue = currentIndicators[entry.symbol]?.adx ?? null
    [NEW] mrRangingAdxBlocked =
            entry.signal_type === 'MEAN_REVERSION' &&
            regime === 'RANGING' &&
            typeof adxValue === 'number' &&
            Number.isFinite(adxValue) &&
            adxValue < 18
    [NEW] nullSignalTypeBlocked = entry.signal_type === null

    if (mrRangingAdxBlocked) → log skip, do NOT add to readyForEntry
    else if (nullSignalTypeBlocked) → log skip, do NOT add to readyForEntry
    else if (currentZScore <= threshold && regimeOk && openPositionsCount < maxPositions)
      → mark TRIGGERED, add to readyForEntry
```

The two new checks are evaluated before the existing combined `if`, as independent early-exit
conditions — not folded into the existing boolean expression — so each can carry its own
distinct log message (FR-07/FR-08) without entangling the existing condition's structure.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Add `mrRangingAdxBlocked`/`nullSignalTypeBlocked` as independent early-exit `if` blocks (one per new check) | Each gets its own distinct log message; mirrors the existing no-indicators early-exit pattern already in the function | Two more `if` blocks in the loop body | **Chosen** |
| Fold both into the single existing combined condition (`currentZScore <= threshold && regimeOk && !mrRangingAdxBlocked && !nullSignalTypeBlocked && openPositionsCount < maxPositions`) | Fewer lines | Loses the ability to log *why* a symbol was skipped — would need to compute which sub-condition failed afterward anyway for FR-07/FR-08 | Rejected |
| Import `mrRangingAdxFloor` from `claude-agent.ts` into `watchlist-monitor.ts` | Single source of truth, zero drift risk | Creates a cross-module coupling from a "leaf" monitor module into the large orchestrator file; not how any other shared constant in this codebase is structured between these two files today | Rejected — explicit instruction (NFR-04) |
| Define `18` as a local constant with a sync-reminder comment | No cross-module coupling; matches this codebase's existing precedent of independently-duplicated thresholds (e.g. backfill scripts duplicating `400`/`200`/`50` rather than importing) | Two literals to keep in sync manually | **Chosen** |
| Extend the ADX check to all signal types (TREND_PULLBACK, TREND_ZLE05, EMA_RECLAIM) | "More thorough" | Explicitly out of scope — those signal types have their own quality gates (TREND_QUALITY_FAIL) that already run unaffected for auto-entries; extending would change behavior not requested and not diagnosed as broken | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/watchlist-monitor.ts` | MODIFY | Add 2 new local checks + 2 new early-exit branches with logging, inside `checkAutoEntry()` |
| `src/lib/__tests__/watchlist-monitor.checkAutoEntry.test.ts` | CREATE | First test file covering `checkAutoEntry()` — none exists today |

## Protected Zone Impact

⚠️ `src/lib/watchlist-monitor.ts` is in the Protected Zone (`CLAUDE.md`: "Auto-entry logic").
Change is additive — two new exclusion conditions inside one function, no signature change,
no change to any other exported function in the file (`detectNearMisses`, `updateWatchlist`,
`markWatchlistTriggered` untouched). Requires **Amaury confirmation before `/implement` runs**.

## Database Changes

None. `near_miss_watchlist` schema unchanged — `entry.signal_type` (already a column) and
`currentIndicators[entry.symbol]?.adx` (already a function parameter) are both pre-existing
data sources; nothing new is read from or written to Supabase.

## Open Questions

None — every design decision (early-exit structure, local constant vs. import, log message
format, exact scope of the two new conditions) was explicitly specified by Amaury in the
fix request that generated this spec.
