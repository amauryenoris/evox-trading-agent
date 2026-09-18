# Design — Guard detectClosedPositions() (Block B, last unguarded point)

## Architecture Decision

This is the third and final part of this session's cooldown-resilience work inside `runAgentCycle()` (`src/lib/claude-agent.ts`, Protected Zone). Block A (the cooldown-persistence `Promise.all`) and the profitable-ghost-close branches are already merged (`cebb212`). This closes the one remaining unguarded call in the same region: `detectClosedPositions(positions)` at line 1339, which — unlike `getActiveCooldowns()` right below it — can actually throw and abort the rest of the cycle, because it delegates to `getOpenPositionContexts()` (`src/lib/db.ts:199-204`), which does `if (error) throw new Error(...)` on any Supabase read failure.

## Data Flow

1. `detectClosedPositions(positions)` is called inside a `try`.
2. On success: `closedContexts` receives the real array (diff of `open_position_contexts` against live Alpaca `positions`) — identical to current behavior.
3. On failure: the `catch` logs a `[GHOST_CLOSE_ERROR]`-prefixed message that explicitly names the consequence (same-cycle `GTC_STOP` protection unavailable this cycle; self-healing next cycle since `detectClosedPositions()` re-diffs fresh every call) and `closedContexts` stays at its `[]` default.
4. Execution continues unconditionally to `existingCooldowns` (untouched), the ghost-close `for` loop (which simply iterates zero times over `[]` — no special-casing needed, identical to a cycle with genuinely zero closed positions), `closedThisCycle` (built from `closedContexts.map(...)`, correctly becomes an empty `Set`), the main watchlist loop, and the final `appendAgentLogEntries(decisions)` call.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Wrap both `detectClosedPositions()` and `getActiveCooldowns()` in one shared `try/catch` | Slightly fewer lines | `getActiveCooldowns()` is independently confirmed to never throw (it swallows Supabase errors internally) — wrapping it adds a false impression of shared risk and obscures which call is actually the fragile one | Rejected — guard only `detectClosedPositions()`, leave `existingCooldowns` untouched, per explicit spec instruction |
| Silent catch (log a generic message, no consequence explanation) | Simpler message | Loses the "honest degradation" property this session's fixes have consistently aimed for — a bare `console.error` doesn't tell an on-call reader (or a future Claude session reading logs) what protection was actually lost and why it's bounded to one cycle | Rejected — the log message must name the consequence and the self-healing property explicitly |
| Retry `detectClosedPositions()` once before giving up | Might survive a transient blip | Explicitly out of scope (C-05, NFR-01); every other resilience fix this session used log-and-continue, not retry, for consistency | Rejected |
| Default `closedContexts` to `undefined` and add null-checks at each downstream use site | — | Requires touching `closedThisCycle`'s construction and the ghost-close loop's `for...of`, both explicitly out of scope (C-03, C-04); an empty array needs zero downstream changes since `[].map()` and `for (const x of [])` are already safe | Rejected — default to `[]`, not `undefined` |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY | Line 1339's `const closedContexts = await detectClosedPositions(positions)` becomes a `let closedContexts: OpenPositionContext[] = []` declaration followed by a `try { closedContexts = await detectClosedPositions(positions) } catch (err) { console.error(...) }` block. `existingCooldowns` (lines 1343-1345) stays byte-for-byte identical. No other line changes. |
| `src/lib/__tests__/cooldown-stop-loss-ghost-close.test.ts` | MODIFY | Add a replicated-logic test for the new catch-and-default-to-`[]` behavior, per this session's established convention (mirrors how Block A's and the profitable-ghost-close branch's tests were added in the immediately preceding change). |

No new file. `OpenPositionContext` is already imported in `claude-agent.ts` (line 55) — no new import needed.

## Protected Zone Impact

⚠️ **`src/lib/claude-agent.ts` is touched — Protected Zone, per `CLAUDE.md`'s File Permission Matrix.**

Same situation as the two prior fixes in this session: the prompt states this is "authorized by Jorge, confirmed this session for this fix." This does not satisfy the project's requirement. No one named Jorge has appeared anywhere in this session's actual conversation with the user; the established project owner is Amaury. This spec does not treat the change as pre-authorized — `tasks.md`'s Protected Zone checkbox is left unchecked, and implementation must not begin until Amaury explicitly confirms in this conversation.

## Database Changes

None. No new query, no new table, no migration — this is purely control-flow (`try/catch`) around an existing function call.

## Open Questions

- **Protected Zone authorization** — hard gate, not a design question. Needs Amaury's explicit in-conversation confirmation before `/implement`.
- None on the technical design — this is the narrowest possible change (one call site wrapped, one default value, one log message), and the underlying diagnostic (which call can throw, which can't, and what genuinely depends on `closedContexts`) was independently verified earlier in this session and re-confirmed live just now (file unchanged since commit `cebb212`, 2026-09-16; lines 1339 and 1343-1345 match the spec's citations exactly).
