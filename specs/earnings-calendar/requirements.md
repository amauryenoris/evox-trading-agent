# Requirements — Earnings Calendar: Daily Cache + Pre-Claude Entry Gate (EARNINGS_BLOCK) + Snapshot Flag

Evidence labels: **[C]** confirmed in code or STEP 0, **[P]** plausible, **[U]** unknown.

## Functional Requirements

### A. Pure window logic (`src/lib/earnings-window.ts`, no I/O)

FR-01: The system shall export the constant `EARNINGS_BLOCK_TRADING_DAYS` with the value 1.
FR-02: The system shall treat `EARNINGS_BLOCK_TRADING_DAYS` equal to 0 as "never block".
FR-03: The system shall block an entry when the report date equals the entry date.
FR-04: The system shall block an entry when the report date equals the next trading day after the entry date.
FR-05: The system shall block an entry in the window whatever the session label is (BMO, AMC or UNKNOWN).
FR-06: The system shall not block an entry when the report date is later than the next trading day.
FR-07: The system shall not block an entry when the report date is earlier than the entry date.
FR-08: The system shall treat a Friday entry with a Monday report as inside the window.
FR-09: The system shall treat a trading-day gap caused by a market holiday as inside the window when the report falls on the next trading day.
FR-10: The system shall compute the entry date as the America/New_York calendar date of the cycle timestamp.
FR-11: The system shall receive the entry date, the report date and the next trading day as inputs, and shall call no network, database or clock function.
FR-12: The system shall return `{ blocked: false, reason: 'UNKNOWN' }` when the report date is missing.
FR-13: The system shall return `{ blocked: false, reason: 'UNKNOWN' }` when the report date is not a valid `YYYY-MM-DD` calendar date.
FR-14: The system shall return `{ blocked: false, reason: 'UNKNOWN' }` when the next trading day is missing or not a valid date.
FR-15: The system shall return `{ blocked: false, reason: 'UNKNOWN' }` when the next trading day is a Saturday or a Sunday.
FR-16: The system shall never throw from any exported function of the module.
FR-17: The system shall export the prefix constant `EARNINGS_BLOCK`.
FR-18: The system shall build the reason text `EARNINGS_BLOCK: SYMBOL reports YYYY-MM-DD (before open)` for session BMO.
FR-19: The system shall build the reason text `EARNINGS_BLOCK: SYMBOL reports YYYY-MM-DD (after close)` for session AMC.
FR-20: The system shall build the reason text `EARNINGS_BLOCK: SYMBOL reports YYYY-MM-DD (time not supplied)` for session UNKNOWN.
FR-21: The system shall compute the number of trading days between the entry date and the report date from a list of upcoming trading dates passed in.

### B. Cache table and database helper

FR-22: The system shall define the table `earnings_calendar` with columns `symbol`, `report_date`, `session` and `fetched_at`.
FR-23: The system shall use `(symbol, report_date)` as the primary key of `earnings_calendar`.
FR-24: The system shall restrict `session` to `BMO`, `AMC` and `UNKNOWN`.
FR-25: The system shall default `fetched_at` to the insert time.
FR-26: The system shall index `earnings_calendar` on `report_date`.
FR-27: The system shall enable row level security on `earnings_calendar`.
FR-28: The system shall deliver the table definition as `specs/earnings-calendar/migration.sql` and shall not apply it.
FR-29: The system shall provide a database helper that returns the earliest cached report on or after a given date for a symbol, or null.
FR-30: The system shall provide a database helper that upserts earnings rows on `(symbol, report_date)`.
FR-31: The system shall provide a database helper that returns the newest `fetched_at` of the whole table, or null when the table is empty.
FR-32: The system shall provide a database helper that deletes rows with a report date older than a given date.
FR-33: The system shall throw an `Error` with a descriptive message from each database helper when Supabase returns an error.

### C. Sync script (`scripts/earnings-calendar-sync.ts`)

FR-34: The system shall request the Nasdaq earnings calendar for every weekday from today through today plus 60 calendar days.
FR-35: The system shall skip Saturdays and Sundays when requesting days.
FR-36: The system shall send at most 4 requests per second.
FR-37: The system shall send a descriptive User-Agent that names the project.
FR-38: The system shall map `time-pre-market` to `BMO`, `time-after-hours` to `AMC` and `time-not-supplied` to `UNKNOWN`.
FR-39: The system shall map any other or missing time label to `UNKNOWN`.
FR-40: The system shall upper-case and trim every symbol and shall skip a row without a symbol.
FR-41: The system shall keep one row per `(symbol, report_date)` when a day lists a symbol twice.
FR-42: The system shall treat a day with zero rows as a successful day.
FR-43: The system shall retry a failed day once before counting it as failed.
FR-44: The system shall report each failed day in the log with its date and the failure reason.
FR-45: The system shall exit with a non-zero code when more than 5% of the requested days failed.
FR-46: The system shall upsert the rows of the successful days in one pass.
FR-47: The system shall delete the cached rows of a successfully fetched day that this run did not refresh, so that a rescheduled report does not leave its old date behind.
FR-48: The system shall not delete the cached rows of a failed day.
FR-49: The system shall delete rows with a report date older than 14 days before today.
FR-50: The system shall not write to the database in a dry run, and shall write only when `RUN_EARNINGS_CALENDAR_SYNC` equals `true`.
FR-51: The system shall print no secret.

### D. Workflow (`.github/workflows/earnings-calendar-sync.yml`)

FR-52: The system shall run the sync on `ubuntu-24.04`.
FR-53: The system shall run the sync once a day, Monday to Friday, at 11:17 UTC.
FR-54: The system shall allow a manual run through `workflow_dispatch`.
FR-55: The system shall set a job timeout.
FR-56: The system shall use the same secret names as the daily-bars-sync workflow for Supabase.
FR-57: The system shall not join the `trading-positions` concurrency group.
FR-58: The system shall use a concurrency group of its own with `cancel-in-progress` false.

### E. Entry gate (⚠️ Protected Zone: `claude-agent.ts`, one gate)

FR-59: The system shall evaluate the earnings gate only for a symbol that has detected a setup.
FR-60: The system shall evaluate the earnings gate before the learning context is built and before Claude is called.
FR-61: The system shall decide the gate with a pure function that takes the cached report, the cache freshness, the entry date and the next trading day.
FR-62: The system shall record a HOLD for a blocked symbol with an `error` that starts with `EARNINGS_BLOCK`.
FR-63: The system shall set `orderExecuted` to false, `quantity` to 0 and `confidence` to 0 in that HOLD.
FR-64: The system shall store the full indicator object in that HOLD.
FR-65: The system shall emit a `[SETUP-GATE]` console line naming the symbol and the reason when it blocks.
FR-66: The system shall skip the symbol for the rest of the cycle after it records the HOLD.
FR-67: The system shall not block a symbol when the cache holds no report for it.
FR-68: The system shall not block a symbol when the newest `fetched_at` of the table is older than 2 trading days before the entry date.
FR-69: The system shall not block a symbol when the cache read fails.
FR-70: The system shall emit one `console.warn` per cycle when the gate runs on an empty, stale or unreadable cache.
FR-71: The system shall set the earnings status to `UNKNOWN` for an empty or unreadable cache, and to `STALE` for a stale cache.
FR-72: The system shall evaluate the gate for auto-entries from the near-miss watchlist in the same way as for other entries.
FR-73: The system shall leave open positions, exit rules, stops, sizing and order submission unchanged.

### F. Snapshot and prompt line

FR-74: The system shall add an `earnings` object to the persisted learning snapshot of a BUY.
FR-75: The system shall fill `earnings` with `nextReportDate`, `session`, `tradingDaysAway`, `blocked`, `source` equal to `nasdaq`, and `status`.
FR-76: The system shall set `status` to one of `OK`, `UNKNOWN` and `STALE`.
FR-77: The system shall set `nextReportDate`, `session` and `tradingDaysAway` to null when the status is not `OK`.
FR-78: The system shall keep every stored learning snapshot of an earlier version readable.
FR-79: The system shall accept learning snapshots of versions 2 and 3 in `buildPatternIds`, and of version 4 if the version is bumped.
FR-80: The system shall add one line `Earnings: reports YYYY-MM-DD (after close), N trading days away` to the BUY prompt block when the status is `OK` and the report is within 5 trading days.
FR-81: The system shall write the session in that line as `before open`, `after close` or `time not supplied`.
FR-82: The system shall omit that line when the status is `UNKNOWN` or `STALE`.
FR-83: The system shall omit that line when the report is more than 5 trading days away.
FR-84: The system shall keep that line out of the trimming loop of the block, so size limits never remove it.
FR-85: The system shall keep the block footer text unchanged.
FR-86: The system shall treat the line as information and shall not let it affect any gate.

### G. Dashboard and reports (touch-freely files)

FR-87: The system shall include `EARNINGS_BLOCK%` and `TREND_3DAY_ABOVE_SMA5%` in the Rejected-today filter.
FR-88: The system shall add `EARNINGS_BLOCK` and `TREND_3DAY_ABOVE_SMA5` to the Rejected-today kind union in the route and in the component.
FR-89: The system shall show the report date and the timing in the reason line of an `EARNINGS_BLOCK` row.
FR-90: The system shall show the short labels `EARNINGS` and `SMA5` in the Rejected-today table.
FR-91: The system shall classify an `EARNINGS_BLOCK` entry in the weekly report before the generic "gate" branch.
FR-92: The system shall count an `EARNINGS_BLOCK` entry in its own bucket of the weekly report.

## Non-Functional Requirements

NFR-01: The gate shall add no Claude API call and no Alpaca order call.
NFR-02: The gate shall add at most one cache read per setup-detected symbol, plus one freshness read per cycle.
NFR-03: The sync shall finish within the 15-minute job timeout at 4 requests per second.
NFR-04: The new modules shall reach at least 80% line coverage.
NFR-05: The new code shall contain no `any` type and no hardcoded secret.
NFR-06: The tests shall make no network call.
NFR-07: Each new file shall stay under 800 lines and each function under 50 lines.

## Constraints

C-01: The change shall edit `src/lib/claude-agent.ts` only for the one earnings gate and its direct wiring (see design O-3 for the one extra line that needs confirmation).
C-02: The change shall not edit `config.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts` or `learning.ts` without a new confirmation from Amaury (see design O-3).
C-03: The change shall not apply the migration.
C-04: The change shall not run a live cycle or place an order.
C-05: The change shall add no dependency.
C-06: An unknown or missing report date shall never block an entry (fail open).
C-07: With `EARNINGS_BLOCK_TRADING_DAYS` equal to 0, every entry decision shall equal the decision made without this change.

## Out of Scope

- Open positions and exit rules, including UUUU (reports 2026-11-04 after close).
- Position sizing, stops and size reduction near earnings.
- A second data source (Finnhub, FMP) or a fallback between sources.
- Backfilling past report dates.
- Changes to the classification prompt in `news-intelligence.ts`.
- Gating by setup type or by expected move size.
