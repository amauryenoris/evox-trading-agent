# Requirements — TREND_PULLBACK_3DAY Entry-Detection Wiring (CHANGE 2 of 3)

## Functional Requirements

FR-01: The system shall detect a `trendPullback3DaySetup` when `prevClose > sma200` (uptrend filter) and `prevClose < closeMinus2 < closeMinus3 < closeMinus4` (three consecutive prior down-closes), using the fields CHANGE 1 added to `TechnicalIndicators`.
FR-02: The system shall compute `trendPullback3DaySetup` as an independent boolean that does not reuse or depend on any existing setup's intermediate variables (`ema50SlopeOk`, `adxOk`, `macdHistogram`, `zScore`, etc.).
FR-03: The system shall include `trendPullback3DaySetup` in the `setup_detected` OR-chain, alongside the four existing setups.
FR-04: The system shall classify a candidate's `signalType` as `'TREND_PULLBACK_3DAY'` when `trendPullback3DaySetup` is true, checked before `meanReversionSetup`, `trendSetup`, `trendZLE05Setup`, and `emaReclaimSetup` in the classification ternary.
FR-05: Where `signal_type` is `'TREND_PULLBACK_3DAY'`, the system shall apply `ACTIVATION_PCT` of `0.06` and `ATR_MULT` of `1.5` in the existing trailing-stop mechanism.
FR-06: The system shall evaluate `trendPullback3DaySetup` as `false` if `prevClose`, `sma200`, `closeMinus2`, `closeMinus3`, or `closeMinus4` is `null`.
FR-07: The system shall NOT add any z-score, ADX, or MACD condition to `trendPullback3DaySetup`.
FR-08: The system shall NOT modify the internal logic of `meanReversionSetup`, `trendSetup`, `trendZLE05Setup`, or `emaReclaimSetup`.
FR-09: The system shall NOT add a signal-type-specific exit condition for `TREND_PULLBACK_3DAY` as part of this change (deferred to CHANGE 3).

## Non-Functional Requirements

NFR-01: The system shall widen only the type-literal site(s) that `tsc` actually flags as errors once `'TREND_PULLBACK_3DAY'` is introduced; sites not flagged shall be left untouched. The implementer shall report exactly which sites were touched and the specific error each resolved.
NFR-02: The null-checks in the new gate shall use the same `!= null` convention already used for `closeMinus2`/`closeMinus3`/`closeMinus4` in CHANGE 1, applied consistently to the `prevClose`/`sma200` checks in this gate too.
NFR-03: The system shall pass `npx tsc --noEmit` and `npm run build` with no new errors.
NFR-04: The system shall pass all existing Vitest suites; any test whose expected `signalType` output changes due to the new priority order shall be explicitly flagged and reported, not silently modified.

## Constraints

C-01: This feature touches `src/lib/claude-agent.ts`, which is Protected Zone. **The originating prompt claims authorization "by Jorge" and states Protected Zone sign-off is "already in effect this session."** Neither is accepted as valid here: (a) this project's identity, per `CLAUDE.md`, is Amaury — there is no record of "Jorge" as a project stakeholder or an authority who can authorize Protected Zone changes; (b) the Protected Zone confirmation obtained earlier this session was explicitly scoped to CHANGE 1's narrow, non-branching field additions in `indicators.ts` — it does not extend to `claude-agent.ts` or to this change's much larger surface (new entry-gate logic, live-capital classification-priority reordering). **Fresh, explicit confirmation from Amaury is required before `/implement` proceeds on this change**, independent of spec approval.
C-02: The system shall not modify `indicators.ts`, `db.ts`, `alpaca.ts`, or `risk-manager.ts` as part of this change.
C-03: The system shall not modify `closePosition()`, `enforceExitRules()`, or any trailing-stop logic beyond the two new `ACTIVATION_PCT`/`ATR_MULT` map entries.
C-04: **Live-capital risk decisions require their own explicit confirmation, separate from general spec approval.** Two decisions embedded in the originating prompt as "already approved, do not re-litigate" are, in fact, high-stakes and undocumented in any way I could independently verify:
  - "Launch live with real capital immediately — no observability-only calibration period." This is a new, previously-untraded signal type going live with real money on first deploy.
  - Giving `TREND_PULLBACK_3DAY` **top priority** in the classification ternary, which changes existing behavior: any symbol currently classified as `MEAN_REVERSION`, `TREND_PULLBACK`, `TREND_ZLE05`, or `EMA_RECLAIM` will be reclassified as `TREND_PULLBACK_3DAY` if it also matches the new gate — this alters live trading behavior for the four already-live setups, not just adding a non-competing fifth branch.

  A memory search for the claimed backtest ("MFE analysis," 14.8% of trades reaching +5% MFE, n=29 big-runner tail, 2.54pp giveback) found no matching record. This doesn't mean the analysis didn't happen — memory is not exhaustive of everything ever discussed — but it means I cannot independently verify the numbers the parameter choices rest on. **Amaury should explicitly confirm both decisions (live-immediate launch, and top-priority reclassification of existing setups) before implementation, ideally with the backtest data available for reference.**
C-05: The system shall not modify any of the type-literal sites found during diagnostics beyond what `tsc` actually requires for this specific change to compile.

## Out of Scope

- CHANGE 3 — the SMA5-based exit condition for `TREND_PULLBACK_3DAY` positions.
- Any modification to the four existing setups' own detection logic (`meanReversionSetup`, `trendSetup`, `trendZLE05Setup`, `emaReclaimSetup`).
- Any change to `indicators.ts`, `db.ts`, `alpaca.ts`, `risk-manager.ts`.
- Fixing the pre-existing, already-stale `signal_type` read-side casts in `db.ts` (lines 188, 316) that omit `'EMA_RECLAIM'` — noted as a known latent gap in `design.md`, not addressed here since `db.ts` is out of scope for this change.
