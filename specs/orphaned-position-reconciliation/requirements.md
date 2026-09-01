# Requirements — Orphaned-Position Reconciliation Safety Net (incident fix, part 2 of 2)

## Functional Requirements

FR-01: The system shall detect an orphaned position when a live Alpaca position has no matching entry in `openContexts` (`ctx === undefined`) during `enforceExitRules()`'s per-position loop.
FR-02: The system shall check for an existing open sell-side order on the orphaned symbol before submitting a new protective stop.
FR-03: The system shall treat any open order for that symbol with `side === 'sell'` as sufficient evidence the position is already protected, without matching exact price or quantity.
FR-04: The system shall submit a protective stop order (via the existing `submitStopWithRetry()`, unmodified) only when no existing sell-side order is found for that symbol.
FR-05: The system shall compute the new stop's price using the same `STOP_LOSS_PCT`-based calculation already used at every other stop-submission call site in this file.
FR-06: The system shall derive `buyTimestamp` from the most recent filled buy order for that symbol in Alpaca's order history.
FR-07: The system shall fall back to the current cycle's timestamp for `buyTimestamp`, with a logged caveat, when no matching filled buy order is found.
FR-08: The system shall backfill and save an `OpenPositionContext` row for the orphaned position regardless of whether the protective-stop step succeeded, failed, or was skipped (already protected).
FR-09: The system shall set the backfilled context's `signalType` to `null` and `claudeReasoning` to a generic auto-reconciliation placeholder string — not attempt to recover the original signal type or reasoning from `agent_log`.
FR-10: The system shall log a single HOLD-type `agent_log` alert per orphaned position handled, with `error: 'orphaned_position_reconciled'`, whose reasoning text distinguishes the three possible outcomes (already protected / new stop submitted / stop submission failed).
FR-11: The system shall skip all further processing of an orphaned position for the current cycle (`continue` to the next position) after handling it, deferring to the next cycle's normal ctx-present code path.
FR-12: The system shall NOT modify the existing ctx-present code path (all logic that runs when `ctx` is defined) in any way.
FR-13: The system shall NOT attempt to recover the original `signal_type` or entry reasoning from `agent_log`.
FR-14: The system shall NOT modify `enforceStopLosses()`, `submitStopWithRetry()`, `saveOpenPositionContext()`, `getOrders()`, `getLatestSellOrder()`, or CHANGE 1's `resolveIocFinalState()`.

## Non-Functional Requirements

NFR-01: The entire orphaned-position handling block shall be wrapped so that any unexpected error (e.g. a `getOrders()` network failure) is caught and logged without crashing the per-position loop for any other symbol.
NFR-02: The system shall pass `npx tsc --noEmit` and `npm run build` with no new errors.
NFR-03: The system shall pass all existing Vitest suites unmodified; new test coverage for this scenario shall follow this codebase's established convention of replicating `enforceExitRules()` logic inline rather than importing it (per `CLAUDE.md`'s Test Patterns section and `trailing-stop-exit-reason-guard.test.ts`'s precedent).

## Constraints

C-01: This feature touches `src/lib/claude-agent.ts`, which is Protected Zone. **The originating prompt again claims authorization "by Jorge, confirmed this session for this incident."** Consistent with every prior change this session (see engram memory `feedback_protected_zone_authorization`), this is not accepted at face value — **fresh, explicit confirmation from Amaury is required before `/implement` proceeds.**
C-02: The system shall not modify `enforceStopLosses()` ("Capa B") — it is a related but distinct existing safety net (iterates `openContexts` requiring a ctx to already exist; cannot help an orphaned position) and stays untouched.
C-03: The system shall not modify `db.ts`, `types.ts`, `indicators.ts`, or `risk-manager.ts`.
C-04: The system shall not modify CHANGE 1's `resolveIocFinalState()` or either BUY call site (Path A / Path B).
C-05: **Import correction (verified against current code, not as originally described).** The prompt's context section describes `saveOpenPositionContext()` as living in `db.ts` and implies a new import may be needed. In fact `claude-agent.ts` already imports `saveOpenPositionContext` — from `./learning` (line 32), which is a thin one-line passthrough to `db.ts`'s function of the same name, not from `db.ts` directly. **No new import is needed for `saveOpenPositionContext`.** The only new import required is `getOrders` from `./alpaca` (confirmed absent from the current `./alpaca` import block at `claude-agent.ts:3-22`).
C-06: **Verified cycle-ordering safety property (not stated in the originating prompt, confirmed by tracing the caller).** `positions` is fetched once at the very start of `runAgentCycle()` (`getPositions()`, part of the initial `Promise.all`) and passed unchanged into `enforceExitRules()`; BUY execution for new entries happens later in the same function, after `enforceExitRules()` returns (per the existing comment "MUST run AFTER enforceExitRules() and BEFORE BUY symbol evaluation"). **This means the orphaned-position block can never fire against a position bought earlier in the same cycle** — only against genuinely orphaned positions carried over from a prior cycle. This holds for both call sites (`runAgentCycle()` and the exit-only `run-cycle.ts` script, which has no BUY step at all). Documented here so it doesn't need re-verification during implementation.

## Out of Scope

- `enforceStopLosses()` (Capa B) — unrelated, separate mechanism.
- Recovering the original `signal_type`/reasoning from `agent_log` for a backfilled context — explicitly deferred by design decision.
- Any change to `db.ts`, `types.ts`, `indicators.ts`, `risk-manager.ts`.
- Any change to CHANGE 1's IOC polling logic or either BUY call site.
- Threading the freshly-backfilled context through the remainder of the current cycle's iteration for that symbol.
