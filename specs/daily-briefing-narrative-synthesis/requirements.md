# Requirements — Market Daily Briefing (Prompt 2/3: Narrative Synthesis + Orchestration)

## Functional Requirements

FR-01: The system shall provide a function that synthesizes a market-daily-briefing narrative string via a Claude call, given a pre-computed SPX snapshot, sector-rotation snapshot, and macro-sentiment summary as parameters.
FR-02: The system shall provide an orchestration function that determines whether a `market_daily_briefings` row already exists for today's date.
FR-03: The system shall synthesize and persist a new narrative when no row exists for today's date.
FR-04: The system shall not call Claude or write a new row when a row already exists for today's date.
FR-05: The orchestration function shall return the narrative text for today's briefing, whether freshly synthesized or already persisted.
FR-06: The system shall persist a synthesized briefing's SPX snapshot, sector-rotation snapshot, macro-sentiment counts, narrative, and today's date in a single `market_daily_briefings` row.
FR-07: The system shall determine "today" using the same `date.toISOString().split('T')[0]` idiom already used elsewhere in this codebase, without introducing a new date-formatting helper.
FR-08: Where the persisted row's existence check is performed, the system shall query by the `briefing_date` unique column.
FR-09: Where the persisted row is written, the system shall upsert on the `briefing_date` unique column, matching the uniform `.upsert({...}, { onConflict: '<column>' })` pattern already used throughout `db.ts`.
FR-10: The system shall not populate `vix_proxy_change` or `upcoming_events_note` in the persisted row (reserved for a deferred, later feature per Prompt 1/3's design).

## Non-Functional Requirements

NFR-01: The Claude call inside the synthesis function shall follow the exact pattern already established by `selectStocksForAnalysis()` (`stock-selector.ts:139-158`) for request shape and response handling: `new Anthropic({ apiKey })`, `model: 'claude-sonnet-4-6'`, `response.content[0]`, a `content.type !== 'text'` guard that throws, then direct use of the parsed text. **Amended during implementation** (user decision): the `client.messages.create()` call itself is wrapped in a locally-duplicated retry loop (429/529 exponential backoff, mirroring `claude-agent.ts`'s private `callClaudeWithRetry()`), per `.claude/skills/claude-api-patterns.md`'s "always use retry wrapper for new Claude calls" guidance — chosen over exporting the Protected Zone helper or forgoing retry resilience entirely.
NFR-02: The system shall not add try/catch or other error-swallowing around the Claude call or the DB operations beyond the retry-on-429/529 behavior described in NFR-01 — all non-retryable errors still throw immediately, uncaught, matching the precedent.
NFR-03: The system shall keep the synthesis function decoupled from Supabase — it receives its three inputs as parameters and returns a narrative string, with no DB access inside it.
NFR-04: New code shall be covered by unit tests that replicate the synthesis function's deterministic sub-logic (prompt assembly, response parsing) as standalone functions in the test file, per the established convention in `news-intelligence.test.ts` — the live Claude call itself is not mocked or tested directly.
NFR-05: New code shall be covered by unit tests for the orchestration function's exists/skip vs. missing/synthesize branching, using the established `vi.mock('../db', ...)` decoupled-mock convention.

## Constraints

C-01: This feature must not modify the Protected Zone (`config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`) — no changes are planned there, and none are needed.
C-02: This feature must not modify `news-intelligence.ts`, `getAggregateMacroSentiment()`, `computeSpxSnapshot()`, `computeSectorRotation()`, or any other existing function anywhere in the codebase — this prompt only adds new functions.
C-03: This feature must not wire the new functions into `runAgentCycle()`, `selectStocksForAnalysis()`, or any cron/API entry point — that is Prompt 3/3's scope.
C-04: This feature must not fetch Alpaca bars, call `computeSpxSnapshot()`, `computeSectorRotation()`, or `getAggregateMacroSentiment()` itself — those remain the caller's responsibility (Prompt 3/3); this prompt's functions receive their outputs as parameters.
C-05: This feature must not modify the `market_daily_briefings` migration or any other migration.
C-06: This feature must not modify `NewsEvent`, `NewsClassificationRecord`, `SectorRotationSnapshot`, or any other existing type in `types.ts` — only a new `MarketDailyBriefing` type is added.
C-07: This feature must not introduce a new date-formatting utility — it must reuse the existing inline `date.toISOString().split('T')[0]` idiom.

## Out of Scope

- Wiring into `runAgentCycle()`, `selectStocksForAnalysis()`, or any cron/API route (Prompt 3/3).
- Fetching the SPX/sector bars from Alpaca needed to call `computeSpxSnapshot()`/`computeSectorRotation()` (Prompt 3/3's responsibility — the caller supplies pre-computed snapshots to this prompt's functions).
- VIX proxy and economic-calendar data population (`vix_proxy_change`, `upcoming_events_note` stay `null`, per Prompt 1/3's deferred-columns design).
- Any dashboard/API surface to display the briefing.
- Retrying or backfilling a briefing for a past date — the orchestration function only reasons about "today."
