# Requirements — Fix candidatesOffered's Pre-Truncation Capture Bug

## Functional Requirements

FR-01: The system shall construct `allCandidates` from the post-truncation Pool A candidate list (after `MAX_POOL_A_CANDIDATES` truncation) merged with Pool B sector snapshots.

FR-02: The system shall persist `candidatesOffered` (via `insertSelectionDecision()`) as exactly the candidate set that was rendered into `screenerLines` and `sectorLines` for that cycle's prompt — no more, no fewer.

FR-03: Where Pool A's post-filter candidate count exceeds `MAX_POOL_A_CANDIDATES` before truncation, the system shall exclude the truncated-out candidates from `allCandidates`.

FR-04: The system shall validate Claude's `selected` symbols against an `allSymbolSet` derived from the post-truncation `allCandidates`, such that a symbol absent from the actually-rendered prompt is filtered out of the final return value even if Claude names it.

FR-05: The system shall preserve the existing `[...candidates, ...sectorSnapshots]` expression unchanged — only its position in the function changes.

## Non-Functional Requirements

NFR-01: This fix shall not alter the runtime behavior of Steps 1-5 (blacklist, held-position exclusion, gap-vol filter, profitability sort, truncation) — it only changes when their combined result is captured into `allCandidates`.

NFR-02: This fix shall not add any new Alpaca or Anthropic API calls, database queries, or dependencies.

## Constraints

C-01: This feature must not modify the Protected Zone (`src/lib/config.ts`, `src/lib/claude-agent.ts`, `src/lib/risk-manager.ts`, `src/lib/indicators.ts`, `src/lib/news-intelligence.ts`, `src/lib/watchlist-monitor.ts`, `src/lib/learning.ts`) — this fix touches only `src/lib/stock-selector.ts`.

C-02: No file other than `src/lib/stock-selector.ts` (and its test file) may be modified.

C-03: `sectorSnapshots`'s own construction, `screenerLines`/`sectorLines` construction, and the prompt template must remain unchanged.

C-04: No existing test file's assertions may be modified.

C-05: `npx tsc --noEmit` and `npm run build` must both pass after the change.

## Out of Scope

- Any change to `selection_history`'s database schema — this fix changes what gets written into the existing `candidates_offered` jsonb column, not its shape or type.
- Any change to `recordSelectionOutcome()` or `getRecentSelections()` — confirmed via diagnostic that neither reads `.candidatesOffered`'s content, so no adaptation is needed there.
- Backfilling or correcting historical `selection_history` rows already persisted with the pre-truncation (over-inclusive) shape — this fix is forward-looking only, from the moment it deploys.
- Fase 4's structured per-candidate scoring output — this is a standalone prerequisite bugfix, tracked separately.
