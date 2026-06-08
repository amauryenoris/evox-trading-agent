# Design — Fase 2b-C: Merge Persistent Cooldowns + Cleanup

## STEP 0 — Pre-implementation snapshot (read-only)

### cooldownSymbols build block (claude-agent.ts lines 1047–1074)

```
1047:  // NOTE 1: cooldownSymbols is in-memory only.
1048:  // GitHub Actions creates a new process per run — cooldown does not
1049:  // persist between runs. Cross-run re-entry is NOT solved by this fix.
1050:  // Fase 2: Supabase symbol_cooldowns table with per-reason durations.
1051:
1052:  // NOTE 2: Cooldown activates on SELL decision generation, not broker
1053:  // execution confirmation. A rejected Alpaca SELL may still create
1054:  // cooldown state.
1055:  const cooldownSymbols = new Set<string>()
1056:
1057:  for (const [symbol, reason] of exitReasons.entries()) {
1058:    if (reason === 'UNKNOWN') {
1059:      console.warn(`[EXIT_COOLDOWN_UNKNOWN_REASON] symbol=${symbol}`)
1060:      if (COOLDOWN_UNKNOWN_EXIT_REASON) {
1061:        cooldownSymbols.add(symbol)
1062:        console.log(`[EXIT_COOLDOWN_ADD] symbol=${symbol} reason=UNKNOWN`)
1063:      }
1064:      continue
1065:    }
1066:    if (reason !== 'TIME_STOP') {
1067:      cooldownSymbols.add(symbol)
1068:      console.log(`[EXIT_COOLDOWN_ADD] symbol=${symbol} reason=${reason}`)
1069:    }
1070:  }
1071:  // TIME_STOP → no cooldown (thesis expired naturally)
1072:  // UNKNOWN → warn; cooldown only if COOLDOWN_UNKNOWN_EXIT_REASON=true
1073:
1074:  console.log(`[EXIT_COOLDOWN_READY] total=${cooldownSymbols.size}`)
```

Line 1074 is the `[EXIT_COOLDOWN_READY]` log that CHANGE 2 replaces in-place.

### db-cooldowns.ts exports confirmed

`getActiveCooldowns` — exported ✅ (line 26)
`cleanExpiredCooldowns` — exported ✅ (line 46)

Current import in claude-agent.ts (line 40):
```ts
import { upsertSymbolCooldown } from './db-cooldowns'
```
Must be extended to include the two new functions.

---

## Architecture Decision

This feature lives entirely within `src/lib/claude-agent.ts` — the agent's main cycle
function. No new files, no schema changes, no API routes.

The merge sits at the boundary between exit processing and entry evaluation: after
`enforceExitRules()` populates `exitReasons` and the in-memory build loop populates
`cooldownSymbols`, but before the watchlist `for` loop begins.

The cleanup sits after all evaluation (after `[EXIT_COOLDOWN_STATS]`) so expired rows
are pruned once per cycle without blocking the critical path.

---

## Data Flow

```
enforceExitRules()
  └─ exitReasons Map populated

in-memory build loop (Fase 1b, unchanged)
  └─ cooldownSymbols.add() for non-TIME_STOP reasons

[CHANGE 1 + 2 insertion point — line 1073/1074]
  inMemoryCooldownCount = cooldownSymbols.size      ← snapshot before merge
  restoredCount = 0
  persistentCooldowns = await getActiveCooldowns()  ← DB read (Supabase)
  for each row:
    if already in cooldownSymbols → [COOLDOWN_RESTORE_SKIP]
    else → cooldownSymbols.add(), restoredCount++, [COOLDOWN_RESTORE]
  [EXIT_COOLDOWN_READY] inMemory=N persistent=M restored=R total=T

watchlist for loop (entry evaluation, unchanged)
  cooldownSymbols.has(symbol) → skip BUY

[EXIT_COOLDOWN_STATS] log (unchanged, line 1790–1795)

[CHANGE 3 insertion point — after line 1795]
  try { await cleanExpiredCooldowns() }
  catch { console.error('[COOLDOWN_CLEAN_FATAL]', err) }

ranking phase → appendAgentLogEntries → return
```

---

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Merge before in-memory loop | Single pass | Changes Fase 1b loop — violates C-01 | Rejected |
| Merge after [EXIT_COOLDOWN_READY] (current design) | Clean separation of layers; in-memory wins on conflict | Extra await before hot path | **Chosen** |
| Lazy merge per symbol (inside watchlist loop) | One DB call only when needed | Multiple awaits in hot path; harder to log totals | Rejected |
| Merge + clean in same try/catch | Fewer blocks | `cleanExpiredCooldowns` failure would suppress merge log | Rejected |

---

## Impact on Existing Files

| File | Change Type | Description |
|------|-------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY | Extend import; add merge block (CHANGE 1); replace `[EXIT_COOLDOWN_READY]` log (CHANGE 2); add `cleanExpiredCooldowns` call (CHANGE 3) |

---

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` is in the Protected Zone.

Changes are strictly additive and confined to:
- Import line 40 (extend named imports)
- 18 lines inserted after line 1072 (merge block)
- 1 line replaced at line 1074 (`[EXIT_COOLDOWN_READY]`)
- 5 lines inserted after line 1795 (`cleanExpiredCooldowns` try/catch)

No setup detection, no exit logic, no position sizing, no signal thresholds are touched.

**Amaury confirmation required before implementation.**

---

## Database Changes

None — `symbol_cooldowns` table already exists from Fase 2a. No new columns, indexes, or
RLS policies needed.

---

## Open Questions

None — all three changes are fully specified by the feature request.
