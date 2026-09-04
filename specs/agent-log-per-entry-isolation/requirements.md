# Requirements — Per-entry error isolation in appendAgentLogEntries()

## Functional Requirements

FR-01: The system shall attempt to insert every entry in the array passed to `appendAgentLogEntries()`, regardless of whether an earlier entry in the same call failed to insert.

FR-02: The system shall log a per-entry diagnostic message when an individual entry's insert fails, including that entry's symbol, decision action, the underlying error message, and — when the action is `SELL` — the entry's reasoning text.

FR-03: The system shall resolve `appendAgentLogEntries()` normally (not reject) when one or more entries in the batch fail to insert.

FR-04: Where one or more entries failed in a given `appendAgentLogEntries()` call, the system shall log a single batch-summary diagnostic stating the count of succeeded and failed entries out of the total.

FR-05: The system shall not log a batch-summary diagnostic when every entry in the batch inserts successfully.

## Non-Functional Requirements

NFR-01: The system shall preserve `appendAgentLogEntries()`'s existing signature (`(entries: AgentLogEntry[]) => Promise<void>`) so no caller requires modification.

NFR-02: The system shall format diagnostic log lines using this project's existing bracketed-tag convention (e.g. `[EXIT-RULES]`, `[COOLDOWN_PERSIST]`), introducing the tags `[AGENT_LOG_INSERT_FAILED]` and `[AGENT_LOG_BATCH_PARTIAL]`.

## Constraints

C-01: This feature must not modify the Protected Zone (`config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`) without explicit confirmation from Amaury.

C-02: This feature shall modify only `src/lib/agent-log.ts`. No other source file (including `db.ts`) may be changed.

C-03: `insertAgentLogEntry()` in `db.ts` shall continue to throw on a Supabase insert error — this feature isolates failures at the caller, not by changing that function's error behavior.

C-04: This feature shall not add retry logic, a dead-letter queue, or any persistence of failed entries beyond console logging.

C-05: This feature shall not change when entries are queued or written (no immediate-write refactor, no dedup logic) — that is a separate, explicitly deferred decision (Option 2).

## Out of Scope

- The cooldown-persistence `Promise.all` and the two unguarded closed-position calls in `claude-agent.ts` (~lines 1291–1326) remain unwrapped and are tracked as a separate, future fix.
- Changing the timing/architecture of when `runAgentCycle()` queues and writes exit/entry decisions (the "lost cycle on mid-loop crash" risk documented in `SDD.md`) — this is Option 2, a distinct future decision.
- Retry logic or a dead-letter queue for failed inserts.
- Any change to `insertAgentLogEntry()` or other `db.ts` functions.
- New or modified tests for `claude-agent.ts` or `db.ts`.
