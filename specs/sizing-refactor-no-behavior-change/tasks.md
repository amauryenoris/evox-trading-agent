# Tasks — Sizing Refactor With No Behavior Change

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone change confirmed: `src/lib/claude-agent.ts` (sizing code only)
- [x] O-1 to O-5 answered (golden-value method, `adjustedShares` in the breakdown, naming the other literals, single call site, degenerate inputs)
- [x] Database migrations drafted (N/A — none)

## Implementation Checklist

### Phase 1 — Golden values from the OLD code (before any edit to claude-agent.ts)
- [x] T-01: Record the golden data: for the 13 reconstructed entries, the stored inputs and the stored `requestedQty` (read-only extraction from `agent_log`, same method as the STEP 0 scripts); commit as test data.
- [x] T-02: Write the frozen verbatim copy of the old `regimeMultiplier`, `calculateBuyQuantity` and the confidence / z-override / EMA steps inside the test, and the input grid for the differential check.
- [x] T-03: Print the "before" quantities table (13 entries) from the old code path and keep it for the final comparison.

### Phase 2 — Pure module (not Protected Zone), tests first
- [x] T-04: Write `position-sizing.test.ts` (RED): golden cases and grid identical with the switch true; switch false → z ≤ −2 with confidence 0.38 gives `round(cappedBase × 0.5)`; regime multipliers; NEUTRAL/missing Kalman halving; buying-power cap; equity cap; zero risk per share; EMA_RECLAIM; the 0.5 confidence minimum; non-finite confidence propagates as before; breakdown fields; purity (same output twice, input not mutated).
- [x] T-05: Create `src/lib/position-sizing.ts` (GREEN): constants, `regimeMultiplier`, `computeBuyQuantity`, breakdown type; no env, no clock, no I/O.

### Phase 3 — Wiring (⚠️ Protected Zone — only after confirmation)
- [x] T-06: `claude-agent.ts`: import the module; remove `regimeMultiplier` and `calculateBuyQuantity`; keep the prompt's `regimeMultiplier` call on the imported function.
- [x] T-07: `claude-agent.ts` sizing block: read `RISK_PCT` / `STOP_LOSS_PCT` as today, call `computeBuyQuantity`, keep the `[BUY SIZING]` line byte-identical (using the breakdown), `requestedQty`, `buyQueueQty` and the immediate path unchanged.
- [x] T-08: Confirm the ranking sort `zScore <= -2.0` and everything outside the sizing code is untouched (diff review).

### Phase 4 — Verification
- [x] T-09: `npx tsc --noEmit` clean.
- [x] T-10: `npx vitest run` — full suite green.
- [x] T-11: Coverage ≥ 80% on new code; 100% lines on `position-sizing.ts`.
- [x] T-12: `npm run build` green.
- [x] T-13: Print the before/after quantities table for the 13 reconstructed entries (must be identical) and `git diff`.
- [x] T-14: Final report states: no live order was placed; what could not be run (the live cycle, `runAgentCycle` end to end); and what to watch on the first live day — every new entry has the same quantity the old formula would give (compare `[BUY SIZING]` and `requestedQty` with the formula).

## Post-Implementation

- [x] Run `/review sizing-refactor-no-behavior-change` to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged except `claude-agent.ts` within the approved sizing edits

## Estimated Complexity

**Low–Medium** — a mechanical extraction of about 40 lines of arithmetic into a pure function, with the real work in proving identity (golden values plus a differential grid). The risk is entirely in a silent change to live position sizes, which the golden test is there to prevent.
