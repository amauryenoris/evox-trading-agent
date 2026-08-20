# Requirements — Wire Market Daily Briefing into selectStocksForAnalysis() (Prompt 3/3)

## Functional Requirements

FR-01: The system shall call `getAggregateMacroSentiment(12)` once per agent cycle, after `spxSnapshot`/`sectorRotation` are computed and before stock selection.
FR-02: The system shall call `generateDailyBriefing(spxSnapshot, sectorRotation, macroSentiment)` once per agent cycle, reusing the already-computed `spxSnapshot` and `sectorRotation` values.
FR-03: The system shall pass the resulting narrative string into `selectStocksForAnalysis()` as a new 4th argument.
FR-04: The system shall default `selectStocksForAnalysis()`'s new 4th parameter to an empty string when no argument is supplied.
FR-05: Where the 4th parameter is a non-empty string, `selectStocksForAnalysis()`'s prompt shall include a "TODAY'S MARKET BRIEFING" section containing that string.
FR-06: Where the 4th parameter is an empty string, `selectStocksForAnalysis()`'s prompt shall omit the "TODAY'S MARKET BRIEFING" section entirely.
FR-07: The system shall log a successful briefing fetch via `console.log('[BRIEFING]', ...)`.
FR-08: The system shall log a failed briefing fetch via `console.error('[BRIEFING] Failed to generate/fetch daily briefing:', ...)`.
FR-09: Where `getAggregateMacroSentiment()` or `generateDailyBriefing()` throws, the system shall continue the agent cycle with an empty briefing narrative rather than propagating the error.
FR-10: Where the briefing fetch fails, the system shall NOT trigger the existing static-watchlist fallback that `selectStocksForAnalysis()`'s own try/catch controls.

## Non-Functional Requirements

NFR-01: The briefing fetch/error-handling block shall be isolated in its own `try`/`catch`, structurally separate from the existing dynamic-selection `try`/`catch` (`claude-agent.ts`'s existing block around `selectStocksForAnalysis()`).
NFR-02: The new import of `getAggregateMacroSentiment` shall extend the existing `import { newsIntelligenceLayer } from './news-intelligence'` line rather than adding a second import statement for the same module.
NFR-03: The new `selectStocksForAnalysis()` parameter and its prompt-template conditional block shall follow `buildEnrichedPrompt()`'s existing `paramName: string = ''` + `${paramName ? \`...\` : ''}` idiom exactly.
NFR-04: New tests shall cover `selectStocksForAnalysis()`'s conditional-section behavior (non-empty vs. empty `briefingNarrative`) — the first test coverage this function has ever had.
NFR-05: New tests shall follow the established "never mock the Anthropic SDK" convention — deterministic prompt-construction logic is tested directly; the live Claude call inside `selectStocksForAnalysis()` is not mocked or exercised.

## Constraints

C-01: This feature touches `claude-agent.ts`, a hard Protected Zone file — requires Amaury's explicit confirmation before implementation, per `CLAUDE.md`, notwithstanding the diagnostic's "Protected-Zone-level care — authorized by Amaury for this wiring" framing.
C-02: This feature must not modify `spxSnapshot`/`sectorRotation` computation, the GDX/XLE/XLK/SPY fetch block, or any other part of the existing `Promise.all` in `runAgentCycle()`.
C-03: This feature must not modify the existing dynamic-selection `try`/`catch`'s static-watchlist fallback logic or its trigger conditions.
C-04: This feature must not modify `buildEnrichedPrompt()`, `formatSectorRotationContext()`, or `sectorRotationContext`'s own injection — a separate, already-shipped feature.
C-05: This feature must not modify any function inside `market-daily-briefing.ts`, `db-market-briefing.ts`, `news-intelligence.ts`, or `sector-rotation.ts`.
C-06: This feature must not modify `screenerLines`, `sectorLines`, `learningLines`, Pool A/B construction, or the final instruction line inside `selectStocksForAnalysis()`'s prompt — only the new conditional section is added.
C-07: This feature must not modify any existing test file's assertions.
C-08: This feature must not modify any gate, signal-detection, or trade-execution logic — the change affects only prompt context text for candidate selection.

## Out of Scope

- Any change to which symbols get selected beyond the new context text available to Claude's existing synthesis call — the selection mechanism itself (JSON parsing, symbol filtering) is unchanged.
- Retrying a failed briefing fetch within the same cycle.
- Surfacing the briefing narrative or its fetch failures on the dashboard/API.
- Any change to `market_daily_briefings`'s schema or the underlying synthesis/persistence logic (Prompts 1/3 and 2/3, already shipped).
