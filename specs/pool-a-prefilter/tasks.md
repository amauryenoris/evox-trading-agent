# Tasks — Pool A Pre-Filter

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [ ] Open questions resolved (currently: none)

---

## Implementation Checklist

### Phase 1 — Import

- [x] T-01: Add `import { INSTRUMENT_BLACKLIST } from './config'` to `src/lib/stock-selector.ts` (line 1–17 import block)

### Phase 2 — Pre-filter pipeline

Insert the following block in `src/lib/stock-selector.ts` after line 70 (`const allCandidates: ScreenerStock[] = [...candidates, ...sectorSnapshots]`) and before the `getSelectionEvaluations` call. The pipeline mutates the local `candidates` variable only — `allCandidates` (used for validation at line 137) is built before the filter so it still contains the full universe.

- [x] T-02: Step 1 — filter `candidates` to remove symbols in `INSTRUMENT_BLACKLIST`
- [x] T-03: Step 2 — filter `candidates` to remove symbols in `heldSymbols`
- [x] T-04: Step 3 — filter `candidates` to remove symbols where `Math.abs(c.changePercent) >= 15`
- [x] T-05: Step 4 — after `selectionEvals` is fetched, build `goodSymbols` Set from profitable outcomes and sort `candidates` (good history first, original volume order preserved within ties)
- [x] T-06: Step 5 — truncate `candidates` to `candidates.slice(0, 15)`

### Phase 3 — Prompt update

- [x] T-07: Update `screenerLines` (line 87) to iterate `candidates` directly instead of `candidates.slice(0, 30)` — the slice is now handled by Step 5

### Phase 4 — Logging

- [x] T-08: Add a `console.log` after Step 5 showing how many candidates remain:
  ```ts
  console.log(`[STOCK-SELECTOR] Pool A after pre-filter: ${candidates.length} candidates (blacklist/held/overbought removed, history sorted)`)
  ```

---

## Post-Implementation

- [ ] Verify TypeScript compiles with zero errors: `npx tsc --noEmit` (requires npm install)
- [x] Verify `INSTRUMENT_BLACKLIST` import does not create a circular dependency (config.ts has no imports — confirmed)
- [x] Manually trace: if `candidates` is empty after filtering, `screenerLines` is `[]` — Claude receives only Pool B symbols. Confirmed acceptable (Pool B alone covers 3 sectors)
- [ ] Run `/review pool-a-prefilter` to verify implementation matches spec

---

## Estimated Complexity

**Low** — single file modification, five array operations, one new import. No new types, no new DB calls, no API changes. The logic is entirely contained within `selectStocksForAnalysis()`.
