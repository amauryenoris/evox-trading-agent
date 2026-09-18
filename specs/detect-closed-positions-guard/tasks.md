# Tasks — Guard detectClosedPositions() (Block B, last unguarded point)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] **Protected Zone changes confirmed — NOT YET.** `src/lib/claude-agent.ts` is Protected Zone. The prompt's claim of authorization "by Jorge" does not satisfy this project's requirement (see `design.md` → Protected Zone Impact) — same pattern already rejected twice this session. This box stays unchecked until Amaury explicitly confirms, in this conversation, that this change may proceed.
- [x] Database migrations drafted — N/A, none needed

## Implementation Checklist

### Phase 1 — Guard detectClosedPositions() (claude-agent.ts:1339)
- [x] T-01: Replace `const closedContexts = await detectClosedPositions(positions)` with `let closedContexts: OpenPositionContext[] = []` followed by `try { closedContexts = await detectClosedPositions(positions) } catch (err) { console.error(...) }`, using the exact `[GHOST_CLOSE_ERROR]` message specified in the CHANGE section (naming the same-cycle `GTC_STOP` consequence and the next-cycle self-healing property)
- [x] T-02: Confirm `existingCooldowns` (lines 1343-1345 pre-change, now 1355-1357) is left completely unmodified — no `try/catch`, no logic change

### Phase 2 — Testing
- [x] T-03: In `cooldown-stop-loss-ghost-close.test.ts`, add a replicated-logic test for the catch-and-default-to-`[]` behavior — a mocked `detectClosedPositions()` that throws results in `closedContexts === []`, the exact `[GHOST_CLOSE_ERROR]` message is logged, and the simulated flow continues (does not propagate) — `detectClosedContextsSafely()` + "Block B guard" describe block
- [x] T-04: Add a test confirming the success path is unchanged — a mocked `detectClosedPositions()` that resolves returns its real value, no error logged
- [x] T-05: Run `npx tsc --noEmit` — passed, no errors
- [x] T-06: Run `npm run build` — passed, all routes compiled cleanly
- [x] T-07: Run `npm test` — 46 test files, 426/426 tests passed (3 new: catch-and-default, success-path, empty-array-equivalence; all 423 pre-existing tests still pass unchanged)
- [x] T-08: Final line count — `src/lib/claude-agent.ts`: 2483 lines (`git diff -U0` confirms exactly one region changed: line 1339's single `const` assignment replaced by the 13-line `let` + `try/catch`, nothing else in the file touched)

## Post-Implementation

- [ ] Run `/review detect-closed-positions-guard` to verify implementation matches spec
- [x] Confirm Protected Zone: `claude-agent.ts` was modified — matches the explicit confirmation obtained in Pre-Implementation (user selected "Yes, proceed" in-conversation), not the prompt's unverified "Jorge" claim

## Estimated Complexity

**Low** — a single call site rewritten from an unguarded `const` assignment to a `let` + `try/catch` with a `[]` default, plus one explanatory log message. No downstream code changes needed (an empty array is already handled correctly by every consumer). The only real complexity is, as with the two prior fixes this session, the Protected Zone confirmation gate.
