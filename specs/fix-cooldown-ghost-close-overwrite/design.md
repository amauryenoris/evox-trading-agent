# Design — Don't Overwrite an Existing Active Cooldown From the Ghost-Close STOP_LOSS Path

## Architecture Decision

Single-file change, entirely within `src/lib/claude-agent.ts` (Protected Zone, explicitly
authorized), in the same function (`runAgentCycle()`) and same region as the just-merged
`fix-cooldown-stop-loss-ghost-close` fix. One new hoisted query plus one added condition on the
existing ghost-close cooldown-write `if` block. No new files, no schema changes, no new RPC —
reuses `getActiveCooldowns()` exactly as it already exists in `db-cooldowns.ts`.

## Data Flow

1. `runAgentCycle()` reaches the point just before the `for (const ctx of closedContexts)`
   ghost-close loop (currently `claude-agent.ts:1066`) — the same point where `cooldownDates` is
   already available (hoisted by the prior fix).
2. A new call, `const existingCooldowns = await getActiveCooldowns()`, runs once here. Its result
   (`Array<{ symbol, exit_reason, cooldown_until }>`) is reduced into an in-memory `Map<string,
   string>` (symbol → exit_reason), mirroring the existing `cooldownReasons` Map pattern used
   later in the same function for the entry-time gate.
3. Inside the loop, at the existing write site (currently `claude-agent.ts:1125`), the condition
   gains one more check: `!existingCooldowns.has(ctx.symbol)` (Map lookup, consistent with the
   `Map`-based style already used for `cooldownReasons`/`exitReasons` elsewhere in this function).
4. If the symbol is present in the lookup, the write is skipped and a `[COOLDOWN_SKIP]` line is
   logged instead of `[COOLDOWN_PERSIST]`, naming the symbol and
   `reason=already_has_active_cooldown source=ghost_close`.
5. If absent, behavior is unchanged from the just-merged fix: `upsertSymbolCooldown(ctx.symbol,
   'STOP_LOSS', cooldownDates.nextTradingDay3)` runs and `[COOLDOWN_PERSIST]` is logged as before.
6. Later in the same cycle, the existing `persistentCooldowns` call (`claude-agent.ts:1200`) and
   the entry-time gate run exactly as today — untouched, and now never see a `STOP_LOSS` cooldown
   that clobbered a genuinely earlier, correct exit-reason cooldown from the same cycle.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Reuse the existing `persistentCooldowns` call (`claude-agent.ts:1200`) instead of adding a new call | No new query | That call runs *after* the ghost-close loop closes (line 1137) — its result does not exist yet at the write site; would require reordering a call that serves an unrelated, later purpose (gate setup) | Rejected |
| Add a new, separate `getActiveCooldowns()` call, hoisted immediately before the `closedContexts` loop | Matches the existing "hoist once, reuse in-memory" pattern already established for `cooldownDates`; single extra query per cycle, independent of `closedContexts` size; keeps the two call sites' purposes (overwrite-prevention vs. gate setup) distinct as required by C-04 | One additional DB round-trip per cycle (already true of the existing `persistentCooldowns` call — same cost class) | **Chosen** |
| Check for an existing cooldown with a query scoped to just `ctx.symbol`, inside the loop, per closed position | Slightly cheaper query per call if `closedContexts` is empty | Re-introduces N+1 query risk called out as unacceptable in the originating request ("must not go inside the loop"); `closedContexts` is typically 0-1 so the saved cost is negligible while the correctness/style cost (deviating from the hoist pattern) is real | Rejected |
| Extend `enforceStopLosses()`'s own STOP_LOSS write with the same check | Symmetric coverage | No confirmed overwrite risk exists there (out of scope per requirements); would widen this fix beyond its diagnosed scope | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY | Add one hoisted `getActiveCooldowns()` call (with an in-memory Map built from its result) before the `closedContexts` loop; add one `!existingCooldowns.has(ctx.symbol)` check to the existing ghost-close `STOP_LOSS` write condition; add a `[COOLDOWN_SKIP]` log line on the skip branch. |
| `src/lib/__tests__/cooldown-stop-loss-ghost-close.test.ts` | MODIFY (additive only) | New test cases covering the skip-when-existing-cooldown and write-when-none behaviors, plus a call-count assertion for the new hoisted call. No existing assertion changes. |

## Protected Zone Impact

⚠️ `claude-agent.ts` **is** modified — explicitly authorized by Amaury in the request that
generated this spec, as the same fix family as the just-merged `fix-cooldown-stop-loss-ghost-close`
spec. No other Protected Zone file (`config.ts`, `risk-manager.ts`, `indicators.ts`) is touched.

## Database Changes

None — reuses the existing `symbol_cooldowns` table and `getActiveCooldowns()` function exactly
as they exist today in `db-cooldowns.ts`. No migration, no new RPC.

## Open Questions

None blocking. Exact naming of the new lookup variable (`existingCooldowns` vs. an alternative) is
an implementation detail with no behavioral ambiguity, left to the implementation step — the spec
requires a Map- or Set-based `.has()` lookup keyed by symbol, consistent with this function's
existing style.
