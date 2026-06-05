# Design — Cooldown Gate Fase 1b (Same-Process Re-entry)

## Architecture Decision

This feature lives entirely inside `runAgentCycle()` in `src/lib/claude-agent.ts`.
It is a pure control-flow addition: one Set built from data already returned by
`enforceExitRules()`, and one guard check inserted into the existing BUY symbol
loop. No new abstractions, no new I/O, no new types.

---

## Prerequisite State (as-found in code)

The call site at line 872 currently reads:

```typescript
const { decisions: exitRuleEntries } = await (async () => {
  try {
    const openCtxs = await getAllOpenPositionContexts()
    return await enforceExitRules(positions, indicatorsCache, openCtxs, account)
  } catch (err) {
    console.error('[EXIT-RULES] enforceExitRules failed:', err)
    return { decisions: [] as AgentLogEntry[], exitReasons: new Map<string, ExitReason>() }
  }
})()
```

`enforceExitRules()` returns `EnforceExitResult { decisions, exitReasons }` (Fase 1a).
The IIFE propagates the full object but only `decisions` is destructured on the
outer binding — `exitReasons` is silently dropped. Fase 1b's T-01 adds `exitReasons`
to the outer destructuring.

---

## Data Flow

```
runAgentCycle()
  │
  ├─ 4e. enforceExitRules() ──► EnforceExitResult
  │       └─ exitReasons: Map<symbol, ExitReason>    ← captured by T-01
  │
  ├─ [T-02] COOLDOWN_UNKNOWN_EXIT_REASON = false     ← module-level constant
  │
  ├─ [T-03] build cooldownSymbols Set
  │     for each [symbol, reason] in exitReasons:
  │       UNKNOWN  → warn; add only if flag=true
  │       TIME_STOP → skip (thesis expired naturally)
  │       all others → add to Set + log [EXIT_COOLDOWN_ADD]
  │     log [EXIT_COOLDOWN_READY total=N]
  │
  ├─ 6. BUY symbol loop (for symbol of watchlist)
  │     ...
  │     [T-04] skipReason = GTC_STOP | exitReasons.get(symbol) | null
  │            if skipReason → log [AGENT] skip + continue
  │     ...
  │
  ├─ end of loop (line ~1609)
  │
  ├─ [T-05] log [EXIT_COOLDOWN_STATS active=... excluded=...]
  │
  └─ ranking phase / cycle completion
```

---

## Exact Placement in `claude-agent.ts`

| Change | Location | Anchor |
|--------|----------|--------|
| T-01 Call site fix | Line 872 | `const { decisions: exitRuleEntries } =` |
| T-02 Module constant | Near top module-level constants | After other `const` flags |
| T-03 cooldownSymbols block | After line 880 (IIFE closes), before line 977 (BUY loop) | After `closedThisCycle` Set at line 968 |
| T-04 Re-entry gate | Lines 988–991 | Replace `if (closedThisCycle.has(symbol))` block |
| T-05 Cycle stats | After line 1609 (loop `}`) | After existing TEMP stats at line 1612, before ranking phase at line 1614 |
| T-06 Known-limitation comments | Above cooldownSymbols block | NOTE 1 + NOTE 2 |

---

## Sequencing Comment (required, verbatim)

```typescript
// MUST run AFTER enforceExitRules() and BEFORE BUY symbol evaluation.
// Otherwise same-cycle re-entry protection breaks.
```

---

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Module-level Map (persists per process) | Survives multiple calls to `runAgentCycle()` in same process | Leaks state; breaks test isolation | Rejected |
| Function-scoped Set (current approach) | Clean per-cycle semantics; no state leak | Does not persist across GitHub Actions runs | **Chosen** |
| Supabase `symbol_cooldowns` table | Cross-run persistence | Requires DB migration + schema change; scope of Fase 2 | Rejected (deferred) |

---

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY | T-01 through T-06 — all changes within `runAgentCycle()` except the module-level constant |

---

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` — requires Amaury confirmation before implementation.

Scope of changes is additive only: no setup detection logic, no position sizing,
no exit rules, no `detectMarketRegime()` is touched.

---

## Database Changes

None.

---

## Open Questions

None — all design decisions are fully specified in the feature prompt.
