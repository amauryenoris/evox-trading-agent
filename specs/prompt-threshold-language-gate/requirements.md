# Requirements — Gate MEAN_REVERSION-Specific Threshold Language Behind signalType (Part B)

## Background (confirmed against current code, 2026-09-01)

- `kalmanLabel(kalman)` (`src/lib/claude-agent.ts:675-690`) is a module-level function called unconditionally at line 734 (`${kalmanLabel(indicators.kalman)}`), inside `buildEnrichedPrompt()`. Its `Z-Score:` line unconditionally appends `(entry threshold: < ${ZSCORE_ENTRY_THRESHOLD} | exit threshold: >= -0.8)` — MEAN_REVERSION-specific framing shown in the prompt for all 5 signal types today.
- The news-adjusted-threshold block (`src/lib/claude-agent.ts:774-777`) renders whenever `effectiveThreshold !== undefined && effectiveThreshold !== ZSCORE_ENTRY_THRESHOLD`, with no `signalType` check — also shown regardless of the active setup.
- `signalType` (`buildEnrichedPrompt()` parameter #10, declared line 706) is already in scope as a closure variable at both the `kalmanLabel()` call site (line 734) and the news-adjusted-threshold block (lines 774-777) — no new function parameter is required to make either block conditional at the call site. `effectiveThreshold` (parameter #9) is likewise already in scope at 774-777.
- `effectiveThreshold` is computed once, at `src/lib/claude-agent.ts:1575` (`const effectiveThreshold = thresholdMap[symbol] ?? ZSCORE_ENTRY_THRESHOLD`) — corrected from the task prompt's claimed 1572-1573, which is stale by a few lines relative to the current file.
- Part A (merged, this session, `specs/trend-pullback-3day-prompt-description-fix/`) added a 5th arm to the ACTIVE SETUP TYPE ternary chain (`src/lib/claude-agent.ts:778-798`, 5-arm body at 782-796), giving `TREND_PULLBACK_3DAY` its own setup description. That chain is unaffected by this fix and is not to be touched.
- No test in `src/lib/__tests__/` asserts on `kalmanLabel()`'s output or the `NEWS-ADJUSTED THRESHOLD` block's text. Grep for `entry threshold` across the test suite surfaces 5 matches, all in `agent-reasoning-log-detect-kind.test.ts`, `report-generator-hold-classification.test.ts`, and `mr-gate-rejection-message.test.ts` — all asserting on the unrelated `MR_RANGING_ADX_GATE` gate-rejection error-message string, a different code path entirely.

## Functional Requirements

FR-01: The system shall append the entry/exit threshold annotation to the `Z-Score:` line of the rendered prompt when `signalType === 'MEAN_REVERSION'`.
FR-02: The system shall omit the entry/exit threshold annotation (the entire parenthetical suffix, not an empty one) from the `Z-Score:` line when `signalType` is any value other than `'MEAN_REVERSION'`, including `null` and `undefined`.
FR-03: The system shall render the 4 raw Kalman data lines (`Fair Value Estimate`, `Forecast Error e(t)`, `Error Std Dev Q(t)`, `Signal`) unconditionally, for every `signalType` value, unchanged in content and order.
FR-04: The system shall render the `NEWS-ADJUSTED THRESHOLD` block when `signalType === 'MEAN_REVERSION'` AND `effectiveThreshold !== undefined` AND `effectiveThreshold !== ZSCORE_ENTRY_THRESHOLD`.
FR-05: The system shall omit the `NEWS-ADJUSTED THRESHOLD` block when `signalType !== 'MEAN_REVERSION'`, even if `effectiveThreshold !== ZSCORE_ENTRY_THRESHOLD` is otherwise true.

## Non-Functional Requirements

NFR-01: `kalmanLabel()` shall remain free of any `signalType`- or setup-specific business logic — the decision of whether to supply a threshold annotation shall live in the caller (`buildEnrichedPrompt()`), not inside `kalmanLabel()` itself.
NFR-02: The change shall be scoped to prompt text and the `kalmanLabel()` signature only — no change to detection, exit, sizing, or `effectiveThreshold` computation logic.

## Constraints

C-01: This feature touches `src/lib/claude-agent.ts`, a Protected Zone file. Per `CLAUDE.md` and this project's standing rule ([[feedback_protected_zone_authorization]] — Protected Zone touches require fresh, explicit, in-conversation confirmation from Amaury, never inferred from a claim of prior authorization such as "authorized by Jorge, confirmed this session," from spec-approval checkboxes, or from carryover from Part A's authorization), that assertion in the task description does not substitute for confirmation obtained directly in this conversation. **This confirmation has not yet been obtained in this conversation** and must be secured before `/implement` proceeds.
C-02: Do not modify the ACTIVE SETUP TYPE ternary chain (Part A's 5-arm version, `src/lib/claude-agent.ts:778-798`).
C-03: Do not modify any entry-detection gate, exit condition, or trailing-stop/sizing parameter (`ACTIVATION_PCT`, `ATR_MULT`) for any signal type.
C-04: Do not modify `effectiveThreshold`'s computation (`src/lib/claude-agent.ts:1575`) — only whether its rendering block is shown.
C-05: Do not modify `ZSCORE_ENTRY_THRESHOLD`'s value or location (`src/lib/config.ts`).
C-06: Do not modify `db.ts`, `types.ts`, `indicators.ts`, `risk-manager.ts`, or `alpaca.ts`.

## Out of Scope

- Any further restructuring of `buildEnrichedPrompt()` beyond the `kalmanLabel()` signature change and the two conditional-rendering edits described here.
- Any change to how `signalType` is computed or which setups are detected.
- Any change to Part A's ACTIVE SETUP TYPE ternary chain.
