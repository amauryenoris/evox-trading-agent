# Requirements — EMA_RECLAIM Null EMA50 Fix + System Prompt Correction

## Functional Requirements

FR-01: The system shall block EMA_RECLAIM setup detection when `indicators.ema50` is null.

FR-02: The system shall block EMA_RECLAIM setup detection when `indicators.ema50Prev` is null.

FR-03: The system shall block EMA_RECLAIM setup detection when `indicators.prevClose` is null.

FR-04: The system shall compare `indicators.currentPrice` directly against `indicators.ema50` (no null-coalescing fallback) when evaluating the EMA50 cross condition.

FR-05: The system shall compute the EMA50 distance percentage using `indicators.ema50` directly (no null-coalescing fallback) when evaluating the 0.2% minimum distance condition.

FR-06: The system shall describe EMA_RECLAIM to Claude as a trend-resumption setup (price reclaiming EMA50 from below after a pullback), not as a mean-reversion setup.

FR-07: The system shall include in the EMA_RECLAIM prompt description: the cross confirmation logic (`prevClose <= ema50Prev`, `currentPrice > ema50`), the z-score constraint (`z < 0`), the EMA50 slope direction, and the 0.2% minimum distance requirement.

FR-08: The system shall note in the EMA_RECLAIM prompt description that the best setups have EMA50 > EMA200 (structural uptrend intact).

## Non-Functional Requirements

NFR-01: The fix shall introduce zero TypeScript compiler errors (strict mode).

NFR-02: The fix shall not change any other setup detection logic (MEAN_REVERSION, TREND_PULLBACK, TREND_ZLE05).

NFR-03: The fix shall not modify `enforceExitRules()`, position sizing, or any open-position logic.

## Constraints

C-01: This feature touches `src/lib/claude-agent.ts`, which is in the Protected Zone — changes require explicit confirmation from Amaury before implementation.

C-02: The `!` non-null assertion operator may only be used in `emaReclaimSetup` after `hasPrevData` has been confirmed true (i.e., the non-null check must precede the assertion in the same boolean expression).

## Out of Scope

- Changes to `indicators.ts` (EMA50 calculation logic)
- Changes to how `ema50Prev` is populated or passed in the indicators object
- Backfilling or re-evaluating historical trades affected by the bug
- Changes to the MEAN_REVERSION, TREND_PULLBACK, or TREND_ZLE05 prompt descriptions
- Adding new tests beyond those directly covering the null-guard behavior
