# Design — Orphaned-Position Reconciliation Safety Net (incident fix, part 2 of 2)

## Architecture Decision

This feature lives entirely in `src/lib/claude-agent.ts`'s `enforceExitRules()` per-position loop, immediately after the existing ctx lookup (`const ctx = openContexts.find((c) => c.symbol === position.symbol)`, currently `claude-agent.ts:198` — corrected from the prompt's "~line 187" estimate, which has drifted since the earlier diagnostics this session). A new `if (!ctx) { ... continue }` block handles the orphaned case entirely self-contained, reusing three existing, unmodified primitives: `getOrders()` (new import from `./alpaca`), `submitStopWithRetry()`, and `saveOpenPositionContext()` (already imported via `./learning`, no new import needed — see C-05).

## Data Flow

1. `enforceExitRules()` iterates Alpaca's live positions (fetched once at the start of the cycle, before this function runs — see C-06).
2. For each position, if no matching `OpenPositionContext` exists in Supabase:
   a. Fetch open orders (`getOrders('open', 100)`) and check whether any has `side === 'sell'` for this symbol — if so, treat as already protected.
   b. If not protected, compute a stop price via the standard `STOP_LOSS_PCT` formula and submit it via `submitStopWithRetry()` (existing retry-once behavior, unmodified).
   c. Fetch filled orders (`getOrders('filled', 200)`), filter to buy-side fills for this symbol, take the most recent `filled_at` as `buyTimestamp` — fall back to the cycle's own `timestamp` with a warning log if none found.
   d. Backfill and save a best-effort `OpenPositionContext` (`signalType: null`, generic `claudeReasoning`, `patternIdsUsed: []`) via `saveOpenPositionContext()`.
   e. Log a single HOLD-type `agent_log` alert (`error: 'orphaned_position_reconciled'`) whose reasoning text names which of the three outcomes occurred.
   f. `continue` to the next position — the rest of this iteration's ctx-dependent logic (universal exits, signal-type exits, trailing stop) never runs against the still-fresh, still-technically-`undefined`-for-this-pass `ctx`.
3. Next cycle: `openContexts` is re-fetched fresh, now includes the backfilled row, and the position is handled by the existing, unmodified ctx-present path exactly like any other tracked position.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Handle inline in `enforceExitRules()`'s per-position loop, `continue` after handling (as specified) | Minimal diff; reuses existing primitives as-is; the existing ctx-present path needs zero changes; matches the codebase's established "the missing piece is caught the moment it's noticed" pattern (mirrors `trailing_stop_naked`'s alert-and-move-on style) | One more branch in an already-long function; orphaned positions get "one cycle behind" treatment (no exit logic applies until the *next* cycle) | Chosen |
| Thread the freshly-backfilled `ctx` through the rest of *this* iteration so exits can apply the same cycle | Slightly faster protection (no one-cycle lag for exit-condition eligibility, though the stop-loss/backfill already happen this cycle) | Requires restructuring the rest of the function to accept a locally-constructed `ctx` alongside the array-sourced one — a larger, riskier diff for a corner case that's already down to "at most one cycle" exposure once the stop is in place | Rejected — explicit design decision (see decision 5 in the originating prompt) |
| Build a separate top-level reconciliation pass (its own function, run before/after `enforceExitRules()`) | Cleaner separation of concerns | Would duplicate the ctx-lookup and position-iteration `enforceExitRules()` already does; two passes over `positions` instead of one | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY | Add the `if (!ctx) { ... continue }` block inside `enforceExitRules()`'s per-position loop, immediately after the ctx lookup. Add `getOrders` to the existing `./alpaca` import block. No other lines change. |
| `src/lib/__tests__/trailing-stop-exit-reason-guard.test.ts` or a new dedicated test file | MODIFY or CREATE | New test coverage for the orphaned-position branch, following the codebase's inline-replica convention — final call on which file deferred to implementation, consistent with how CHANGE 1 and CHANGE 3 of the TREND_PULLBACK_3DAY series each made this same kind of call. |

## Protected Zone Impact

⚠️ **`src/lib/claude-agent.ts` is Protected Zone.** As with every prior change this session, this requires **fresh, explicit confirmation from Amaury** before `/implement` proceeds — see C-01. The claimed "Jorge... confirmed this session for this incident" is not accepted as sufficient.

## Database Changes

None — this reuses the existing `open_position_contexts` table and `saveOpenPositionContext()`'s existing upsert (`onConflict: 'symbol'`), which is itself idempotent-safe if this block ever ran twice for the same symbol before the next cycle's fresh `openContexts` fetch picks it up.

## Open Questions

1. **Authorization.** Same unresolved pattern as every Protected Zone touch this session: the claimed sign-off is not independently verifiable and is not treated as sufficient. Amaury's own explicit confirmation is required before `/implement`.
2. **Test placement.** Should new coverage extend `trailing-stop-exit-reason-guard.test.ts` (the existing inline replica of `enforceExitRules()`'s cascade) or live in a new dedicated file (mirroring how CHANGE 2's entry gate got its own `trend-pullback-3day-setup.test.ts`)? This branch is a fairly self-contained sub-flow (getOrders check → conditional stop submit → timestamp derivation → backfill → alert) with several independent outcomes to cover (already-protected / new-stop-success / new-stop-failure / no-matching-buy-order / unexpected-exception) — a dedicated file may read more clearly than folding five-plus new cases into the existing cascade-focused file. Deferred to implementation.
3. **Operational note, not blocking.** Each orphaned position handled costs 2 extra `getOrders()` calls (`'open'` + `'filled'`) plus a possible `submitStopWithRetry()` retry round-trip. This only fires when `ctx` is genuinely missing — a healthy cycle with all positions tracked pays zero extra cost — so this is not expected to be a routine burden, only a rare-path safety net. Worth remembering if orphaned positions are ever seen in bulk (e.g. after a Supabase outage wiped several context rows) rather than the one-off GOOGL case this was built for.
