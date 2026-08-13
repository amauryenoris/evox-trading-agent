# Requirements — News Intelligence MACRO Symbol Fallback Fix

## Functional Requirements

FR-01: The system shall persist `symbol: null` for any news classification where `parsed.scope === 'MACRO'`, regardless of whether an ambient ticker was available for that article.

FR-02: The system shall NOT substitute the ambient ticker for `symbol` when `parsed.scope === 'MACRO'`, even when Claude's own `parsed.symbol` is `null`.

FR-03: The system shall persist Claude's own `parsed.symbol` for any news classification where `parsed.scope === 'SYMBOL'` and `parsed.symbol` is present.

FR-04: The system shall fall back to the ambient ticker for `symbol` when `parsed.scope === 'SYMBOL'` and Claude's own `parsed.symbol` is absent, unchanged from current behavior.

FR-05: The system shall leave the classification prompt text, the sentiment+impact→adjustment map, and all scope/sentiment/impact parsing in `classifyNewsItem()` unchanged.

FR-06: The system shall leave `buildThresholdMap()` unchanged.

FR-07: The system shall leave `getWeeklyNewsStats()` in `db.ts` unchanged.

FR-08: The system shall NOT modify or backfill any existing row in `news_events`.

## Non-Functional Requirements

NFR-01: The fix shall be isolated to a single expression change in `classifyNewsItem()` (`src/lib/news-intelligence.ts`), with no ripple changes to other functions.

NFR-02: The fix shall be covered by a unit test exercising the MACRO-scope null-symbol case, since this path has zero existing test coverage today.

## Constraints

C-01: This feature modifies only `src/lib/news-intelligence.ts` (and adds a test file) — no Protected Zone file is touched.

C-02: No backfill of historical `news_events` rows is in scope — forward-only fix.

C-03: `getWeeklyNewsStats()` (`db.ts`) must not be modified — its handling of post-fix null-symbol MACRO rows is to be reported only (informational), as input to a separate future decision.

## Out of Scope

- Backfilling the ~246 already-corrupted MACRO rows in `news_events`.
- Adding scope-aware filtering/defensive handling to `getWeeklyNewsStats()`'s `bullishBoosts`/`bearishPenalties` mapping.
- Any change to the classification prompt, the adjustment map, or scope-classification accuracy (e.g. the Citigroup-note calibration inconsistency or the Workday MACRO/SYMBOL scope question noted in the prior diagnostic) — those are separate, unconfirmed decisions.
- Any change to the Market Daily Briefing / Buy Scanner Phase 2 work this fix is a prerequisite for.
