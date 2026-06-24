# Design — Fix MR Ranging ADX Gate Rejection Message

## Architecture Decision

This is a two-file, surgical fix. The root cause lives in `runAgentCycle()`'s catch-all `if (!setup_detected)` branch in `src/lib/claude-agent.ts` (Protected Zone): it builds one hardcoded `reasoning` string regardless of *why* `setup_detected` is false. The fix adds a sub-branch inside that block, reusing the existing `meanReversionSignal` / `mrRangingAdxGateOk` booleans already in scope (no new computation, no new gate). The secondary fix is in `src/components/dashboard/AgentReasoningLog.tsx` (not Protected Zone): an explicit regex branch in `detectKind()` so the new error prefix is classified as `GATE_BLOCKED` by design, not by accidental fallthrough into the existing generic `action === 'HOLD' && err.length > 0` rule.

## Data Flow

```
runAgentCycle() per-symbol loop
  ├─ meanReversionSignal = zScore <= effectiveThreshold        (unchanged)
  ├─ mrRangingAdxGateOk  = !(RANGING && validAdx && adx < 18)   (unchanged)
  ├─ meanReversionSetup  = meanReversionSignal && mrRangingAdxGateOk (unchanged)
  ├─ mrBlockedRangingAdxSymbols.add(symbol) if signal && !gateOk (unchanged, stats only)
  │
  └─ if (!setup_detected):
        ├─ NEW: mrGateBlocked = meanReversionSignal && !mrRangingAdxGateOk
        │
        ├─ if (mrGateBlocked):
        │     reasoning = "Mean reversion signal triggered (z-score X <= threshold Y)
        │                  but blocked by RANGING+low-ADX gate (ADX Z < 18)"
        │     error     = "MR_RANGING_ADX_GATE: z-score X met threshold Y, blocked —
        │                  regime=RANGING, ADX=Z < 18"
        │     decisions.push({ ..., error })
        │
        └─ else (genuine no-setup, UNCHANGED):
              reasoning = "Setup gate: no mean reversion setup (z-score X > threshold Y)
                           and no trend setup..."
              error     = undefined
              decisions.push({ ..., error: undefined })

appendAgentLogEntries(decisions) → insertAgentLogEntry() → agent_log table
  → /api/agent-log → AgentReasoningLog.tsx
       detectKind(entry):
         err = entry.error ?? ''
         ...
         NEW: if (/mr_ranging_adx_gate/i.test(err)) return 'GATE_BLOCKED'   ← explicit, before generic fallback
         ...
         (existing generic `action==='HOLD' && err.length>0` rule stays as a safety net for other untagged cases)
       → GateBlockedCard renders entry.error verbatim (unchanged component)
```

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Add sub-branch in claude-agent.ts + explicit regex in detectKind() | Minimal diff, reuses existing booleans, matches existing `TREND_QUALITY_FAIL`/`TREND_ZGT125` string-prefix convention, explicit not accidental | Two files touched (one Protected Zone) | **Chosen** |
| Add sub-branch in claude-agent.ts only, rely on generic `action==='HOLD' && err.length>0` fallthrough in detectKind() | One file touched (Protected Zone only) | Classification depends on an incidental fallback rule not written for this case — fragile if that rule is ever reordered/removed; less explicit/readable | Rejected — correctness should not depend on fallthrough order |
| Add structured `reasonType` enum field to `AgentDecision`/`AgentLogEntry` | Most "correct" long-term design | Requires types.ts + db.ts (new column or jsonb shape) + every UI consumer touched — far bigger blast radius than this bug warrants; not requested | Rejected — out of scope, YAGNI for a logging-text fix |
| Patch only the displayed string in AgentReasoningLog.tsx (leave claude-agent.ts untouched) | No Protected Zone change | The persisted `agent_log.reasoning`/`error` would still be wrong at the source — any other consumer (future API, reports) would inherit the bug | Rejected — root cause is in claude-agent.ts, must be fixed there |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY | Inside `if (!setup_detected)` (~line 1566-1579): add `mrGateBlocked` check and a dedicated `reasoning`/`error` for that sub-case; genuine no-setup path unchanged |
| `src/components/dashboard/AgentReasoningLog.tsx` | MODIFY | Add one explicit regex branch in `detectKind()` (~line 93) matching the new `MR_RANGING_ADX_GATE` error prefix → `GATE_BLOCKED` |
| `src/lib/__tests__/mr-ranging-adx-gate.test.ts` | NONE | Unchanged — only tests `signal`/`setup` booleans |
| New: `src/lib/__tests__/mr-gate-rejection-message.test.ts` | CREATE | Unit tests replicating the new message-construction branch inline (per project convention — signal-condition tests don't import from claude-agent.ts) |

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` — Protected Zone. Requires explicit confirmation from Amaury before implementation. Change is additive (new sub-branch) and does not alter `meanReversionSignal`, `mrRangingAdxGateOk`, `meanReversionSetup`, trade execution, or sizing.

## Database Changes

None. `agent_log.reasoning` and `agent_log.error` are existing `text` columns — no schema change, only different string content for one specific HOLD sub-case.

## Open Questions

None — the fix is fully determined by the diagnostic; no design decision requires Amaury's input beyond the standard Protected Zone confirmation.
