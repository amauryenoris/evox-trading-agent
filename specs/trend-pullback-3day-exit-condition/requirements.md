# Requirements — TREND_PULLBACK_3DAY Exit-Condition Wiring (CHANGE 3 of 3)

## Functional Requirements

FR-01: The system shall close a `TREND_PULLBACK_3DAY` position when `currentPrice > sma5` and no earlier exit condition (universal or another signal type's branch) has already fired in the same cycle.
FR-02: The system shall evaluate this exit condition only when `signalType === 'TREND_PULLBACK_3DAY'`.
FR-03: The system shall skip this exit condition (never set `exitReason` from it) when `sma5` is `null`.
FR-04: The system shall place this exit branch after the existing `EMA_RECLAIM` exit branch and before the trailing-stop block, mirroring the existing branches' `!exitReason` guard convention.
FR-05: The system shall NOT add any condition beyond `currentPrice > sma5` to this exit branch (no minimum days-held, no momentum confirmation).
FR-06: The system shall NOT modify the two universal exits (profit target, 20-day time stop) or the three existing per-signal-type exit branches (`MEAN_REVERSION`, the `TREND`/`TREND_PULLBACK`/`TREND_ZLE05` group, `EMA_RECLAIM`).
FR-07: The system shall NOT modify `ACTIVATION_PCT`, `ATR_MULT`, or any trailing-stop logic.
FR-08: The system shall NOT modify the CHANGE 2 entry-detection gate (`trendPullback3DaySetup`) or the classification ternary.

## Non-Functional Requirements

NFR-01: The new branch's variable references shall match the exact local variable name already used by the surrounding branches in `enforceExitRules()` (`ind`, not `indicators` — confirmed distinct from CHANGE 2's scope, which uses `indicators`).
NFR-02: The null-check on `sma5` shall use the same `!= null` convention established for `closeMinus2/3/4` in CHANGE 1 and `prevClose`/`sma200` in CHANGE 2.
NFR-03: The system shall pass `npx tsc --noEmit` and `npm run build` with no new errors.
NFR-04: The system shall pass all existing Vitest suites unmodified in behavior (test *fixtures* that inline-replicate `enforceExitRules()`'s cascade, such as `trailing-stop-exit-reason-guard.test.ts`, may be extended with new cases, per this codebase's established convention of keeping such replicas in sync — but no existing assertion shall change meaning).

## Constraints

C-01: This feature touches `src/lib/claude-agent.ts`, which is Protected Zone. **The originating prompt again claims authorization "by Jorge" and "already in effect this session."** As with CHANGE 2, neither is accepted: there is no record of "Jorge" as a project authority, and no standing Protected Zone authorization carries across changes — each touch to `claude-agent.ts` has required its own fresh, explicit confirmation from Amaury in this session (CHANGE 1's indicators.ts scope, CHANGE 2's entry-gate scope). **Fresh, explicit confirmation from Amaury is required before `/implement` proceeds on this change too.**
C-02: The system shall not modify `indicators.ts`, `db.ts`, `alpaca.ts`, or `risk-manager.ts`.
C-03: The system shall not modify any of the 5 pre-existing exit-cascade conditions (2 universal + 3 per-signal-type) above the new branch, nor the trailing-stop block (PASO 1–5) below it.
C-04: **Behavior change for live capital, lower stakes than CHANGE 2 but still real.** `TREND_PULLBACK_3DAY` has been live (per CHANGE 2's explicit confirmation) since that change merged. Any position already open under this signal type is currently exit-protected only by the universal exits and the trailing stop. The moment this change deploys, such positions become subject to a new, immediate exit trigger (`currentPrice > sma5`) that could fire on the very next cycle if already true. This is inherently risk-*reducing* (adds a protective/profit-taking exit, doesn't remove one) rather than risk-increasing like CHANGE 2's decisions were — but Amaury should be aware any currently-open `TREND_PULLBACK_3DAY` position could close on the next cycle after deploy if its price is already above its SMA5.

## Out of Scope

- Any change to `indicators.ts`, `db.ts`, `alpaca.ts`, `risk-manager.ts`.
- Any change to the CHANGE 2 entry gate, `ACTIVATION_PCT`/`ATR_MULT`, or the classification ternary.
- Any change to the 5 pre-existing exit-cascade conditions or the trailing-stop mechanism itself.
- Any additional exit condition beyond the single backtested `currentPrice > sma5` check (no days-held minimum, no momentum filter).
