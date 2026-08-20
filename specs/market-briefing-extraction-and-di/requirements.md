# Requirements — Extract db-market-briefing.ts + Dependency Injection for generateDailyBriefing()

## Functional Requirements

FR-01: The system shall provide `getMarketDailyBriefingByDate()` and `upsertMarketDailyBriefing()` from a new dedicated module, `src/lib/db-market-briefing.ts`, instead of from `db.ts`.
FR-02: The system shall re-export both functions from `db.ts`, so any consumer importing them from `'./db'` continues to resolve correctly.
FR-03: The system shall import both functions directly from `'./db-market-briefing'` in `market-daily-briefing.ts`, not via `db.ts`'s re-export.
FR-04: The system shall accept an optional 4th parameter on `generateDailyBriefing()` — a synthesis function — defaulting to the real `synthesizeDailyBriefingNarrative`.
FR-05: The system shall use the supplied 4th-parameter function (when provided) in place of `synthesizeDailyBriefingNarrative` when constructing a new briefing.
FR-06: The system shall behave identically to the pre-fix implementation when `generateDailyBriefing()` is called with only 3 arguments.
FR-07: Where a test supplies a fake synthesis function via the 4th parameter, the system shall allow the "missing row → synthesize → upsert" path to be exercised end-to-end without any Anthropic SDK call.

## Non-Functional Requirements

NFR-01: `getMarketDailyBriefingByDate()` and `upsertMarketDailyBriefing()` shall keep their exact current `if (error) throw new Error(...)` behavior after the move — `db-cooldowns.ts`'s error-swallowing pattern (`console.error`, return `[]`/`void`) shall NOT be adopted.
NFR-02: `db-market-briefing.ts` shall have its own private `getClient()` helper, duplicated (not imported from `db.ts`), matching `db-cooldowns.ts`'s structural precedent.
NFR-03: `db.ts`'s line count shall decrease as a result of this extraction (two function bodies removed, replaced by a shorter re-export block).
NFR-04: All 7 pre-existing tests in `market-daily-briefing.test.ts` shall continue to pass with zero changes to their assertions — only the mocked module path changes.
NFR-05: The new test covering the "missing row" branch shall assert: the injected fake synthesis function was called with the correct `spxSnapshot`/`sectorRotation`/`macroSentiment` arguments; `upsertMarketDailyBriefing` was called with a record containing the fake narrative; and `generateDailyBriefing()`'s return value is the fake narrative.

## Constraints

C-01: This feature must not modify the Protected Zone (`config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`) — no changes are planned there, and none are needed.
C-02: This feature must not modify `formatSpxSnapshotContext()`, `formatSectorRotationSnapshot()`, `formatMacroSentimentSummary()`, `buildBriefingRecord()`, `synthesizeDailyBriefingNarrative()`, or `callClaudeWithRetry()` — all stay byte-identical.
C-03: This feature must not move the `MarketDailyBriefing` type — it stays in `types.ts`.
C-04: This feature must not modify `db-cooldowns.ts` — it is a read-only structural precedent.
C-05: This feature must not change any of the 7 existing tests' expected behavior/assertions — only their mocked module path.
C-06: This feature must not modify any other file beyond `db.ts`, the new `db-market-briefing.ts`, `market-daily-briefing.ts`, and `market-daily-briefing.test.ts`.

## Out of Scope

- Wiring `generateDailyBriefing()` into `runAgentCycle()`, `selectStocksForAnalysis()`, or any cron/API route (Prompt 3/3, unaffected by this fix).
- Adding an error-case test for the two extracted functions' `throw new Error(...)` behavior beyond what's needed to confirm the move preserved it (a lightweight confirmation, not a new dedicated error-path test suite, unless the diagnostic's "confirm with a constructed error-case test if one doesn't already exist" turns out to require one — see design.md).
- Any change to `db-cooldowns.ts` itself, or reconciling its error-swallowing convention with the rest of `db.ts` — noted as a pre-existing inconsistency, not resolved here.
- Extending dependency injection to any other Claude-calling function in the codebase (`classifyNewsItem()`, `selectStocksForAnalysis()`) — scoped to `generateDailyBriefing()` only.
