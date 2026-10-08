# Requirements — Measure real entry slippage vs recorded entry_price (STEP 0b, read-only)

## Context

STEP 0 (2026-10-07) found, and the shipped `weighted-fill-buy-price` CHANGE confirmed: 107 of 110 closed
trades in `trade_evaluations` have `entry_price` exactly equal to `indicators_at_buy.currentPrice` (a stale
daily-bar close, not the fill) rather than the trade's actual weighted average fill price. That fix is
forward-only — it does not touch any existing row. This task measures, read-only, how far off the
historical `entry_price` values are from what was actually filled, using Alpaca's own order records as the
source of truth. `agent_log.order_id` holds the BUY order id for every historical trade (the single order,
for every trade predating the retry mechanism); Alpaca's `GET /v2/orders/{id}` returns `filled_avg_price`
and `filled_qty` for that order. The match key between `trade_evaluations` and `agent_log` is
`symbol` + exact `buy_timestamp`/`timestamp` string equality — both are set from the same `timestamp`
variable within a single `runAgentCycle()` invocation (confirmed in `claude-agent.ts`), so the join is 1:1,
not fuzzy.

This is **not a shipped feature** — it is a one-off, throwaway, read-only measurement script. It produces a
console report and is explicitly forbidden from writing to the database, modifying any repo file, or being
committed.

## Functional Requirements

FR-01: The system shall read every row of `trade_evaluations` (all are closed trades) via a read-only
Supabase query, retrieving at minimum `id`, `symbol`, `buy_timestamp`, `entry_price`, `exit_price`,
`quantity`, `pnl_usd`, `pnl_pct`, `outcome`, and `signal_type`.

FR-02: For each `trade_evaluations` row, the system shall locate its matching `agent_log` row by exact
equality on `symbol` and on `agent_log.timestamp == trade_evaluations.buy_timestamp`, restricted to rows
where `action = 'BUY'` and `order_executed = true`.

FR-03: Where no matching `agent_log` row is found, the system shall exclude that trade from all slippage
calculations and count it under a distinct "no matching agent_log row" reason.

FR-04: Where a matching `agent_log` row has a `null` `order_id`, the system shall exclude that trade from
all slippage calculations and count it under a distinct "no order_id recorded" reason.

FR-05: For every trade with a resolved `order_id`, the system shall call Alpaca `GET /v2/orders/{order_id}`
(paper trading base URL) to retrieve that order's `filled_avg_price` and `filled_qty`.

FR-06: Where the retrieved order's `filled_qty` is greater than zero and `filled_avg_price` is `null` or
missing, the system shall exclude that trade from all slippage calculations and count it under a distinct
"partial fill with no filled_avg_price" reason.

FR-07: Where the retrieved order's `filled_qty` is zero, the system shall exclude that trade from all
slippage calculations and count it under a distinct "order shows zero fill" reason.

FR-08: For every trade with a usable `filled_avg_price`, the system shall compute slippage in basis points
as `((filled_avg_price - entry_price) / entry_price) * 10000`.

FR-09: The system shall report, over all measured trades, the mean, median, and 90th-percentile slippage in
basis points.

FR-10: The system shall report the same mean/median/p90 slippage figures broken down by `signal_type`
(treating a `null`/missing `signal_type` as its own `UNKNOWN` group).

FR-11: The system shall report the share (count and percentage) of measured trades where
`filled_avg_price > entry_price`.

FR-12: For every measured trade, the system shall recompute `pnl_pct` and `pnl_usd` substituting
`filled_avg_price` for `entry_price` as the cost basis, keeping the existing `exit_price` and `quantity`
unchanged, using the same formula `trade_evaluations` itself uses
(`pnlPct = ((exit_price - cost) / cost) * 100`, `pnlUSD = (exit_price - cost) * quantity`).

FR-13: The system shall report, side by side, the current (as-recorded) and the recomputed (fill-based)
overall average `pnl_pct`, win rate, and profit factor across all measured trades.

FR-14: Win rate and profit factor in FR-13 shall be computed consistently for both the current and
recomputed figures (a trade's win/loss classification for the recomputed figures shall use the sign of the
recomputed `pnl_pct`, not the stored `outcome` column).

FR-15: The system shall print, at the end of its run, a clear count of trades excluded under each distinct
reason from FR-03, FR-04, FR-06, and FR-07, plus the number of trades successfully measured.

FR-16: The system shall never print the raw value of `ALPACA_API_KEY`, `ALPACA_SECRET_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, or any other credential, in any console output.

## Non-Functional Requirements

NFR-01: The script shall issue only read operations — `select` queries against Supabase and `GET` requests
against Alpaca. No `insert`, `update`, `upsert`, `delete`, or any Alpaca order-placement/cancellation call
shall appear anywhere in the script.

NFR-02: The script shall live at `.tmp/entry-slippage-check.ts` (an already-gitignored path in this repo) —
not inside `src/`, `scripts/`, or any other path that is part of the committed tree.

NFR-03: The script shall be runnable as a single `npx tsx --env-file=.env.local .tmp/entry-slippage-check.ts`
invocation from the repo root, consistent with how every existing one-off script in `scripts/` is run.

NFR-04: The script shall not import from `src/lib/*` or any other repo module — following the existing
convention in `scripts/backfill-spx-regime.ts` of duplicating the minimal Alpaca-header and Supabase-client
setup locally, since `tsx` run against a file outside `src/` does not resolve this project's `@/` path alias.

NFR-05: The script shall not be staged or committed to git under any circumstance.

## Constraints

C-01: This task does not touch the Protected Zone — no Protected Zone file is read, written, or referenced
by the script.

C-02: This task shall not write to `open_position_contexts`, `trade_evaluations`, `agent_log`, or any other
table.

C-03: This task shall not create, modify, or apply any Supabase migration.

C-04: This task shall not place, modify, or cancel any Alpaca order.

C-05: This task shall not modify any file inside the committed repo tree (`src/`, `scripts/`, `specs/`
excluded since this spec itself lives there, config files, etc.) — only `.tmp/entry-slippage-check.ts` is
created, and it is gitignored.

C-06: The recomputed fill-based `pnl_pct`/win rate/profit factor figures (FR-12 to FR-14) shall be printed
to the console only — they shall not be written to any file, table, or document.

## Out of Scope

- Correcting or backfilling any `trade_evaluations` or `open_position_contexts` row (forbidden elsewhere;
  not attempted here either — this is pure measurement).
- Cross-checking the small number of trades that have `indicators_at_buy.fillAttempts` persisted (the
  handful of retry-path trades, e.g. FCX/NKE/INTC) against their *full* weighted-average fill — this script
  uses only the single `agent_log.order_id` lookup the task specifies; any such trade is measured against
  its first order only, which is a known, stated limitation, not a defect to fix here.
- Any change to the dashboard, API routes, or `trade-views.ts`.
- Persisting this report anywhere — it is read once, reported to the console/chat, and discarded.
