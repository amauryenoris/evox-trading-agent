# Design — Fix: Path 1 Zero-Fill Agent-Log Visibility

## Architecture Decision

Single targeted restructure inside `runAgentCycle()` in `src/lib/claude-agent.ts`. The `continue` statement at the end of the zero-fill guard is removed; the entire "filledQty > 0" execution block (lines ~1844-1912 today) is wrapped in an `else` clause, so that on zero-fill the flow falls through to the existing `indicatorsWithLearning` / `AgentLogEntry` construction at lines ~1929-1953. No new code, no duplicated logic, no new functions.

## Current vs. Fixed Control Flow

**Current (broken):**
```
if (filledQty === 0) {
  error = IOC_NOT_FILLED
  decision.action = 'HOLD'
  continue              ← exits loop, entry construction SKIPPED
}
// filledQty > 0 inline:
orderId = order.id
orderExecuted = true
...
```

**Fixed:**
```
if (filledQty === 0) {
  error = IOC_NOT_FILLED
  decision.action = 'HOLD'
  // NO continue — falls through to entry construction below
} else {
  // filledQty > 0 block:
  orderId = order.id
  orderExecuted = true
  ...
}
// entry construction always reached:
const indicatorsWithLearning = { ... }
const entry: AgentLogEntry = { ..., orderExecuted, error }
decisions.push(entry)
```

On zero-fill: `orderExecuted` stays `false`, `error = IOC_NOT_FILLED`, `decision.action = 'HOLD'` — all set in the guard. The entry construction picks them up exactly as-is, producing the correct agent_log entry.

On filled (full or partial): unchanged — same `else` block runs exactly as the parent fix already implements.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Replace `continue` with `else` (this design) | Zero duplication; reuses existing entry construction; mirrors Path 2's structure exactly | Increases nesting depth by one level for the filledQty > 0 block | **Chosen** |
| Duplicate the entry construction inside the `if (filledQty === 0)` block | Minimal restructure | Violates C-02 (no duplication); two entry constructions to maintain in sync | Rejected |
| Extract a helper that the guard calls before `continue` | Could be independently testable | More invasive than necessary for a one-line fix; creates a new function for a flow-control problem | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY | Remove `continue` from Path 1 zero-fill guard; wrap filledQty > 0 block in `else` |
| `src/lib/__tests__/ioc-fill-verification.test.ts` | MODIFY | Add 1 new test asserting Path 1 zero-fill produces a `decisions` entry with `orderExecuted:false` and `error` containing `IOC_NOT_FILLED` |

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` is in the Protected Zone. **Authorization already granted** by the parent `fix-ioc-fill-verification` spec's Amaury confirmation this session — this follow-up closes a bug within that same approved scope.

## Database Changes

None.

## Open Questions

None — the fix and test are fully specified. The restructure is deterministic.
