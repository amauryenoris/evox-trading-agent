# Requirements — Narrow getRecentNewsClassifications()'s Return Type

## Functional Requirements

FR-01: The system shall expose a type that represents exactly the columns `getRecentNewsClassifications()` selects from `news_events` (`scope`, `symbol`, `sentiment`, `impact`, `threshold_adjustment`).
FR-02: The system shall declare `getRecentNewsClassifications()`'s return type as that narrower type instead of `NewsEvent[]`.
FR-03: The system shall reject, at compile time, any code that reads a field from `getRecentNewsClassifications()`'s result that is not one of `scope`, `symbol`, `sentiment`, `impact`, `threshold_adjustment`.
FR-04: The system shall leave the SQL query inside `getRecentNewsClassifications()` — the `.select()` column list, the `.gt()` time filter, and the error-handling branch — unchanged.
FR-05: The system shall leave `newsIntelligenceLayer()`'s defensive filter (`.filter((e) => e.scope && e.sentiment && e.impact)`) unchanged.
FR-06: Where a new column is added to `getRecentNewsClassifications()`'s `.select()` list in the future, the system shall carry a comment at that location pointing to the type definition that must be updated in tandem.
FR-07: Where the narrower type's field list is defined, the system shall carry a comment pointing back to the `.select()` list it must stay in sync with.

## Non-Functional Requirements

NFR-01: The change shall not alter runtime behavior for either existing caller (`newsIntelligenceLayer()`, `getAggregateMacroSentiment()`).
NFR-02: The change shall not require any test file to be modified for existing tests to keep passing.
NFR-03: `npx tsc --noEmit` and `npm run build` shall both pass with zero new errors after the change.

## Constraints

C-01: This feature must not modify the `NewsEvent` interface itself — all 12 existing fields stay exactly as declared.
C-02: This feature must not modify the `.select()` column list, the `.gt()` filter, or the error-handling branch inside `getRecentNewsClassifications()`.
C-03: This feature must not modify `newsIntelligenceLayer()`, `getAggregateMacroSentiment()`, `buildThresholdMap()`, or any other function in `news-intelligence.ts`.
C-04: This feature must not modify any type in `types.ts` other than adding the one new derived type.
C-05: This feature must not modify any other function in `db.ts`.
C-06: This feature must not add a new import statement to `db.ts` if an import from `./types` already exists there — extend the existing one.

## Out of Scope

- Adding a database-level `NOT NULL` constraint on any `news_events` column (the defensive filter in `newsIntelligenceLayer()` stays precisely because this has not been confirmed/added).
- A more general derive-the-type-from-the-query abstraction (e.g., inferring the `Pick<>` fields from the `.select()` string automatically) — explicitly rejected in favor of paired comments, matching this project's preference for simple, direct code.
- Any change to how `market_daily_briefings` or the Market Daily Briefing feature (Prompts 2/3, 3/3) consumes this function's output.
- Widening or otherwise changing `NewsClassification` (the existing interface in `news-intelligence.ts` used by `buildThresholdMap()`) — that type is untouched and unrelated to this fix.
