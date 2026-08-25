# Tasks — Fix candidatesOffered's Pre-Truncation Capture Bug

## Pre-Implementation

- [ x] Amaury has reviewed and approved this spec
- [ x] Protected Zone changes confirmed — N/A, none required
- [x ] Database migrations drafted — N/A, none required

## Implementation Checklist

### Phase 1 — Reorder `allCandidates` construction (stock-selector.ts)
- [x] T-01: Remove the `const allCandidates: ScreenerStock[] = [...candidates, ...sectorSnapshots]` line from its current position (currently line 88, immediately after `sectorSnapshots` is fetched and before `selectionEvals`/Step 4/Step 5)
- [x] T-02: Insert the identical line immediately after Step 5's truncation (currently line 105: `candidates = candidates.slice(0, MAX_POOL_A_CANDIDATES)`), before the `console.log('[STOCK-SELECTOR] Pool A after pre-filter...')` line
- [x] T-03: Confirm every other reference to `allCandidates` in the function (the `candidatesOffered: allCandidates` field, and `const allSymbolSet = new Set(allCandidates.map(...))`) is untouched — only the declaration moved

### Phase 2 — Testing
- [x] T-04: Add a test constructing a scenario with >15 Pool A survivors pre-truncation (e.g. 20 candidates passing Steps 1-3), asserting the resulting `allCandidates`/`candidatesOffered` length is capped at `MAX_POOL_A_CANDIDATES` (15) plus the Pool B count — not the pre-truncation 20+
- [x] T-05: Add a test confirming a `selected` symbol that exists only in the pre-truncation-but-not-post-truncation set is now filtered OUT of `selectStocksForAnalysis()`'s return value — asserting the corrected behavior explicitly (not merely that nothing crashes)
- [x] T-06: Confirm the 2 existing `stock-selector.test.ts` describe blocks (briefingNarrative section, Step 3 gap+volume filter) still pass unmodified — both test replicated logic snippets, unaffected by this reordering

## Post-Implementation

- [x] Run `/review candidates-offered-truncation-fix` to verify implementation matches spec
- [x] Run `npx tsc --noEmit` and `npm run build` — both must pass
- [x] Confirm Protected Zone files unchanged
- [x] Confirm no existing test assertions were modified

## Estimated Complexity

Low — this is a one-line relocation within a single function, with no logic changes to any of the 5 filter/sort/truncate steps. The bulk of the work is in Phase 2's tests, which must construct a >15-candidate scenario to actually exercise the previously-buggy path (the existing 2 tests never invoke `selectStocksForAnalysis()` directly, so new test infrastructure — likely a mocked Anthropic client and Supabase reads — is needed to test this function end-to-end for the first time).
