# Design — Earnings Calendar Sync: Stop Failing on Far-Future Days

## Architecture Decision

The change is local to the sync script. Today every day that fails twice goes into one `failedDays` list and `exceedsFailureThreshold(failed, total)` runs over all weekdays (`scripts/earnings-calendar-sync.ts:167`). Nasdaq publishes about 7 weeks ahead (the 2026-10-30 run failed only from 2026-12-23, calendar offset 54), so the tail of the 60-day window fails every day and the run turns red even though 3,455 rows were saved. The script will split the window into near days (offset <= 35) and far days (offset > 35), keep the threshold on near days only, and report far "no data" days separately. Pure helpers keep the logic unit-testable, like the rest of the file.

## Data Flow

1. `buildWeekdays` returns the window as today (unchanged).
2. For each day, `fetchDayWithRetry` runs as today. On the second failure it logs `[EARNINGS_SYNC_ERROR]` for near days; for a far day whose error is the no-data-object error it logs `[EARNINGS_SYNC_SKIPPED_FAR_FUTURE] <date>` instead.
3. `runEarningsSync` sorts each failed day: near goes to `failedDays`, far goes to `skippedFarDays`. Neither enters `successDays`, so their cached rows are not deleted (fail-open unchanged).
4. `main` prints `[EARNINGS_SYNC_DONE] days=N failed_near=X skipped_far=Y rows=R`, then exits 1 if `exceedsFailureThreshold(failedDays.length, nearDayCount)` or (live and `rowCount === 0`).

## Design details

- `NEAR_WINDOW_CALENDAR_DAYS = 35` (exported constant). `isFarFutureDay(today, day)` is true when the calendar offset is greater than 35.
- `parseNasdaqRows` throws a small `NasdaqNoDataError` (subclass of `Error`, same message text "Nasdaq payload has no data object") so the caller can tell it from HTTP and timeout errors without matching strings. The existing `toThrow()` tests still pass.
- `fetchDayWithRetry` returns a discriminated result (`rows` | `no_data` | `failed`) instead of `EarningsRow[] | null`. It stays private.
- `SyncResult` gains `skippedFarDays: string[]` and `nearDayCount: number`; `failedDays` now means near-day failures only. The existing tests that read `failedDays` use `lookaheadDays: 3`, so all their days are near and their expectations hold.
- A pure `shouldFailRun(...)` combines the near-day threshold and the zero-rows rule so `main` stays trivial and the decision is testable.
- Far days that fail for another reason (HTTP 5xx, timeout) are excluded from the threshold but still logged with `[EARNINGS_SYNC_ERROR]` (default for O-1).

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Near/far split with the threshold on near days (requested) | Matches the request; a real outage still fails the run because it hits near days | Keeps a fixed 35-day horizon | Chosen |
| Shrink `LOOKAHEAD_CALENDAR_DAYS` to about 50 | Simplest | Out of scope; the horizon drifts | Rejected |
| Treat any trailing run of failures as far | No fixed horizon | Hides a real outage that happens to fail the last days | Rejected |
| Match the error message string in `main` | No new class | Fragile string coupling | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `scripts/earnings-calendar-sync.ts` | MODIFY | Constant, `isFarFutureDay`, `NasdaqNoDataError`, result split, threshold on near days, zero-rows check, new final line |
| `scripts/earnings-calendar-sync.test.ts` | MODIFY | New tests (FR-22 to FR-28); existing tests unchanged |
| `.github/workflows/earnings-calendar-sync.yml` | NONE | It only runs `npm run earnings-calendar-sync` (line 32); the exit code and log line come from the script |

## Protected Zone Impact

None — this feature does not require Protected Zone changes.

## Database Changes

None. No schema, policy or grant change. Writes (upsert, unrefreshed delete, prune) are unchanged.

## Open Questions

- **O-1** Far days that fail for a reason other than "no data object" (HTTP 5xx, timeout). Default: **excluded from the threshold** (literal reading of "the 5% threshold applies only to days inside the first 35 days"), logged as errors. Alternative: count them.
- **O-2** Boundary. Default: offset 35 is near, offset 36 is far (near = 36 calendar days counting today).
- **O-3** "Keep exit 1 ... when zero rows are written": the current script has **no** zero-rows check (it exits 0 with 0 rows). Default: add it for live runs only, using the collected row count; a dry run never fails on it.
- **O-4** The current final line has `failed=` and a dry-run suffix. Default: the new format exactly as requested, with the suffix kept only in a dry run.
