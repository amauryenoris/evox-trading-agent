# Requirements — Earnings Calendar Follow-up: Snapshot Wiring (T-17) + Migration File Alignment

## Functional Requirements

### A. Snapshot and prompt wiring

FR-01: The system shall pass the earnings gate result of the current symbol to `buildLearningContext` as an `earnings` property.
FR-02: The system shall pass the same object that the earnings gate evaluated for that symbol in this cycle.
FR-03: The system shall not re-evaluate the earnings gate to build the `earnings` property.
FR-04: The system shall accept an optional `earnings` property in the input type of `buildLearningContext`.
FR-05: The system shall forward the `earnings` property from `buildLearningContext` to `buildSetupLearningBlock` unchanged.
FR-06: The system shall persist the `earnings` object in the learning snapshot saved with a BUY.
FR-07: The system shall include `nextReportDate`, `session`, `tradingDaysAway`, `blocked`, `source` and `status` in the persisted `earnings` object.
FR-08: The system shall set `source` to `nasdaq` in the persisted `earnings` object.
FR-09: The system shall persist `status` `UNKNOWN` with null `nextReportDate`, `session` and `tradingDaysAway` when the earnings cache was unavailable.
FR-10: The system shall persist `status` `STALE` with null `nextReportDate`, `session` and `tradingDaysAway` when the earnings cache was stale.
FR-11: The system shall add the earnings line to the BUY prompt block only when `status` is `OK` and the report is within 5 trading days.
FR-12: The system shall not add the earnings line when `status` is `UNKNOWN` or `STALE`.
FR-13: The system shall leave the BUY prompt block and the snapshot without an `earnings` field when no earnings input is given.
FR-14: The system shall not throw from the wiring when the earnings cache is unavailable.
FR-15: The system shall apply the same wiring to the BUY path of the ranked best candidate, because both BUY paths read the snapshot returned by `buildLearningContext`.
FR-16: The system shall keep the snapshot version at 3.
FR-17: The system shall keep snapshots stored before this change readable.

### B. Tests

FR-18: The system shall have a test that passes a gate result through `buildLearningContext` and finds it in the returned snapshot.
FR-19: The system shall have a test that builds the `earnings` object with `evaluateEarningsGate` and finds the prompt line in the returned text for status `OK` within 5 trading days.
FR-20: The system shall have a test that finds neither the prompt line nor a throw for status `UNKNOWN`.
FR-21: The system shall have a test that finds neither the prompt line nor a throw for status `STALE`.
FR-22: The system shall have a test that `buildLearningContext` called without `earnings` returns the same text and snapshot keys as before this change.

### C. Migration file

FR-23: The system shall replace the contents of `specs/earnings-calendar/migration.sql` with the DDL that the owner already applied.
FR-24: The system shall not apply the migration.
FR-25: The system shall record in the migration file that RLS is enabled with no policy.
FR-26: The system shall use only the columns `symbol`, `report_date`, `session` and `fetched_at` in `db-earnings.ts`.
FR-27: The system shall use only the columns `symbol`, `report_date`, `session` and `fetched_at` in `scripts/earnings-calendar-sync.ts`.
FR-28: The system shall write `symbol` as text, `report_date` as a `YYYY-MM-DD` string, `session` as one of `BMO`, `AMC`, `UNKNOWN`, and `fetched_at` as an ISO-8601 timestamp.
FR-29: The system shall report the column and type confirmation in the implementation report.

### D. Task file

FR-30: The system shall untick the line "`migration.sql` reviewed and applied" in `specs/earnings-calendar/tasks.md`.
FR-31: The system shall note "applied by the owner 2026-10-29" on that line.
FR-32: The system shall tick T-17 in `specs/earnings-calendar/tasks.md` after the wiring is done.

## Non-Functional Requirements

NFR-01: The change shall add no database read, Alpaca call or Claude call to the cycle.
NFR-02: The new code shall contain no `any` type.
NFR-03: The tests shall make no network call.
NFR-04: The change shall pass `tsc --noEmit`, the full Vitest suite and `npm run build`.

## Constraints

C-01: The change shall add one optional property to the input type in `src/lib/learning.ts` and nothing else in that file, except the type import that property needs (see design O-1).
C-02: The change shall add one property at the existing `buildLearningContext` call in `src/lib/claude-agent.ts` and nothing else in that file.
C-03: The change shall not edit any other Protected Zone file.
C-04: The change shall not change the earnings gate logic, exits, sizing, stops or order paths.
C-05: The change shall not apply a migration, run a live cycle or place an order.
C-06: The change shall add no dependency.

## Out of Scope

- A snapshot version bump.
- Gate logic, window size and staleness rules.
- Any change to the sync script or `db-earnings.ts` beyond the confirmation.
- Revoking or changing production grants and policies.
- Blocked symbols (they skip the learning context, so they carry no snapshot).
