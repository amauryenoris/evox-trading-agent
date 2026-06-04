# Requirements — TREND_ZLE05 Prompt Description Fix

## Background

Claude's reasoning for an RDW trade (z=1.159) cited "z <= 0.5 is the target range" and flagged a valid entry as outside that range. The gate logic is correct (`z <= 1.25` passes in `claude-agent.ts`). The bug is in the text description passed to Claude inside `buildEnrichedPrompt()` — it still says `0 < z-score <= 0.5` and `ADX >= 20`, reflecting the pre-widening values. Claude's analytical framing must match the actual gate logic.

---

## Functional Requirements

FR-01: The system shall describe the TREND_ZLE05 z-score range as `0 < z-score <= 1.25` in the prompt text passed to Claude inside `buildEnrichedPrompt()`.

FR-02: The system shall describe the TREND_ZLE05 ADX requirement as `>= 18 (or >= 15 with strong MACD > 0.25)` in the prompt text passed to Claude inside `buildEnrichedPrompt()`.

FR-03: The system shall include a note in the TREND_ZLE05 prompt description stating that z 0.5–1.25 is the expanded bucket, valid when ADX and MACD confirm trend quality.

FR-04: The system shall describe TREND_ZLE05 as "price moderately above fair value" (not "slightly above fair value") in the prompt text passed to Claude.

FR-05: The system shall describe the MACD condition as `MACD histogram > 0` (not "positive") in the TREND_ZLE05 prompt text.

---

## Non-Functional Requirements

NFR-01: The prompt description change shall not introduce any TypeScript compilation errors.

NFR-02: The change shall not alter the runtime behavior of the agent — no gate logic, position sizing, or exit rules are affected.

---

## Constraints

C-01: The expression `zScore <= 0.5 ? 'legacy' : 'expanded'` at line 1160 is intentional temp logging and shall not be modified.

C-02: The stale inline comment at line 1193 is low priority and out of scope for this fix.

C-03: No gate variables (`trendZLE05Setup`, `adxOkZLE05`, `trendQualityOkZLE05`) shall be modified.

C-04: No other setup descriptions (`MEAN_REVERSION`, `TREND_PULLBACK`, `EMA_RECLAIM`) shall be modified.

C-05: No `enforceExitRules()` or position sizing code shall be modified.

---

## Out of Scope

- Changing any gate logic or entry conditions
- Removing the temp logging at line 1160
- Fixing the stale inline comment at line 1193
- Any changes to `enforceExitRules()`, position sizing, or risk management
- Changes to other setup descriptions in `buildEnrichedPrompt()`
