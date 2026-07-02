# Requirements — Fix: Path 1 Zero-Fill Agent-Log Visibility (HIGH-01 follow-up)

## Context

This spec closes the one HIGH finding from the `fix-ioc-fill-verification` review:

> **HIGH-01**: FR-07 violated for Path 1. The `continue` at line 1841 exits the watchlist
> loop iteration before the agent_log entry construction at lines 1929-1953. Zero-fill events
> in Path 1 (the common buy path) produce no agent_log entry — the exact invisibility the
> spec was designed to eliminate. Path 2 already handles this correctly.

The parent fix is correct in every other respect: no phantom positions, no wrong quantities,
no silent stop failures. This spec solely addresses the missing log entry for zero-fills in
Path 1 (`fix-ioc-fill-verification` FR-07, Path 1 half) and the test that would have caught it.

Protected Zone: `src/lib/claude-agent.ts` — **already confirmed by Amaury this session**
as part of the parent `fix-ioc-fill-verification` spec.

## Functional Requirements

FR-01: When a limit IOC buy order in Path 1 (immediate execution, not the ranking path) fills zero shares, the system shall produce an agent_log entry for that symbol in that cycle.

FR-02: When a limit IOC buy order in Path 1 fills zero shares, the system shall set `orderExecuted = false` in that agent_log entry.

FR-03: When a limit IOC buy order in Path 1 fills zero shares, the system shall set the `error` field of that agent_log entry to a string containing `IOC_NOT_FILLED`.

FR-04: When a limit IOC buy order in Path 1 fills zero shares, the system shall set `decision.action = 'HOLD'` in that agent_log entry.

FR-05: When a limit IOC buy order in Path 1 fills a non-zero quantity (full or partial fill), the system shall behave identically to the already-approved `fix-ioc-fill-verification` implementation — no regression in FR-02 through FR-16 of that spec.

FR-06: When a limit IOC buy order in Path 2 (ranking path) fills zero shares, the system shall continue to behave as it does today — no change to Path 2's zero-fill handling.

## Non-Functional Requirements

NFR-01: After implementation, `npx tsc --noEmit` shall produce zero errors.

NFR-02: After implementation, `npm run build` shall complete successfully.

NFR-03: All 212 previously-passing tests shall continue to pass.

NFR-04: The change shall touch exactly one source file: `src/lib/claude-agent.ts`.

NFR-05: At least one new test shall assert FR-01 through FR-04 directly — confirming that a zero-fill in Path 1 produces a `decisions` entry with `orderExecuted: false` and `error` containing `IOC_NOT_FILLED`.

## Constraints

C-01: `src/lib/claude-agent.ts` is in the Protected Zone. **This change is authorized by the same Amaury confirmation that covered the parent `fix-ioc-fill-verification` spec** — no additional approval needed since the scope is a targeted bug fix within the already-approved Protected Zone touch.

C-02: The agent_log entry construction at lines 1929-1953 shall not be duplicated — the fix reuses the existing construction by restructuring control flow only.

C-03: Path 2's zero-fill handling shall not be modified.

C-04: No other file (`db.ts`, `learning.ts`, `alpaca.ts`, `types.ts`, etc.) shall be modified.

C-05: `submitStopWithRetry`, `IOC_NOT_FILLED`, `STOP_SUBMIT_FAILED`, and the stop price formula shall not change.

## Out of Scope

- Any change to Path 2's zero-fill handling (already correct per review).
- Any change to the approved FR-02 through FR-16 behavior of the parent fix.
- Any change to gate conditions, signal detection, or exit-rules logic.
- Data cleanup for existing phantom/partial-fill records (separate manual step).
