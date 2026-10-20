# Tasks — Outlier Guard on the 1-Minute High + Split `applyProfitFloor`

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone change confirmed: `src/lib/claude-agent.ts` (call-site argument + `sell_now` extraction)
- [x] O-1 answered (bad bar that stays in the 18 h window: A cap / B reject / C shorter window)
- [x] O-2, O-3, O-4 answered
- [x] Database migrations drafted (N/A — none)

## Implementation Checklist

### Phase 1 — Bar-level guard (`src/lib/peak-high.ts`, tests first)
- [x] T-01: Extend `peak-high.test.ts` (RED): zero-volume spike ignored; non-finite bar ignored; a high 5% above close is capped at close×1.01; a legitimate high (≤ close×1.01) unchanged; existing cases untouched.
- [x] T-02: Add `PEAK_CLOSE_CAP_RATIO` and the bar filter/cap in `maxRegularSessionHigh` (GREEN).

### Phase 2 — Jump guard (BLOCKED until O-1)
- [x] T-03: Tests (RED): candidate within +10 pp unchanged and no warn; candidate above is handled per O-1 (capped at stored+10 pp, or ignored) with a `console.warn` carrying symbol, candidate, stored, entry, cap; guard skipped without `{ storedHigh, entry }`; never returns below the stored high at the call site; bars failure still returns null; **sequence of 3–4 consecutive checks with the same bad bar in the window** — total rise must not exceed 10 pp of entry (FR-17); a sequence of legitimate rising highs keeps up.
- [x] T-04: Add `PEAK_MAX_JUMP_PP` and the optional `{ storedHigh, entry }` argument to `getPeakHighSinceLastCheck`; implement the O-1 behavior.

### Phase 3 — Call site and split (⚠️ Protected Zone — only after confirmation)
- [x] T-05: `claude-agent.ts`: pass `{ storedHigh: ctx.highSinceEntry ?? currentPrice, entry }` to `getPeakHighSinceLastCheck`; keep the single named import.
- [x] T-06: `claude-agent.ts`: extract the `sell_now` branch of `applyProfitFloor` into its own helper with identical persistence, exit text and `exitAlreadySet` handling.
- [x] T-07: Confirm `applyProfitFloor` and the new helper are each ≤ 50 lines.

### Phase 4 — Verification
- [x] T-08: `mr-profit-floor-exit-rules.test.ts` and `protective-stop.test.ts` pass with no edits.
- [x] T-09: Add one exit-rules test that the call site passes `storedHigh` and `entry` (mock call arguments).
- [x] T-10: `npx tsc --noEmit` clean.
- [x] T-11: `npx vitest run` — full suite green.
- [x] T-12: Coverage ≥ 80% on new code; 100% lines on `peak-high.ts`.
- [x] T-13: `npm run build` green.
- [x] T-14: Show `git diff`; state that no live order was placed and what could not be run (real SIP bars, real bad prints, the live cron).

## Post-Implementation

- [x] Run `/review mr-peak-outlier-guard` to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged except `claude-agent.ts` within the approved edits

## Estimated Complexity

**Low–Medium** — two small files and a mechanical extraction, but the jump-guard semantics (O-1) decide whether the fix actually works, and the exit-rules test mock constrains how the new argument can be passed.
