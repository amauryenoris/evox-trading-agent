# Tasks — TREND_PULLBACK_3DAY: No Entry When Price Is Above the SMA5 Exit Level

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone change confirmed: `src/lib/claude-agent.ts` (3DAY exit comparison, entry gate, blocked record)
- [x] O-1 answered (equality is allowed because the exit is strict, or otherwise)
- [x] O-2, O-3, O-4 answered
- [x] Database migrations drafted (N/A — none)

## Implementation Checklist

### Phase 1 — Shared comparison (not Protected Zone), tests first
- [x] T-01: Create `src/lib/__tests__/sma5-exit.test.ts` (RED): price below SMA5 → not met / allowed; equal → not met / allowed (operator stated in the test name); above → met / blocked; SMA5 null, undefined, NaN, Infinity → not blocked and flagged unusable; table of pairs reused later by the exit test; reason text has the prefix `TREND_3DAY_ABOVE_SMA5`, `price $X >= SMA5 $Y (3DAY exit would fire immediately)` and two-decimal numbers.
- [x] T-02: Create `src/lib/sma5-exit.ts` (GREEN): `isSma5ExitConditionMet` (the exact exit expression), gate-state helper, reason builder.

### Phase 2 — Exit direction (⚠️ Protected Zone — only after confirmation)
- [x] T-03: Write `trend-3day-sma5-gate-exit-rules.test.ts` (RED/GREEN): through `enforceExitRules` a TREND_PULLBACK_3DAY position exits for exactly the pairs where the shared function is true, with the unchanged text `Exit rule: price $X closed above SMA5 $Y`; null SMA5 does not exit; another setup is unaffected.
- [x] T-04: `claude-agent.ts` exit: replace the inline comparison with the shared function; text and behavior unchanged.

### Phase 3 — Entry gate (⚠️ Protected Zone)
- [x] T-05: `claude-agent.ts` detection (~1982-1999): keep the SMA200 and streak conditions untouched; derive the blocked flag from them and the shared function; `trendPullback3DaySetup` = conditions met and not blocked; one `console.warn` with the symbol for a missing or non-finite SMA5.
- [x] T-06: `claude-agent.ts` blocked record (next to `TREND_QUALITY_FAIL`): `[SETUP-GATE]` log + HOLD record with `error` starting `TREND_3DAY_ABOVE_SMA5`, full indicators, `continue` when no other setup is detected; console line only when another setup is detected (O-2).
- [x] T-07: Confirm the existing `trend-pullback-3day-setup.test.ts` and all other 3DAY tests pass unedited.

### Phase 4 — Verification
- [x] T-08: `npx tsc --noEmit` clean.
- [x] T-09: `npx vitest run` — full suite green.
- [x] T-10: Coverage ≥ 80% on new code; 100% lines on `sma5-exit.ts`.
- [x] T-11: `npm run build` green.
- [x] T-12: Show `git diff` and the exact comparison used (`sma5 != null && price > sma5`).
- [x] T-13: Final report states: no live order was placed; what could not be run (the live cycle, real candidates, the `decisions.push` wiring inside `runAgentCycle`); and what to watch on the first live day — blocked 3DAY candidates appear as HOLD with `TREND_3DAY_ABOVE_SMA5` and every new 3DAY entry has price below SMA5.

## Post-Implementation

- [x] Run `/review trend-3day-above-sma5-gate` to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged except `claude-agent.ts` within the approved edits

## Estimated Complexity

**Low** — a pure comparison module, one call site on each side and one more blocked-candidate record in an existing pattern. The only care points are equality semantics (O-1) and not suppressing other setups (O-2).
