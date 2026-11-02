# Requirements — Earnings Calendar Sync: Stop Failing on Far-Future Days

## Functional Requirements

### A. Near and far days
FR-01: The system shall classify a weekday as near when its offset from the run date is 35 calendar days or fewer.
FR-02: The system shall classify a weekday as far when its offset from the run date is more than 35 calendar days.
FR-03: The system shall record a far day whose fetch fails with the "Nasdaq payload has no data object" error as SKIPPED_FAR_FUTURE.
FR-04: The system shall log each SKIPPED_FAR_FUTURE day with its date.
FR-05: The system shall not count a SKIPPED_FAR_FUTURE day toward the failure threshold.
FR-06: The system shall not count any far-day failure toward the failure threshold (see O-1).
FR-07: The system shall count a near day that fails after its one retry toward the failure threshold.
FR-08: The system shall keep logging a near-day failure with `[EARNINGS_SYNC_ERROR]`, including the "no data object" reason.

### B. Exit code
FR-09: The system shall compute the failure fraction as near-day failures divided by the number of near weekdays.
FR-10: The system shall exit with code 1 when the near-day failure fraction is above 5%.
FR-11: The system shall exit with code 1 in a live run when zero rows were collected (see O-3).
FR-12: The system shall exit with code 0 when the near-day failure fraction is at most 5% and at least one row was collected.

### C. Unchanged behavior
FR-13: The system shall retry a failed day once, for near and far days alike.
FR-14: The system shall not delete the cached rows of a failed or skipped day.
FR-15: The system shall prune rows whose report date is more than 14 days before the run date.
FR-16: The system shall keep the fetch window at the run date through 60 calendar days ahead, weekdays only.
FR-17: The system shall keep the request interval, User-Agent and upsert behavior unchanged.

### D. Final line
FR-18: The system shall print one final line of the form `[EARNINGS_SYNC_DONE] days=N failed_near=X skipped_far=Y rows=R`.
FR-19: The system shall set `days` to the number of weekdays in the window, `failed_near` to the near-day failures, `skipped_far` to the SKIPPED_FAR_FUTURE days and `rows` to the rows collected.
FR-20: The system shall print the final line before exiting, including when the exit code is 1.
FR-21: The system shall append ` (dry run, nothing written)` to the final line only in a dry run (see O-4).

### E. Tests
FR-22: The system shall have a test that a far-day "no data object" failure does not count toward the threshold.
FR-23: The system shall have a test that a near-day failure counts toward the threshold.
FR-24: The system shall have a test of the 35-day boundary (offset 35 is near, offset 36 is far).
FR-25: The system shall have a test that the 5% threshold uses only the near-day denominator.
FR-26: The system shall have a test that zero collected rows in a live run yields a failing exit decision.
FR-27: The system shall have a test of the exact final line format.
FR-28: The system shall have a test that skipped far days keep their cached rows.

## Non-Functional Requirements

NFR-01: The change shall add no network call, dependency, environment variable or secret.
NFR-02: The change shall print no secret.
NFR-03: The new code shall contain no `any` type.
NFR-04: The change shall pass `tsc --noEmit`, the full Vitest suite and `npm run build`.
NFR-05: The tests shall make no network call.

## Constraints

C-01: The change shall edit only `scripts/earnings-calendar-sync.ts` and `scripts/earnings-calendar-sync.test.ts`.
C-02: The change shall edit `.github/workflows/earnings-calendar-sync.yml` only if needed (the design finds it is not needed).
C-03: The change shall not touch any Protected Zone file.
C-04: The change shall not change `earnings-window.ts`, `EARNINGS_BLOCK_TRADING_DAYS` or the gate logic.
C-05: The change shall not change the `earnings_calendar` schema.
C-06: The change shall not run a live sync.

## Out of Scope

- Shrinking the 60-day window.
- Changing the staleness rule or the gate.
- Using a second data source for far dates.
- Alerting when the Nasdaq publish horizon moves.
