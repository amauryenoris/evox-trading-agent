# Requirements — Backfill SPX Regime into trade_evaluations

## Functional Requirements

FR-01: The system shall query `trade_evaluations` for rows where `spx_price IS NULL` AND `buy_timestamp >= '2026-04-20'`, ordered by `buy_timestamp ASC`, to build the backfill candidate list.

FR-02: The system shall compute the SPY bar date range as: `earliestBuyDate − 250 calendar days` through `latestBuyDate + 5 calendar days`.

FR-03: The system shall fetch SPY daily bars from Alpaca in a single bulk HTTP request covering the computed date range.

FR-04: The system shall convert each trade's `buy_timestamp` to an Eastern Time calendar date (`YYYY-MM-DD`) using the `America/New_York` timezone before resolving the prior trading day.

FR-05: The system shall select the SPY close from the last bar whose date is **strictly before** the trade's ET date (no lookahead bias — only prior-day close was known at entry time).

FR-06: The system shall skip a trade and log `[BACKFILL_SKIP] reason=no_prior_bar` when no SPY bar exists before the trade's ET date.

FR-07: The system shall compute SMA50 using the 50 closes ending at (and including) the reference bar, using only data available at that index.

FR-08: The system shall compute SMA200 using the 200 closes ending at (and including) the reference bar, using only data available at that index.

FR-09: The system shall skip a trade and log `[BACKFILL_SKIP] reason=insufficient_bars` when fewer than 200 bars exist at or before the reference bar index.

FR-10: The system shall classify macro regime as `'BULL'` when `spyClose > sma200`, as `'CAUTION'` when `spyClose > sma50` (and `spyClose <= sma200`), and as `'BEAR'` otherwise.

FR-11: When `RUN_BACKFILL` env var is not set, the system shall log each would-be update as `[BACKFILL_DRY]` and print a `[BACKFILL_DRY_DONE] wouldUpdate=N wouldSkip=N` summary without writing any rows to Supabase.

FR-12: When `RUN_BACKFILL=true`, the system shall `UPDATE trade_evaluations SET spx_price, spx_sma50, spx_sma200, spx_regime WHERE id = trade.id AND spx_price IS NULL`.

FR-13: The system shall log each successful live update as `[BACKFILL] id=UUID symbol=SYM buy=DATE spy=N sma50=N sma200=N regime=X`.

FR-14: The system shall print a `[BACKFILL_DONE] updated=N skipped=N failed=N` summary after the live run completes.

FR-15: The system shall log `[BACKFILL_ERROR]` and exit with code 1 if the Alpaca bulk bars fetch fails.

FR-16: The system shall log `[BACKFILL_ROW_ERROR] id=UUID`, increment a failed counter, and continue processing remaining trades if a single Supabase row update fails.

FR-17: The system shall not modify any `trade_evaluations` row where `spx_price IS NOT NULL`.

FR-18: The system shall not modify any other table in the database.

## Non-Functional Requirements

NFR-01: The script shall be runnable with `npx tsx` — no additional package installs or ts-node required.

NFR-02: The script shall make exactly one HTTP request to the Alpaca bars endpoint regardless of the number of trades to backfill.

NFR-03: The script shall document its methodology in a header comment (no-lookahead bias, ET date conversion, prior-close snapshot, regime classification).

## Constraints

C-01: This feature must not modify any file in `src/` — Protected Zone or otherwise.

C-02: Only `scripts/backfill-spx-regime.ts` may be created; no existing file may be changed.

C-03: The regime classification logic is frozen as specified: `BULL` / `CAUTION` / `BEAR` — no alternate label set.

## Out of Scope

- Wiring SPX regime into the live agent cycle (`runAgentCycle`) — deferred to a future spec.
- Backfilling trades before `2026-04-20` — excluded by query filter.
- Creating a UI column or dashboard widget for `spx_regime` — deferred.
- Pagination for Alpaca bars response (limit=1000 is sufficient for the date range covered).
