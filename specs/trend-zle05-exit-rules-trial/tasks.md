# Tasks — TREND_ZLE05 Exits: Drop EMA50 Break, Add Z-Score Exhaustion Exit, 5% Profit Target

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] **Protected Zone changes confirmed** — `src/lib/claude-agent.ts` is touched. Spec approval alone does not satisfy this; needs Amaury's separate, explicit, fresh in-conversation sign-off before `/implement` proceeds.
- [x] **Open Question answered** — `design.md`'s Open Question (how the new z-score-exhaustion exit reason is classified for cooldown purposes, given `types.ts` cannot be touched) must be resolved by Amaury before `/implement` writes any code. Answer (confirmed fresh, in-conversation, via AskUserQuestion at `/implement` time): **Option 2 — add one new substring-matching branch to `toExitReason()` mapping the new message to the existing `'Z_SCORE_EXIT'` value**, giving it the same same-day cooldown as a MEAN_REVERSION fair-value exit.
- [x] Database migrations drafted — N/A, none required

## Implementation Checklist

### Phase 1 — New constants

- [x] T-01: Inside `enforceExitRules()`, near the existing `ACTIVATION_PCT`/`ATR_MULT`/`MIN_DISTANCE_PCT` local constants (`:322-340`), add `const PROFIT_TARGET_PCT: Record<string, number> = { TREND_ZLE05: 0.05, default: 0.10 }`. **Placement deviation from design.md**: declared immediately before `let exitReason`'s first use instead of alongside `ACTIVATION_PCT`/`ATR_MULT` — `const` is not hoisted, and `PROFIT_TARGET_PCT` is consumed at the universal-profit-target check (now ~line 286), which runs before line 322. Declaring it at 322 would be a use-before-declaration error.
- [x] T-02: Add `const TREND_ZLE05_Z_EXIT = 1.25` alongside it (same placement deviation, same reason — it's consumed by the new rule inserted before line 322 too), with a comment stating it mirrors the TREND_ZLE05 entry ceiling (`zScore <= 1.25` in `trendZLE05Setup`, `:1889-1899`) and must be revisited if that literal changes.

### Phase 2 — Per-signal-type profit target

- [x] T-03: Replace the universal `pnlPct >= 0.10` check (`:283-285`) with a per-signal-type lookup: `const profitTargetPct = PROFIT_TARGET_PCT[signalType ?? 'default'] ?? PROFIT_TARGET_PCT['default']`, then `if (pnlPct >= profitTargetPct)`.
- [x] T-04: Update the exit-reason message to state the applied threshold dynamically (e.g. `` `Exit rule: profit target reached (${(pnlPct * 100).toFixed(1)}% >= ${(profitTargetPct * 100).toFixed(0)}%)` ``) instead of the hardcoded `"10%"`.
- [x] T-05: Confirmed — profit-target check still runs first, before the time stop and all signal-specific rules, unchanged evaluation order.

### Phase 3 — EMA50-break exclusion + new z-score exhaustion rule

- [x] T-06: At `:298` (original numbering), removed `TREND_ZLE05` from the EMA50-break condition — now `signalType === 'TREND' || signalType === 'TREND_PULLBACK'`. `TREND`/`TREND_PULLBACK` logic inside the block is byte-for-byte unchanged.
- [x] T-07: Added immediately after that block, before the `EMA_RECLAIM` block: `if (!exitReason && signalType === 'TREND_ZLE05') { if (Number.isFinite(zScore) && zScore >= TREND_ZLE05_Z_EXIT) { exitReason = \`Exit rule: z-score ${zScore.toFixed(2)} reached 1.25 (entry ceiling) — move exhausted\` } }`.
- [x] T-08: Resolution chosen (confirmed fresh via AskUserQuestion): **Option 2**. Added one new branch to `toExitReason()` (`:178`, right after the existing `FAIR_VALUE` branch): `if (r.includes('MOVE_EXHAUSTED')) return 'Z_SCORE_EXIT'` — matches the new message's normalized text uniquely, no collision with any other exit reason, `types.ts` untouched.

### Phase 4 — Tests

- [x] T-09: Created `src/lib/__tests__/trend-zle05-exit-rules-trial.test.ts`, inline-replica convention (replicates the relevant slice of `enforceExitRules()`'s per-position check sequence, following `trailing-stop-exit-reason-guard.test.ts`'s existing pattern — no import from `claude-agent.ts`).
- [x] T-10: Test — TREND_ZLE05 with `zScore >= 1.25` (finite) triggers the z-score exhaustion exit with the exact expected message.
- [x] T-11: Test — TREND_ZLE05 with `zScore` just below 1.25 does not trigger the z-score exhaustion exit.
- [x] T-12: Test — TREND_ZLE05 with `zScore` as `NaN` does not trigger the z-score exhaustion exit.
- [x] T-13: Test — a non-TREND_ZLE05 signal type (`TREND_PULLBACK`) with `zScore >= 1.25` does NOT trigger the z-score exhaustion exit.
- [x] T-14: Test — TREND_ZLE05 with price below EMA50 no longer exits via the EMA50-break rule.
- [x] T-15: Test — TREND with price below EMA50 still exits via the EMA50-break rule (unchanged).
- [x] T-16: Test — TREND_PULLBACK with price below EMA50 still exits via the EMA50-break rule (unchanged).
- [x] T-17: Test — TREND_ZLE05 at `pnlPct >= 0.05` triggers the profit-target exit (5% threshold).
- [x] T-18: Test — TREND_ZLE05 at `pnlPct` just below 0.05 does NOT trigger the profit-target exit.
- [x] T-19: Test — each of MEAN_REVERSION, TREND, TREND_PULLBACK, TREND_PULLBACK_3DAY, EMA_RECLAIM, and legacy `null` still requires `pnlPct >= 0.10` for the profit-target exit (parametrized `it.each`, unchanged default). Fixture bug found and fixed during the first test run: the original `ema50:200/currentPrice:50` fixture accidentally tripped the EMA50-break/EMA-reclaim rules before the profit-target path could be isolated — fixed to `ema50:10/sma5:100` so no other rule fires first.
- [x] T-20: Test — first-match ordering: TREND_ZLE05 with both the profit target and the time stop satisfied fires the profit-target message, not the time stop.
- [x] T-21: Test — first-match ordering: TREND_ZLE05 with both the time stop and the z-score-exhaustion condition satisfied fires the time-stop message, not the z-score message. All 17 tests pass (`npx vitest run src/lib/__tests__/trend-zle05-exit-rules-trial.test.ts`).

### Phase 5 — Verification

- [x] T-22: Ran `npx tsc --noEmit` — clean, zero errors.
- [x] T-23: Ran the full test suite — 51 files, 483 tests passed (466 pre-existing + 17 new), no regressions.
- [x] T-24: Diff shown in the implementation report (see below).
- [x] T-25: Before/after table produced (see implementation report).
- [x] T-26: Confirmed by direct diff inspection — `git diff` shows no hunks in the `:1760-2000` entry-detection region (`trendZLE05Setup`, `trendSetup`, `meanReversionSetup`, `emaReclaimSetup`, `trendPullback3DaySetup` all unchanged).
- [x] T-27: `git diff --stat` + `git status --short` confirm exactly `src/lib/claude-agent.ts` (modified) and `src/lib/__tests__/trend-zle05-exit-rules-trial.test.ts` (new). No other file touched by this session.
- [x] T-28: Stated explicitly in the implementation report's "Could not verify" note.

## Post-Implementation

- [x] Run `/review trend-zle05-exit-rules-trial` to verify implementation matches spec — APPROVED, see `specs/trend-zle05-exit-rules-trial/review.md`
- [x] Confirm Protected Zone file (`claude-agent.ts`) changes were explicitly approved, not just spec-approved — confirmed fresh, in-conversation, via AskUserQuestion at `/implement` time
- [ ] Note for Amaury (not an implementation task): this is an explicit trial per the Background section — schedule the 15-20-trade review before trusting this as permanent. The EMA50-break rule's removal for TREND_ZLE05 means those positions now rely only on the profit target, time stop, trailing stop, and the new z-exhaustion rule to exit — if TREND_ZLE05 price action turns adverse without ever touching `zScore >= 1.25` again, the position now rides the trailing stop (ATR-based, `:331-339`) instead of cutting at EMA50 — a materially different risk profile worth watching during the review window, not just the win-rate number.

## Estimated Complexity

**Low-Medium** — the code change itself is small and localized (one condition narrowed, one new ~5-line rule, one map replacing one literal), but it is a Protected Zone file carrying real trading-capital risk, and one design decision (the Open Question) must be made by Amaury before coding starts rather than assumed.
