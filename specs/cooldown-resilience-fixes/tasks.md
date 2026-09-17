# Tasks — Cooldown Resilience Fixes (Block A guard + profitable ghost-close branch)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] **Protected Zone changes confirmed — NOT YET.** `src/lib/claude-agent.ts` is Protected Zone. The CHANGE prompt's claim of authorization "by Jorge" does not satisfy this project's requirement (see `design.md` → Protected Zone Impact). This box stays unchecked until Amaury explicitly confirms, in this conversation, that both Part 1 and Part 2 may proceed.
- [x] Database migrations drafted — N/A, none needed

## Implementation Checklist

### Phase 1 — Part 1: Block A guard (claude-agent.ts:1306-1331)
- [x] T-01: Wrap the existing `if (cooldownDates !== null) { ... } else { ... }` block (lines 1306-1331) in `try { ... } catch (err) { console.error('[COOLDOWN_PERSIST_ERROR] cooldown-persistence block failed:', err) }`, with zero changes to any line inside the block

### Phase 2 — Part 2: profitable ghost-close cooldown branch (claude-agent.ts:1396-1410)
- [x] T-02: Immediately after the existing `pnlPct < 0` / `else if` pair (ending at line 1410), add `} else if (pnlPct >= 0 && cooldownDates !== null && !existingCooldowns.has(ctx.symbol)) { ... }` computing `isConfirmedTrailingStopFill` from `sellOrder?.id` vs `ctx.trailingStopOrderId`, writing `reason='TRAILING_STOP'`/`cooldownDates.nextTradingDay1` when confirmed or `reason='GHOST_CLOSE_PROFIT'`/`cooldownDates.endOfTradingDay` otherwise, via `upsertSymbolCooldown(ctx.symbol, reason, cooldownUntil)`, with a `[COOLDOWN_PERSIST]` log line including `confirmed=${isConfirmedTrailingStopFill}`
- [x] T-03: Add the trailing `} else if (pnlPct >= 0 && cooldownDates !== null) { ... }` skip branch with a `[COOLDOWN_SKIP]` log line, for the case where an active cooldown already exists
- [x] T-04: Confirm the two existing `pnlPct < 0` branches (1396-1410) are byte-for-byte unchanged after both new branches are appended

### Phase 3 — Testing
- [x] T-05: In `cooldown-stop-loss-ghost-close.test.ts`, add a replicated-logic test for Part 1's catch-and-continue behavior (a thrown error inside the simulated block is caught, logged, and does not propagate) — `persistCooldownsSafely()` + "Block A guard" describe block
- [x] T-06: In the same file, add replicated-logic tests for Part 2: (a) `sellOrder.id === ctx.trailingStopOrderId` (both non-null) → `'TRAILING_STOP'`; (b) no match, or either id null/undefined → `'GHOST_CLOSE_PROFIT'`; (c) `pnlPct >= 0` with an existing active cooldown → skip, no write — `isConfirmedTrailingStopFill()`, `decideProfitableGhostCloseCooldownReason()`, `shouldWriteProfitableGhostCloseCooldown()` + two new describe blocks
- [x] T-07: Updated the two existing assertions that claimed "non-negative pnlPct writes nothing" (now: "does not trigger a STOP_LOSS cooldown" / "never triggers this STOP_LOSS-scoped write") — `shouldWriteStopLossCooldown`/`shouldWriteGhostCloseCooldown` themselves and their original assertions are unchanged (still correctly `STOP_LOSS`-scoped), only the misleading descriptions were re-scoped; the new profitable-close describe blocks cover the case they no longer accurately described
- [x] T-08: Run `npx tsc --noEmit` — passed, no output/errors
- [x] T-09: Run `npm run build` — passed; `/api/cooldowns` and all other routes compiled cleanly, no new build errors
- [x] T-10: Run `npm test` — 46 test files, 423/423 tests passed (10 new: 2 Block A guard + 4 trailing-stop-match + 4 profitable-close-decision; all 413 pre-existing tests still pass unchanged)
- [x] T-11: Final line count — `src/lib/claude-agent.ts`: 2471 lines (+48 net; diff: 72 lines changed, 48 insertions/24 deletions region within the two touched blocks)

## Post-Implementation

- [ ] Run `/review cooldown-resilience-fixes` to verify implementation matches spec
- [x] Confirm Protected Zone: `claude-agent.ts` was modified — matches the explicit confirmation obtained in Pre-Implementation (user selected "Yes, proceed with both parts" in-conversation), not the prompt's unverified "Jorge" claim

## Estimated Complexity

**Low-Medium** — the code change itself is small and narrowly scoped (one `try/catch` wrap, two new `else if` branches, both using only already-in-scope data). The complexity is concentrated in getting the test updates right (re-scoping two existing assertions without weakening what they still correctly assert) and, more importantly, in the Protected Zone gate — this cannot proceed on the spec alone.
