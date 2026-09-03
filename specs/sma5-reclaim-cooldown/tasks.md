# Tasks — Map TREND_PULLBACK_3DAY's SMA5 Exit to a Same-Day Cooldown

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Amaury has given fresh, explicit, in-conversation confirmation to modify `src/lib/claude-agent.ts` (Protected Zone) for this specific change — the task's claimed prior authorization does not satisfy this per project rule
- [x] Database migrations drafted (if applicable) — N/A, none required

## Implementation Checklist

### Phase 1 — types.ts (non-Protected-Zone)
- [x] T-01: In `src/lib/types.ts`, add `'SMA5_RECLAIM'` to the `ExitReason` union (currently lines 394-401), positioned between `'EMA_FAILURE'` and `'UNKNOWN'`.
- [x] T-02: Verify the 7 pre-existing `ExitReason` members are byte-for-byte unchanged (diff review).

### Phase 2 — claude-agent.ts (Protected Zone — gated on Pre-Implementation confirmation)
- [x] T-03: In `toExitReason()` (currently lines 165-178), add `if (r.includes('CLOSED_ABOVE_SMA5')) return 'SMA5_RECLAIM'` after the 5 existing substring checks, before the final `console.warn`/`'UNKNOWN'` fallback.
- [x] T-04: In `computeCooldownUntil()` (currently lines 132-153), add `case 'SMA5_RECLAIM':` to the existing `case 'Z_SCORE_EXIT': case 'PROFIT_TARGET': return endOfTradingDay` group.
- [x] T-05: Verify the 5 pre-existing `toExitReason()` checks and all other `computeCooldownUntil()` cases are byte-for-byte unchanged, and that the exit-detection branch at lines 306-311 was not touched (diff review).
- [x] T-06: Verify `upsertSymbolCooldown()`, `enforceStopLosses()`, the ghost-close reconciliation path, and all 3 cooldown call sites are byte-for-byte unchanged (diff review).

### Phase 3 — Verification
- [x] T-07: Manually confirm (via a throwaway script replicating both functions' current logic — not a new permanent test file) that: (a) a string matching CHANGE 3's exact SMA5 exit format classifies as `'SMA5_RECLAIM'`; (b) representative strings for each of the other 5 known exit types still classify exactly as before (no regression, no check-ordering collision in either direction); (c) `computeCooldownUntil('SMA5_RECLAIM', ...)` returns the same `endOfTradingDay` value as `computeCooldownUntil('Z_SCORE_EXIT', ...)` and `computeCooldownUntil('PROFIT_TARGET', ...)` for identical inputs; (d) the `ExitReason` union now has exactly 8 members.
- [x] T-08: Trace path (A) (`claude-agent.ts:1289-1314`) by inspection to confirm the unmodified call chain (`exitReasons` Map → `computeCooldownUntil()` → `if (cooldownUntil !== null)` guard → `upsertSymbolCooldown()`) now results in `upsertSymbolCooldown(symbol, 'SMA5_RECLAIM', endOfTradingDay)` actually being invoked for a `TREND_PULLBACK_3DAY` SMA5 exit, where today it is skipped entirely.
- [x] T-09: Run `npx tsc --noEmit` — must pass.
- [x] T-10: Run `npm run build` — must pass.
- [x] T-11: Run the full test suite (`npx vitest run`) — all existing tests must pass unmodified; report which test files ran. Confirm `cooldown-gate-fase-1b.test.ts` and `cooldown-stop-loss-ghost-close.test.ts` (the two files referencing `ExitReason`) are unaffected, since both declare their own local, independent `ExitReason` type rather than importing the real one.
- [x] T-12: Report the final line count of `claude-agent.ts`.

## Post-Implementation

- [x] Run `/review sma5-reclaim-cooldown` to verify implementation matches spec
- [x] Confirm exactly two files changed (`types.ts`, `claude-agent.ts`)
- [x] Confirm Protected Zone changes in `claude-agent.ts` were the ones explicitly approved (no scope creep into `upsertSymbolCooldown()`, the exit-detection branch, other `ExitReason` cases, or the agent_log batch-write gap)

## Estimated Complexity

Low — two small, well-isolated additions (one union member, one substring check, one switch case) mirroring an established pattern (`EMA_FAILURE`'s precedent) already present in the same two functions. The only non-trivial item is securing the required Protected Zone confirmation from Amaury before `/implement`, independent of this task's claimed prior authorization.
