# Requirements — candidate_scores Data-Layer Plumbing

## Functional Requirements

FR-01: The system shall provide a `candidate_scores` jsonb column on `selection_history`, nullable, added via a tracked migration.

FR-02: The system shall expose a `CandidateScore` type with fields `symbol` (string), `score` (number), `regime` (string), `risks` (string array), and `thesis` (string).

FR-03: The system shall allow `SelectionDecision` to optionally carry a `candidateScores` field of type `CandidateScore[]`.

FR-04: Where `insertSelectionDecision()` is called with `candidateScores` present, the system shall persist it to the `candidate_scores` column.

FR-05: Where `insertSelectionDecision()` is called without `candidateScores`, the system shall persist `null` to the `candidate_scores` column.

FR-06: The system shall map a row's `candidate_scores` column back onto `SelectionDecision.candidateScores` when read via `getRecentSelections()`.

FR-07: Where a `selection_history` row's `candidate_scores` column is `null` (including all pre-existing historical rows), the system shall map it to `undefined` on the returned `SelectionDecision`, without error.

## Non-Functional Requirements

NFR-01: This change shall not alter the runtime behavior of any currently-running code path — `candidateScores` remains unpopulated by any production call site until a separate, later change wires it up.

NFR-02: This change shall not add any new Alpaca or Anthropic API calls.

## Constraints

C-01: This feature must not modify the Protected Zone (`src/lib/config.ts`, `src/lib/claude-agent.ts`, `src/lib/risk-manager.ts`, `src/lib/indicators.ts`, `src/lib/news-intelligence.ts`, `src/lib/watchlist-monitor.ts`, `src/lib/learning.ts`).

C-02: This feature must not modify `src/lib/stock-selector.ts` — that is explicitly out of scope for this prompt (covered by a separate, later prompt).

C-03: The new migration shall not include any RLS statement — `selection_history`'s RLS is already live-enabled, confirmed empirically.

C-04: The new migration file shall follow the existing naming convention (`{14-digit timestamp}_{snake_case description}.sql`) and use `ADD COLUMN IF NOT EXISTS`.

C-05: No other field or column mapping in `insertSelectionDecision()`/`getRecentSelections()` may change.

C-06: `candidatesOffered`'s own construction or meaning must not change.

C-07: No existing test file's assertions may be modified.

C-08: `npx tsc --noEmit` and `npm run build` must both pass after the change.

## Out of Scope

- Any change to `stock-selector.ts` — the `SELECTION_SYSTEM_PROMPT` change, `max_tokens` increase, and response-parsing logic that would actually populate `candidateScores` are a separate, later prompt.
- Backfilling `candidate_scores` for any of the 745 existing `selection_history` rows — all remain `null` after this migration, which is correct and expected.
- Any dashboard UI surfacing `candidateScores` — not requested, not part of this change.
- Persisting or reading `candidate_scores` anywhere outside `insertSelectionDecision()`/`getRecentSelections()`.
