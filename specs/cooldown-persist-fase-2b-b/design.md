# Design — Fase 2b-B: Add computeCooldownUntil() and persist cooldowns after exits

## Architecture Decision

Both changes land exclusively in `claude-agent.ts` — the core agent loop. `computeCooldownUntil()` is a pure synchronous helper added near the other top-of-file helpers. The cooldown-write block is injected into `runAgentCycle()` immediately after the `enforceExitRules()` IIFE, before any downstream use of `exitReasons`. The block is fire-and-observe (async, try/catch-wrapped) so a DB failure never kills the cycle.

## Step 0 Baseline (verified before spec was written)

```
enforceExitRules destructure — lines 878–886:
  const { decisions: exitRuleEntries, exitReasons } = await (async () => {
    try {
      const openCtxs = await getAllOpenPositionContexts()
      return await enforceExitRules(positions, indicatorsCache, openCtxs, account)
    } catch (err) {
      console.error('[EXIT-RULES] enforceExitRules failed:', err)
      return { decisions: [] as AgentLogEntry[], exitReasons: new Map<string, ExitReason>() }
    }
  })()

⚠️  Alias discrepancy: spec request uses "exitDecisions" but actual code uses "exitRuleEntries".
    The insertion reads from exitReasons (not the alias), so this has no impact on the code.

alpaca.ts imports (lines 3–17): getNextTradingDay is NOT currently imported.
db.ts imports (lines 27–38): upsertSymbolCooldown is NOT currently imported.
ExitReason: ✅ imported from './types' at line 49 — no re-import needed.

cooldownSymbols build block: lines 976–1006.
Insertion window: after line 886, before line 976.
```

## Data Flow

```
runAgentCycle()
  │
  ├─ enforceExitRules() → exitReasons: Map<symbol, ExitReason>   ← line 886
  │
  ├─ [NEW] Cooldown-write block                                    ← insertion point
  │     getNextTradingDay(now, 1)  ─┐
  │     getNextTradingDay(now, 3)  ─┴─ Promise.all (2 Alpaca calls)
  │     computeEndOfTradingDay(now, nextTradingDay1)
  │     Promise.all(exitReasons.entries().map(
  │       ([symbol, reason]) →
  │         cooldownUntil = computeCooldownUntil(reason, ...)
  │         if non-null → upsertSymbolCooldown(symbol, reason, cooldownUntil)
  │                       log [COOLDOWN_PERSIST]
  │     ))
  │     catch(err) → log [COOLDOWN_PERSIST_ERROR] — cycle continues
  │
  ├─ cooldownSymbols build block (Fase 1b, unchanged)              ← line 976
  └─ ... rest of cycle
```

## computeCooldownUntil() — Duration Policy

| ExitReason | Duration | Rationale |
|------------|----------|-----------|
| `Z_SCORE_EXIT` | End of trading day | Quick z-score exits: thesis may reset same day |
| `PROFIT_TARGET` | End of trading day | Target hit: fine to re-evaluate next morning |
| `TRAILING_STOP` | Next trading day | Momentum stalled: give one session to stabilize |
| `EMA_FAILURE` | Next trading day | Trend broke: one full session recovery required |
| `STOP_LOSS` | 3 trading days | Hard loss: extended cooling-off period |
| `TIME_STOP` | No cooldown (`null`) | Thesis expired naturally — not a loss event |
| `UNKNOWN` | No cooldown (`null`) | Cannot determine risk profile — skip to be safe |

## Market Close Approximation

`endOfTradingDay` uses 21:00 UTC as a fixed proxy for market close (4pm ET / EDT).
EST (winter) drifts by ~1 hour — acceptable for cooldown purposes since the goal is
preventing same-day re-entry, not exact-to-the-minute precision.
A proper timezone library (e.g. `date-fns-tz`) is deferred to Fase 3.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Async `computeCooldownUntil()` — fetches calendar internally | Self-contained | Calendar API called N times (once per exit) — expensive on multi-exit cycles | **Rejected** |
| Pre-fetch calendar outside IIFE, pass as params (chosen) | Calendar fetched once; helper is pure/testable | Slightly more ceremony at call site | **Chosen** |
| Write cooldowns inside `enforceExitRules()` itself | Co-located with exit logic | Modifies Protected Zone function signature; mixes exit logic with persistence concern | **Rejected** |
| Use `'./db'` import for `upsertSymbolCooldown` | One fewer import path | `db.ts` re-exports via barrel — fine, but spec explicitly requires `'./db-cooldowns'` for clarity | **Per spec** |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY | (1) Add `getNextTradingDay` to alpaca import; (2) Add `upsertSymbolCooldown` import from `'./db-cooldowns'`; (3) Add `computeCooldownUntil()` helper near top helpers; (4) Add cooldown-write block after line 886 |

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` is a Protected Zone file — **requires Amaury confirmation before implementation.**

The changes are purely additive:
- New import lines (no existing imports modified)
- New pure helper function (no existing function modified)
- New async block inserted between two existing blocks (neither block modified)

## Database Changes

None — `symbol_cooldowns` table and `upsert_symbol_cooldown` RPC were created in Fase 2a.

## Open Questions

None — all design decisions are resolved. The only prerequisite is Amaury's Protected Zone
confirmation (C-01).
