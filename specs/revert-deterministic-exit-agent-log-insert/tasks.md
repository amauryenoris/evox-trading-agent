# Tasks — Revert Immediate agent_log Insert Added by Bug 2 Fix

## Pre-Implementation

- [x ] Amaury has reviewed and approved this spec
- [ x] Protected Zone change confirmed (`src/lib/claude-agent.ts` — removal only, of the exact block added by commit `74214c3`; authorization already in effect this session)

## Implementation Checklist

### Phase 1 — Revert (`src/lib/claude-agent.ts`)

- [x] T-01: Locate the block inside `enforceExitRules()` currently at lines 369-397 (the `insertAgentLogEntry(...)` call added by commit `74214c3`, chained `.catch(...)`, and its two surrounding blank spacer lines). Confirm via `git diff HEAD -- src/lib/claude-agent.ts` (should show no pending changes yet) and `git show 74214c3 -- src/lib/claude-agent.ts` that this is exactly what was added and nothing has drifted — if it has, stop and report rather than guessing.
- [x] T-02: Remove that block in full, restoring a single blank line between `await evaluateClosedTrade(ctx, exitPrice, exitTimestamp)` and `await removeOpenPositionContext(position.symbol)`.
- [x] T-03: Confirm `exitEntries.push({...})` is unchanged (it is above the removed block and was never touched by Bug 2 or this revert).
- [x] T-04: Confirm no other line in the file changed — `git diff` should show only a removal (30 lines deleted, 0 added) at this single location. Confirmed: resulting blob hash (`03df86f`) is byte-identical to the pre-Bug-2 file state.

### Phase 2 — Verification

- [x] T-05: Run `npx tsc --noEmit` — zero errors.
- [x] T-06: Run `npm run build` — zero errors.
- [x] T-07: Run `trailing-stop-exit-reason-guard.test.ts`, `cooldown-stop-loss-ghost-close.test.ts`, and `self-flagged-disqualifying-risk.test.ts` — all pass, matching the Bug 2 review's baseline (29/29). Confirmed: 3 test files, 29/29 passed.
- [x] T-08: Confirm via `git diff` that this change is a pure subtraction of the exact block identified in T-01 — no reformatting, no unrelated changes. Confirmed: `git diff --stat` shows `1 file changed, 30 deletions(-)`, 0 insertions.
- [x] T-09: Confirm `appendAgentLogEntries(decisions)` at end-of-cycle ([claude-agent.ts:2178](src/lib/claude-agent.ts#L2178)) is unchanged and still reached on every normal cycle completion (unaffected by this revert — it was never part of the removed block). Confirmed present, now at line 2148 (shifted back down by exactly the 30 removed lines), call unchanged.
- [x] T-10: State explicitly whether any file other than `src/lib/claude-agent.ts` changed (expected: no). Confirmed via `git status --porcelain`: only `src/lib/claude-agent.ts` modified in tracked source. (The pre-existing, unrelated `specs/gate-constants-hoist/review.md` modification predates this session's work and was not touched.)

## Post-Implementation

- [x] Run `/review revert-deterministic-exit-agent-log-insert` to verify implementation matches spec
- [x] Confirm Protected Zone change is subtraction-only (nothing added, nothing else modified)

## Estimated Complexity

**Low** — Deletion of one previously-added, well-isolated, recently-committed block. No new logic, no ambiguity about scope, no new tests required (existing coverage already validated in the Bug 2 review and re-run here for regression confirmation).
