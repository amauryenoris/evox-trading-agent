# Review Report — Extract db-market-briefing.ts + Dependency Injection for generateDailyBriefing()

**Date**: 2026-08-20
**Reviewer**: Claude (automated)
**Status**: APPROVED WITH WARNINGS

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Functions provided from new dedicated module | ✅ SATISFIED | `db-market-briefing.ts:11-30` — both functions present, correctly exported |
| FR-02 | Re-exported from `db.ts` | ✅ SATISFIED | `db.ts` diff shows `export { getMarketDailyBriefingByDate, upsertMarketDailyBriefing } from './db-market-briefing'` alongside the existing `db-cooldowns.ts` block |
| FR-03 | `market-daily-briefing.ts` imports directly from `'./db-market-briefing'` | ✅ SATISFIED | Line 5 |
| FR-04 | Optional 4th param, defaults to real function | ✅ SATISFIED | `market-daily-briefing.ts:136` — `synthesize: typeof synthesizeDailyBriefingNarrative = synthesizeDailyBriefingNarrative` |
| FR-05 | Supplied function used in place of the real one | ✅ SATISFIED | Line 146 — `await synthesize(...)`, not the bare identifier |
| FR-06 | 3-argument calls behave identically | ✅ SATISFIED | The pre-existing "row exists" test still calls with exactly 3 arguments and passes unmodified — default parameter mechanics confirmed correct |
| FR-07 | Fake synthesis exercises "missing row" path end-to-end, zero Anthropic SDK | ✅ SATISFIED | New test in `market-daily-briefing.test.ts` — no `@anthropic-ai/sdk` import/mock anywhere in the test file |
| NFR-01 | Throw-on-error kept, not swallowed | ✅ SATISFIED | Both functions' bodies identical to pre-move; additionally now directly verified by 2 new dedicated error-case tests in `db-market-briefing.test.ts` |
| NFR-02 | Own private `getClient()`, not imported from `db.ts` | ✅ SATISFIED | `db-market-briefing.ts:4-9` — duplicated, byte-identical to `db.ts`'s and `db-cooldowns.ts`'s version |
| NFR-03 | `db.ts` line count decreases | ✅ SATISFIED | 795 → 778 (17 fewer) |
| NFR-04 | All 7 pre-existing tests pass with zero assertion changes | ✅ SATISFIED | Diff confirms only the `vi.mock(...)` path string changed; every existing `it()` body is untouched |
| NFR-05 | New test's specific assertions | ✅ SATISFIED | All three assertions present exactly as specified: fake called with correct args, upsert called with a record containing the fake narrative, return value is the fake narrative |
| C-01 | Protected Zone untouched | ✅ SATISFIED | Verified via `git diff` — empty for all 7 Protected Zone files |
| C-02 | Six named functions stay byte-identical | ✅ SATISFIED | `market-daily-briefing.ts` diff shows exactly 3 changed lines (import, signature, one call site) — `formatSpxSnapshotContext`, `formatSectorRotationSnapshot`, `formatMacroSentimentSummary`, `buildBriefingRecord`, `synthesizeDailyBriefingNarrative`, `callClaudeWithRetry` all untouched |
| C-03 | `MarketDailyBriefing` type stays in `types.ts` | ✅ SATISFIED | `types.ts` has zero diff |
| C-04 | `db-cooldowns.ts` not modified | ✅ SATISFIED | Zero diff |
| C-05 | Existing 7 tests' assertions unchanged | ✅ SATISFIED | Confirmed above (NFR-04) |
| C-06 | No file modified beyond the 4 listed | ⚠️ PARTIAL | A 5th file, `src/lib/__tests__/db-market-briefing.test.ts`, was created — not in `design.md`'s "Impact on Existing Files" table or C-06's literal list. This was done in direct response to T-12 (itself approved via the "open question resolved" checkbox) and disclosed transparently in `tasks.md`'s completion notes, not hidden — but it's a real, if minor, scope expansion beyond the spec's literal file list. See MEDIUM finding below. |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | — |
| src/lib/claude-agent.ts | UNTOUCHED | — |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | — |

No unauthorized Protected Zone changes.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ➖ N/A | No Protected Zone file touched |
| Supabase patterns | ✅ | No new `any` cast (the inherited `as MarketDailyBriefing \| null` cast is unchanged from before the move); `if (error) throw` preserved on both functions; no `db.ts`/`db-market-briefing.ts` import added to any `'use client'` file; `market_daily_briefings` RLS already enabled (Prompt 1/3) |
| TypeScript quality | ✅ | No `any` in new code; `db-market-briefing.ts` (30 lines) and updated `db.ts` (778 lines) both well within limits; all functions well under 50 lines; no magic numbers introduced |
| Security | ✅ | No hardcoded secrets; no SQL injection surface (Supabase client, parameterized `.eq()`/`.upsert()`); no sensitive data logged |

## Task Checklist

- Completed: 19/19 implementation tasks (`T-01`–`T-19`), plus all 3 Pre-Implementation checkboxes
- 2 Post-Implementation checkboxes remain unchecked (`/review` itself, and the "confirm unchanged files" check) — both satisfied by this review

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
- **C-06 scope deviation**: a new test file (`db-market-briefing.test.ts`, 5 tests) was created, beyond `design.md`'s explicit 4-file impact list and C-06's literal constraint. The underlying work is sound and directly serves an already-approved task (T-12) plus incidentally closes a LOW finding from the Prompt 2/3 review (these two functions were previously untested even indirectly) — but the spec's own "Out of Scope" section explicitly hedged toward "a lightweight confirmation, not a new dedicated error-path test suite" as the default, and what was built is closer to the latter (a full dedicated file with both success- and error-path coverage for both functions, not just a minimal error-throw check). Future specs touching this area should decide up front whether "lightweight" or "dedicated suite" is intended, rather than leaving it to implementation-time judgment as this one did.

### LOW (optional)
- None beyond the above.

---

## Decision

**APPROVED WITH WARNINGS** — No CRITICAL or HIGH findings. One MEDIUM finding: a disclosed, beneficial, but technically out-of-list file addition. Safe to commit.
