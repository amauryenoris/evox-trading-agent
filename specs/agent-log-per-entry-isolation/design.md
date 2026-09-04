# Design — Per-entry error isolation in appendAgentLogEntries()

## Architecture Decision

This fix lives entirely in `src/lib/agent-log.ts`, the thin persistence-orchestration layer between `runAgentCycle()` (in `claude-agent.ts`, which calls `appendAgentLogEntries(decisions)` once at the end of each cycle — `claude-agent.ts:2425`) and `insertAgentLogEntry()` (in `db.ts`, the single-row Supabase insert primitive). `appendAgentLogEntries()` is the only remaining call path that batches multiple `insertAgentLogEntry()` calls in a plain sequential loop without per-call error isolation; every other direct call site in `claude-agent.ts` already wraps its call in an immediate `.catch(err => console.error(...))`. This fix brings that same isolation idiom to the loop, changing nothing about which layer owns retries, timing, or persistence semantics.

## Data Flow

1. `runAgentCycle()` finishes evaluating all symbols for the cycle and builds `decisions: AgentLogEntry[]`.
2. `runAgentCycle()` calls `await appendAgentLogEntries(decisions)` once, at the end of the cycle (unchanged).
3. `appendAgentLogEntries()` iterates `entries` in order. For each entry:
   a. It calls `await insertAgentLogEntry(entry)` inside a `try`.
   b. On success, it increments a `succeeded` counter and continues to the next entry.
   c. On a thrown error, it increments a `failed` counter, logs `[AGENT_LOG_INSERT_FAILED]` with the entry's symbol/action/error, and continues to the next entry (the loop is no longer aborted).
4. After the loop, if `failed > 0`, it logs one `[AGENT_LOG_BATCH_PARTIAL]` summary line.
5. `appendAgentLogEntries()` returns (resolves) normally in all cases — `runAgentCycle()`'s `await` on line 2425 is unaffected by any individual insert failure.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Per-entry `try/catch` inside the existing loop (this spec) | Matches the isolation idiom already proven safe at 5 of 6 direct call sites in `claude-agent.ts`; minimal diff; no timing/architecture change | Does not address the separate "whole cycle lost on process crash" risk documented in `SDD.md` (Option 2) | **Chosen** |
| `Promise.allSettled()` over all entries (parallel inserts) | Also isolates failures; possibly faster | Changes insert ordering/concurrency against Supabase, a behavior change beyond the stated scope; not requested | Rejected |
| Immediate per-symbol write inside `runAgentCycle()`'s loop (Option 2) | Also fixes the "lost cycle on crash" risk | Explicitly deferred — a separate, more invasive decision requiring full pipeline tracing (per the incident history around the earlier Bug 2 dedup attempt) | Rejected (deferred) |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/agent-log.ts` | MODIFY | Replace `appendAgentLogEntries()`'s body (lines 8–12) with the per-entry try/catch + counters + `[AGENT_LOG_INSERT_FAILED]` / `[AGENT_LOG_BATCH_PARTIAL]` logging described above. `readAgentLog()` is untouched. |
| `src/lib/__tests__/agent-log.test.ts` | CREATE | New test file (none currently exists for this module) covering: all-succeed (no summary log), one-fails-others-still-attempted, function resolves without throwing on partial failure, log content includes symbol/action/error. |

## Protected Zone Impact

None — `src/lib/agent-log.ts` is not in the Protected Zone (`config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`, per `CLAUDE.md`). No confirmation gate applies to this change.

## Database Changes

None.

## Open Questions

None — the fix, its exact code, logging convention, and verification steps are fully specified in the originating FIX/PROMPT.
