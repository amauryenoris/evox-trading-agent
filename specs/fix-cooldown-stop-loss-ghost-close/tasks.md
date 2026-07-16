# Tasks — Wire Stop-Loss/Ghost-Close Paths Into the Cooldown System

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] Protected Zone changes confirmed (if applicable) — `claude-agent.ts`, explicitly
      authorized in the originating request
- [X] Database migrations drafted (if applicable) — N/A, none needed

## Implementation Checklist

### Phase 1 — Hoist date computation
- [x] T-01: Move the date computation block (`nowUTC`, `marketCloseUTC`, `nextTradingDay1`,
      `nextTradingDay3`, `endOfTradingDay`), currently inside the `try {}` at
      `claude-agent.ts:1016-1024`, to run once, earlier in `runAgentCycle()`, before the
      `enforceStopLosses()` call (currently line 925). Wrapped in `cooldownDates` (nullable on
      failure, matching the previous try/catch's fail-safe behavior).
- [x] T-02: Update the existing cooldown-write block (currently `~1030-1048`) to read the
      hoisted values instead of recomputing them; confirm no behavior change for
      `enforceExitRules()`-sourced cooldowns. Fail-safe preserved: if `cooldownDates` is null
      (date fetch failed earlier), logs `[COOLDOWN_PERSIST_ERROR]` and skips writing, matching
      the old try/catch's behavior exactly.

### Phase 2 — `enforceStopLosses()` cooldown write
- [x] T-03: Add a new parameter to `enforceStopLosses()` carrying the hoisted `nextTradingDay3`
      value; update its call site (currently line 925) to pass it. Typed `Date | null` to match
      `cooldownDates`'s nullable-on-failure shape.
- [x] T-04: After a successful `closePosition(ctx.symbol)` inside `enforceStopLosses()`, call
      `upsertSymbolCooldown(ctx.symbol, 'STOP_LOSS', nextTradingDay3)` and log a
      `[COOLDOWN_PERSIST]` line with `source=enforceStopLosses`.

### Phase 3 — Ghost-close audit-trail + cooldown write
- [x] T-05: Restructure the `alreadyEvaluated` branch (currently `claude-agent.ts:1059-1064`) so
      it no longer short-circuits past the `agent_log` ghost-close insert — only the
      `evaluateClosedTrade()` call (and the `trade_evaluations` write it causes), plus
      `recordSelectionOutcome`, are skipped when a `TradeEvaluation` already exists.
      `removeOpenPositionContext` and the `agent_log` insert now run unconditionally.
- [x] T-06: Ensure a pnl_pct-equivalent value is available on **both** branches — `sellOrder`/
      `sellPrice`/`sellTimestamp`/`pnlPct` are now computed once, before the branch, using the
      existing `(sellPrice - ctx.buyPrice) / ctx.buyPrice` formula, reused by both branches
      (note: the not-yet-evaluated branch's `evaluation.pnlPct` from `evaluateClosedTrade` is a
      percentage number, while this local `pnlPct` is a fraction — sign-equivalent, which is all
      the cooldown decision needs, per the design doc).
- [x] T-07: After the `agent_log` ghost-close insert, if the closing pnl_pct-equivalent value is
      negative, call `upsertSymbolCooldown(ctx.symbol, 'STOP_LOSS', nextTradingDay3)` and log
      `[COOLDOWN_PERSIST]` with `source=ghost_close`; write nothing if zero or positive.

### Phase 4 — Testing
- [x] T-08: Test — an `enforceStopLosses()` closure triggers exactly one `upsertSymbolCooldown`
      call with `('<symbol>', 'STOP_LOSS', nextTradingDay3)`. Since `enforceStopLosses` is
      private/non-exported, this is covered via the replicated-logic convention (matching
      `cooldown-gate-fase-1b.test.ts`): tests confirm the trigger condition mathematically
      always implies `pnlPct < 0`, which is the exact condition the real code now gates the
      cooldown write on — `src/lib/__tests__/cooldown-stop-loss-ghost-close.test.ts`.
- [x] T-09: Test — a ghost-close with `pnlPct=-0.79`-equivalent (fraction form) triggers the same
      cooldown write; a positive/zero pnlPct triggers none. Same file.
- [x] T-10: Test — the `alreadyEvaluated` branch decision logic confirms `agent_log`
      insert + `removeOpenPositionContext` always run, while `evaluateClosedTrade` /
      `recordSelectionOutcome` only run when not already evaluated. Same file.
- [x] T-11: Test — `getNextTradingDay` is called exactly twice regardless of how many consumers
      reuse the hoisted result (call-count assertion). Same file.
- [x] T-12: Regression test replaying XOM's 2026-07-14 scenario — a `STOP_LOSS`-labeled cooldown
      (now producible by either new path) blocks same-day re-entry via the existing,
      unmodified gate, with `skipReason='STOP_LOSS'`. Same file.
- [x] T-13: Ran the 3 existing cooldown test files unmodified — all still pass (see full suite
      run below).
- [x] T-14: `npx tsc --noEmit` — passed clean.
- [x] T-15: `npm run build` — passed clean.
- [x] T-16: Full test suite — 258/258 passed (23 → 24 test files, 248 → 258 tests, +10 new,
      zero regressions).

## Post-Implementation

- [x] Run `/review fix-cooldown-stop-loss-ghost-close` to verify implementation matches spec
- [x] Confirm Protected Zone changes match what was authorized (`claude-agent.ts` only)

## Estimated Complexity

Medium — touches the Protected Zone (`claude-agent.ts`) across 3 coordinated locations (a hoist
plus 2 new call sites) plus a control-flow restructure in an existing branch. No new files or
schema changes, but requires careful manual verification given the file's size and the
async/control-flow subtlety in the ghost-close restructure.
