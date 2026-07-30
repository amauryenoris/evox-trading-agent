# Design — Revert Immediate agent_log Insert Added by Bug 2 Fix

## Architecture Decision

This is a straight revert of a single, well-isolated hunk inside `enforceExitRules()` in `src/lib/claude-agent.ts` — the exact inverse of the Bug 2 commit (`74214c3`). No new logic, no new files, no new state. The pre-existing end-of-cycle batch write (`appendAgentLogEntries(decisions)`, [claude-agent.ts:2178](src/lib/claude-agent.ts#L2178), which predates Bug 2 and was not touched by it) resumes being the sole path by which deterministic-exit SELL rows reach `agent_log`, exactly as it behaved before Bug 2 shipped.

## Data Flow

```
Before this revert (current, post-Bug-2 state):
  enforceExitRules() deterministic exit
    ├─ evaluateClosedTrade()               → trade_evaluations (unconditional, inline)
    ├─ insertAgentLogEntry() [Bug 2]       → agent_log row #1 (immediate)
    └─ removeOpenPositionContext()
  ...cycle continues, decisions array still holds the original exitEntries.push() object...
  runAgentCycle() end
    └─ appendAgentLogEntries(decisions)    → agent_log row #2 (same exit, batched) — DUPLICATE

After this revert:
  enforceExitRules() deterministic exit
    ├─ evaluateClosedTrade()               → trade_evaluations (unconditional, inline)
    └─ removeOpenPositionContext()
  ...decisions array holds the exitEntries.push() object, untouched...
  runAgentCycle() end
    └─ appendAgentLogEntries(decisions)    → agent_log row (single, batched) — matches pre-Bug-2 behavior

  Known, re-accepted limitation: if the process crashes/times out between the
  exit and this final call, the row is lost. Pre-existing since before Bug 2;
  not addressed by this revert (see requirements.md C-04, Out of Scope).
```

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Remove the Bug 2 block entirely, restore pre-Bug-2 state exactly (this spec) | Simplest, lowest-risk; matches a well-understood prior state; zero new surface area | Re-accepts the narrower crash-mid-cycle gap | **Chosen** — matches the explicit goal of an "urgent revert," not a redesign |
| Keep the Bug 2 immediate insert, add deduplication logic instead (e.g. skip the batch-write entry if an immediate one already exists for that symbol/timestamp) | Would get "resilient to crash" + "no duplicate" in one pass | Explicitly forbidden by scope (C-04); non-trivial (matching an in-memory `decisions` entry against a DB row requires new logic, e.g. a lookup or a shared ID) — real design work, not a same-day revert | Rejected — scope creep into an urgent revert, per the prompt's own stated learning objective |
| Keep the Bug 2 immediate insert, remove the `exitEntries.push()` seeding into `decisions` instead (so the batch write no longer double-counts exits) | Also solves the duplicate | Touches the pre-existing, Bug-2-unrelated `exitEntries.push()` / `decisions` flow that also feeds non-exit decision types; broader blast radius; explicitly forbidden (FR-03, C-04) | Rejected |

## Impact on Existing Files

### Required changes

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY | Remove the 30-line block added by commit `74214c3` (the `insertAgentLogEntry(...)` call + `.catch()` + its two spacer blank lines) from inside `enforceExitRules()`. No other change. |

### Not touched

| File | Reason |
|------|--------|
| `src/lib/agent-log.ts` | Forbidden by scope (C-03); not part of Bug 2's diff |
| `scripts/run-cycle.ts`, `src/lib/run-cycle.ts`, `src/app/api/cron/run/route.ts` | Forbidden by scope (C-02); not part of Bug 2's diff |
| `src/lib/db.ts`, `risk-manager.ts`, `indicators.ts`, `learning.ts` | Forbidden by scope (C-02) |
| `src/components/dashboard/AgentReasoningLog.tsx` | Not affected either way — it already renders whatever rows exist in `agent_log` regardless of which write path produced them (confirmed during the Bug 2 spec's own research) |

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` is a Protected Zone file. Authorization for this specific bug/revert is already in effect for this session, carried forward from the Bug 2 diagnostic and fix. The change is confined to deleting the exact block Bug 2 added — no other line is touched.

## Database Changes

None.

## Open Questions

None. This is a mechanical, fully-specified revert of a single, recently-committed, well-isolated hunk with no ambiguity about what to remove or what must remain.
