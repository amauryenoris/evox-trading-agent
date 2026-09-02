# Tasks — Gate MEAN_REVERSION-Specific Threshold Language Behind signalType (Part B)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Amaury has given fresh, explicit, in-conversation confirmation to modify `src/lib/claude-agent.ts` (Protected Zone) for this specific change — Part A's authorization does not carry over, and the task's claimed prior authorization does not satisfy this per project rule
- [x] Database migrations drafted (if applicable) — N/A, none required

## Implementation Checklist

### Phase 1 — Prompt text and kalmanLabel() signature (only phase)
- [x] T-01: In `src/lib/claude-agent.ts`, modify `kalmanLabel()`'s signature (currently lines 675-690) to accept an optional `zscoreAnnotation?: string` second parameter; append it to the `Z-Score:` line only when truthy (`${zscoreAnnotation ? \` (${zscoreAnnotation})\` : ''}`); leave the other 3 raw data lines and the `Signal:` line unchanged in content and order.
- [x] T-02: Update the call site (currently line 734) to pass the annotation only when `signalType === 'MEAN_REVERSION'`, `undefined` otherwise.
- [x] T-03: Update the news-adjusted-threshold block's condition (currently lines 774-777) to additionally require `signalType === 'MEAN_REVERSION'`, alongside the existing `effectiveThreshold !== undefined && effectiveThreshold !== ZSCORE_ENTRY_THRESHOLD` check.
- [x] T-04: Verify Part A's ACTIVE SETUP TYPE ternary chain (lines 778-798) is byte-for-byte unchanged (diff review).
- [x] T-05: Verify no other line in `buildEnrichedPrompt()`, `kalmanLabel()`'s 4 unconditional lines, or the rest of the file changed beyond the 3 edits above.

### Phase 2 — Verification
- [x] T-06: Run `npx tsc --noEmit` — must pass.
- [x] T-07: Run `npm run build` — must pass.
- [x] T-08: Run the full test suite (`npx vitest run`) — all existing tests must pass unmodified; report which test files ran. Explicitly confirm `agent-reasoning-log-detect-kind.test.ts`, `report-generator-hold-classification.test.ts`, and `mr-gate-rejection-message.test.ts` are unaffected (they assert on the unrelated `MR_RANGING_ADX_GATE` error-message string, not `kalmanLabel()`).
- [x] T-09: Manually confirm (via a throwaway script — not a new permanent test file) that: (a) the Z-Score annotation appears for `signalType === 'MEAN_REVERSION'` and is fully absent — not empty parens — for `TREND_PULLBACK`, `TREND_ZLE05`, `EMA_RECLAIM`, `TREND_PULLBACK_3DAY`, `null`, and `undefined`; (b) the `NEWS-ADJUSTED THRESHOLD` block appears only when both `signalType === 'MEAN_REVERSION'` AND `effectiveThreshold` differs from `ZSCORE_ENTRY_THRESHOLD` are true — specifically confirming a non-MEAN_REVERSION candidate with a genuinely adjusted `effectiveThreshold` still does NOT render the block.
- [x] T-10: Report the final line count of `claude-agent.ts`.

## Post-Implementation

- [x] Run `/review prompt-threshold-language-gate` to verify implementation matches spec
- [x] Confirm Protected Zone changes were the ones explicitly approved (no scope creep into Part A's ACTIVE SETUP TYPE chain, entry-detection gates, exit conditions, or `effectiveThreshold`'s computation)

## Estimated Complexity

Low — two small, well-isolated edits (a new optional function parameter used in one line, and one `&&` clause added to one existing ternary condition); no logic, type, or test changes required beyond verification. The only non-trivial item is securing the required Protected Zone confirmation from Amaury before `/implement`, separately from Part A's.
