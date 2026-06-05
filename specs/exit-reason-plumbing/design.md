# Design — Exit Reason Plumbing (Fase 1a)

## Architecture Decision

This change lives entirely in the exit-rules layer of `src/lib/claude-agent.ts` and the shared types file `src/lib/types.ts`. `enforceExitRules()` already computes a human-readable `exitReason` string at each SELL branch; this spec attaches a typed `ExitReason` enum alongside it and widens the return envelope so callers can read it. No new data flows to the DB, no new API routes, no UI changes. The goal is infrastructure only — Fase 1b will consume the map to build the cooldown gate.

## Data Flow

```
enforceExitRules() called
  │
  ├─ exitReasons = new Map<string, ExitReason>()
  │
  ├─ for each position:
  │    ├─ compute exitReason (string | null)  ← existing logic, unchanged
  │    ├─ if (!exitReason) → continue         ← guard at line 252, unchanged
  │    ├─ closePosition()                     ← unchanged
  │    ├─ exitEntries.push(SELL entry)        ← unchanged
  │    ├─ [NEW] exitReasons.set(symbol, toExitReason(exitReason))
  │    │         → emits [EXIT_COOLDOWN] log
  │    └─ removeOpenPositionContext()         ← unchanged
  │
  └─ return { decisions: exitEntries, exitReasons: new Map(exitReasons) }
                                              ← snapshot, not the mutable ref

Caller (claude-agent.ts:842):
  const { decisions: exitRuleEntries } = await enforceExitRules(...)
  ...
  const decisions: AgentLogEntry[] = [...exitRuleEntries]   ← unchanged downstream

Caller (run-cycle.ts:38):
  const { decisions: _exitDecisions } = await enforceExitRules(...)
  (discarded — no downstream use)
```

## toExitReason() matching strategy

Based on STEP 0 findings. After `.trim().toUpperCase().replace(/[-\s]/g, '_')`:

```ts
function toExitReason(reason?: string | null): ExitReason {
  if (!reason?.trim()) {
    console.warn(`[EXIT_REASON_EMPTY] raw="${String(reason)}"`)
    return 'UNKNOWN'
  }
  const r = reason.trim().toUpperCase().replace(/[-\s]/g, '_')
  if (r.includes('PROFIT_TARGET'))    return 'PROFIT_TARGET'   // "PROFIT_TARGET_REACHED"
  if (r.includes('TIME_STOP'))        return 'TIME_STOP'        // "20_DAY_TIME_STOP"
  if (r.includes('FAIR_VALUE'))       return 'Z_SCORE_EXIT'     // "REVERTED_TO_FAIR_VALUE"
  if (r.includes('FELL_BELOW_EMA50')) return 'EMA_FAILURE'      // both EMA exit strings share this
  if (r.includes('TRAILING_STOP'))    return 'TRAILING_STOP'    // "TRAILING_STOP_TRIGGERED"
  console.warn(`[EXIT_REASON_UNMATCHED] raw="${reason}"`)
  return 'UNKNOWN'
}
```

`STOP_LOSS` is intentionally unreachable from `enforceExitRules()` strings — reserved for future GTC path.

Pattern safety: each pattern is a multi-token substring unique to its category. No single-token patterns (`EMA`, `PROFIT`, `STOP`) that could match across categories.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Typed enum + widened return (this spec) | Type-safe, zero logic change, caller-controlled | Requires 2 call-site updates | **Chosen** |
| Replace exitReason string with enum directly | Simpler typing, no mapping needed | Changes `reasoning` field in agent_log (DB impact) | Rejected — schema change |
| Store exitReason in a module-level variable | No return shape change | Not thread-safe; bleeds across concurrent calls | Rejected |
| Add exitReason as a new field on AgentLogEntry | Persists to DB automatically | DB migration required, schema change | Rejected — out of scope for Fase 1a |

## Impact on Existing Files

### Required changes

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/types.ts` | MODIFY | Add `ExitReason` union type and `EnforceExitResult` type (top-level exports) |
| `src/lib/claude-agent.ts` | MODIFY | (1) Change return type of `enforceExitRules()` to `Promise<EnforceExitResult>`; (2) add `exitReasons` map + `toExitReason()` helper; (3) populate after each SELL push; (4) update all return statements; (5) update IIFE at line 842 + catch branch |
| `src/lib/run-cycle.ts` | MODIFY | Destructure `decisions` from `enforceExitRules()` return |

### Not touched

| File | Reason |
|------|--------|
| `src/lib/db.ts` | No new DB writes |
| `src/lib/learning.ts` | Not involved |
| `src/lib/indicators.ts` | Not involved |
| All dashboard/API files | Not involved |

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` is a Protected Zone file. The changes are confined to:
- The return type declaration of `enforceExitRules()`
- Adding `exitReasons` map + `toExitReason()` helper inside it
- Adding `exitReasons.set()` calls after each existing `push()`, before each existing `removeOpenPositionContext()`
- Updating the IIFE call site destructuring
No exit conditions, thresholds, or control flow are modified.

Requires Amaury confirmation before implementation.

## Database Changes

None.

## Open Questions

None — all strings confirmed from STEP 0, matching strategy validated against actual templates.
