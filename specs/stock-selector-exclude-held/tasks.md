# Tasks — Exclude Held Symbols from Pool B and selectStocksForAnalysis()'s Return Value

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed — N/A, `stock-selector.ts` is not Protected Zone
- [x] Database migrations drafted — N/A, none needed

## Implementation Checklist

### Phase 1 — stock-selector.ts
- [x] T-01: At `sectorOnlySymbols`'s construction (currently line 107: `const sectorOnlySymbols = sectorSymbols.filter((s) => !screenerSymbolSet.has(s))`), add `&& !heldSymbols.has(s)` to the same filter predicate — do not add a separate `.filter()` call, do not remove the existing `!screenerSymbolSet.has(s)` check
- [x] T-02: At the return statement (currently line 217: `return parsed.selected.filter((s) => allSymbolSet.has(s))`), add `&& !heldSymbols.has(s)` to the same filter predicate — do not remove the existing `allSymbolSet.has(s)` check
- [x] T-03: Remove system-prompt line 59 (`- Stocks currently held should only be included if you may want to evaluate them for exit`) outright — no replacement line
- [x] T-04: Confirm every other line in the file — Pool A's filters (89-98), `MAX_POOL_A_CANDIDATES`/truncation (125), the sort logic (112-122), the mandatory sector-coverage instruction (53-56), both "6-8 symbols" instructions (48, 175), `recordSelectionOutcome()` (220-247) — is byte-for-byte unchanged

## Post-Implementation

- [x] T-05: Run `npx tsc --noEmit` — must pass with zero new errors
- [x] T-06: Produce a diff-only view (`git diff -- src/lib/stock-selector.ts`) confirming exactly the three intended line-level changes and nothing else
- [x] T-07: Confirm `heldSymbols` is now referenced at three points total: Pool A (existing, line 90), Pool B construction (new), and the return statement (new)
- [x] T-08: State explicitly, in the completion report, the fully-held-sector behavior already analyzed in `design.md`'s "Known Behavior Change" section — confirm it still holds against the actual shipped diff (not just the plan)
- [ ] Run `/review stock-selector-exclude-held` to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged — expected, `stock-selector.ts` is not Protected Zone

## Estimated Complexity

**Low** — two one-line filter-predicate extensions (both additive `&&` clauses reusing an already-computed `Set`) and one prompt-text line removal, in a single already-well-understood file. The only real subtlety is the fully-held-sector edge case, which is analyzed and explicitly accepted rather than engineered around, per the CHANGE spec's own scope boundary.
