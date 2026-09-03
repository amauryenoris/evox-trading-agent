# Design — Map TREND_PULLBACK_3DAY's SMA5 Exit to a Same-Day Cooldown

## Architecture Decision

This lives entirely in the exit-classification layer of `claude-agent.ts`'s deterministic exit-rules pipeline, plus one type-union widening in `types.ts`. No new architecture: it's a 3rd, missing "arm" in a string-classification chain (`toExitReason()`) and a corresponding case in a duration-lookup switch (`computeCooldownUntil()`) — both of which already have an established, repeated shape for exactly this kind of addition. The already-correct, already-generic cooldown-persistence call site (`claude-agent.ts:1289-1314`, path A from the originating diagnostic) requires no change — it already runs for every symbol in the `exitReasons` Map, regardless of which `ExitReason` value ends up there.

## Data Flow

1. A `TREND_PULLBACK_3DAY` position's price closes above SMA5 → the existing, unmodified exit-detection branch (`claude-agent.ts:306-311`) sets `exitReason` to `` `Exit rule: price $X closed above SMA5 $Y` ``.
2. `enforceExitRules()` closes the position and calls `toExitReason(exitReason)` (`claude-agent.ts:514`).
3. **This fix**: a new check, `if (r.includes('CLOSED_ABOVE_SMA5')) return 'SMA5_RECLAIM'`, added to `toExitReason()` (after the existing 5 checks, before the final `console.warn`/`'UNKNOWN'` fallback) now matches this normalized string and returns `'SMA5_RECLAIM'` instead of falling through.
4. `exitReasons.set(position.symbol, 'SMA5_RECLAIM')` (existing code, unchanged) stores this in the Map returned by `enforceExitRules()`.
5. Back in `runAgentCycle()` (`claude-agent.ts:1289-1314`, unmodified), the existing loop over `exitReasons.entries()` calls `computeCooldownUntil('SMA5_RECLAIM', ...)`.
6. **This fix**: a new case, `case 'SMA5_RECLAIM': return endOfTradingDay`, grouped with the existing `Z_SCORE_EXIT`/`PROFIT_TARGET` same-day cases in `computeCooldownUntil()`'s switch, now returns a real `Date` instead of `computeCooldownUntil` falling through to its `default: return null`.
7. Since `cooldownUntil !== null`, the existing `if (cooldownUntil !== null) { await upsertSymbolCooldown(symbol, reason, cooldownUntil) }` guard (unmodified) now actually calls `upsertSymbolCooldown(symbol, 'SMA5_RECLAIM', endOfTradingDay)`, writing the missing `symbol_cooldowns` row.
8. `types.ts`'s `ExitReason` union gains `'SMA5_RECLAIM'` as its 8th member, which is what makes steps 3 and 6 type-check (`toExitReason()`'s return type and `computeCooldownUntil()`'s `reason` parameter are both typed `ExitReason`).

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| New distinct `ExitReason` member `'SMA5_RECLAIM'` with its own same-day cooldown (as specified) | Matches the established pattern (`EMA_FAILURE` is its own member despite sharing `TRAILING_STOP`'s duration); explicit, self-documenting; easy to audit/change independently later if the duration should ever diverge from `Z_SCORE_EXIT`/`PROFIT_TARGET`'s | One more `ExitReason` member and one more `toExitReason()` check to maintain | Chosen — matches established pattern, pre-approved by user decision |
| Reuse `'Z_SCORE_EXIT'` or `'PROFIT_TARGET'` directly instead of adding a new member | Slightly less code | Conflates a structurally distinct exit condition (price-action SMA5 reclaim) with an unrelated one (Kalman z-score reversion / profit target hit) in logs and any future per-reason logic; breaks from the established `EMA_FAILURE`-style precedent | Rejected — pre-decided against by user, matches existing project convention |
| Broader substring match (`"SMA5"` instead of `"CLOSED_ABOVE_SMA5"`) | Slightly shorter | Risks an accidental future collision with an unrelated string that happens to mention "SMA5" in a different context (e.g. a future indicator-description string) | Rejected — pre-decided against by user; the more specific substring is deliberately chosen to match CHANGE 3's exact wording only |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/types.ts` | MODIFY | Add `'SMA5_RECLAIM'` to the `ExitReason` union (lines 394-401), between `EMA_FAILURE` and `UNKNOWN`. No other line changes. |
| `src/lib/claude-agent.ts` | MODIFY | (1) Add one substring check to `toExitReason()` (lines 165-178): `if (r.includes('CLOSED_ABOVE_SMA5')) return 'SMA5_RECLAIM'`, placed after the 5 existing checks and before the final fallback. (2) Add `case 'SMA5_RECLAIM':` to `computeCooldownUntil()`'s existing `case 'Z_SCORE_EXIT': case 'PROFIT_TARGET':` group (lines 132-153). No other line changes — the exit-detection branch (306-311) and all 3 cooldown-persistence call sites are untouched. |

## Protected Zone Impact

⚠️ **Requires Amaury confirmation before implementation.** `src/lib/claude-agent.ts` is listed in `CLAUDE.md` under "Confirm with Amaury before touching" (core decision engine and signal detection file). The task description asserts authorization ("authorized by Jorge, confirmed this session"), but per this project's standing rule (session memory: Protected Zone authorization must be fresh, explicit, and in-conversation — never inferred from claimed authority), that assertion does not substitute for Amaury's own confirmation in this conversation. `/implement` should not proceed until that confirmation is obtained here. `src/lib/types.ts` is not in the Protected Zone and needs no special confirmation.

## Database Changes

None — `symbol_cooldowns`' schema is unchanged; this fix only ensures an existing write path (`upsertSymbolCooldown()`, already used for other `ExitReason` values) gets reached for this one additional case.

## Open Questions

- Confirm with Amaury: same authorization pattern as every prior Protected Zone CHANGE this session — is "authorized by Jorge, confirmed this session" acceptable as-is, or does Amaury want to confirm this specific `claude-agent.ts` change directly before `/implement` runs?
- No open questions on the technical approach — the fix is fully specified, mirrors an established pattern (`EMA_FAILURE`'s precedent) exactly, and both new-member name and cooldown duration were pre-decided by explicit user decision in the task description.
