# Design — Wire Stop-Loss/Ghost-Close Paths Into the Cooldown System

## Architecture Decision

Single-file change, entirely within `src/lib/claude-agent.ts` (Protected Zone, explicitly
authorized). Three coordinated changes within `runAgentCycle()` and its two helper functions:
(1) hoist the trading-day date computation to run once, earlier in the cycle; (2) give
`enforceStopLosses()` a new parameter and a cooldown-write side effect; (3) restructure the
ghost-close handler's `alreadyEvaluated` branch so it keeps its audit-trail insert and gains a
cooldown-write side effect, on both branches (already-evaluated and newly-evaluated). No new
files, no schema changes — reuses the already-built-but-dormant `STOP_LOSS` `ExitReason` value
end to end.

## Data Flow

1. `runAgentCycle()` starts → the hoisted date block runs **once**, before the
   `enforceStopLosses()` call → produces `{ endOfTradingDay, nextTradingDay1, nextTradingDay3 }`
   in a scope reachable by every later step in the same cycle.
2. `enforceStopLosses(positions, nextTradingDay3)` runs → for each position it closes (trigger
   condition already guarantees a loss), it calls
   `upsertSymbolCooldown(symbol, 'STOP_LOSS', nextTradingDay3)` and logs `[COOLDOWN_PERSIST]
   source=enforceStopLosses`.
3. `enforceExitRules()` runs as before, producing its own `exitReasons` map. The **existing**
   cooldown-write block (currently `claude-agent.ts:1030-1048`) persists those exactly as today
   — the only change is it reads the hoisted dates instead of locally-scoped ones.
4. `detectClosedPositions()`'s ghost-close loop runs. For each closed context:
   - If `tradeEvaluationExists()` is true: **skip** `evaluateClosedTrade()` (no duplicate
     `trade_evaluations` row), but still compute a sign-equivalent pnl_pct locally, insert the
     `agent_log` entry with `error='ghost_close'`, and — if that pnl_pct is negative — write the
     `STOP_LOSS` cooldown.
   - If not: run `evaluateClosedTrade()` as today, then apply the same logging/cooldown logic
     using `evaluation.pnlPct`.
5. Later in the same cycle, the entry-time gate (`claude-agent.ts:1210-1229`, **unchanged**)
   reads the now-populated `symbol_cooldowns`/in-memory cooldown state and blocks re-entry into
   any symbol with an active cooldown — no gate-side changes needed, it already treats
   `STOP_LOSS` as a first-class reason.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Recompute dates independently inside each new call site | No control-flow restructuring needed | Violates the "fetched once per cycle" intent (NFR-01), risks inconsistent dates within one cycle if computed at slightly different instants | Rejected |
| Hoist the date computation once; thread `nextTradingDay3` into `enforceStopLosses()` as a new parameter; ghost-close loop reads the hoisted values directly (same function scope, no signature change needed) | Matches the explicit decision in the originating request; minimal signature surface; single computation, satisfies NFR-01 | `enforceStopLosses()` gains one new required parameter (small, contained change) | **Chosen** |
| Have `enforceStopLosses()` return info about what it closed, and let the *existing* cooldown-write block process both `exitReasons` and these returned closures centrally | Fully centralizes cooldown-writing in one place | Requires restructuring the existing block's iteration source (currently just `exitReasons.entries()`); larger diff for an equivalent outcome; the originating request explicitly asks `enforceStopLosses()` to call `upsertSymbolCooldown` itself | Rejected |
| Ghost-close `alreadyEvaluated` branch re-fetches the existing `TradeEvaluation` row to get its authoritative `pnl_pct` | Reuses the single source of truth exactly | Extra DB read for a value only needed for a sign check; the diagnostic already confirmed a sign-equivalent value is computable locally with the same formula already used at the existing `pnlPct` line, no new dependency | Rejected — locally-computed sign-equivalent chosen |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|--------------|
| `src/lib/claude-agent.ts` | MODIFY | Hoist date computation earlier in `runAgentCycle()`; `enforceStopLosses()` gains a new parameter and a cooldown-write call; ghost-close loop restructured so the `alreadyEvaluated` branch preserves its `agent_log` insert and gains a cooldown-write, on both branches. |
| `src/lib/__tests__/*` (new file, name decided at implementation time) | CREATE | New tests per the Requirements' testable behaviors, following this project's established "replicate logic inline, don't import from `claude-agent.ts`" test convention. |

## Protected Zone Impact

⚠️ `claude-agent.ts` **is** modified — explicitly authorized by Amaury in the request that
generated this spec ("Protected Zone — authorized by Amaury"). No other Protected Zone file
(`config.ts`, `risk-manager.ts`, `indicators.ts`) is touched.

## Database Changes

None — reuses the existing `symbol_cooldowns` table, `upsert_symbol_cooldown` RPC, and the
already-defined `STOP_LOSS` value in the `ExitReason` type. No migration needed.

## Open Questions

None blocking. Exact internal naming for the hoisted date block and `enforceStopLosses()`'s new
parameter is an implementation detail with no behavioral ambiguity, left to the implementation
step.
