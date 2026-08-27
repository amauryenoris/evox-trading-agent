# Tasks — TREND_PULLBACK_3DAY Exit-Condition Wiring (CHANGE 3 of 3)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed — Amaury's own explicit confirmation for touching `claude-agent.ts` in this session (the claimed "Jorge" authorization and prior-change carryover are NOT accepted as sufficient — see design.md Open Question 1)
- [x] Amaury acknowledges any currently-open `TREND_PULLBACK_3DAY` position could exit on the next cycle after deploy (design.md Open Question 2) — informational, not blocking
- [x] Database migrations drafted (N/A — none needed)

## Implementation Checklist

### Phase 1 — Exit Branch
- [x] T-01: In `claude-agent.ts`'s `enforceExitRules()`, immediately after the existing `EMA_RECLAIM` exit branch (~line 231) and before the `TRAILING STOP` section, add the new `TREND_PULLBACK_3DAY` branch using `ind.sma5`/`ind.currentPrice` with the `!= null` convention. No additional condition beyond `currentPrice > sma5`.

### Phase 2 — Verification
- [x] T-02: Trace the full `!exitReason` chain by reading the diff in context — confirm the new branch is reached only when `signalType === 'TREND_PULLBACK_3DAY'` and no earlier branch (2 universal + 3 existing per-signal-type) has already set `exitReason`. (Confirmed — the new block is positioned after all 5 pre-existing branches and is itself guarded by `!exitReason`.)
- [x] T-03: Confirm the 5 pre-existing exit-cascade conditions are byte-for-byte unchanged. (Confirmed via single-hunk `git diff` — zero lines changed above the new block.)
- [x] T-04: Confirm `ACTIVATION_PCT`, `ATR_MULT`, and the trailing-stop block (PASO 1–5) are byte-for-byte unchanged. (Confirmed via `git diff` — zero lines changed below the new block.)
- [x] T-05: Confirm the CHANGE 2 entry gate (`trendPullback3DaySetup`) and classification ternary are untouched. (Confirmed — diff contains exactly one hunk, the new exit branch; nothing elsewhere in the file changed.)
- [x] T-06: Run `npx tsc --noEmit` — must pass with no new errors. (Passed.)
- [x] T-07: Run `npm run build` — must pass. (Passed.)
- [x] T-08: Run the full Vitest suite — report which test files ran. (41 test files, 377 tests, all passed unmodified.)
- [x] T-09: Extend `trailing-stop-exit-reason-guard.test.ts` (or a comparable location, per design.md Open Question 3) with cases for the new branch: fires when price > sma5 and no earlier exit; does NOT fire when sma5 is null; takes priority over an already-activated trailing stop (mirroring the existing `TREND_PULLBACK`/EMA50 priority test in the same file). (Extended the existing file — 3 new cases added: priority over an already-activated trailing stop, null-sma5 fallthrough to trailing stop, and no-fire when price hasn't reclaimed SMA5. 8/8 tests pass in the file; 380/380 pass suite-wide.)
- [x] T-10: Confirm `indicators.ts`, `db.ts`, `alpaca.ts`, `risk-manager.ts` are untouched (`git status --short src/`). (Confirmed untouched — only `claude-agent.ts` and the extended test file changed.)
- [x] T-11: Report the final line count of `claude-agent.ts`. (2339 lines.)

## Post-Implementation

- [x] Run `/review trend-pullback-3day-exit-condition` to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged beyond `claude-agent.ts` (or changes approved) — confirmed, no other Protected Zone file was touched (unlike CHANGE 2, no type cascade occurred).

## Estimated Complexity

**Low** — a single, small, well-isolated branch added to an already-established cascade pattern, with no interaction needed with the trailing-stop block (it already respects `!exitReason`). Complexity is almost entirely in the Protected Zone re-authorization (same class of gate as CHANGE 1 and CHANGE 2, not skippable via the disputed "Jorge"/carryover claim) and in deciding where new test coverage belongs.
