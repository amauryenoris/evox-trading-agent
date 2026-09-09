# Review Report — Raise max_tokens for selectStocksForAnalysis() (CHANGE 1 of 3)

**Date**: 2026-09-09
**Reviewer**: Claude (automated)
**Status**: APPROVED

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | `max_tokens` set to `8000`, replacing `3000` | ✅ SATISFIED | `stock-selector.ts:169`: `max_tokens: SELECTION_MAX_TOKENS`, where `SELECTION_MAX_TOKENS = 8000` (`stock-selector.ts:23`). |
| FR-02 | Expressed as a named constant, not inline | ✅ SATISFIED | Same as above — no bare literal remains at the call site. |
| FR-03 | No other Claude call parameter changed | ✅ SATISFIED | `model: 'claude-sonnet-4-6'`, `system: SELECTION_SYSTEM_PROMPT`, `messages: [...]` all unchanged — confirmed via `git diff`, which shows exactly 2 lines touched in the whole file. |
| FR-04 | No other logic in `selectStocksForAnalysis()` changed | ✅ SATISFIED | `git diff src/lib/stock-selector.ts` (independently re-run) shows only the new constant declaration and the one call-site line — screener-fetch, prompt construction, response parsing, and the Supabase write are byte-identical. |
| FR-05 | `claude-agent.ts:1151-1167` untouched | ✅ SATISFIED | `git diff --stat src/lib/claude-agent.ts` (independently re-run) — empty. |
| FR-06 | Old-value test assertion updated | ✅ SATISFIED | `stock-selector.test.ts:312` now asserts `max_tokens: 8000`; test description text also updated for consistency. Confirmed passing (12/12 in that file, independently re-run). |

## Constraints Verification

| ID | Constraint | Status | Notes |
|----|-----------|--------|-------|
| C-01 | No Protected Zone change without confirmation (`claude-agent.ts` etc.) | ✅ SATISFIED | None of the listed files touched. |
| C-02 | `config.ts` Protected Zone — requires explicit confirmation if chosen as placement | ✅ SATISFIED (moot) | The local-`stock-selector.ts` placement was chosen instead (confirmed via an explicit question at implementation start, recorded in `tasks.md` Pre-Implementation) — `config.ts` was never touched. `git diff --stat src/lib/config.ts` (independently re-run) — empty. |
| C-03 | No other test in `stock-selector.test.ts` modified | ✅ SATISFIED | `git diff` on the test file (via task record + independent grep for `3000`) shows only the one assertion block changed; no other test in the file altered. |
| C-04 | No error isolation / `stop_reason` / new table added | ✅ SATISFIED | Confirmed — this CHANGE is exactly the 2-line diff described, nothing from CHANGE 2/3's scope leaked in. |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | Independently re-confirmed via `git diff --stat`. |
| src/lib/claude-agent.ts | UNTOUCHED | Independently re-confirmed via `git diff --stat`. |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | — |

`git status --porcelain` (independently re-run) shows only `src/lib/stock-selector.ts` and `src/lib/__tests__/stock-selector.test.ts` as source changes — full Protected Zone clear.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ➖ N/A | `claude-agent.ts` not touched. |
| Supabase patterns | ➖ N/A | No query or `db.ts` change — `insertSelectionDecision()`'s call site and behavior are untouched. |
| TypeScript quality | ✅ | No `any`; no mutation; `selectStocksForAnalysis()` unchanged in length; `stock-selector.ts` is 221 lines, `stock-selector.test.ts` 315 — both well under the 800-line guideline; the prior bare-literal `3000` is now a named constant with an explanatory comment (why 8000, referencing the confirmed incident), matching this file's own existing local-constant style (`MAX_DAILY_CHANGE_PCT`, `HIGH_RELATIVE_VOLUME_THRESHOLD`, `MAX_POOL_A_CANDIDATES`). |
| Security | ✅ | No secrets, no new logging of sensitive data — the added comment is descriptive, not diagnostic-leaking. |

## Task Checklist

- Completed: 15/16 (4 pre-implementation + 10 implementation + 1 of 2 post-implementation). The one remaining unchecked box, "Run `/review`," is this review itself.

## Independent Re-Verification (not just trusting the implementation's self-report)

- `git status --porcelain` → only `stock-selector.ts` + its test file modified (plus the pre-existing unrelated `specs/gate-constants-hoist/review.md`); re-confirmed.
- `git diff src/lib/stock-selector.ts` → exactly 2 lines changed; re-confirmed verbatim.
- `git diff --stat` on `claude-agent.ts` and `config.ts` → both empty; re-confirmed.
- `npx tsc --noEmit` → re-run, exit 0.
- `npm run build` → re-run, same clean result, all routes.
- `npx vitest run` → re-run, 44/44 files, 400/400 tests.
- Repo-wide `grep max_tokens` across `src/lib` → confirmed only `stock-selector.ts`'s call site now references the new constant; the other 4 Claude call sites (`learning.ts`, `claude-agent.ts:1959`, `market-daily-briefing.ts`, `news-intelligence.ts`) remain untouched inline literals, exactly matching this spec's explicit Out-of-Scope list.

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
- None

### LOW (optional)
- **Domain-mismatch concern from design.md is now moot but worth remembering for CHANGE 2/3**: this CHANGE correctly avoided placing an AI-tuning constant inside the trading-parameters-scoped `config.ts`, and correctly caught/corrected the originating FIX/PROMPT's incorrect "config.ts is not Protected Zone" claim rather than carrying it forward. Worth keeping that same scrutiny for CHANGE 2 (per-step error isolation), since it's explicitly scoped to touch `claude-agent.ts` — genuinely Protected Zone, unlike this CHANGE — and will need its own fresh, explicit confirmation, not inherited from this approval.

---

## Decision

**APPROVED** — No CRITICAL, HIGH, or MEDIUM findings. All 6 functional requirements and all 4 constraints are satisfied and independently re-verified against fresh command runs, not just trusted from the implementation's self-report. The Protected Zone question raised during spec-writing (config.ts vs. local constant) was correctly resolved via an explicit question before any code was written, and the delivered diff matches that decision exactly — a clean 2-line change with a fully updated test and zero scope creep into CHANGE 2/3's territory. Ready to commit.
