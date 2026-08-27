# Requirements — TREND_PULLBACK_3DAY Data Layer (CHANGE 1 of 3)

## Functional Requirements

FR-01: The system shall compute a 5-period simple moving average (`sma5`) inside `calculateAllIndicators()` when bars are available.
FR-02: Where `TechnicalIndicators` is defined, the system shall expose `sma5` as an optional `number | null` field. **Deviation from original spec (recorded during implementation):** the spec originally called for a non-optional field matching `sma50`/`sma200`'s style, but that broke `tsc` across `claude-agent.ts` and `db.ts` (out-of-scope/Protected Zone per C-02) plus 4 test fixtures, since — unlike `sma50`/`sma200` — several fallback/error-path object literals across the codebase omit optional fields. Amaury confirmed making it optional (matching `closeMinus2/3/4`'s pattern) instead of touching Protected Zone files.
FR-03: The system shall compute `closeMinus2` as the close price two trading days prior to the most recent bar when at least 3 bars are available.
FR-04: The system shall compute `closeMinus3` as the close price three trading days prior to the most recent bar when at least 4 bars are available.
FR-05: The system shall compute `closeMinus4` as the close price four trading days prior to the most recent bar when at least 5 bars are available.
FR-06: The system shall return `null` for `closeMinus2`, `closeMinus3`, or `closeMinus4` if there are insufficient bars to compute them.
FR-07: The system shall leave the value and computation of existing `TechnicalIndicators` fields (`sma50`, `sma200`, `prevClose`, `ema50Prev`, and all others) unchanged.
FR-08: The system shall NOT introduce any entry-gate, exit-condition, or signal-classification logic as part of this change.

## Non-Functional Requirements

NFR-01: The system shall compute `closeMinus2`/`closeMinus3`/`closeMinus4` using the same bounds-checking convention already used for `prevClose` (`bars.length >= N ? bars[bars.length - N].c : null`), not a new convention.
NFR-02: The system shall preserve `calculateAllIndicators()`'s existing function signature and all existing returned fields.
NFR-03: The system shall pass `npx tsc --noEmit` and `npm run build` with no new errors introduced by this change.
NFR-04: The system shall pass all existing Vitest suites unmodified.

## Constraints

C-01: This feature must not modify the Protected Zone without explicit confirmation from Amaury. **Note:** `src/lib/indicators.ts` IS listed as Protected Zone in both `specs/README.md` and the project `CLAUDE.md` file-permission matrix ("Signal calculation — Kalman filter"), despite the originating prompt's header claiming otherwise. This spec treats it as Protected Zone — see Open Questions in `design.md`.
C-02: The system shall not modify `claude-agent.ts`, `db.ts`, `alpaca.ts`, or `risk-manager.ts` as part of this change.
C-03: The system shall not modify `calculateSMA()`, nor the existing computation of `sma50`, `sma200`, or `prevClose`.
C-04: The system shall not modify any test file's assertions as part of this change (none currently assert on `TechnicalIndicators`' exact field count/shape — confirmed via search of `src/lib/__tests__/`).

## Out of Scope

- Any entry-gate/down-streak detection logic for `TREND_PULLBACK_3DAY` (this is CHANGE 2).
- Any exit-condition logic for `TREND_PULLBACK_3DAY` (this is CHANGE 3).
- Any modification to `setup_detected` or the `signalType` classification ternary.
- Any change to `claude-agent.ts`, `db.ts`, `alpaca.ts`, `risk-manager.ts`.
- Any new data fetching — the underlying daily bars are already retrieved every cycle via the existing `getBars(sym, '1Day', 300, 300)` calls.
