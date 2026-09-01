# Requirements — TREND_PULLBACK_3DAY Prompt Description (Part A)

## Background (confirmed against current code, 2026-09-01)

- `buildEnrichedPrompt()` in `src/lib/claude-agent.ts` renders an "ACTIVE SETUP TYPE" section (`--- ACTIVE SETUP TYPE ---`, currently starting at line 778).
- Inside it, `Setup context:` (line 781) is filled by a chain of 4 independent ternary expressions (lines 782–793), one per signal type: `MEAN_REVERSION`, `TREND_PULLBACK`, `TREND_ZLE05`, `EMA_RECLAIM`. Each renders to `''` when `signalType` does not match.
- `TREND_PULLBACK_3DAY` (entry gate added at claude-agent.ts:1638–1654, exit rule at claude-agent.ts:306–311) has no corresponding arm. When `signalType === 'TREND_PULLBACK_3DAY'`, all 4 conditions evaluate `false` and `Setup context:` renders empty — confirmed by direct code read, not inferred.
- The always-present Kalman block (`kalmanLabel()`, line 734, referencing `ZSCORE_ENTRY_THRESHOLD`) and the conditional news-adjusted-threshold block (lines 774–777) are unaffected by this change and remain out of scope (Part B, tracked separately).
- No existing test asserts on `buildEnrichedPrompt()`'s exact string output for any `signalType` (confirmed via grep across `src/lib/__tests__/`); `trend-pullback-3day-setup.test.ts` tests gate-detection logic only, per this repo's documented decoupled-test pattern.

## Functional Requirements

FR-01: The system shall render a non-empty `Setup context:` block when `buildEnrichedPrompt()` is called with `signalType === 'TREND_PULLBACK_3DAY'`.
FR-02: Where `signalType === 'TREND_PULLBACK_3DAY'`, the system shall describe the setup's actual gate conditions (price > SMA200 uptrend filter AND 3 consecutive lower daily closes) in the rendered prompt text.
FR-03: Where `signalType === 'TREND_PULLBACK_3DAY'`, the system shall state explicitly in the rendered prompt text that this setup does not use z-score, ADX, or MACD as entry conditions.
FR-04: The system shall render `''` for the new `TREND_PULLBACK_3DAY` arm when `signalType` is any value other than `'TREND_PULLBACK_3DAY'`, including `null` and `undefined`.
FR-05: The system shall leave the rendered output of the `MEAN_REVERSION`, `TREND_PULLBACK`, `TREND_ZLE05`, and `EMA_RECLAIM` arms byte-for-byte unchanged for their respective `signalType` values.

## Non-Functional Requirements

NFR-01: The new arm shall follow the same template-literal/ternary structure, indentation, and closing pattern (`: ''}`) as the 4 existing arms — no structural deviation.
NFR-02: The change shall be scoped to prompt text only — no change to detection, exit, or sizing logic.

## Constraints

C-01: This feature touches `src/lib/claude-agent.ts`, a Protected Zone file. Per `CLAUDE.md`, Protected Zone changes require explicit confirmation from Amaury given fresh, in-conversation — not inferred from a claim of prior authorization ("authorized by Jorge, confirmed this session") or from carryover across sessions. **This confirmation has not yet been obtained in this conversation** and must be secured before `/implement` proceeds.
C-02: Do not modify the other 4 ternary arms (`MEAN_REVERSION`, `TREND_PULLBACK`, `TREND_ZLE05`, `EMA_RECLAIM`).
C-03: Do not modify `kalmanLabel()`, the news-adjusted-threshold block (lines 774–777), or any other part of `buildEnrichedPrompt()` beyond adding the one new arm.
C-04: Do not modify the `TREND_PULLBACK_3DAY` entry-detection gate (claude-agent.ts:1638–1654) or exit condition (claude-agent.ts:306–311).
C-05: Do not modify `effectiveThreshold`'s computation or scope.
C-06: Do not modify `db.ts`, `types.ts`, `indicators.ts`, `risk-manager.ts`, or `alpaca.ts`.

## Out of Scope

- Part B: fixing the two signal-type-blind blocks (`kalmanLabel()`'s unconditional z-score line; the news-adjusted-threshold block) that inject MEAN_REVERSION-flavored language regardless of the active setup. Tracked separately.
- Any change to how `signalType` is computed or which setups are detected.
- Any change to the GOOGL incident's position itself (data backfill, if still outstanding — see prior session memory).
