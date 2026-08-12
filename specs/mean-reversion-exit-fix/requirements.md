# Requirements — mean-reversion-exit-fix

## Functional Requirements

FR-01: The system shall evaluate the MEAN_REVERSION thesis-complete exit condition regardless of whether the trailing stop has activated for that position.
FR-02: The system shall set `exitReason` for a MEAN_REVERSION position when `ind.kalman.signal === 'EXIT_LONG'` and no earlier exit condition has already set `exitReason` this cycle.
FR-03: The system shall include the current `zScore` (formatted to 3 decimal places) in the exit reasoning text as descriptive context, without using it as the triggering condition.
FR-04: The system shall not add optional chaining to `ind.kalman.signal` — the existing per-position null-guard (`if (!ind?.kalman) { ...continue }`) already guarantees `ind.kalman` is non-null at this point in the function.

## Non-Functional Requirements

NFR-01: The change shall be scoped to a single branch (the MEAN_REVERSION exit check, `claude-agent.ts:211-215`) with no change to any other exit-condition branch, the null-guard, CHANGE 3b's order-replacement logic, or PASO 5's trailing trigger check.
NFR-02: `npx tsc --noEmit` and `npm run build` shall pass with no new type errors.
NFR-03: `trailing-stop-exit-reason-guard.test.ts` shall be updated (not left stale) to reflect the new condition, since its existing helper and one of its test cases hardcode and assert the exact behavior being removed.
NFR-04: The four other tests in `trailing-stop-exit-reason-guard.test.ts` (TREND_PULLBACK EMA50-breach × 2, FCX TREND historical replay, persistence-tracking) shall continue to pass unmodified in behavior (edits to the shared helper must not change their outcomes).
NFR-05: `cooldown-stop-loss-ghost-close.test.ts` and `self-flagged-disqualifying-risk.test.ts` shall pass unmodified.
NFR-06: The completion report shall state explicitly that the effective z-score threshold changes from -0.8 to -0.5 as a result of this fix, distinct from and in addition to reporting that the trailing-activation suppression was removed.

## Constraints

C-01: `claude-agent.ts` is in the Protected Zone. Per `specs/README.md`, this requires Amaury's explicit confirmation before implementation proceeds, separate from and in addition to normal spec approval. As with the prior two prompts in this session, this prompt claims authorization from "Jorge" — no such approver is established in this project's CLAUDE.md or prior context; that claim is disregarded, and a dedicated Protected Zone confirmation checkbox is required in `tasks.md`.
C-02: `indicators.ts` must not be modified — `exitStd`'s value (0.5) and `calculateKalman()`'s computation are out of scope; only how `enforceExitRules()` consumes the already-computed `kalman.signal` output changes.
C-03: `db.ts`, `alpaca.ts`, `risk-manager.ts`, `learning.ts` must not be modified.
C-04: The other four exit branches (profit-target, time-stop, TREND/EMA50-break, EMA_RECLAIM/EMA50-break) must not be modified — confirmed via prior diagnostic that none of them share this bug.
C-05: CHANGE 3b's order-replacement block (`claude-agent.ts:~295-371`) and PASO 5's trailing trigger check must not be modified — confirmed orthogonal (does not read/write `exitReason`).
C-06: The null-guard at `claude-agent.ts:177-179` must not be modified.
C-07: If the current block at lines 211-215 does not match the verbatim text confirmed in the diagnostic, implementation must stop and report the discrepancy rather than adapt silently (FAIL FAST). Re-verified immediately before this spec was written — still matches exactly as of this session.

## Out of Scope

- Making `exitStd` configurable, signal-type-aware, or otherwise different from its current hardcoded `0.5` default in `indicators.ts`.
- Any change to `indicators.ts`.
- Any change to the other four exit-condition branches.
- Any change to CHANGE 3b's trailing-stop-limit order-replacement logic or PASO 5.
- Wiring `ind.kalman.signal` into any additional logic beyond this one exit branch — its two existing consumers (entry-time position sizing, Claude's prompt text) remain untouched.
