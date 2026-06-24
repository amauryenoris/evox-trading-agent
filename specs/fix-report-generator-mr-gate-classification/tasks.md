# Tasks — Fix report-generator.ts HOLD Classification for MR Gate-Blocked Entries

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] Protected Zone changes confirmed (N/A — no Protected Zone file touched)
- [X] Database migrations drafted (N/A)

## Implementation Checklist

### Phase 1 — Classification fix

- [x] T-01: In `src/lib/report-generator.ts`, add `else if (err.includes('MR_RANGING_ADX_GATE')) { noSetupDetected++ }` immediately before the existing `else if (err.includes('gate') || err.includes('Gate') || err.includes('Market closed'))` branch (current line 224), inside the `for (const e of nonExecuted)` loop.

### Phase 2 — Testing

- [x] T-02: Add or extend a unit test (new file `src/lib/__tests__/report-generator-hold-classification.test.ts`, replicating the classification chain inline per project convention) covering:
  - `error: 'MR_RANGING_ADX_GATE: z-score -2.298 met entry threshold -1.20, blocked — regime=RANGING, ADX=null < 18'` → classifies as `noSetupDetected`
  - genuine no-setup entry (`error: undefined`, `reasoning: 'Setup gate: no mean reversion setup...'`) → still classifies as `noSetupDetected` (unchanged)
  - `error: 'Liquidity gate: ...'` → still classifies as `gate1Liquidity` (unchanged)
  - `error: 'TREND_QUALITY_FAIL: adx=12.0 slope=flat'` → still classifies as `noSetupDetected` (unchanged)
- [x] T-03: Run `npx tsc --noEmit` — must exit 0 with no errors.
- [x] T-04: Run `npm run build` — must pass.
- [x] T-05: Trace by hand (or via the new test) the four VERIFY scenarios from the spec context and confirm each lands in the intended bucket.

## Post-Implementation

- [x] Run `/review fix-report-generator-mr-gate-classification` to verify implementation matches spec
- [x] Confirm no Protected Zone file was touched
- [x] Confirm no other branch in the if/else chain changed (diff review)

## Estimated Complexity

**Low** — One additive `else if` branch in a non-Protected file, plus tests. No schema change, no UI change, no new counter.
