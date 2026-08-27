# Design — TREND_PULLBACK_3DAY Exit-Condition Wiring (CHANGE 3 of 3)

## Architecture Decision

This feature lives entirely in `src/lib/claude-agent.ts`'s `enforceExitRules()` function (starting line 154), specifically in the exit-cascade block (lines 204–231) that runs before the trailing-stop mechanism (line 236 onward, `PASO 1–5`). The cascade is a strict "first to fire wins" chain: two universal exits, then three per-signal-type branches, each guarded by `!exitReason`. This change adds a fourth per-signal-type branch, following the exact same guard pattern, for `signalType === 'TREND_PULLBACK_3DAY'`.

Verified against current code: the diagnostic's line references (204–231 for the cascade, 237–254 for the maps CHANGE 2 already updated) are accurate as of this session. The scope-local variable is `ind` (not `indicators`, which is CHANGE 2's separate scope in `runAgentCycle()`) — confirmed by the existing branches' `ind.ema50`, `ind.currentPrice`, `ind.kalman.signal` usage.

## Data Flow

1. Each cycle, `enforceExitRules()` computes `signalType` from the open position's stored context (line 200, unchanged).
2. The exit cascade runs top to bottom: profit target → time stop → `MEAN_REVERSION` → `TREND` family → `EMA_RECLAIM` → **(new) `TREND_PULLBACK_3DAY`** → trailing-stop block.
3. The new branch only evaluates `ind.sma5 != null && ind.currentPrice > ind.sma5` when `!exitReason && signalType === 'TREND_PULLBACK_3DAY'` — i.e., only for `TREND_PULLBACK_3DAY` positions where nothing already closed them this cycle.
4. If it fires, `exitReason` is set before the trailing-stop block runs. Because the trailing-stop block's own final assignment is already guarded by `!exitReason` (confirmed via `trailing-stop-exit-reason-guard.test.ts`, which specifically tests and locks in this "first to fire wins, state-tracking still persists" behavior), the new branch naturally takes priority over the trailing stop without any additional code — consistent with the backtest, where SMA5-reclaim was the primary/sole exit mechanism.
5. If `sma5` is null, the branch is a no-op — the position falls through to the trailing-stop mechanism exactly as it does today (no regression for the null case).

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| New independent branch, placed after `EMA_RECLAIM`, before trailing-stop | Matches the cascade's existing structure and guard convention exactly; minimal diff; the trailing-stop block's existing `!exitReason` guard means no extra work is needed to make this take priority | One more branch in an already-large function | Chosen |
| Fold into the existing `TREND`/`TREND_PULLBACK`/`TREND_ZLE05` group condition | Fewer total branches | The backtested rule (price > SMA5) is a different condition entirely from that group's (price < EMA50) — folding them would either wire the wrong condition to `TREND_PULLBACK_3DAY` or force an awkward per-branch conditional inside a shared block. Explicitly rejected by the diagnostic. | Rejected |
| Add a minimum days-held or momentum filter on top of the SMA5 check | Might reduce whipsaw exits | Not part of what was backtested (n=196, 69.5% win rate, +1.18% avg pnl as tested); adding untested conditions on a live-capital signal contradicts the same "match the evidence exactly" principle applied in CHANGE 2 | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY | Add one new exit branch (`if (!exitReason && signalType === 'TREND_PULLBACK_3DAY') { if (ind.sma5 != null && ind.currentPrice > ind.sma5) { exitReason = ... } }`) between the existing `EMA_RECLAIM` branch and the `TRAILING STOP` section header. No other lines in `enforceExitRules()` change. |
| `src/lib/__tests__/trailing-stop-exit-reason-guard.test.ts` | MODIFY (likely) | This file inline-replicates the full exit cascade + trailing-stop interaction and is the established place to verify a new branch's priority against the trailing stop, mirroring how it already covers `TREND_PULLBACK`'s EMA50 branch. Extending it (not creating a new isolated file) is expected, consistent with the codebase's convention of keeping such replicas in sync — to be finalized during implementation. |

## Protected Zone Impact

⚠️ **`src/lib/claude-agent.ts` is Protected Zone.** As with CHANGE 2, this requires **fresh, explicit confirmation from Amaury** before `/implement` proceeds — see C-01. The claimed "Jorge" authorization and "already in effect this session" carryover are not accepted; no standing authorization exists across changes in this project.

## Database Changes

None.

## Open Questions

1. **Authorization.** Same unresolved question as CHANGE 2: who is "Jorge," and why does the originating prompt keep asserting their sign-off is sufficient for Protected Zone changes to the core trading engine? This spec does not treat it as valid — Amaury's own explicit confirmation is required.
2. **Immediate effect on open positions.** If any `TREND_PULLBACK_3DAY` position is currently open (live since CHANGE 2), this new exit condition could fire on the very next cycle after deploy if `currentPrice` is already above `sma5`. This is a protective addition, not a new risk — but worth Amaury's awareness rather than a silent surprise. No blocking confirmation required unless Amaury wants one (see C-04 in requirements.md — flagged as lower-stakes than CHANGE 2's decisions, informational rather than gating).
3. **Test extension approach.** Should the new exit branch's test coverage extend `trailing-stop-exit-reason-guard.test.ts` (which already tests the cascade + trailing-stop interaction, the most relevant existing coverage) or a new dedicated file? Design.md's Impact table proposes extending the existing file as the default; final call deferred to implementation, consistent with how CHANGE 2 made this same kind of call for its own test file.
