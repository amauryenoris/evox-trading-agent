# Requirements — MR Ranging ADX Gate (temporary)

## Context

MEAN_REVERSION entries taken in RANGING regime with ADX < 18 have produced 3/3 losses: RBLX -5.09% (ADX 16.4, z=-3.18), NEM Jun -5.65% (ADX 13.0, z=-1.81), UUUU -6.19% (ADX 15.2, z=-1.57). In a directionless, low-energy market the mean-reversion bounce doesn't materialize before the -5% stop. Counter-case verified: OXY entered in HIGH_VOLATILITY with ADX 17.6 — non-RANGING regimes must NOT be blocked by this gate.

This gate is **temporary**: it will be replaced by the MR Policy layer (SPX-regime-driven) when Macro-B/C is complete. The `trade_evaluations` SPX columns (spx_price/sma50/sma200/regime, commit 6c87d23) are already collecting the data that layer needs.

The current detection is a single expression at `claude-agent.ts:1239`: `meanReversionSetup = zScore <= effectiveThreshold`. This spec splits it into an ungated signal (`meanReversionSignal`) and a gated setup (`meanReversionSetup`), so the raw signal remains observable for counterfactual logging.

## Functional Requirements

FR-01: The system shall compute `meanReversionSignal` as `zScore <= effectiveThreshold`, with no gate applied.

FR-02: The system shall set `meanReversionSetup` to false when `meanReversionSignal` is true, the market regime is `RANGING`, the ADX value is valid, and ADX is below 18.

FR-03: The system shall set `meanReversionSetup` equal to `meanReversionSignal` when the market regime is not `RANGING`.

FR-04: The system shall set `meanReversionSetup` equal to `meanReversionSignal` when the ADX value is invalid (null, NaN, or non-numeric) — fail-open.

FR-05: The system shall set `meanReversionSetup` equal to `meanReversionSignal` when ADX is greater than or equal to 18, regardless of regime.

FR-06: The system shall set `meanReversionSetup` equal to `meanReversionSignal` for all inputs when the gate toggle (`enableMrRangingAdxGate`) is false.

FR-07: When the gate blocks a setup (`meanReversionSignal` true, `meanReversionSetup` false), the system shall emit a `[MR_BLOCKED_RANGING_ADX]` log containing symbol, adx, adxFloor, z, regime, macd, and dist_ema50.

FR-08: When the gate blocks a setup, the system shall record the symbol in a per-cycle set of unique blocked symbols.

FR-09: The system shall report the count of unique gate-blocked symbols in the end-of-cycle stats log line that carries `[TREND_PULLBACK_STATS]`.

FR-10: The system shall continue to use the gated `meanReversionSetup` at every existing decision point (`setup_detected`, auto-entry bypass check, `signalType` derivation) — never `meanReversionSignal`.

FR-11: The system shall preserve the behavior of all four verified loss/pass profiles: NEM (RANGING, 13.0, -1.81) blocked; UUUU (RANGING, 15.2, -1.57) blocked; RBLX (RANGING, 16.4, -3.18) blocked; OXY (HIGH_VOLATILITY, 17.6, -1.28) passes.

## Non-Functional Requirements

NFR-01: After the change, `npx tsc --noEmit` shall produce zero errors.

NFR-02: After the change, `npm run build` shall complete successfully.

NFR-03: After the change, `npx vitest run` shall pass, including a new gate-logic test replicating the decision matrix inline (repo convention for signal tests).

## Constraints

C-01: ⚠️ This feature modifies `src/lib/claude-agent.ts` (Protected Zone). Explicit confirmation from Amaury is required before implementation — spec approval alone is not sufficient; the tasks.md has a dedicated Protected Zone checkbox.

C-02: Only `src/lib/claude-agent.ts` may be modified, plus ONE new test file (`src/lib/__tests__/mr-ranging-adx-gate.test.ts`). No other existing file may change.

C-03: The following must remain byte-identical: `effectiveThreshold`/`thresholdMap` calculation, `trendSetup`, `trendPullbackMacdFloor`, `trendPullbackMomentumOk`, `wouldPassWithoutMacdFloor`, the `[TREND_PULLBACK_BLOCKED_MACD]` log, all TREND_PULLBACK / TREND_ZLE05 / EMA_RECLAIM logic, all exit rules and `enforceExitRules()`.

C-04: The gate must be disable-able by flipping a single boolean (`enableMrRangingAdxGate = false`).

C-05: Invalid ADX data must never block a setup (fail-open by design).

## Out of Scope

- The MR Policy layer (SPX regime) — Macro-B/C replaces this gate; this spec is the stopgap.
- Moving `mrRangingAdxFloor` / `enableMrRangingAdxGate` to `config.ts` or env vars — kept as local consts for the temporary gate; promote only if the gate outlives Macro-B/C.
- Auto-entry bypass: near-miss watchlist auto-entries set `setup_detected` via `isAutoEntry` (line 1415) and therefore bypass this gate. Pre-existing architecture, untouched here — flagged for the MR Policy layer design.
- Dashboard display of blocked entries: gate-blocked symbols fall into the generic no-setup HOLD (error undefined → "No Setup" card). Console log + cycle stats are the observability surface for now.
- Backtesting the floor value (18) — chosen from the 3-loss sample (max 16.4) plus margin; tune later with [MR_BLOCKED_RANGING_ADX] data.
