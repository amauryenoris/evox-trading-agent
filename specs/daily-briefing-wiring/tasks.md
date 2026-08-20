# Tasks — Wire Market Daily Briefing into selectStocksForAnalysis() (Prompt 3/3)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed — `src/lib/claude-agent.ts` is touched (see design.md → Protected Zone Impact); confirmation required even though the diagnostic states this wiring was pre-authorized
- [x] Database migrations drafted (N/A — no schema change)

## Implementation Checklist

### Phase 1 — claude-agent.ts wiring
- [x] T-01: Extend the existing `import { newsIntelligenceLayer } from './news-intelligence'` line to also import `getAggregateMacroSentiment`
- [x] T-02: Add a new import: `import { generateDailyBriefing } from './market-daily-briefing'`
- [x] T-03: Immediately after `sectorRotation`/`sectorRotationContext` are computed, add an isolated `try`/`catch`: `let briefingNarrative = ''`, then inside `try`, `const macroSentiment = await getAggregateMacroSentiment(12)` followed by `briefingNarrative = await generateDailyBriefing(spxSnapshot, sectorRotation, macroSentiment)` and `console.log('[BRIEFING]', briefingNarrative)`; inside `catch`, `console.error('[BRIEFING] Failed to generate/fetch daily briefing:', err)`
- [x] T-04: Confirmed this new block is structurally separate from (not nested inside, not sharing a `try` with) the existing dynamic-selection `try`/`catch`
- [x] T-05: Added `briefingNarrative` as a 4th argument to the existing `selectStocksForAnalysis(candidates, account, positions)` call — no other change to that call site or its surrounding try/catch

### Phase 2 — stock-selector.ts wiring
- [x] T-06: Added `briefingNarrative: string = ''` as a 4th parameter to `selectStocksForAnalysis()`'s signature
- [x] T-07: Inserted a new conditional prompt section immediately after `Currently held: ...` and before `--- POOL A ---`, matching `buildEnrichedPrompt()`'s exact `${paramName ? \`...\` : ''}` idiom, with the header `--- TODAY'S MARKET BRIEFING ---`
- [x] T-08: Confirmed via diff — `screenerLines`, `sectorLines`, `learningLines`, Pool A/B construction, and the final instruction line are byte-identical to before

### Phase 3 — Testing
- [x] T-09: Created `src/lib/__tests__/stock-selector.test.ts` — first-ever test coverage for this function
- [x] T-10: Test added: prompt includes the "TODAY'S MARKET BRIEFING" section when `briefingNarrative` is non-empty, positioned after portfolio state and before Pool A
- [x] T-11: Test added: prompt omits the section entirely when `briefingNarrative` is `''` (default)
- [x] T-12: Confirmed — no test mocks `@anthropic-ai/sdk`; tested via a standalone-replicated prompt-skeleton function (matching `news-intelligence.test.ts`'s convention), since `selectStocksForAnalysis()` itself makes a live Claude call and the spec forbade extracting/modifying its internals beyond the signature and the one new template section

### Phase 4 — Verification
- [x] T-13: Ran `npx tsc --noEmit` — passed
- [x] T-14: Ran `npm run build` — passed
- [x] T-15: Ran the full test suite — 38 files / 344 tests passed (342 pre-fix + 2 new)
- [x] T-16: `git diff` confirms `spxSnapshot`/`sectorRotation` computation, the GDX/XLE/XLK/SPY fetch block, and the existing dynamic-selection try/catch's fallback logic are byte-identical to before
- [x] T-17: `git diff` confirms `buildEnrichedPrompt()` and `formatSectorRotationContext()` untouched (zero occurrences in the diff); no gate/signal/execution logic anywhere in the diff
- [x] T-18: `git diff` matches the expected shape exactly: `claude-agent.ts` (2 import lines changed/added, 9 lines added for the isolated try/catch, 1 argument added to 1 call site), `stock-selector.ts` (1 parameter + 1 template section) — `git status` confirms no other files modified besides the new test file and spec docs

## Post-Implementation

- [ ] Run `/review daily-briefing-wiring` to verify implementation matches spec
- [ ] Confirm `market-daily-briefing.ts`, `db-market-briefing.ts`, `news-intelligence.ts`, `sector-rotation.ts` are all unchanged
- [ ] Report per the diagnostic's requested structure: (1) files modified, (2) verification performed, (3) verification skipped and why, (4) final git diff summary

## Estimated Complexity

Low-Medium — the code change itself is small and mechanical (2 import edits, one isolated try/catch, one new parameter, one new template section), matching tight existing precedents throughout. The complexity is entirely in the *care* required: this is the first change in the whole Market Daily Briefing feature to touch a hard Protected Zone file (`claude-agent.ts`), and getting the failure-isolation behavior exactly right (briefing failure ≠ static-watchlist fallback) is the one piece with real correctness risk.
