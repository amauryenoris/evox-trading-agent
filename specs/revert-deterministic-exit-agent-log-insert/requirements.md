# Requirements — Revert Immediate agent_log Insert Added by Bug 2 Fix

## STEP 0 — Pre-implementation findings

Verified live against `src/lib/claude-agent.ts` in this session, and cross-checked against the committed Bug 2 diff (`git show 74214c3 -- src/lib/claude-agent.ts`) — the working tree matches the commit exactly, no drift since it shipped.

### The exact block to remove (current lines 369-397)

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

This block sits between two unchanged lines, both of which predate Bug 2 and must remain exactly as they are:

```ts
          await evaluateClosedTrade(ctx, exitPrice, exitTimestamp)
                                                            ← Bug 2 block goes here, to be removed
          await removeOpenPositionContext(position.symbol)
```

Bug 2's diff (confirmed via `git show`) inserted this block plus one blank line immediately after `evaluateClosedTrade(...)` and one blank line immediately before `removeOpenPositionContext(...)`, adding 30 lines total (28 lines of new code + 2 blank spacer lines) with zero other changes anywhere in the file. Reverting means removing exactly those 30 lines and restoring the single blank line that separated `evaluateClosedTrade(...)` and `removeOpenPositionContext(...)` before Bug 2.

### Why this is a pure subtraction, not a3-way merge

No other commit has touched `src/lib/claude-agent.ts` since Bug 2 (`git log --oneline -1 -- src/lib/claude-agent.ts` shows `74214c3` — the Bug 2 commit — as the most recent). The revert is a straight removal of that one hunk; there is no risk of reverting into a different surrounding context than what Bug 2 modified.

### What must NOT move

- `exitEntries.push({...})` (pre-Bug-2, untouched by Bug 2, untouched by this revert) — this is what feeds `decisions` → `appendAgentLogEntries(decisions)` at end-of-cycle ([claude-agent.ts:2178](src/lib/claude-agent.ts#L2178), confirmed present and unrelated to Bug 2's diff).
- `evaluateClosedTrade(ctx, exitPrice, exitTimestamp)` — pre-Bug-2, still needed for `trade_evaluations`.
- `removeOpenPositionContext(position.symbol)` — pre-Bug-2, still needed for context cleanup.
- The ghost-close `insertAgentLogEntry` call (~line 1140 region post-Bug-2-shift) — separate write path, not part of Bug 2's diff, not part of this revert.
- `appendAgentLogEntries` / `src/lib/agent-log.ts` — pre-existing, unrelated to Bug 2, not touched by this revert.

---

## Functional Requirements

FR-01: The system shall remove the `insertAgentLogEntry(...)` call (and its chained `.catch(...)`) added by the Bug 2 commit from the deterministic-exit branch of `enforceExitRules()`.

FR-02: The system shall restore a single blank line between `evaluateClosedTrade(ctx, exitPrice, exitTimestamp)` and `removeOpenPositionContext(position.symbol)`, matching the pre-Bug-2 state exactly.

FR-03: The system shall leave `exitEntries.push({...})` byte-for-byte unchanged.

FR-04: The system shall leave `evaluateClosedTrade()`, `removeOpenPositionContext()`, the trailing-stop floor computation (~lines 275-291), and all exit-condition logic and ordering unchanged.

FR-05: The system shall leave the ghost-close `insertAgentLogEntry` call, `appendAgentLogEntries`, and `src/lib/agent-log.ts` unchanged.

FR-06: Where the current code differs from the Bug 2 diff described in STEP 0 (i.e., something else already modified this block), the system shall stop and report the discrepancy rather than guessing what to remove.

## Non-Functional Requirements

NFR-01: `npx tsc --noEmit` shall pass with zero errors after the change.

NFR-02: `npm run build` shall pass with zero errors after the change.

NFR-03: `trailing-stop-exit-reason-guard.test.ts`, `cooldown-stop-loss-ghost-close.test.ts`, and `self-flagged-disqualifying-risk.test.ts` shall all pass after the change, matching their pre-revert (Bug 2 review) results.

## Constraints

C-01: This feature modifies `src/lib/claude-agent.ts`, a Protected Zone file. Authorization for Protected Zone edits to this file, for this bug/revert, is already in effect for this session (established for the Bug 2 diagnostic and carried forward for this immediate follow-up revert).

C-02: No changes to `scripts/run-cycle.ts`, `src/lib/run-cycle.ts`, `src/app/api/cron/run/route.ts`, `risk-manager.ts`, `indicators.ts`, `learning.ts`, or `db.ts`.

C-03: No changes to `appendAgentLogEntries` or `src/lib/agent-log.ts`.

C-04: No deduplication mechanism, crash-mid-cycle persistence fix, new field, or any other additive change — this is a pure subtraction. Any such improvement is explicitly deferred to a future, separately-scoped spec.

C-05: No changes to the ghost-close duplicate-insert issue — separate, already tracked, out of scope.

C-06: No DB schema/RLS changes.

## Out of Scope

- Re-designing agent_log persistence to avoid the narrower crash-mid-cycle data-loss gap that Bug 2 originally (over-)diagnosed. That gap is real (per the existing code comment above `appendAgentLogEntries`) and is knowingly re-accepted by this revert, not fixed.
- The ghost-close duplicate-insert issue.
- Any deduplication logic for `agent_log`.
- Updating `specs/fix-deterministic-exit-agent-log/` (the Bug 2 spec) to reflect that it's being reverted — if a record of this reversal is wanted there, that's a documentation decision for Amaury, not part of this implementation.
