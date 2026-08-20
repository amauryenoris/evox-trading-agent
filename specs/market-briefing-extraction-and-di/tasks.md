# Tasks — Extract db-market-briefing.ts + Dependency Injection for generateDailyBriefing()

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Open question resolved (see design.md → Open Questions: adding a new error-case test for the moved functions, beyond the diagnostic's literal file-move scope)
- [x] Protected Zone changes confirmed (N/A — see design.md → Protected Zone Impact: no protected file is touched)

## Implementation Checklist

### Phase 1 — Extraction
- [x] T-01: Create `src/lib/db-market-briefing.ts` with its own private `getClient()` (duplicated, not imported), following `db-cooldowns.ts`'s structure
- [x] T-02: Move `getMarketDailyBriefingByDate()` into the new file — body byte-identical, throw-on-error behavior unchanged
- [x] T-03: Move `upsertMarketDailyBriefing()` into the new file — body byte-identical, throw-on-error behavior unchanged
- [x] T-04: In `db.ts`, remove the two moved function bodies (currently lines 770-789)
- [x] T-05: In `db.ts`, add a re-export block for both functions from `'./db-market-briefing'`, placed alongside the existing `db-cooldowns.ts` re-export
- [x] T-06: In `db.ts`, remove the now-unused `MarketDailyBriefing` import (confirmed no other reference remained in the file after the move)

### Phase 2 — Dependency Injection
- [x] T-07: In `market-daily-briefing.ts`, change the import of `getMarketDailyBriefingByDate`/`upsertMarketDailyBriefing` to `'./db-market-briefing'`
- [x] T-08: Change `generateDailyBriefing()`'s signature to accept an optional 4th parameter `synthesize: typeof synthesizeDailyBriefingNarrative = synthesizeDailyBriefingNarrative`
- [x] T-09: Change the internal call site to use `synthesize(...)` instead of the bare `synthesizeDailyBriefingNarrative(...)` identifier

### Phase 3 — Testing
- [x] T-10: Update `market-daily-briefing.test.ts`'s `vi.mock('../db', ...)` path to `'../db-market-briefing'`
- [x] T-11: Add a new test for the "missing row → synthesize → upsert" path: mock `getMarketDailyBriefingByDate` to return `null`, call `generateDailyBriefing()` with a 4th argument (a simple fake async function returning a known narrative), and assert (a) the fake was called with the correct 3 arguments, (b) `upsertMarketDailyBriefing` was called with a record containing the fake narrative, (c) the return value is the fake narrative
- [x] T-12: Added a new dedicated `db-market-briefing.test.ts` (mocking `@supabase/supabase-js` directly, matching `cooldown-db.test.ts`'s convention) testing the real moved functions — confirms both throw on a Supabase error, plus success-path coverage that didn't exist before (5 tests total; this also closes the "LOW" finding from the Prompt 2/3 review about these functions being untested directly)
- [x] T-13: Ran all 7 pre-existing tests — 0 behavioral changes, only the mock path differs (confirmed via full suite run)

### Phase 4 — Verification
- [x] T-14: Run `npx tsc --noEmit` — passed
- [x] T-15: Run `npm run build` — passed
- [x] T-16: Run the full test suite — 37 files / 342 tests passed (336 pre-fix + 5 new in `db-market-briefing.test.ts` + 1 new in `market-daily-briefing.test.ts`)
- [x] T-17: `db.ts`: 795 → 778 lines (17 fewer). New `db-market-briefing.ts`: 30 lines.
- [x] T-18: `git diff` confirms `db-cooldowns.ts`, `types.ts`, `news-intelligence.ts`, `sector-rotation.ts`, `state-fingerprint.ts`, `stock-selector.ts`, `claude-agent.ts` all empty-diff; `market-daily-briefing.ts`'s diff shows only the import line, the signature line, and the one call-site line changed — `formatSpxSnapshotContext()`, `formatSectorRotationSnapshot()`, `formatMacroSentimentSummary()`, `buildBriefingRecord()`, `synthesizeDailyBriefingNarrative()`, `callClaudeWithRetry()` all byte-identical
- [x] T-19: Confirmed — the "row exists" test still calls `generateDailyBriefing()` with exactly 3 arguments and passes unmodified; the new 4-arg test is fully independent

## Post-Implementation

- [ ] Run `/review market-briefing-extraction-and-di` to verify implementation matches spec
- [ ] Confirm `db-cooldowns.ts`, `types.ts`, `news-intelligence.ts`, `sector-rotation.ts`, `state-fingerprint.ts`, `stock-selector.ts`, `claude-agent.ts` are all unchanged

## Estimated Complexity

Low — a mechanical file split following an exact existing precedent, plus a single optional-parameter addition with a default value preserving 100% backward compatibility for 3-argument callers. The only genuine risk is the test mock path (silently stops applying if missed, per the diagnostic's explicit warning) — mitigated by T-10 and T-13 explicitly checking for this.
