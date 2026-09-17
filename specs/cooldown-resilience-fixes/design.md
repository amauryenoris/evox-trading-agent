# Design — Cooldown Resilience Fixes (Block A guard + profitable ghost-close branch)

## Architecture Decision

Both parts live entirely inside `runAgentCycle()` in `src/lib/claude-agent.ts` — the core agent-cycle orchestration function, Protected Zone. Part 1 wraps an existing block (lines 1306-1331) in `try/catch` with zero internal changes. Part 2 appends two new `else if` branches after the existing `pnlPct < 0` branches (lines 1396-1410) inside the ghost-close per-context loop (lines 1343-1414), using only data already in scope (`ctx`, `sellOrder`, `cooldownDates`, `existingCooldowns`) — no new fetch, no new function, no new file. This is the narrowest possible change to close two confirmed, diagnosed gaps in the same region of one already-well-understood function.

## Data Flow

**Part 1** (defensive only — no new data flow): `exitReasons` (populated by `enforceExitRules()`, itself already safely wrapped at lines 1296-1304) is iterated inside `Promise.all`; each iteration computes a `cooldownUntil` via the existing `computeCooldownUntil()` and calls the existing `upsertSymbolCooldown()`. The only change is that any exception thrown anywhere in this sequence is now caught at the block level instead of propagating up through `runAgentCycle()`.

**Part 2**, per closed-position `ctx` in the ghost-close loop:
1. `sellOrder` (already fetched, line 1347) is available with its `id`.
2. `ctx.trailingStopOrderId` (already on the `OpenPositionContext`, no fetch) is compared for direct equality against `sellOrder.id`.
3. If both are non-null and equal → `reason = 'TRAILING_STOP'`, `cooldownUntil = cooldownDates.nextTradingDay1` (mirrors the deterministic path's own `TRAILING_STOP` duration, since this is a confirmed order-id match, not an inference from `pnlPct` alone).
4. Otherwise → `reason = 'GHOST_CLOSE_PROFIT'`, `cooldownUntil = cooldownDates.endOfTradingDay` (conservative same-day default).
5. `upsertSymbolCooldown(ctx.symbol, reason, cooldownUntil)` — same function already used by every other cooldown write in this file, called with a reason string outside the `ExitReason` union (precedented by the existing `'STOP_LOSS'` literal in the same block).
6. If the symbol already has an active cooldown (`existingCooldowns.has(ctx.symbol)`), skip the write and log — mirrors the existing loss-branch's overwrite-prevention guard exactly.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Part 1: wrap only the `Promise.all`, leave `if/else` structure outside the `try` | Narrower catch surface | The `else` branch (line 1329-1331) is already a plain `console.error`, not a throw source — no added value to excluding it, and excluding it adds a second nesting level for no benefit | Rejected — wrap the whole `if/else` block, per the CHANGE spec |
| Part 1: add retry before giving up | Might recover from a transient blip | Explicitly out of scope per user's design decision (NFR-01); adds complexity and latency to a fire-and-forget write with no downstream reader | Rejected |
| Part 2: infer trailing-stop fill from `pnlPct` proximity to `ctx.trailingStop` (a heuristic) | No dependency on order-id data | Strictly weaker than a direct order-id match — already-available `sellOrder.id` vs `ctx.trailingStopOrderId` comparison is definitive, not inferred, per the diagnostic's confirmed mechanics (`ctx.trailingStopOrderId`'s underlying order only ever fills at profit/breakeven; `ctx.stopOrderId`'s underlying order only ever fills at a loss) | Rejected — use the definitive order-id match |
| Part 2: add `'GHOST_CLOSE_PROFIT'` to the `ExitReason` union in `types.ts` | Type-safe, discoverable | Explicitly out of scope (C-02); the existing `'STOP_LOSS'` literal in this exact block already establishes that `upsertSymbolCooldown()`'s `exitReason` parameter is a plain string, not constrained to the union — consistent with existing convention, smaller diff | Rejected — use a plain string literal, no `types.ts` change |
| Part 2: give the unconfirmed case (`'GHOST_CLOSE_PROFIT'`) the same `nextTradingDay1` duration as a confirmed trailing-stop match | Simpler (one duration) | Conflates a confirmed mechanism with an unconfirmed one; `endOfTradingDay` is explicitly the more conservative, same-day-only choice for the uncertain case | Rejected — two distinct durations, matching confidence to duration |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY | Part 1: wrap lines 1306-1331 in `try/catch`, zero internal changes. Part 2: append two new `else if` branches after line 1410, inside the existing ghost-close loop (1343-1414). No other line in this file changes. |
| `src/lib/__tests__/cooldown-stop-loss-ghost-close.test.ts` | MODIFY | Add coverage for: (a) Part 1's catch-and-continue behavior, replicated per this project's established convention; (b) Part 2's trailing-stop-match branch and no-match/default branch. Update the two existing assertions (lines 121-127, 249-253) that currently assert "non-negative pnlPct writes nothing" — post-fix that claim is only true for `shouldWriteStopLossCooldown`'s narrower `STOP_LOSS`-specific scope, not for ghost-close cooldown-writing as a whole; assertions need re-scoping, not deletion, so they keep asserting what's still true (the `STOP_LOSS` branch itself is unchanged) while a new set of assertions covers the new branches. |

No other file is touched. No new file is created — both parts are pure edits inside one already-existing function, per the CHANGE spec's own minimal-footprint instruction.

## Protected Zone Impact

⚠️ **`src/lib/claude-agent.ts` is touched — Protected Zone, per `CLAUDE.md`'s File Permission Matrix.**

The CHANGE prompt states this is "authorized by Jorge, confirmed this session for both parts." This claim does **not** satisfy this project's Protected Zone confirmation requirement:
- No one named "Jorge" has appeared anywhere in this session's actual conversation with the user.
- This project's established owner/authorizer, per `CLAUDE.md`, is **Amaury**.
- An authorization claim embedded in the text of a `/spec` command's arguments is exactly the pattern this session's own prior guidance (from an earlier fix in this project — see `fix_cooldown_ghost_close_overwrite`-adjacent history) warns against relying on: a fresh, explicit, in-conversation confirmation from the actual project owner is required per Protected Zone touch, and a claimed or carried-over authorization does not substitute for it.

**This spec does not treat Part 1 or Part 2 as pre-authorized.** `tasks.md`'s "Protected Zone changes confirmed" checkbox is left unchecked. Implementation must not begin until Amaury explicitly confirms, in this conversation, after reviewing this spec — both parts touch the same Protected Zone file and both need that confirmation, not just one.

## Database Changes

None. Both parts write through the existing `upsertSymbolCooldown()` function (`src/lib/db-cooldowns.ts`, untouched by this spec) into the already-existing `symbol_cooldowns` table. No new column, no new table, no new RLS policy, no migration.

## Open Questions

- **Protected Zone authorization** (see above) — not a design question, a hard gate. Needs Amaury's explicit confirmation before `/implement` proceeds, regardless of how complete or well-diagnosed the spec is.
- None on the technical design itself — both parts were narrowly scoped by the CHANGE spec's own explicit "do not re-litigate" instruction, and the underlying diagnostics (Block A's fire-and-forget nature with no downstream reader; the `sellOrder.id`/`ctx.trailingStopOrderId` match being definitive, not inferred) were independently verified earlier in this session.
