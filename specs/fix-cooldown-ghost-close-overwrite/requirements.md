# Requirements — Don't Overwrite an Existing Active Cooldown From the Ghost-Close STOP_LOSS Path

## Context

Confirmed via a prior read-only diagnostic (this session, not re-verified here): the ghost-close
cooldown write at `claude-agent.ts:1125-1132` — `if (pnlPct < 0 && cooldownDates !== null) {
await upsertSymbolCooldown(ctx.symbol, 'STOP_LOSS', cooldownDates.nextTradingDay3) }` — fires
unconditionally whenever a ghost-closed position has a negative pnl. This is the same code path
landed by the just-merged `fix-cooldown-stop-loss-ghost-close` spec. It does not check whether the
symbol already has an active cooldown written earlier in the same cycle by
`enforceExitRules()`'s own cooldown-write block (e.g. `Z_SCORE_EXIT`, `nextTradingDay1`), which
runs first, at `claude-agent.ts:1041-1063`. Because `upsertSymbolCooldown` is an upsert (write path
confirmed in `db-cooldowns.ts:11-24`, backed by the `upsert_symbol_cooldown` RPC), a `STOP_LOSS`
write here silently replaces an already-correct, shorter-duration cooldown with the longer
`nextTradingDay3` one — extending a symbol's re-entry block beyond what the original, correct exit
reason warranted.

`getActiveCooldowns()` (`db-cooldowns.ts:26-44`) takes no parameters, returns all active cooldowns
project-wide (capped at 100 rows via `.limit(100)`), and never throws (returns `[]` on any query
error). The existing call site (`persistentCooldowns`, `claude-agent.ts:1200`, inside the
entry-time-gate setup) runs *after* the ghost-close loop closes (`claude-agent.ts:1137`) — not in
scope at line 1125 — so answering "does this symbol already have an active cooldown" at the
ghost-close write site requires a new, separate call.

Zero existing test coverage exists for this exact scenario — this is additive-only to
`cooldown-stop-loss-ghost-close.test.ts`; no existing assertion in any of the 4 cooldown test
files needs to change.

## Functional Requirements

FR-01: The system shall query all currently active cooldowns exactly once per agent cycle, before
the ghost-close (`closedContexts`) loop runs.
FR-02: The system shall build an in-memory lookup of that query's result, keyed by symbol,
reachable inside the ghost-close loop.
FR-03: The system shall write a `STOP_LOSS` cooldown for a ghost-closed position with negative
pnl when no active cooldown already exists for that symbol.
FR-04: The system shall not write a `STOP_LOSS` cooldown for a ghost-closed position when an
active cooldown already exists for that symbol, regardless of that existing cooldown's exit
reason.
FR-05: The system shall log a line identifying symbol, the skip reason
(`already_has_active_cooldown`), and source (`ghost_close`) whenever a `STOP_LOSS` write is
skipped under FR-04.
FR-06: The system shall leave an existing active cooldown's `exit_reason` and `cooldown_until`
values unmodified when the write under FR-04 is skipped.
FR-07: The system shall preserve the existing `enforceStopLosses()` STOP_LOSS write (the other
new call site from the just-merged fix) unchanged — this overwrite check applies only to the
ghost-close path.
FR-08: The system shall preserve the existing `persistentCooldowns` call site
(`claude-agent.ts:1200`) unchanged — the new call added under FR-01 is separate and does not
replace or consolidate it.

## Non-Functional Requirements

NFR-01: The new active-cooldowns query shall be called exactly once per agent cycle from the new
call site, regardless of how many positions `closedContexts` contains (not once per closed
position).
NFR-02: The fix shall not introduce any new database table, column, migration, or RPC.
NFR-03: The fix shall not modify any existing assertion in `cooldown-stop-loss-ghost-close.test.ts`
or in the 3 fully-protected cooldown test files (`cooldown-gate-fase-1b.test.ts`,
`cooldown-db.test.ts`, `cooldown-merge-fase-2b-c.test.ts`).

## Constraints

C-01: This feature modifies `claude-agent.ts`, a Protected Zone file — explicitly authorized by
Amaury in the request that generated this spec, as part of the same fix family as the
just-merged `fix-cooldown-stop-loss-ghost-close` spec.
C-02: This feature must not modify `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`,
`watchlist-monitor.ts`, `learning.ts`, or `db.ts`.
C-03: This feature must not modify `enforceStopLosses()`'s own `STOP_LOSS` write, `computeCooldownUntil()`,
the `STOP_LOSS` mapping, or any entry-time gate-side logic.
C-04: This feature must not modify the existing `persistentCooldowns` call site
(`claude-agent.ts:1200`) — the new call is separate, earlier in the cycle, and serves a different
purpose (overwrite-prevention at write time vs. gate-time cooldown merging).
C-05: This feature must not modify the 3 fully-protected cooldown test files.
C-06: This feature must only add new test cases to `cooldown-stop-loss-ghost-close.test.ts` —
existing assertions in that file must not change.

## Out of Scope

- Applying the same existing-cooldown check to `enforceStopLosses()`'s own STOP_LOSS write — a
  similar cross-cycle overwrite scenario there is not confirmed and is explicitly out of scope
  per the originating request.
- Making the overwrite check setup-specific (symbol+exit_reason) instead of symbol-only — the
  check is "does this symbol have any active cooldown," not "does it have this specific reason."
- Any change to how `getActiveCooldowns()` itself queries or limits results (the 100-row cap,
  the `.gt('cooldown_until', ...)` filter) — reused as-is.
- Historical backfill of any cooldown already incorrectly overwritten before this fix.
