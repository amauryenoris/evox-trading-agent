# Tasks — EMA_RECLAIM Null EMA50 Fix + System Prompt Correction

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] Protected Zone change confirmed (`src/lib/claude-agent.ts`)

## Implementation Checklist

### Phase 1 — Gate Logic: null guard (`claude-agent.ts` ~line 1253)

- [x] T-01: Extend `hasPrevData` to include `indicators.ema50 != null` as a third condition
- [x] T-02: Replace `indicators.currentPrice > (indicators.ema50 ?? 0)` with `indicators.currentPrice > indicators.ema50!`
- [x] T-03: Replace `(indicators.currentPrice - (indicators.ema50 ?? 0))` with `(indicators.currentPrice - indicators.ema50!)`
- [x] T-04: Replace `(indicators.ema50 ?? 1)` divisor with `indicators.ema50!`

### Phase 2 — System Prompt: EMA_RECLAIM description (`claude-agent.ts` ~line 572)

- [x] T-05: Replace the 3-line EMA_RECLAIM string in `buildEnrichedPrompt()` with the full trend-reclaim description from the spec (including NOT mean-reversion note, cross logic, z-score constraint, EMA50 slope, distance requirement, and EMA50 > EMA200 note)

### Phase 3 — Verification

- [x] T-06: Run `npm run build` — confirm zero TypeScript errors
- [x] T-07: Manually verify `hasPrevData` now has 3 conditions (`prevClose`, `ema50Prev`, `ema50`)
- [x] T-08: Manually verify no `?? 0` or `?? 1` fallbacks remain in `emaReclaimSetup`
- [x] T-09: Manually verify EMA_RECLAIM prompt text contains "trend resumption" / "NOT mean-reversion"
- [x] T-10: Manually verify MEAN_REVERSION, TREND_PULLBACK, TREND_ZLE05 prompt strings are unchanged

### Phase 4 — Testing

- [x] T-11: Write unit test: `emaReclaimSetup` returns `false` when `indicators.ema50 = null` (all other conditions valid)
- [x] T-12: Write unit test: `emaReclaimSetup` returns `false` when `indicators.ema50Prev = null`
- [x] T-13: Write unit test: `emaReclaimSetup` returns `false` when `indicators.prevClose = null`
- [x] T-14: Write unit test: `emaReclaimSetup` returns `true` when all required fields are non-null and conditions pass

## Post-Implementation

- [ ] Run `/review ema-reclaim-null-fix` to verify implementation matches spec
- [ ] Confirm MEAN_REVERSION, TREND_PULLBACK, TREND_ZLE05, `enforceExitRules()`, position sizing unchanged

## Estimated Complexity

**Low** — Two isolated changes in one file: a one-line addition to an existing null guard, two `!` replacements in a boolean expression, and a 3-line string swap in a prompt template. No new functions, no schema changes, no dependencies.
