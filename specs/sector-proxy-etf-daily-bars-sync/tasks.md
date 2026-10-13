# Tasks — Always sync sector-proxy ETFs into daily_bars

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Open Questions 1-5 in `design.md` answered
- [x] Protected Zone changes confirmed — N/A, none required
- [x] Database migrations drafted — N/A, none needed

## Implementation Checklist

### Phase 0 — Read-only pre-checks
- [x] T-01: Confirm the Alpaca bars endpoint parameters (`adjustment`, `page_token`, `limit` maximum, `feed`) against primary Alpaca docs, and confirm `getBars` sends `feed=sip`. Report any difference; do not guess.
  - Result: Alpaca docs confirm `adjustment` (raw default; `split` valid), `page_token`/`next_page_token`, `limit` 1-10000 (default 1000), `feed` default `sip`, `sort` asc. `getBars` sends `feed=sip` and no `adjustment` (raw). Note: the JSDoc above `getBars` says `iex` is required, but the code sends `sip`; not changed here.
- [x] T-02: Find an entrypoint guard that works under `tsx` (the script is CommonJS-style: no `"type": "module"`) and under Vitest import. If none works without a new file, STOP and report.
- [x] T-03: Confirm `daily_bars` unique constraint on the live project (read-only `list_tables` or `execute_sql` SELECT) and that `onConflict: 'symbol,bar_date'` matches it.
  - Result: the trading-agent Supabase project is not in the MCP account (only emerald-bay-quotes, landing_EVOX, Parqueo, Dealer), so no live query was possible. Evidence: migration `UNIQUE (symbol, bar_date)` + `specs/daily-bars-table/review.md` (live-confirmed via `pg_constraint`: `daily_bars_symbol_bar_date_key`) + the script already upserts with `onConflict: 'symbol,bar_date'`.

### Phase 1 — Tests first (RED), in `scripts/daily-bars-sync.test.ts`
- [x] T-04: Universe contains all 11 ETFs exactly once; overlap with positions/candidates deduped; ETFs kept when `selection_history` errors (FR-01 to FR-05).
- [x] T-05: Backfill chosen at 399 rows, not at 400 or 401; never for a non-ETF symbol (FR-07 to FR-11).
- [x] T-06: Count-read error logs one line and keeps the normal path (FR-12).
- [x] T-07: History request has `adjustment=split`, `sort=asc`, explicit `limit`, and pages across `next_page_token` (FR-13 to FR-16, FR-20).
- [x] T-08: Keeps only the latest 400 bars; row mapping equals the existing path's mapping (FR-18, FR-21).
- [x] T-09: A backfilled symbol contributes rows from one path only; no duplicate `(symbol, bar_date)` in the batch (FR-22, FR-24).
- [x] T-10: One failing symbol logs one `[DAILY_BARS_ERROR]` line, counts in `failed`, others still produce rows; exit behavior unchanged (FR-28 to FR-32).
- [x] T-11: Importing the module does not call `main()` (FR-34).

### Phase 2 — `scripts/daily-bars-sync.ts` (GREEN)
- [x] T-12: Add exported `SECTOR_PROXY_ETFS` and the four named constants (NFR-04).
- [x] T-13: Add `buildUniverse` and wire it so the ETFs are always included (FR-02 to FR-05).
- [x] T-14: Add `countStoredRows` (head/count query on `daily_bars`, filtered by symbol) with per-symbol error handling.
- [x] T-15: Add `fetchHistoryBars` (paged, ascending, explicit limit, `adjustment` per Open Question 1, keep last 400).
- [x] T-16: Select the fetch path per symbol so each ETF contributes rows from exactly one path; add the per-symbol backfill log line (FR-22, FR-33).
- [x] T-17: Add the entrypoint guard (FR-34, FR-35); confirm `npm run daily-bars-sync` still starts a run in dry-run mode.
- [x] T-18: Keep functions under 50 lines, file under 800, no `any`.

### Phase 3 — Verification
- [x] T-19: `npx tsc --noEmit` clean.
- [x] T-20: Full Vitest run passes; coverage of the new code at least 80%.
- [x] T-21: `npm run build` succeeds.
- [x] T-22: ONE read-only run of `.tmp/sector-proxy-dryrun.ts` (gitignored, no keys printed, writes nothing): per ETF print rows already in `daily_bars`, bars fetched, first and last bar date, and the number of bars whose split-adjusted close differs from the raw close.
  - Result: all 11 ETFs fetched 400 bars (2025-03-12 to 2026-10-13). Stored rows: SPY 280, XLE 302, the other nine 0. **split_vs_raw_diff = 186 for XLE, XLK and XLY** (0 for the rest); **XLE: 89 stored rows would change value** under `split`. See review of Open Question 1.
- [x] T-23: `git status` shows only `scripts/daily-bars-sync.ts` and `scripts/daily-bars-sync.test.ts` changed (plus the spec folder). State plainly that the real write was not executed here and happens only in the scheduled sync after deploy.

## Post-Implementation

- [x] Run /review sector-proxy-etf-daily-bars-sync to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged
- [ ] After deploy: check the first `[DAILY_BARS_DONE]` line (failed count, upserted count) and `SELECT symbol, count(*) FROM daily_bars WHERE symbol IN (...) GROUP BY 1`

## Estimated Complexity

Medium — the logic is small, but it needs its own paged Alpaca fetcher, a testability refactor of a script that has no tests,
and care around the duplicate-in-batch and mixed-adjustment hazards.
