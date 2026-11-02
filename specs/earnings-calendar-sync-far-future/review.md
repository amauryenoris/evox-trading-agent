# Review Report — Earnings Calendar Sync: Stop Failing on Far-Future Days

**Date**: 2026-11-02
**Reviewer**: Claude (automated)
**Status**: APPROVED

Verification: `tsc --noEmit` clean; full Vitest 968/968 (+10 new); `npm run build` green; ESLint on the two files: 0 errors, 1 warning. Changes are uncommitted in the working tree. No live sync was run.

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01, FR-02 | Near = offset <= 35, far = offset > 35 | ✅ | `isFarFutureDay`, `NEAR_WINDOW_CALENDAR_DAYS = 35`; boundary test 35/36. |
| FR-03 | Far "no data object" recorded as SKIPPED_FAR_FUTURE | ✅ | `NasdaqNoDataError` + `isFar` in `fetchDayWithRetry` → `skippedFarDays`. |
| FR-04 | Each skipped day logged with its date | ✅ | `[EARNINGS_SYNC_SKIPPED_FAR_FUTURE] <date>`; test asserts it. |
| FR-05, FR-06 | Far failures not counted | ✅ | Only near days reach `failedDays`; other far failures are dropped from the result (O-1 default). |
| FR-07 | Near failure after retry counts | ✅ | Test with a near no-data day and the existing 503 test. |
| FR-08 | Near failure still logged `[EARNINGS_SYNC_ERROR]` with reason | ✅ | Test asserts "no data object" in the error log. |
| FR-09, FR-10 | Fraction = near failures / near weekdays; exit 1 above 5% | ✅ | `shouldFailRun` + `nearDayCount`; tests 1/25 passes, 2/25 fails. |
| FR-11 | Exit 1 on zero rows in a live run | ✅ | `shouldFailRun`; note this rule is new (the script had none), as flagged in O-3. |
| FR-12 | Exit 0 when within threshold and rows > 0 | ✅ | `main` returns without `process.exit`. |
| FR-13 | One retry for near and far days | ✅ | Loop unchanged (`attempt < 2` continue). |
| FR-14 | Cached rows of failed/skipped days not deleted | ✅ | They never enter `successDays`; test checks no unrefreshed delete for the far day. |
| FR-15–17 | Prune, window, interval, User-Agent, upsert unchanged | ✅ | `persist`, `buildWeekdays`, constants untouched; existing tests pass unchanged. |
| FR-18, FR-19 | Final line format and fields | ✅ | `formatDoneLine`; exact-string test. |
| FR-20 | Final line printed before exit | ✅ | `console.log` precedes the verdict and `process.exit(1)`. |
| FR-21 | Dry-run suffix only in dry run | ✅ | Tested both ways. |
| FR-22–28 | Required tests | ✅ | All seven present (far skip, near count, boundary, denominator, zero rows, line format, rows kept). |
| NFR-01–05 | No network/dependency/env/secret; no `any`; checks green | ✅ | |
| C-01–06 | Scope, workflow, Protected Zone, gate, schema, no live sync | ✅ | Only the script and its test changed. |

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

`earnings-window.ts`, `EARNINGS_BLOCK_TRADING_DAYS`, the table schema and the workflow file are also unchanged.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | N/A, `claude-agent.ts` untouched. |
| Supabase patterns | ✅ | No new queries; the same three helpers are called as before. |
| TypeScript quality | ✅ | No `any`; typed `DayOutcome`; 238 lines; functions under 50 lines; `35` is a named constant. |
| Security | ✅ | No secrets, no new env; logs carry dates only. |

## Task Checklist

- Completed: 16/16 implementation tasks. The 4 post-implementation items (this review, Protected Zone confirmation, report, live-run note) remain open by design.

## Findings

### CRITICAL (blocks merge)
- None.

### HIGH (should fix)
- None.

### MEDIUM (consider fixing)
- **M-1** Far-day failures that are not "no data" (HTTP 5xx, timeout) are logged but appear nowhere in the result or in the `[EARNINGS_SYNC_DONE]` line, so a far-only outage is visible only in the error logs and the run stays green. This is the O-1 default (excluded from the threshold). A `failed_far` counter would fix it, but it is outside the requested line format.
- **M-2** `main`'s wiring (verdict, exit code) is not unit tested; the pieces it calls (`shouldFailRun`, `formatDoneLine`) are. The first scheduled run is the real check.

### LOW (optional)
- **L-1** ESLint warning: unused `url` parameter in `scripts/earnings-calendar-sync.test.ts:281` (the "uses only the near days" test).
- **L-2** The 35-day horizon is a fixed constant. If Nasdaq ever publishes fewer than 35 days ahead, near days will fail and the run will go red again, which is the intended signal.

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. Ready to commit. The next scheduled or manual run should be green with `skipped_far` greater than 0; that is the first real execution of the new logic.
