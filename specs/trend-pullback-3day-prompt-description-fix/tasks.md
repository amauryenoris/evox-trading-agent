# Tasks — TREND_PULLBACK_3DAY Prompt Description (Part A)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Amaury has given fresh, explicit, in-conversation confirmation to modify `src/lib/claude-agent.ts` (Protected Zone) — the task's claimed prior authorization does not satisfy this per project rule
- [x] Database migrations drafted (if applicable) — N/A, none required

## Implementation Checklist

### Phase 1 — Prompt text (only phase)
- [x] T-01: In `src/lib/claude-agent.ts`, add a 5th ternary arm to the `Setup context:` chain (currently lines 782–793), placed immediately after the `EMA_RECLAIM` arm, for `signalType === 'TREND_PULLBACK_3DAY'`, containing: one-line setup description, `Edge:` line describing the price>SMA200 + 3-down-closes gate and explicitly stating no z-score/ADX/MACD condition applies, `Key indicators:` line (SMA200 filter, pullback depth/consistency, SMA5 exit relationship), and a closing guidance sentence — matching the exact template-literal/ternary style of the other 4 arms.
- [x] T-02: Verify the other 4 arms (`MEAN_REVERSION`, `TREND_PULLBACK`, `TREND_ZLE05`, `EMA_RECLAIM`) are byte-for-byte unchanged (diff review).
- [x] T-03: Verify no other line in `buildEnrichedPrompt()` or the rest of the file changed.

### Phase 2 — Verification
- [x] T-04: Run `npx tsc --noEmit` — must pass.
- [x] T-05: Run `npm run build` — must pass.
- [x] T-06: Run the full test suite (`npm test` / relevant `npx vitest run` invocations) — all existing tests must pass unmodified; report which test files ran.
- [x] T-07: Manually confirm (via a quick inline check or a throwaway script — not a new permanent test file, since none was requested) that `buildEnrichedPrompt()` called with `signalType = 'TREND_PULLBACK_3DAY'` renders non-empty setup context, and with every other value (including `null`) the new arm contributes `''`.
- [x] T-08: Report the final line count of `claude-agent.ts`.

## Post-Implementation

- [x] Run `/review trend-pullback-3day-prompt-description-fix` to verify implementation matches spec
- [x] Confirm Protected Zone changes were the ones explicitly approved (no scope creep into the other arms, `kalmanLabel()`, or the news-adjusted-threshold block)

## Estimated Complexity

Low — a single, well-isolated template-literal addition mirroring an existing, repeated 4-arm pattern; no logic, type, or test changes required. The only non-trivial item is securing the required Protected Zone confirmation from Amaury before `/implement`.
