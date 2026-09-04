# Requirements — daily_bars sync script + workflow (CHANGE 2 of 2 for historical OHLC persistence)

## Functional Requirements

FR-01: The system shall compute a symbol universe for each run consisting of the union of every currently open position's symbol and every distinct symbol found in `selection_history.candidates_offered` rows created in the last 7 days.

FR-02: The system shall deduplicate the symbol universe before fetching bars, so no symbol is fetched more than once per run.

FR-03: The system shall fetch up to 400 days of daily bars per symbol in the universe, using an explicit `limit` matching `daysBack` on every fetch.

FR-04: The system shall continue processing remaining symbols when a single symbol's bar fetch fails, logging the failure with the symbol and underlying error.

FR-05: The system shall convert each fetched bar's ISO timestamp into a plain date value before storing it, matching `daily_bars.bar_date`'s `DATE` column type.

FR-06: The system shall upsert all collected rows into `daily_bars` in a single batch operation per run, keyed on the `(symbol, bar_date)` uniqueness constraint, so re-running the sync corrects or fills gaps without creating duplicate rows.

FR-07: The system shall default to a dry run — printing what would happen without writing to Supabase — unless a specific environment variable is explicitly set to enable live writes.

FR-08: The system shall log one summary line per run reporting how many symbols were processed, how many failed, and how many rows were upserted (or would be, in a dry run).

FR-09: The system shall run automatically once per weekday, after market close, independent of the existing position-health-check schedule.

FR-10: The system shall also be triggerable manually, without waiting for its scheduled time.

## Non-Functional Requirements

NFR-01: The script's structure (client setup, dry-run gate, batching, logging, top-level error handling) shall mirror `scripts/position-health-check.ts`'s established pattern, for consistency with this repository's existing standalone-script convention.

NFR-02: The workflow's structure (triggers, concurrency group, secrets block, `npm audit` step) shall mirror `.github/workflows/position-health.yml`'s established pattern.

NFR-03: The system shall write to `daily_bars` using its own Supabase client instance, matching `position-health-check.ts`'s precedent of not routing through `db.ts` for its own write, while still using `db.ts`'s existing `getOpenPositionContexts()` for reads.

## Constraints

C-01: This feature must not modify the Protected Zone (`config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts`) — none of these files are touched by this CHANGE.

C-02: This feature shall not modify `scripts/position-health-check.ts`, `.github/workflows/position-health.yml`, `alpaca.ts`, `db.ts`, or `daily_bars`' schema.

C-03: This feature shall not add retry logic beyond what `position-health-check.ts` already does (log-and-skip per-symbol fetch failure; log-and-return on batch write failure) — no exponential backoff, no dead-letter queue.

C-04: This feature shall fetch exactly `daysBack=400, limit=400` per symbol — no other window size without calling out the deviation explicitly (none is called out, so this is fixed).

C-05: This feature shall not build any backtesting or analysis tooling that reads from `daily_bars` — this CHANGE only populates the table.

## Out of Scope

- Any consumer of `daily_bars` (backtesting, strategy discovery, dashboard views).
- Incremental/delta fetching (only-fetch-new-days) — every run re-fetches the full 400-day window per symbol, relying on upsert idempotency.
- A `db.ts` helper function for `daily_bars` reads or writes.
- Changes to `daily_bars`' schema, RLS, or constraints (CHANGE 1 is closed).
- Changes to `position-health-check.ts` or its workflow.
