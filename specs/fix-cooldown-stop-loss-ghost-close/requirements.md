# Requirements — Wire Stop-Loss/Ghost-Close Paths Into the Cooldown System

## Context

Confirmed via two prior read-only diagnostics (this session, not re-verified here): the cooldown
system (`symbol_cooldowns` table, `upsertSymbolCooldown`, `computeCooldownUntil`,
`getActiveCooldowns`, and the entry-time gate at `claude-agent.ts:1210-1229`) only ever gets
written to by `enforceExitRules()`'s own deterministic exits. Two other closure paths —
`enforceStopLosses()` (Capa B manual -5% check, `claude-agent.ts:749-775`) and the
`detectClosedPositions()` ghost-close handler (`claude-agent.ts:1057-1111`, for positions closed
externally e.g. an Alpaca GTC stop) — never write a cooldown, which allowed XOM to re-enter
same-day into an "identical" TREND_ZLE05 configuration after a loss, with Claude's own reasoning
explicitly citing the ignored lesson. Separately, the ghost-close handler's
`if (alreadyEvaluated) { ...; continue }` branch (`claude-agent.ts:1059-1064`) was found to
silently skip its own `agent_log` audit-trail insert under a specific, identifiable condition.

`STOP_LOSS` already exists in `ExitReason` (`types.ts`) with a working `computeCooldownUntil`
mapping (`nextTradingDay3`, the longest of all reasons) and is already treated as first-class by
the existing cooldown test suite — nothing currently produces this value.

## Functional Requirements

FR-01: The system shall compute the trading-day date values (`endOfTradingDay`,
`nextTradingDay1`, `nextTradingDay3`) exactly once per agent cycle, before `enforceStopLosses()`
runs.
FR-02: The system shall reuse that single hoisted date computation in the existing
cooldown-write block, in `enforceStopLosses()`, and in the ghost-close handler — no path shall
recompute these dates independently.
FR-03: The system shall write a `symbol_cooldowns` entry with `exit_reason='STOP_LOSS'` and
`cooldown_until=nextTradingDay3` for every position `enforceStopLosses()` successfully closes.
FR-04: The system shall write a `symbol_cooldowns` entry with `exit_reason='STOP_LOSS'` and
`cooldown_until=nextTradingDay3` for a ghost-closed position when its closing pnl_pct is
negative.
FR-05: The system shall write no cooldown for a ghost-closed position when its closing pnl_pct
is zero or positive.
FR-06: The system shall log a line matching the existing `[COOLDOWN_PERSIST]` format for each
new cooldown write, identifying its source (`enforceStopLosses` or `ghost_close`).
FR-07: The system shall insert an `agent_log` entry with `error='ghost_close'` for a detected
closed position even when a `TradeEvaluation` already exists for that symbol/buyTimestamp.
FR-08: The system shall not call `evaluateClosedTrade` a second time for a symbol/buyTimestamp
that already has a `TradeEvaluation` (no duplicate `trade_evaluations` row).
FR-09: Where a `TradeEvaluation` already exists for the closed position, the system shall use a
sign-equivalent pnl_pct value computed locally (without a new DB read) for the cooldown-writing
decision, rather than recomputing `evaluateClosedTrade`.
FR-10: The system shall preserve the existing behavior of the cooldown-write block for
`enforceExitRules()`-detected exits (`Z_SCORE_EXIT`, `PROFIT_TARGET`, `TRAILING_STOP`,
`EMA_FAILURE`, `TIME_STOP`, `UNKNOWN`) unchanged.
FR-11: The system shall preserve `computeCooldownUntil()`'s existing switch-statement mapping
unchanged.
FR-12: The system shall block re-entry into a symbol via the existing entry-time gate
(`claude-agent.ts:1210-1229`) once a `STOP_LOSS` cooldown has been written for that symbol,
using the existing gate mechanics without modification.

## Non-Functional Requirements

NFR-01: `getNextTradingDay()` shall be called at most twice per agent cycle (once for
`nextTradingDay1`, once for `nextTradingDay3`), regardless of how many positions close via any
path in that cycle.
NFR-02: The fix shall not introduce any new database table, column, or migration.
NFR-03: The fix shall not modify the 3 existing cooldown test files' existing assertions
(`cooldown-gate-fase-1b.test.ts`, `cooldown-db.test.ts`, `cooldown-merge-fase-2b-c.test.ts`).

## Constraints

C-01: This feature modifies `claude-agent.ts`, a Protected Zone file — explicitly authorized by
Amaury in the request that generated this spec.
C-02: This feature must not modify `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`,
`watchlist-monitor.ts`, `learning.ts`, or `db.ts`.
C-03: This feature must not modify `computeCooldownUntil()`'s switch statement — `STOP_LOSS`'s
mapping already exists and is correct.
C-04: This feature must not create a duplicate `trade_evaluations` row for any symbol/buyTimestamp
that already has one.
C-05: This feature must not modify `getNextTradingDay()` itself (`alpaca.ts`).

## Out of Scope

- Historical backfill of any missed cooldowns from before this fix (e.g. no retroactive cooldown
  for XOM's 2026-07-14 closure) — this spec is forward-looking code only.
- The `signal_type = NULL` data-completeness gap.
- Any change to the entry-time gate logic itself (`claude-agent.ts:1210-1229`) — already correct
  and symbol-based, per the diagnostic; not modified here.
- Making the cooldown setup-specific (symbol+signal_type) instead of symbol-only — diagnosed but
  not requested to change in this spec.
- The "NOK/INTC 2026-07-16 pattern" referenced in the originating request's learning objective —
  motivating context only, not a separate investigation/fix item in this spec.
