# Tasks — TREND_PULLBACK_3DAY Entry-Detection Wiring (CHANGE 2 of 3)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed — Amaury's own explicit confirmation for touching `claude-agent.ts` in this session (the claimed "Jorge" authorization and CHANGE 1's carryover are NOT accepted as sufficient — see design.md Open Question 1). Confirmed explicitly via interactive question, in-session.
- [x] Live-immediate launch (no calibration period) explicitly confirmed by Amaury (design.md Open Question 2). Confirmed explicitly via interactive question, in-session.
- [x] Top-priority classification order explicitly confirmed by Amaury, understanding it reclassifies overlapping candidates away from the four existing live setups (design.md Open Question 3). Confirmed explicitly via interactive question, in-session.
- [x] Database migrations drafted (N/A — none needed; `db.ts` cast staleness noted as a separate, out-of-scope follow-up)

## Implementation Checklist

### Phase 1 — Entry Gate
- [x] T-01: In `claude-agent.ts`, near the existing setup-boolean block (~lines 1543–1630), add `trendPullback3DayUptrendOk`, `trendPullback3DayStreakOk`, and `trendPullback3DaySetup`, using `indicators.prevClose`, `indicators.sma200`, `indicators.closeMinus2/3/4` with `!= null` checks (matching CHANGE 1's convention exactly). No z-score/ADX/MACD condition. No dependency on any existing setup's intermediate variables.

### Phase 2 — Wiring
- [x] T-02: Add `trendPullback3DaySetup` to the `setup_detected` OR-chain (line 1679).
- [x] T-03: Reorder the classification ternary (lines 1687–1696) so `trendPullback3DaySetup` is checked first; leave the relative order of the existing four unchanged among themselves.
- [x] T-04: Add `TREND_PULLBACK_3DAY: 0.06` to `ACTIVATION_PCT` and `TREND_PULLBACK_3DAY: 1.5` to `ATR_MULT` (lines 237–252); confirm the 5 pre-existing entries in each map are byte-for-byte unchanged.

### Phase 3 — Types
- [x] T-05: Run `tsc --noEmit`, identify every error caused by introducing `'TREND_PULLBACK_3DAY'`, and widen only those specific type-literal sites (starting with `OpenPositionContext.signalType` in `types.ts:193`). Report each site touched and the exact error it resolved.
  Sites touched (5 total, all `tsc`-driven, none speculative):
  1. `types.ts:193` — `OpenPositionContext.signalType` — resolved a `claude-agent.ts` assignment error (signalType flowing into the open-position context).
  2. `types.ts:373` — `NearMissEntry.signal_type` — resolved errors where `signalType` flows into a near-miss record.
  3. `types.ts:210` — `TradeEvaluation.signal_type` — resolved `learning.ts:178`'s assignment error (cascaded once `OpenPositionContext.signalType` was widened).
  4. `src/lib/watchlist-monitor.ts:22` — `detectNearMisses()`'s `blockedByGate.signalType` parameter — **Protected Zone, not in original authorization scope; separately authorized in-session before touching.**
  5. `src/lib/state-fingerprint.ts:15-22` — `getZBucket()`'s `signalType` parameter — not Protected Zone.
  All five are pure literal-union widenings — no logic changed in any of them.

### Phase 4 — Verification
- [x] T-06: Run `npx tsc --noEmit` — must pass with no new errors. (Passed.)
- [x] T-07: Run `npm run build` — must pass. (Passed.)
- [x] T-08: Run the full Vitest suite — report which test files ran; for any test that constructs a multi-setup-overlap scenario, confirm it reflects the new priority order or flag that no such test exists (per NFR-04). (41 test files, 377 tests, all passed. No existing test constructs a multi-setup classification-priority scenario — confirmed by grepping for "priority"/"ternary"/"overlap" across `src/lib/__tests__/`; none found. This matches the codebase's established convention of one isolated, inline-replicated test file per setup rather than integration-style ternary tests — see `trend-zle05-setup.test.ts`, `trend-pullback-macd-floor.test.ts`, `ema-reclaim-null-fix.test.ts`. Added `trend-pullback-3day-setup.test.ts` following that same convention — 11 new tests covering the happy path, each streak-break case, the uptrend boundary, and all 5 null-field cases. Not explicitly listed as a spec task, but required by `CLAUDE.md`'s testing rule and the implement workflow's Step 5 — flagging the gap in the spec rather than silently skipping tests for new live-trading logic.)
- [x] T-09: Confirm no change to `closePosition()`, `enforceExitRules()`, or trailing-stop logic beyond the two new map entries. (Confirmed via `git diff` — only the two map entries plus the new gate/wiring in `runAgentCycle()`.)
- [x] T-10: Confirm `indicators.ts`, `db.ts`, `alpaca.ts`, `risk-manager.ts` are untouched (`git status --short src/`). (Confirmed untouched. Also touched, beyond `claude-agent.ts`: `types.ts` (not Protected Zone), `state-fingerprint.ts` (not Protected Zone), and `watchlist-monitor.ts` (Protected Zone — separately authorized in-session, see T-05 notes) — all pure type-literal widenings required by `tsc`, no logic changes.)
- [x] T-11: Report the final line count of `claude-agent.ts`. (2332 lines.)

## Post-Implementation

- [x] Run `/review trend-pullback-3day-entry-detection` to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged beyond `claude-agent.ts` (or changes approved) — `watchlist-monitor.ts` was also touched (type-only), separately authorized in-session; see review.md.

## Estimated Complexity

**Medium** — the code change itself is small and mechanical (one new boolean, one OR-chain addition, one ternary reorder, two map entries, likely one type-union widen), consistent with the codebase's existing setup-detection pattern. The complexity is almost entirely in the **authorization and risk-decision gating**: this touches the core live-trading decision engine, reorders classification priority for four already-live setups, and — per the originating prompt — launches with real capital immediately with no calibration period, based on backtest numbers that couldn't be independently verified from memory. None of that should be waved through on the strength of a prompt claiming prior sign-off.
