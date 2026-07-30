# Tasks — Persist Deterministic-Exit SELL Entries to agent_log (Bug 2)

## Pre-Implementation

- [ x] Amaury has reviewed and approved this spec
- [ x] Protected Zone change confirmed (`src/lib/claude-agent.ts` — one new logging call inside the existing `if (ctx)` block only, no exit logic touched)

## Implementation Checklist

### Phase 1 — `enforceExitRules()` change (`src/lib/claude-agent.ts`)

- [x] T-01: Locate the `if (ctx) { try { ... } catch (cleanupErr) { ... } }` block (currently lines 359-376). Confirm it still matches the shape recorded in STEP 0 of `requirements.md` before editing — if it has drifted meaningfully, stop and report rather than guessing.
- [x] T-02: Immediately after the existing `await evaluateClosedTrade(ctx, exitPrice, exitTimestamp)` line and before `await removeOpenPositionContext(position.symbol)`, insert:
  ```ts
  await insertAgentLogEntry({
    id: randomUUID(),
    timestamp: exitTimestamp,
    symbol: position.symbol,
    decision: {
      action: 'SELL',
      symbol: position.symbol,
      quantity: ctx.quantity,
      reasoning: exitReason,
      confidence: 1.0,
    },
    indicators: {
      ...ind,
      entryPrice: ctx.buyPrice,
      exitPrice,
      pnlPct: (exitPrice - ctx.buyPrice) / ctx.buyPrice,
      signalType: ctx.signalType,
      daysOpen,
      closedBy: 'deterministic_exit',
    } as unknown as TechnicalIndicators,
    portfolioSnapshot: {
      equity: account.equity,
      cash: account.cash,
      positionCount: positions.length,
    },
    orderExecuted: true,
    error: undefined,
  }).catch((err) => console.error(`[EXIT-RULES] Failed to insert agent_log for ${position.symbol}:`, err))
  ```
- [x] T-03: Confirm `exitReason` is non-null at this point (it is — the `if (!exitReason) { ...continue }` guard earlier in the loop already guarantees this before this block is ever reached; no additional null check needed).
- [x] T-04: Confirm no import changes are needed — `insertAgentLogEntry` (line 31), `randomUUID` (used elsewhere in this file), and `TechnicalIndicators` (used in the ghost-close call already) are all already imported.
- [x] T-05: Confirm the existing `exitEntries.push({...})` block (lines 337-346) is byte-for-byte unchanged.
- [x] T-06: Confirm no other line in `enforceExitRules()`, `closePosition()`, `evaluateClosedTrade()`, or the trailing-stop floor computation (lines ~275-291) was touched.

### Phase 2 — Verification

- [x] T-07: Run `npx tsc --noEmit` — zero new errors.
- [x] T-08: Run `npm run build` — zero errors.
- [x] T-09: Read the diff and confirm it is exactly one added block (the new `insertAgentLogEntry` call + `.catch()`) with no reformatting or unrelated line changes elsewhere in the file.
- [x] T-10: Re-confirm by reading (not running) that all four deterministic exit types — profit target, time stop, MEAN_REVERSION z-score exit, trend/EMA50/EMA-Reclaim exit, and trailing stop — flow through the single shared `if (!exitReason) {...} / closePosition() / exitEntries.push() / if (ctx) {...}` path where the new call now lives, per the "Why all four deterministic exit types reach this call" section of `design.md`.
- [x] T-11: Confirm the new call's field structure against the ghost-close call at line ~1110 side by side (per the mapping table in `design.md`) — same table, comparable field names, same `as unknown as TechnicalIndicators` cast convention.
- [x] T-12: Re-run the consumer search from STEP 0 (`AgentReasoningLog.tsx`, `db.ts:getAgentLogPrioritized`) against the actual diff to confirm nothing there needs a companion change.

## Post-Implementation

- [x] Run `/review fix-deterministic-exit-agent-log` to verify implementation matches spec
- [x] Confirm Protected Zone change is logging-only (no exit condition, timing, or decision logic modified)
- [x] Note for Amaury: post-fix, a genuine deterministic exit will produce two `agent_log` rows (the new correct one + the pre-existing spurious `ghost_close` duplicate) until the separately-tracked ghost-close duplicate-insert bug is fixed — expected, not a regression from this change.

## Estimated Complexity

**Low** — Additive only: one new function call with its own error handling, inserted at a single, well-understood point in an already-shared code path. No control-flow changes, no new types, no new files, no caller changes, no DB schema changes.
