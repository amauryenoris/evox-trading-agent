# Requirements — Wire Per-Candidate Scores into selectStocksForAnalysis()

## Functional Requirements

FR-01: The system shall instruct Claude, via `SELECTION_SYSTEM_PROMPT`, to return a `scores` array containing one `{symbol, score, regime, risks, thesis}` object for every candidate rendered in Pool A and Pool B.

FR-02: The system shall set `max_tokens` to `3000` on the `selectStocksForAnalysis()` Claude API call.

FR-03: Where Claude's response includes a `scores` array, the system shall parse it and assign it to `SelectionDecision.candidateScores`.

FR-04: Where Claude's response omits the `scores` field, the system shall leave `SelectionDecision.candidateScores` as `undefined` without throwing.

FR-05: The system shall derive the function's returned watchlist exclusively from `parsed.selected`, unaffected by the presence, absence, or content of `parsed.scores`.

## Non-Functional Requirements

NFR-01: This change shall not alter `db.ts`, since Prompt 2a already handles `candidateScores` read/write correctly.

NFR-02: This change shall not introduce a second import statement for `./types` — `CandidateScore` shall be added to the existing type-only import.

## Constraints

C-01: This feature must not modify the Protected Zone (`src/lib/config.ts`, `src/lib/claude-agent.ts`, `src/lib/risk-manager.ts`, `src/lib/indicators.ts`, `src/lib/news-intelligence.ts`, `src/lib/watchlist-monitor.ts`, `src/lib/learning.ts`).

C-02: No file other than `src/lib/stock-selector.ts` (and its test file) may be modified.

C-03: The final two lines of `selectStocksForAnalysis()` (`allSymbolSet` construction and `return parsed.selected.filter(...)`) must remain byte-identical.

C-04: Pool A's Steps 1-5 filter/sort/truncate pipeline and `allCandidates`'s own construction must remain unchanged.

C-05: `recordSelectionOutcome()` must remain unchanged.

C-06: No existing test file's assertions may be modified.

C-07: `npx tsc --noEmit` and `npm run build` must both pass.

## Out of Scope

- Any change to `db.ts` — already correctly wired by the prior (Prompt 2a) change.
- Any dashboard UI surfacing `candidateScores`.
- Recalibrating or validating `max_tokens: 3000` — this is an explicitly unvalidated starting estimate; recalibration is a future, separate concern once real response sizes are observed.
- Any use of `candidateScores`/`scores` to influence which symbols are returned — explicitly forbidden by this spec, not merely unaddressed.
