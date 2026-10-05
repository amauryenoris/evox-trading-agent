# Review Report — Fix Truncated Macro/Sector Bar Fetch + Staleness Guard

**Date**: 2026-10-05
**Reviewer**: Claude (automated)
**Status**: APPROVED

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Explicit `limit=400` on all 5 macro/sector `getBars()` calls | ✅ SATISFIED | `claude-agent.ts` diff: all 5 calls now `getBars(sym, '1Day', 400, 400)` |
| FR-02 | No pagination (`next_page_token`) logic added | ✅ SATISFIED | No pagination code anywhere in the diff |
| FR-03 | Pure function: bars array + reference date → stale boolean | ✅ SATISFIED | `isMacroBarsStale(bars, referenceDate)` in `macro-bars-staleness.ts` |
| FR-04 | `STALE_MACRO_BARS_MAX_DAYS` named constant = 5 | ✅ SATISFIED | `macro-bars-staleness.ts:1` |
| FR-05 | Empty bars array reported as stale | ✅ SATISFIED | `if (bars.length === 0) return true`; covered by T-09 test |
| FR-06 | Staleness check applied after fetch resolves (success or caught failure), before use | ✅ SATISFIED | `guardMacroBars()` called immediately after `Promise.all` destructure, before any `compute*` call; `.catch()` fallbacks (already producing `[]`) are upstream of the guard, so caught-failure case is covered too |
| FR-07 | Log format `[STALE_MACRO_BARS] symbol=X lastBar=YYYY-MM-DD ageDays=N` | ✅ SATISFIED | `claude-agent.ts` `guardMacroBars()` — exact format match |
| FR-08 | Stale data treated as unavailable via existing empty-array fallback shape | ✅ SATISFIED | `guardMacroBars()` returns `[]` on stale, identical shape to the `.catch()` blocks |
| FR-09 | Staleness check applied uniformly to all 5 symbols, no exceptions | ✅ SATISFIED | `guardMacroBars()` called once per symbol (SPY/GDX/XLE/XLK/VIXY), same logic path |
| FR-10 | No change to `compute-spx-snapshot-window.test.ts` expectations; comment updated only if inconsistent | ✅ SATISFIED | File confirmed untouched (`git diff` empty) — comment already described post-fix state accurately, per T-13 |

## Non-Functional Requirements

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| NFR-01 | `npx tsc --noEmit` zero errors | ✅ SATISFIED | Re-ran during review: clean |
| NFR-02 | Full suite passes, no regressions, new tests added | ✅ SATISFIED | Re-ran during review: 466/466 passing (50 files), including 7 new staleness tests |
| NFR-03 | No change to RS / SPX snapshot / VIXY change formulas | ✅ SATISFIED | `sector-rotation.ts`, `state-fingerprint.ts`, `market-daily-briefing.ts` confirmed untouched via `git diff --stat` |
| NFR-04 | No change to any per-symbol indicator bar fetch | ✅ SATISFIED | The 3 `claude-agent.ts` per-symbol sites and `run-cycle.ts:29` still read `'1Day', 300, 300`, unchanged |

## Constraints

| ID | Constraint | Status | Notes |
|----|-----------|--------|-------|
| C-01 | Protected Zone (`claude-agent.ts`) requires Amaury's explicit confirmation | ✅ SATISFIED | Fresh, in-conversation confirmation obtained via `AskUserQuestion` at `/implement` time — not inferred from the `tasks.md` checkbox alone |
| C-02 | No change to `alpaca.ts`, `sector-rotation.ts`, `state-fingerprint.ts`, `market-daily-briefing.ts`, any db file, any migration | ✅ SATISFIED | All confirmed untouched via `git diff --stat` |
| C-03 | No change to any per-symbol bar fetch | ✅ SATISFIED | Confirmed in NFR-04 check |
| C-04 | No backfill/rewrite of stored rows | ✅ SATISFIED | No DB writes or backfill scripts added |
| C-05 | `risk-manager.ts`, `indicators.ts`, `config.ts`, `learning.ts` untouched | ✅ SATISFIED | Confirmed untouched via `git status --short` |
| C-06 | New staleness function pure — no `Date.now()`/`new Date()` inside | ✅ SATISFIED | `isMacroBarsStale()` takes `referenceDate` as a parameter; caller (`guardMacroBars` in `claude-agent.ts`) supplies `new Date()` |

---

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | — |
| src/lib/claude-agent.ts | MODIFIED | Listed in `design.md` Impact table; explicitly confirmed by Amaury at `/implement` time (separate from spec approval) |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | — |

No unauthorized Protected Zone modification. The single modified file was both anticipated in `design.md` and separately confirmed.

---

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | `decision.action = 'HOLD'` override sites (9 occurrences) unchanged by this diff; no new language touching Claude's decision role — this change is entirely upstream of Claude's prompt/response handling |
| Supabase patterns | ➖ N/A | No `db.ts` or query changes in this feature |
| TypeScript quality | ✅ | No `any` casts in new code; `guardMacroBars`/`isMacroBarsStale` are immutable (return new `[]` or the untouched input, never mutate); both functions well under 50 lines; `STALE_MACRO_BARS_MAX_DAYS` is a named constant, no magic numbers introduced |
| Security | ✅ | No secrets touched; `console.warn` logs only symbol/date/age-in-days, no sensitive data; live verification script used existing env-sourced credentials, printed only dates/closes |

**Pre-existing condition, not introduced by this change**: `claude-agent.ts` is 2619 lines, far over the 800-line file-size guideline. This change adds a net +27/-8 lines to an already-oversized file; it does not newly violate the guideline, and splitting this file is out of scope for this fix (noted here for visibility, not as a finding against this change).

---

## Task Checklist

- Implementation Checklist: 19/19 tasks completed (T-01 through T-19)
- Pre-Implementation: 3/3 checked (spec approval, Protected Zone confirmation, migrations N/A)
- Post-Implementation: 1/3 checked at time of this review (this `/review` run satisfies item 1; item 2 — confirm Protected Zone approval — was satisfied via the in-conversation `AskUserQuestion` at `/implement` time, recommend checking the box; item 3 is a note-only reminder for Amaury, not a gating task)

---

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
- None

### LOW (optional)
- `specs/macro-bars-truncation-fix/tasks.md` Post-Implementation item 2 ("Confirm Protected Zone file changes were explicitly approved") can be checked off now — this was satisfied during `/implement` via interactive confirmation, just not yet reflected in the checkbox.

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. Ready to commit.
