# Requirements — Cooldown Resilience Fixes (Block A guard + profitable ghost-close branch)

## Functional Requirements

### Part 1 — Block A guard

FR-01: The system shall catch any exception thrown while writing persistent cooldowns from `exitReasons` (the existing `if (cooldownDates !== null) { ... Promise.all ... } else { ... }` block).
FR-02: The system shall log a caught Block A exception via `console.error` with a `[COOLDOWN_PERSIST_ERROR]`-prefixed message.
FR-03: The system shall continue executing the rest of `runAgentCycle()` after a caught Block A exception, rather than propagating it.
FR-04: Where no exception occurs, the system shall preserve Block A's existing behavior byte-for-byte (both the `cooldownDates !== null` success path and the `else` "dates unavailable" path).

### Part 2 — Profitable ghost-close cooldown branch

FR-05: The system shall write a persistent cooldown for a ghost-closed position when `pnlPct >= 0`, `cooldownDates !== null`, and the symbol has no existing active cooldown.
FR-06: Where the closing order's id (`sellOrder.id`) matches the position context's trailing-stop order id (`ctx.trailingStopOrderId`), both non-null, the system shall persist the cooldown with reason `'TRAILING_STOP'` and duration `cooldownDates.nextTradingDay1`.
FR-07: Where the closing order's id does not match the trailing-stop order id (including when either is null/undefined), the system shall persist the cooldown with reason `'GHOST_CLOSE_PROFIT'` and duration `cooldownDates.endOfTradingDay`.
FR-08: The system shall log every profitable-ghost-close cooldown write with a `[COOLDOWN_PERSIST]`-prefixed message including symbol, reason, expiry, source, and whether the trailing-stop match was confirmed.
FR-09: Where `pnlPct >= 0`, `cooldownDates !== null`, and the symbol already has an existing active cooldown, the system shall log a `[COOLDOWN_SKIP]`-prefixed message and shall not write a cooldown.
FR-10: The system shall leave the existing `pnlPct < 0` branches (lines 1396-1410) unmodified — same condition, same `'STOP_LOSS'` reason, same `nextTradingDay3` duration, same log messages.

## Non-Functional Requirements

NFR-01: Neither part shall introduce retry logic — a caught failure is logged once and the cycle continues (log-and-continue, matching the existing agent_log per-entry isolation fix's established pattern).
NFR-02: Part 2's trailing-stop-fill detection shall use data already available at the point of the decision (`sellOrder`, fetched at the existing line 1347, and `ctx`, already in loop scope) — no new Alpaca or Supabase fetch.

## Constraints

C-01: This feature modifies `src/lib/claude-agent.ts`, a Protected Zone file. Per `CLAUDE.md`'s File Permission Matrix, this requires explicit confirmation from Amaury before implementation — a claim of authorization embedded in a prompt ("authorized by Jorge") does not satisfy this; no one named Jorge has appeared anywhere in this session, and this project's established owner is Amaury. Implementation must not proceed until Amaury explicitly confirms, in this conversation, after reviewing this spec.
C-02: The system shall not modify `ExitReason` (`src/lib/types.ts`) or `computeCooldownUntil()` — both parts use the plain-string / direct-Date convention already established in this exact block (the existing `'STOP_LOSS'` literal is precedent for a plain string not constrained to the `ExitReason` union).
C-03: The system shall not modify `enforceExitRules()`, `sellOrder`'s fetch at line 1347, or any other part of the ghost-close loop beyond Part 2's two new `else if` branches.
C-04: The system shall not modify `detectClosedPositions()` (line 1335) or the `existingCooldowns` setup (lines 1339-1340) — both remain a separate, explicitly deferred follow-up.
C-05: The system shall not add retry logic to either part.
C-06: The system shall not modify the two existing `pnlPct < 0` branches (lines 1396-1410) in any way.

## Out of Scope

- `detectClosedPositions()`'s own unguarded call and the `existingCooldowns` Supabase read (Block B's other two unguarded points) — confirmed separately, deferred.
- Any change to `ExitReason`'s type union to formally include `'GHOST_CLOSE_PROFIT'`.
- Any change to `enforceExitRules()`'s own (separately wrapped) exit-detection logic.
- Retry/backoff logic for `upsertSymbolCooldown()` failures.
- Any UI/dashboard change (no dashboard component reads `symbol_cooldowns` update timing directly beyond what already exists).
