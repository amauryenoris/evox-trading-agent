# Tasks — TREND_PULLBACK_3DAY Data Layer (CHANGE 1 of 3)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (indicators.ts — see design.md Open Questions)
- [x] Database migrations drafted (N/A — none needed)

## Implementation Checklist

### Phase 1 — Data Layer
- [x] T-01: In `src/lib/types.ts`, add `sma5: number | null`, `closeMinus2?: number | null`, `closeMinus3?: number | null`, `closeMinus4?: number | null` to the `TechnicalIndicators` interface, immediately after the existing `prevClose` field (do not touch `ema50Prev`, already present).
- [x] T-02: In `src/lib/indicators.ts`, inside `calculateAllIndicators()`'s return object, add `sma5: calculateSMA(bars, 5)` alongside the existing `sma50`/`sma200` computations.
- [x] T-03: In the same return object, add `closeMinus2`, `closeMinus3`, `closeMinus4`, each using `prevClose`'s exact bounds-check convention (`bars.length >= N ? bars[bars.length - N].c : null`).

### Phase 2 — Verification
- [x] T-04: Run `npx tsc --noEmit` — must pass with no new errors. (Failed initially with `sma5` non-optional — see FR-02 deviation note in requirements.md. Passed clean after making `sma5` optional, per Amaury's confirmation.)
- [x] T-05: Run `npm run build` — must pass. (Passed.)
- [x] T-06: Run the full Vitest suite (`npm test` / `npx vitest run`) — all existing tests must pass unmodified; report which test files ran. (40 test files, 366 tests, all passed unmodified.)
- [x] T-07: Diff `calculateAllIndicators()` before/after — confirm every pre-existing field (`sma50`, `sma200`, `prevClose`, `ema50Prev`, `rsi`, `macd`, `bollingerBands`, `ema50`, `ema200`, `distanceToEma50Pct`, `kalman`, `currentPrice`, `volume`, `prevDayVolume`, `adx`, `atr`, `atrPercentile`, `marketRegime`) is byte-for-byte unchanged. (Confirmed — only additions, no existing lines altered.)
- [x] T-08: Confirm no test asserts on `TechnicalIndicators`' exact field count/shape (already checked during spec authoring — none found in `src/lib/__tests__/`; re-confirm if new tests were added since). (Re-confirmed — no such assertions; the 4 fixtures that broke were structural type mismatches, not shape assertions, and are resolved by the FR-02 deviation.)

## Post-Implementation

- [x] Run `/review trend-pullback-3day-data-layer` to verify implementation matches spec
- [x] Confirm no files outside `types.ts`/`indicators.ts` were touched (specifically: `claude-agent.ts`, `db.ts`, `alpaca.ts`, `risk-manager.ts` untouched) — verified via `git status --short src/`

## Estimated Complexity

**Low** — two small, additive, non-branching changes to already-generic/already-patterned code (`calculateSMA` is reused as-is; the `closeMinusN` fields copy `prevClose`'s exact one-line pattern). No new logic, no new tests strictly required beyond the existing suite passing, no data flow changes. The only friction is the Protected Zone sign-off on `indicators.ts`.
