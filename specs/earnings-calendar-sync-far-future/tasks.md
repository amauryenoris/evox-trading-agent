# Tasks — Earnings Calendar Sync: Stop Failing on Far-Future Days

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (N/A: none)
- [x] Database migrations drafted (N/A: none)
- [x] O-1 to O-4 answered or defaults accepted

## Implementation Checklist

### Phase 1 — Tests first (RED)
- [x] T-01: `scripts/earnings-calendar-sync.test.ts`: `isFarFutureDay` boundary (offset 35 near, 36 far).
- [x] T-02: far-day no-data failure is skipped, not counted, and its cached rows are kept (`skippedFarDays`, no unrefreshed delete for it).
- [x] T-03: near-day failure counts; the near-only denominator decides the threshold (for example 1 of 25 passes, 2 of 25 fails).
- [x] T-04: far-day non-"no data" failure is excluded from the threshold and logged as an error (O-1 default).
- [x] T-05: `shouldFailRun`: fails on zero rows in a live run, not in a dry run.
- [x] T-06: exact `[EARNINGS_SYNC_DONE]` line, with and without the dry-run suffix.

### Phase 2 — Script
- [x] T-07: add `NEAR_WINDOW_CALENDAR_DAYS`, `isFarFutureDay`, `NasdaqNoDataError`.
- [x] T-08: make `fetchDayWithRetry` return a typed result; log `[EARNINGS_SYNC_SKIPPED_FAR_FUTURE]` for far no-data days.
- [x] T-09: extend `runEarningsSync` and `SyncResult` with `skippedFarDays` and `nearDayCount`.
- [x] T-10: add the pure `shouldFailRun(...)` and use it in `main`.
- [x] T-11: print the new final line before any `process.exit`.

### Phase 3 — Verification
- [x] T-12: existing sync tests still pass unchanged.
- [x] T-13: `npx tsc --noEmit` clean.
- [x] T-14: full `npx vitest run` green.
- [x] T-15: `npm run build` green.
- [x] T-16: confirm with `git diff --stat` that only the script and its test changed.

## Post-Implementation

- [ ] Run /review earnings-calendar-sync-far-future to verify the implementation matches the spec
- [ ] Confirm Protected Zone files unchanged
- [ ] Report: diff summary and test results
- [ ] Note that no live sync was run; the next scheduled or manual run is the first real check (expect green and `skipped_far` > 0)

## Estimated Complexity

Low. One script, pure helpers and a typed result; the unit tests carry the weight.
