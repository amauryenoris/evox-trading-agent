# Tasks — Wire Per-Candidate Scores into selectStocksForAnalysis()

## Pre-Implementation

- [ x] Amaury has reviewed and approved this spec
- [ x] Protected Zone changes confirmed — N/A, none required
- [ x] Database migrations drafted — N/A, none required (Prompt 2a already applied the migration)

## Implementation Checklist

### Phase 1 — Prompt + API call (stock-selector.ts)
- [x] T-01: Extend `SELECTION_SYSTEM_PROMPT`'s JSON response instruction (currently lines 47-51) to also request a `scores` array — one `{symbol, score, regime, risks, thesis}` object per candidate shown in Pool A and Pool B, explicitly noting it must cover every rendered candidate, not just the 6-8 selected
- [x] T-02: Change `max_tokens` (currently line 156) from `512` to `3000`

### Phase 2 — Types + response parsing (stock-selector.ts)
- [x] T-03: Add `CandidateScore` to the existing type-only import from `./types` (currently lines 2-9) — one import statement, no duplicate
- [x] T-04: Widen the response-parsing cast (currently line 166) to `{ selected: string[]; reasoning: string; scores?: CandidateScore[] }`
- [x] T-05: Add `candidateScores: parsed.scores` to the `decision` object literal (currently lines 168-173)
- [x] T-06: Confirm the final two lines of the function (`allSymbolSet` construction and `return parsed.selected.filter(...)`) remain byte-identical — no reference to `parsed.scores`/`decision.candidateScores` anywhere in them

### Phase 3 — Testing
- [x] T-07: Add a test: a simulated Claude response with a full `scores` array for every rendered candidate parses correctly into `candidateScores`, verified via the persisted `insertSelectionDecision()` call payload
- [x] T-08: Add a test: a simulated Claude response without a `scores` field completes successfully, `candidateScores` is `undefined`, and the returned watchlist is correct
- [x] T-09: Add a test: a `scores` array containing a low score for a selected symbol AND a `scores` entry for a symbol not in `selected` does not change the returned watchlist — proving `parsed.scores`/`candidateScores` has zero influence on the selection outcome
- [x] T-10: Add a test confirming `max_tokens: 3000` is present in the actual `client.messages.create()` call parameters
- [x] T-11: Confirm all existing `stock-selector.test.ts` describe blocks (briefingNarrative, Step 3 gap+volume filter, candidatesOffered truncation fix) still pass unmodified

## Post-Implementation

- [x] Run `/review candidate-scores-response-wiring` to verify implementation matches spec — APPROVED, see review.md
- [x] Run `npx tsc --noEmit` and `npm run build` — both must pass
- [x] Confirm Protected Zone files unchanged
- [x] Confirm no existing test assertions were modified
- [x] Confirm no file other than `stock-selector.ts` (+ its test file) was modified

## Estimated Complexity

Low — the change is confined to a prompt-text extension, one `max_tokens` constant, one import addition, one cast widening, and one new object-literal field. The behavioral guarantee (scores never influence the returned watchlist) is already structurally true simply by not touching the last two lines of the function — Phase 3's tests exist to prove that guarantee explicitly, not because the mechanism is complex.
