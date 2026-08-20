# Review Report — Market Daily Briefing (Prompt 2/3: Narrative Synthesis + Orchestration)

**Date**: 2026-08-20
**Reviewer**: Claude (automated)
**Status**: APPROVED WITH WARNINGS

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Synthesis function taking 3 pre-computed inputs, returns narrative via Claude | ✅ SATISFIED | `synthesizeDailyBriefingNarrative(spxSnapshot, sectorRotation, macroSentiment): Promise<string>` — `market-daily-briefing.ts:97-130` |
| FR-02 | Orchestration function determines whether today's row exists | ✅ SATISFIED | `generateDailyBriefing()` calls `getMarketDailyBriefingByDate(today)` — `market-daily-briefing.ts:139` |
| FR-03 | Synthesize + persist when no row exists | ✅ SATISFIED | Lines 145-147: calls synthesis then `upsertMarketDailyBriefing(buildBriefingRecord(...))` |
| FR-04 | No Claude call / no write when row already exists | ✅ SATISFIED | Lines 140-143: early return with `existing.narrative`, before synthesis is ever called |
| FR-05 | Orchestration returns narrative (fresh or existing) | ✅ SATISFIED | Both branches return a `string` narrative — line 142 (existing) and line 150 (new) |
| FR-06 | Persist SPX + sector + macro + narrative + date in one row | ✅ SATISFIED | `buildBriefingRecord()` maps all fields into a single `Omit<MarketDailyBriefing, 'id'\|'created_at'>` object, written via one `upsertMarketDailyBriefing()` call |
| FR-07 | "Today" via existing `toISOString().split('T')[0]` idiom, no new helper | ✅ SATISFIED | `market-daily-briefing.ts:137` — no new date utility introduced anywhere |
| FR-08 | Existence check queries by `briefing_date` | ✅ SATISFIED | `db.ts` — `.eq('briefing_date', briefingDate).maybeSingle()` |
| FR-09 | Upsert on `briefing_date`, matching `db.ts`'s uniform pattern | ✅ SATISFIED | `.upsert({...}, { onConflict: 'briefing_date' })` immediately followed by `if (error) throw new Error(...)` — byte-for-byte the same two-line shape as every other upsert in the file |
| FR-10 | `vix_proxy_change`/`upcoming_events_note` not populated | ✅ SATISFIED | `buildBriefingRecord()` hardcodes both to `null` |
| NFR-01 | Claude-call pattern matches precedent, amended with local retry wrapper | ✅ SATISFIED | Request/response shape matches `selectStocksForAnalysis()` exactly (model, `content[0]`, type guard, fence-strip+parse); retry loop is a verbatim duplicate of `claude-agent.ts`'s private `callClaudeWithRetry()`, correctly re-flagged in-code with a comment explaining why it's duplicated rather than imported |
| NFR-02 | No error-swallowing beyond retry-on-429/529 | ✅ SATISFIED | Non-retryable errors `throw err` immediately (line 31); no other try/catch anywhere in the new file |
| NFR-03 | Synthesis function decoupled from Supabase | ✅ SATISFIED | `synthesizeDailyBriefingNarrative()` has zero imports from `./db`; only `generateDailyBriefing()` touches `db.ts` |
| NFR-04 | Tests cover synthesis's deterministic sub-logic | ✅ SATISFIED (with a documented, reasoned deviation) | Instead of copy-replicating logic into the test file, the sub-logic (`formatSpxSnapshotContext`, `formatSectorRotationSnapshot`, `formatMacroSentimentSummary`) was exported from the source file and imported directly in tests — a strictly safer variant of the same convention (zero drift risk vs. copy-paste), since unlike `classifyNewsItem()` these helpers are pure and side-effect-free. A comment in the test file states why the live-calling function itself isn't tested. |
| NFR-05 | Tests cover orchestration's exists/skip vs. missing/synthesize branching | ⚠️ PARTIAL | The "exists → skip" branch is directly tested end-to-end via `generateDailyBriefing()` with mocked `db.ts`. The "missing → synthesize" branch is **not** exercised end-to-end through `generateDailyBriefing()` itself — only its payload-construction logic (`buildBriefingRecord()`) is tested in isolation. This is a real, disclosed gap: Vitest cannot intercept a same-module bare-identifier call to `synthesizeDailyBriefingNarrative()` from within `generateDailyBriefing()`, so mocking it without mocking the Anthropic SDK (against convention) isn't mechanically possible with the current single-file structure. |
| C-01–C-07 | Protected Zone, existing-function, wiring, Alpaca-fetch, migration, type, and date-helper constraints | ✅ SATISFIED | Verified via `git diff` — zero changes to `config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `stock-selector.ts`, `state-fingerprint.ts`, `sector-rotation.ts`, or any migration; no `runAgentCycle()`/`selectStocksForAnalysis()`/API-route reference to the new functions (grepped); `NewsEvent`/`NewsClassificationRecord`/`SectorRotationSnapshot` all diff-clean; no new date utility added |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | — |
| src/lib/claude-agent.ts | UNTOUCHED | `callClaudeWithRetry` duplicated, not imported/exported — file itself has zero diff |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | — |

No unauthorized Protected Zone changes. `db.ts` and `types.ts` (both outside the CLAUDE.md permission matrix's protected list, per this feature's — and the prior feature's — precedent) and the new `market-daily-briefing.ts` file are the only files touched, exactly as designed.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ➖ N/A | `claude-agent.ts` not touched; this Claude call is a market-narrative synthesis, not a trading decision — no action/BUY/SELL/HOLD language anywhere in the new system prompt |
| Supabase patterns | ✅ | No `any` cast (both new `db.ts` functions cast to the concrete `MarketDailyBriefing` type, same pattern as `NewsClassificationRecord`); `if (error) throw` present on both; no `db.ts` import added to any `'use client'` file; the `market_daily_briefings` table already has RLS enabled (verified in Prompt 1/3) |
| TypeScript quality | ✅ | No `any` in new code; `buildBriefingRecord()` constructs a fresh object rather than mutating inputs; all functions in `market-daily-briefing.ts` are well under 50 lines (longest is `synthesizeDailyBriefingNarrative` at ~25 lines); `db.ts` is now 795 lines — see MEDIUM finding below; `1024`/`429`/`529`/`30_000`/`4` are the same named-in-context constants already used identically in `claude-agent.ts`'s precedent, not novel magic numbers |
| Security | ✅ | No hardcoded secrets (`ANTHROPIC_API_KEY` read from env, guarded); no SQL injection surface (Supabase client, parameterized `.eq()`/`.upsert()`); no sensitive data in the two `console.log`/`console.warn` calls (briefing date and retry-attempt counters only) |

## Task Checklist

- Completed: 15/15 implementation tasks (`T-01`–`T-15`), plus all 3 Pre-Implementation checkboxes (including the "Open questions resolved" checkbox, which the user confirmed alongside a third mid-implementation decision — the retry-wrapper question — that was surfaced and answered via an explicit question during implementation, not silently assumed)
- 2 Post-Implementation checkboxes remain unchecked (`/review` itself, and the "confirm unchanged files" check) — both satisfied by this review

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
- **`db.ts` is now 795 lines**, 5 lines under the 800-line file cap from `coding-style.md`. Not a violation today, but the next addition to this file (very likely in Prompt 3/3, if any further `db.ts` function is needed) will breach it. Consider extracting a `db-market-briefing.ts` module (mirroring the existing `db-cooldowns.ts` split already present in this file) the next time `db.ts` needs to grow.
- **NFR-05 partial**: the "missing row → synthesize → upsert" path through `generateDailyBriefing()` is not exercised end-to-end by any test — only its two halves are (the exists-check via `generateDailyBriefing()`, and the payload-construction via `buildBriefingRecord()` directly). This is a reasoned, disclosed tradeoff forced by the codebase's own "never mock Anthropic" convention colliding with same-module function calls not being mockable in Vitest, not an oversight — but it does mean a bug in how `generateDailyBriefing()` *wires* `synthesizeDailyBriefingNarrative()`'s result into `buildBriefingRecord()`'s call (as opposed to a bug in either piece individually) would not be caught by the current test suite.

### LOW (optional)
- The overall project coverage tool (`vitest.config.ts` → `coverage.include: ['src/lib/db.ts']`) only tracks `db.ts`, and the two new `db.ts` functions added here are not directly unit-tested (only reachable via the mocked `'../db'` module in `market-daily-briefing.test.ts`). This exactly matches the pre-existing pattern for every other thin Supabase-wrapper function in `db.ts` (e.g. `getRecentNewsClassifications()` is equally untested directly) — not a new gap introduced by this feature, just worth naming for completeness.

---

## Decision

**APPROVED WITH WARNINGS** — No CRITICAL or HIGH findings; 2 MEDIUM findings noted above (file-size headroom, one untested integration seam), both disclosed transparently during implementation rather than discovered after the fact. Safe to commit; worth a follow-up note for Prompt 3/3 if `db.ts` needs another addition.
