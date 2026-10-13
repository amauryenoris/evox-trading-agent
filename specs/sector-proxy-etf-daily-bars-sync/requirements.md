# Requirements — Always sync sector-proxy ETFs into daily_bars

Data-only change. Scope is `scripts/daily-bars-sync.ts` and its test file. No Protected Zone file is touched.

## Functional Requirements

### A. Universe

FR-01: The system shall export a constant `SECTOR_PROXY_ETFS` equal to `['SPY','GDX','XLE','XLK','COPX','URA','REMX','SMH','XLY','XLC','XME']`.
FR-02: The system shall include every symbol of `SECTOR_PROXY_ETFS` in the sync universe on every run.
FR-03: The system shall contain each symbol exactly once in the sync universe, including when it is also an open position or a recent candidate.
FR-04: The system shall keep the existing universe sources (open positions and `selection_history.candidates_offered` of the last 7 days) unchanged.
FR-05: The system shall include `SECTOR_PROXY_ETFS` in the universe when the `selection_history` read fails.
FR-06: The system shall not filter, remove or alter any other symbol already present in `daily_bars`.

### B. Backfill decision

FR-07: The system shall count the rows already stored in `daily_bars` for each symbol of `SECTOR_PROXY_ETFS` before fetching its bars.
FR-08: The system shall treat a sector-proxy symbol as needing history when its stored row count is below 400.
FR-09: The system shall not treat a sector-proxy symbol as needing history when its stored row count is 400 or more.
FR-10: The system shall apply the backfill decision only to symbols of `SECTOR_PROXY_ETFS`.
FR-11: The system shall keep the existing fetch path for every symbol that does not need history.
FR-12: If the row-count read fails for a symbol, the system shall log one error line for that symbol and keep that symbol on the existing fetch path.

### C. Backfill fetch

FR-13: The system shall fetch up to the most recent 400 trading days of daily bars for each symbol that needs history.
FR-14: The system shall request the bars sorted ascending.
FR-15: The system shall send an explicit page-size limit on every backfill request.
FR-16: The system shall follow the response's next-page token until none is returned.
FR-17: The system shall request a calendar window that contains at least 400 trading days.
FR-18: The system shall keep only the most recent 400 bars when the window returns more.
FR-19: The system shall request the same price feed as the existing `getBars` helper.
FR-20: The system shall request raw (unadjusted) bars for the backfill, the same convention as every other stored bar (decided 2026-10-13, Open Question 1: the dry-run showed split-vs-raw differences for XLE, XLK and XLY).
FR-21: The system shall map each fetched bar to a `daily_bars` row with the same fields and the same date derivation as the existing path.
FR-22: The system shall contribute rows for a sector-proxy symbol from exactly one fetch path per run.

### D. Write

FR-23: The system shall write backfilled rows with the existing upsert keyed on `symbol,bar_date`.
FR-24: The system shall not produce two rows with the same `(symbol, bar_date)` in one upsert batch.
FR-25: The system shall keep the existing dry-run gate (`RUN_DAILY_BARS_SYNC`) for backfilled rows.
FR-26: The system shall not delete any `daily_bars` row.
FR-27: The system shall write to no table other than `daily_bars`.

### E. Failure handling and logging

FR-28: If one symbol's fetch fails, the system shall log one error line for that symbol in the existing `[DAILY_BARS_ERROR]` style.
FR-29: If one symbol's fetch fails, the system shall continue with the remaining symbols.
FR-30: The system shall count a failed sector-proxy symbol in the existing `failed` total.
FR-31: The system shall keep the existing exit-code behavior: exit 1 only on an uncaught error.
FR-32: The system shall keep the existing summary line `[DAILY_BARS_DONE]` and its fields.
FR-33: The system shall log one line per backfilled symbol with the symbol, the stored row count and the number of bars fetched.

### F. Testability

FR-34: The system shall not start a sync run when the script module is imported.
FR-35: The system shall start a sync run when the script is executed through `npm run daily-bars-sync`.

## Non-Functional Requirements

NFR-01: The change shall add no new dependency and no change to `package.json`.
NFR-02: Every new function shall be under 50 lines and the script file under 800 lines.
NFR-03: No `any` shall be introduced.
NFR-04: Magic numbers (400 rows, 400 bars, page size, calendar window) shall be named constants.
NFR-05: New code shall have at least 80% line coverage from the new test file.
NFR-06: `npx tsc --noEmit`, the full Vitest suite and `npm run build` shall pass.
NFR-07: The script shall print no secret or key.
NFR-08: A re-run shall be idempotent: the same input produces the same stored rows.

## Constraints

C-01: No Protected Zone file shall be modified: `claude-agent.ts`, `learning.ts`, `config.ts`, `indicators.ts`, `risk-manager.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`.
C-02: `db.ts`, `types.ts`, `alpaca.ts`, migrations, workflows, dashboard and `package.json` shall not be modified.
C-03: No existing `daily_bars` row shall be deleted, and the penny-stock and leveraged-ETF rows shall not be touched or filtered.
C-04: The real write shall not be executed during implementation; it happens only in the scheduled sync after deploy.
C-05: The verification script shall live in `.tmp/`, write nothing, and print no key.

## Out of Scope

- The symbol-to-sector-to-ETF mapping and the relative-strength computation that will consume these bars.
- Any consumer of `daily_bars`.
- Changing `getBars` in `alpaca.ts`, or the macro bars in `claude-agent.ts`.
- Changing the incremental fetch window (400 calendar days) for symbols that already have history.
- Chunking the upsert into several batches.
- Workflow schedule, secrets or `package.json` script changes.
- Cleaning up or reconciling adjustment differences in rows already stored.
