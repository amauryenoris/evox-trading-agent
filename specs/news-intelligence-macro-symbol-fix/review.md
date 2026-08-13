# Review Report — News Intelligence MACRO Symbol Fallback Fix

**Date**: 2026-08-13
**Reviewer**: Claude (automated)
**Status**: APPROVED

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Persist `symbol: null` when `scope === 'MACRO'`, regardless of ambient ticker | ✅ SATISFIED | `news-intelligence.ts:139` — `symbol: parsed.scope === 'MACRO' ? null : (parsed.symbol ?? symbol)` |
| FR-02 | Do NOT substitute ambient ticker for MACRO scope even when `parsed.symbol` is null | ✅ SATISFIED | Same line — the `?? symbol` fallback is unreachable inside the MACRO branch by construction |
| FR-03 | Persist Claude's own `parsed.symbol` for SYMBOL scope when present | ✅ SATISFIED | SYMBOL branch retains `parsed.symbol ?? symbol`, unchanged; covered by test "persists the parsed symbol when scope=SYMBOL and Claude returns a valid symbol" |
| FR-04 | Fall back to ambient ticker for SYMBOL scope when `parsed.symbol` absent, unchanged | ✅ SATISFIED | Same fallback chain preserved; covered by test "falls back to the ambient ticker when scope=SYMBOL and parsed.symbol is null" |
| FR-05 | Leave classification prompt, adjustment map, scope/sentiment/impact parsing unchanged | ✅ SATISFIED | `git diff` confirms lines 1-136 and 140-267 of the pre-fix logic are byte-identical except the two `export` additions (visibility-only, see NFR-01 note) |
| FR-06 | Leave `buildThresholdMap()` unchanged | ⚠️ PARTIAL | Function body is byte-identical; only the `export` keyword was added to its signature (visibility-only, zero behavioral change) — see NFR-01 |
| FR-07 | Leave `getWeeklyNewsStats()` in `db.ts` unchanged | ✅ SATISFIED | `git diff --stat` shows `db.ts` untouched |
| FR-08 | Do NOT modify or backfill existing `news_events` rows | ✅ SATISFIED | No DB writes, no migration, no backfill script in the diff |

## Non-Functional Requirements

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| NFR-01 | Isolated to a single expression change, no ripple to other functions | ⚠️ PARTIAL | The core fix is exactly one expression (line 139), as required. However, `export` was additionally prepended to the `NewsClassification` interface and to `buildThresholdMap()`'s function declaration — a visibility-only change with zero behavioral difference, made to satisfy the already-approved T-07 (direct test of `buildThresholdMap()`'s real output). This is a literal, minor deviation from "single expression change," disclosed transparently in `tasks.md`'s T-02 note. Not a functional risk — both symbols were already used identically throughout the file; only their module-boundary visibility changed. |
| NFR-02 | Unit test covering MACRO-scope null-symbol case, given zero prior coverage | ✅ SATISFIED | `src/lib/__tests__/news-intelligence.test.ts` is the module's first test file; two tests cover the MACRO branch directly (ambient ticker present, and a defensive case where `parsed.symbol` itself is a stray ticker) |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | — |
| src/lib/claude-agent.ts | UNTOUCHED | — |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | MODIFIED | Listed in design.md; pre-authorized by Amaury per the originating request. Not in CLAUDE.md's core 4-file Protected Zone, but is in the separate "Confirm with Amaury before touching" File Permission Matrix — correctly flagged and honored in the spec. |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | — |
| .env / .env.local | UNTOUCHED | — |
| vercel.json | UNTOUCHED | — |
| DB migrations | NONE | No migration files created, per C-02/FR-08 |

No unauthorized Protected Zone changes. The single modified file was declared in `design.md` → Impact on Existing Files, with authorization already on record in the spec's Constraints section (C-01) and Protected Zone Impact section.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ➖ N/A | `claude-agent.ts` untouched; this fix is entirely inside the news-classification layer, which does not decide trades. The Claude Haiku classification call itself (model, prompt, JSON schema) is unmodified. |
| Supabase patterns | ✅ | No new queries added; `saveNewsEvent()`/`getWeeklyNewsStats()` call sites in `db.ts` untouched. `db.ts`'s existing `if (error) throw` pattern is unaffected by this change. |
| TypeScript quality | ✅ | No `any` types introduced; no mutation (the fix is a pure conditional expression in an object-literal return); `classifyNewsItem()` and `buildThresholdMap()` remain well under 50 lines; `news-intelligence.ts` is 320 lines, well under 800; no new magic numbers (reuses the existing adjustment-map constants, untouched) |
| Security | ✅ | No secrets, no SQL, no sensitive data in any log line touched by this diff |

## Task Checklist

- Completed: 11/11 implementation tasks (T-01 through T-11)
- Pre-implementation: 3/3 checked (spec approved — minor checkbox formatting glitch `[ x]` in tasks.md line 5, but user-intentional per session context and clearly marked)
- Post-implementation: 1/2 — "Confirm no other file changed" is checked; "Run /review" is the current step, now satisfied by this report

## Verification Commands Run (independently re-executed for this review)

- `npx tsc --noEmit` → clean, no errors
- `npx vitest run` → 314/314 tests passed (32 test files), including the 6 new `news-intelligence.test.ts` tests
- `git diff --stat -- <all Protected Zone files except news-intelligence.ts> src/lib/db.ts .env .env.local vercel.json` → no output (all untouched)
- `git status --porcelain` → confirms only `src/lib/news-intelligence.ts` (modified) and `src/lib/__tests__/news-intelligence.test.ts` (new) are part of this feature's changes

## Findings

### CRITICAL (blocks merge)
None.

### HIGH (should fix)
None.

### MEDIUM (consider fixing)
None.

### LOW (optional)
- NFR-01/FR-06 technically report PARTIAL rather than full SATISFIED because two `export` keywords were added beyond the single line-139 expression. This was a deliberate, disclosed choice to enable direct testing of the real `buildThresholdMap()` implementation (T-07) rather than duplicating its ~50-line aggregation/capping logic in the test file, which would have carried its own drift risk. No behavioral change resulted. If strict adherence to "single expression change" is preferred over this trade-off in future isolated fixes, the alternative is to test via a hand-replicated copy (as `compute-spx-snapshot-window.test.ts` does elsewhere in this repo) instead of exporting.
- The two `NewsClassification`/`buildThresholdMap` exports slightly widen `news-intelligence.ts`'s public surface. Since nothing outside the module currently imports them except the new test file, this is inert today but worth remembering if the module is refactored later.

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. All 8 functional requirements are satisfied (one marked PARTIAL for a disclosed, zero-behavior-impact visibility change). Both non-functional requirements are met in substance; NFR-01's "single expression" framing is technically broadened by two export keywords, which is noted but does not block. Protected Zone change is limited to the pre-authorized file and matches the spec's declared impact. Ready to commit.
