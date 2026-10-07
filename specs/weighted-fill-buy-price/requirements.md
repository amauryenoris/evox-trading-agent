# Requirements — Record the real weighted fill price as buy_price (forward only)

## Context

STEP 0 (2026-10-07) found: both BUY execution paths in `src/lib/claude-agent.ts` store
`buyPrice: indicators.currentPrice` — the close of the last completed daily bar (`indicators.ts:122,336`),
fetched once per cycle, not a live quote and not the fill — instead of the trade's actual weighted average
fill price. 107 of 110 closed trades in `trade_evaluations` have `entry_price` exactly equal to that stale
value. Example gaps found: FCX +5.8 bps, INTC (open position) +25 bps between the recorded price and the
weighted fill. `executeIocWithRemainderRetry` (`claude-agent.ts:1138-1198`) already computes and returns
`avgFillPrice: weightedAvgFillPrice(attempts, totalFilledQty)` — a quantity-weighted average across every
fill attempt, sourced from each order's `filled_avg_price` — and the `fillResult` object carrying it is
already in scope at both `saveOpenPositionContext` call sites (`claude-agent.ts:2386`, `:2591`), where it is
presently used for `attempts`/`firstOrder.id`/`totalFilledQty` but not for the price. The orphaned-position
reconciliation path (`claude-agent.ts:247`) is a separate, third call to `saveOpenPositionContext` that
already uses `position.avg_entry_price` (Alpaca's true cost basis) and is correct as-is — it must not change.

## Authorization

Amaury has explicitly authorized touching the Protected Zone file `src/lib/claude-agent.ts` for this change,
scoped narrowly to the two `saveOpenPositionContext` call sites near line 2386 and line 2591 — no other
location in that file, and no other Protected Zone file.

## Functional Requirements

FR-01: Where the normal-mode BUY path calls `saveOpenPositionContext` (`claude-agent.ts:~2386`), the system
shall pass `fillResult.avgFillPrice` as `buyPrice` when that value is a finite number greater than `0`.

FR-02: Where the ranking-mode BUY path calls `saveOpenPositionContext` (`claude-agent.ts:~2591`), the system
shall pass `fillResult.avgFillPrice` as `buyPrice` when that value is a finite number greater than `0`.

FR-03: The system shall fall back to `indicators.currentPrice` (respectively `best.indicators.currentPrice`)
as `buyPrice` at each of the two call sites when `fillResult.avgFillPrice` is `null`, not finite, or not
greater than `0`.

FR-04: The system shall apply this resolution independently at each of the two call sites — neither call
site's behavior shall depend on the other.

## Non-Functional Requirements

NFR-01: The change shall be expressed only at the two named call sites — no new exported function, no new
module-level helper, and no change to `executeIocWithRemainderRetry`, `buildFillAttempt`, or
`weightedAvgFillPrice`.

NFR-02: `npx tsc --noEmit` shall report zero errors after this change.

NFR-03: The full Vitest suite shall pass after this change.

NFR-04: New/adjusted tests shall follow this codebase's existing convention of replicating the relevant
`claude-agent.ts` logic inline in the test file (as `src/lib/__tests__/ioc-remainder-retry.test.ts` already
does for `executeIocWithRemainderRetry`) rather than importing from `claude-agent.ts` directly.

## Constraints

C-01: This feature shall modify `src/lib/claude-agent.ts` only at the two named `saveOpenPositionContext`
call sites (~2386, ~2591). No other line in that file may change.

C-02: The orphaned-position reconciliation call to `saveOpenPositionContext` (`claude-agent.ts:~247`) shall
remain byte-for-byte unchanged.

C-03: This feature shall not modify the initial GTC stop price computation, the trailing-stop floor logic,
the Capa-B manual stop-loss check, or any profit-target logic.

C-04: This feature shall not modify `src/lib/learning.ts`, `src/lib/db.ts`, `src/lib/types.ts`, any dashboard
component, or any Supabase migration.

C-05: This feature shall not modify any Protected Zone file other than the two authorized lines in
`src/lib/claude-agent.ts`.

C-06: This feature shall not backfill, update, or otherwise alter any existing row in
`open_position_contexts` or `trade_evaluations`.

## Out of Scope

- Re-anchoring the initial GTC stop price, trailing-stop floor, or Capa-B stop to the corrected entry price
  (explicitly deferred — see "Known side effect" below).
- Any historical data backfill.
- Any change to how `sellPrice`/`exit_price` is derived.
- Any change to the orphaned-position reconciliation path.

## Known Side Effect (do not "fix" as part of this change)

Going forward, `ctx.buyPrice` will sit at (or slightly above) the live fill rather than the stale daily-bar
close — in the cases observed in STEP 0, this moves it slightly *above* the previously-recorded quote. Since
the trailing-stop floor (`claude-agent.ts:392`) and the Capa-B stop check (`claude-agent.ts:966`) both derive
directly from `ctx.buyPrice`, both will shift up by the same amount — i.e., *tighter*, in the safe direction
(less downside tolerated than before, not more). The initial GTC stop submitted at BUY time
(`claude-agent.ts:2337`, `:2523`) stays anchored to `indicators.currentPrice` as before and is unaffected by
this change. This is expected and shall be stated plainly in the implementation report — not treated as a
defect to correct in this change.
