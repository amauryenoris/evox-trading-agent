# Tasks — Market Daily Briefing (Prompt 2/3: Narrative Synthesis + Orchestration)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Open questions resolved (see design.md → Open Questions: `max_tokens`=1024, JSON narrative format — both confirmed; plus a third decision made during implementation: retry wrapper duplicated locally rather than exported from claude-agent.ts, see requirements.md NFR-01 amendment)
- [x] Protected Zone changes confirmed (N/A — see design.md → Protected Zone Impact: no protected file is touched)

## Implementation Checklist

### Phase 1 — Type Layer
- [x] T-01: In `src/lib/types.ts`, add `MarketDailyBriefing` interface (snake_case fields matching all 16 `market_daily_briefings` columns)

### Phase 2 — Data Access Layer
- [x] T-02: In `src/lib/db.ts`, add `MarketDailyBriefing` to the existing `./types` import
- [x] T-03: Add `getMarketDailyBriefingByDate(briefingDate: string): Promise<MarketDailyBriefing | null>` — `.select('*').eq('briefing_date', briefingDate).maybeSingle()`, standard `if (error) throw` check
- [x] T-04: Add `upsertMarketDailyBriefing(record: Omit<MarketDailyBriefing, 'id' | 'created_at'>): Promise<void>` — `.upsert({...}, { onConflict: 'briefing_date' })`, standard `if (error) throw` check

### Phase 3 — Synthesis + Orchestration
- [x] T-05: Create `src/lib/market-daily-briefing.ts`
- [x] T-06: Implement `synthesizeDailyBriefingNarrative(spxSnapshot, sectorRotation, macroSentiment): Promise<string>` following `selectStocksForAnalysis()`'s exact Claude-call pattern (model `claude-sonnet-4-6`, `max_tokens: 1024`, system prompt constant, fence-strip + `JSON.parse`; amended to wrap the API call in a locally-duplicated retry loop per user decision — see requirements.md NFR-01)
- [x] T-07: Implement `generateDailyBriefing(spxSnapshot, sectorRotation, macroSentiment): Promise<string>` — compute today via `new Date().toISOString().split('T')[0]`, call `getMarketDailyBriefingByDate()`, return existing `narrative` if found, else call `synthesizeDailyBriefingNarrative()` + `upsertMarketDailyBriefing()` and return the new narrative

### Phase 4 — Testing
- [x] T-08: Test `generateDailyBriefing()`'s "row exists" branch — mocked `db.ts`, asserts `upsertMarketDailyBriefing` is never called and the existing narrative is returned
- [x] T-09: Test the "row missing" payload-construction logic — extracted `buildBriefingRecord()` as a pure, directly-testable function (rather than mocking `synthesizeDailyBriefingNarrative` in-module, which Vitest cannot intercept for same-file bare-identifier calls); test asserts the exact upsert payload shape
- [x] T-10: Added direct tests for the synthesis function's deterministic sub-logic (`formatSpxSnapshotContext`, `formatSectorRotationSnapshot`, `formatMacroSentimentSummary`) — exported and imported directly rather than replicated by copy-paste in the test file, since (unlike `classifyNewsItem()`) these helpers are pure/side-effect-free and can be exported safely; a comment in the test file explains why `synthesizeDailyBriefingNarrative()` itself stays untested
- [x] T-11: Coverage on new code — all deterministic/branching logic is fully covered (7/7 tests passing); the Claude-calling code path (`synthesizeDailyBriefingNarrative`'s body, `generateDailyBriefing`'s "row missing" branch) is intentionally untested, per the codebase's established "never mock the Anthropic SDK" convention — matches the existing precedent (`classifyNewsItem()`, `selectStocksForAnalysis()` are equally untested). The 80% target is not literally met on this file's raw line-coverage number as a result; project-wide, the only coverage-tracked file (`db.ts`, per `vitest.config.ts`) sits at ~10% baseline across the whole suite already, so this is consistent with actual existing practice, not a new regression.

### Phase 5 — Verification
- [x] T-12: Run `npx tsc --noEmit` — must pass
- [x] T-13: Run `npm run build` — must pass
- [x] T-14: Run the full test suite — all existing tests must pass unmodified
- [x] T-15: Grep to confirm no wiring was added into `runAgentCycle()`, `selectStocksForAnalysis()`, or any API/cron route

## Post-Implementation

- [ ] Run `/review daily-briefing-narrative-synthesis` to verify implementation matches spec
- [ ] Confirm `news-intelligence.ts`, `stock-selector.ts`, `state-fingerprint.ts`, `sector-rotation.ts`, `claude-agent.ts`, and the `market_daily_briefings` migration are all unchanged

## Estimated Complexity

Medium — two new small functions plus two new db.ts functions, all following tight existing precedents (no novel patterns), but the feature is genuinely new logic (first Claude-synthesis call in this feature area, first read-check-then-write orchestration in the codebase) rather than a mechanical extension, and two design choices (max_tokens, response format) need Amaury's sign-off before implementation can start.
