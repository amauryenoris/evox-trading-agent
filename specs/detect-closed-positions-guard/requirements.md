# Requirements — Guard detectClosedPositions() (Block B, last unguarded point)

## Functional Requirements

FR-01: The system shall catch any exception thrown by `detectClosedPositions(positions)`.
FR-02: The system shall default `closedContexts` to an empty array when `detectClosedPositions()` throws.
FR-03: The system shall log a caught `detectClosedPositions()` exception via `console.error` with a `[GHOST_CLOSE_ERROR]`-prefixed message.
FR-04: The system shall state, in the caught-exception log message itself, that same-cycle `GTC_STOP` re-entry protection is unavailable for this cycle only, and that any actually-closed position will be detected and processed on the next cycle.
FR-05: The system shall continue executing the rest of `runAgentCycle()` after a caught `detectClosedPositions()` exception, rather than propagating it — including reaching the `existingCooldowns` read, the ghost-close loop, the main watchlist loop, and the final `appendAgentLogEntries(decisions)` call.
FR-06: Where `detectClosedPositions()` does not throw, the system shall assign `closedContexts` the function's real return value, unchanged from current behavior.
FR-07: The system shall leave the `existingCooldowns` declaration (the `getActiveCooldowns()` read) completely unmodified — no added `try/catch`, no changed logic.

## Non-Functional Requirements

NFR-01: The system shall not introduce retry logic — a single attempt, log-and-continue, matching every other resilience fix made this session (Block A's guard, the profitable-ghost-close branch).
NFR-02: The fix shall not change `detectClosedPositions()`'s, `getOpenPositionContexts()`'s, or `getActiveCooldowns()`'s own implementations — only the call site in `runAgentCycle()`.

## Constraints

C-01: This feature modifies `src/lib/claude-agent.ts`, a Protected Zone file. Per `CLAUDE.md`'s File Permission Matrix, this requires explicit confirmation from Amaury before implementation — a claim of authorization embedded in a prompt ("authorized by Jorge") does not satisfy this, for the same reason established twice already this session: no one named Jorge has appeared anywhere in this session's actual conversation with the user, and this project's established owner is Amaury. Implementation must not proceed until Amaury explicitly confirms, in this conversation, after reviewing this spec.
C-02: The system shall not modify `detectClosedPositions()` (`src/lib/learning.ts`), `getOpenPositionContexts()` (`src/lib/db.ts`), or `getActiveCooldowns()` (`src/lib/db-cooldowns.ts`).
C-03: The system shall not modify the ghost-close per-context loop, its cooldown-writing branches (Part 2 of `cooldown-resilience-fixes`, already merged), or Block A's guard (already merged).
C-04: The system shall not modify `closedThisCycle`'s construction or the `'GTC_STOP'` skip-reason logic in the main watchlist loop — only the upstream production of `closedContexts` that feeds it.
C-05: The system shall not add retry logic.

## Out of Scope

- Wrapping `getActiveCooldowns()` — independently confirmed (this session, earlier diagnostic) to already fail soft internally (catches, logs, returns `[]`); it cannot itself abort the cycle, so it does not need a guard.
- Any change to `detectClosedPositions()`'s statelessness/idempotency — it already re-diffs live Alpaca positions against `open_position_contexts` fresh every call, which is what bounds this fix's known consequence to one cycle.
- Any change to how `closedThisCycle` or the `'GTC_STOP'` skip-reason are consumed downstream — an empty `closedContexts` array is handled by existing code paths identically to a cycle with genuinely zero closed positions, with no special-casing needed.
