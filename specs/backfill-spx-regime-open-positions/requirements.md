# Requirements — Backfill SPX Regime into open_position_contexts

## STEP 0 verification findings (informs the requirements below)

- `scripts/backfill-spx-regime.ts` only ever queries/updates `trade_evaluations` — confirmed via full read of the file (no reference to `open_position_contexts`). No backfill script has ever existed for `open_position_contexts`.
- That script's helper functions (`toEtDate`, `smaAtIndex`) and its prior-bar/regime logic are **not exported** — they are private to the file. The file must remain untouched (per constraint), so the new script needs its own copy of this logic rather than an import from the old file.
- `open_position_contexts` has no `id`/primary-key column. Columns: `symbol, buy_timestamp, buy_price, quantity, indicators, reasoning, pattern_ids, stop_order_id, signal_type, high_since_entry, trailing_stop, trailing_activated`. `symbol` is the de facto unique key — confirmed by `saveOpenPositionContext`'s `upsert(..., { onConflict: 'symbol' })` and by `updatePositionContext`/`deleteOpenPositionContext` both already keying solely on `.eq('symbol', symbol)` in `src/lib/db.ts`. A composite `symbol + buy_timestamp` key is unnecessary — `symbol` alone is safe and matches existing convention.
- Live re-query confirms the current affected-row state still matches the prior session's finding:

  | symbol | buy_timestamp | spx_price | spx_sma50 | spx_sma200 | spx_regime |
  |---|---|---|---|---|---|
  | COP | 2026-06-15T13:54:58.238Z | null | null | null | null |
  | XOM | 2026-06-15T13:54:58.238Z | null | null | null | null |
  | CVX | 2026-06-24T15:30:52.037Z | 733.58 | null | null | null |
  | AAPL | 2026-06-25T19:07:33.908Z | 738.65 | 691.3652 | 676.6046 | BULL |
  | META | 2026-06-26T17:58:23.027Z | 733.73 | 692.4744 | 677.1646 | BULL |

  AAPL/META are already fully populated (post `bbafb30` fix) and must not be touched. CVX is a **partial** case: `spx_price` already correct and must be preserved as-is; only `spx_sma50`/`spx_sma200`/`spx_regime` are missing.
- **Methodology divergence identified (see design.md Open Questions)**: the live agent cycle (`computeSpxSnapshot()` in `claude-agent.ts`) computes ONE shared SPY snapshot per cycle run (`refIndex = bars.length - 2`, relative to "now"), reused for every symbol bought that cycle. `backfill-spx-regime.ts` instead anchors independently **per row**, to that row's own `buy_timestamp`. This spec follows the latter (per-row, `buy_timestamp`-anchored) methodology, per the explicit instruction to compute "AS OF each position's own buy_timestamp (no lookahead)" — this is intentional and is the more accurate historical-reconstruction approach, not a bug.

## Functional Requirements

FR-01: The system shall query `open_position_contexts` for all rows (no table-side filter — the table holds only currently-open positions and is small) and shall, in application code, identify candidate rows where `indicators.spx_price`, `indicators.spx_sma50`, `indicators.spx_sma200`, or `indicators.spx_regime` is null or absent.

FR-02: The system shall compute the SPY bar fetch date range as `earliestCandidateBuyTimestamp − 400 calendar days` through `latestCandidateBuyTimestamp + 5 calendar days`, using only candidate rows (rows with at least one missing field) to determine the range.

FR-03: The system shall fetch SPY daily bars from Alpaca (`/v2/stocks/SPY/bars`, `feed=iex`, `1Day` timeframe) in a single bulk HTTP request covering the computed date range, using the same request shape as `scripts/backfill-spx-regime.ts`.

FR-04: The system shall convert each candidate row's `buy_timestamp` to an Eastern Time calendar date (`YYYY-MM-DD`, `America/New_York`) before resolving the prior trading day, using the same conversion logic as `scripts/backfill-spx-regime.ts`.

FR-05: The system shall select the SPY close from the last bar whose date is **strictly before** the row's ET buy date (no lookahead bias).

FR-06: The system shall skip a row's update and log `[BACKFILL_OPC_SKIP] symbol=SYM reason=no_prior_bar` when no SPY bar exists before the row's ET buy date.

FR-07: The system shall compute `spx_sma50` (50-period) and `spx_sma200` (200-period) SMAs ending at the reference bar, using the same windowed-average logic as `scripts/backfill-spx-regime.ts`.

FR-08: The system shall skip writing `spx_sma50`/`spx_sma200`/`spx_regime` (while still allowed to write `spx_price` per FR-09) and log `[BACKFILL_OPC_SKIP] symbol=SYM reason=insufficient_bars` when fewer than 200 bars exist at or before the reference bar index.

FR-09: The system shall classify `spx_regime` as `'BULL'` when `spxClose > sma200`, as `'CAUTION'` when `spxClose > sma50` (and `spxClose <= sma200`), and as `'BEAR'` otherwise — identical formula to `scripts/backfill-spx-regime.ts` and to `computeSpxSnapshot()` in `claude-agent.ts`.

FR-10: For each candidate row, the system shall only overwrite the specific `spx_*` field(s) that are currently null or absent, preserving any `spx_*` field that already holds a non-null value (e.g., CVX's existing `spx_price = 733.58` must remain unchanged).

FR-11: The system shall preserve every other key already present in a row's `indicators` JSONB object (e.g. `kalman`, `macd`, `adx`, `bollingerBands`) unchanged — the update shall be a merge, never a replace, of the `indicators` column.

FR-12: The system shall identify the row to update using `symbol` alone (`.eq('symbol', symbol)`), consistent with the existing `updatePositionContext`/`deleteOpenPositionContext` convention in `src/lib/db.ts`.

FR-13: When the `RUN_BACKFILL` env var is not set to `'true'`, the system shall log each would-be update as `[BACKFILL_OPC_DRY]` and print a `[BACKFILL_OPC_DRY_DONE] wouldUpdate=N wouldSkip=N` summary without writing any rows to Supabase.

FR-14: When `RUN_BACKFILL=true`, the system shall `UPDATE open_position_contexts SET indicators = <merged jsonb> WHERE symbol = <symbol>` for each row with at least one field successfully computed.

FR-15: The system shall log each successful live update as `[BACKFILL_OPC] symbol=SYM buy=DATE spy=N sma50=N sma200=N regime=X fields_updated=[...]`.

FR-16: The system shall print a `[BACKFILL_OPC_DONE] updated=N skipped=N failed=N` summary after a live run completes.

FR-17: The system shall log `[BACKFILL_OPC_ERROR]` and exit with code 1 if the Alpaca bulk bars fetch fails.

FR-18: The system shall log `[BACKFILL_OPC_ROW_ERROR] symbol=SYM`, increment a failed counter, and continue processing remaining rows if a single Supabase row update fails.

FR-19: The system shall not modify any row where all four `spx_*` fields are already non-null (e.g. AAPL, META).

FR-20: The system shall not modify `scripts/backfill-spx-regime.ts`.

FR-21: The system shall not modify any table other than `open_position_contexts`.

## Non-Functional Requirements

NFR-01: The script shall be runnable with `npx tsx --env-file=.env.local scripts/backfill-spx-regime-open-positions.ts` — no additional package installs.

NFR-02: The script shall make exactly one HTTP request to the Alpaca bars endpoint regardless of the number of candidate rows.

NFR-03: The SPY-fetch/ET-conversion/SMA/regime helper logic shall be extracted into a new shared module (not into `backfill-spx-regime.ts`) so it has a single source of truth and is unit-testable; both scripts may end up with their own copy until/unless a future spec consolidates them — this spec does not require refactoring the existing script.

NFR-04: The new shared helper functions (ET-date conversion, SMA-at-index, regime classification) shall be pure functions with no I/O, to allow direct unit testing without mocking Supabase or Alpaca.

## Constraints

C-01: This feature must not modify `scripts/backfill-spx-regime.ts`.
C-02: This feature must not modify any Protected Zone file (`src/lib/config.ts`, `src/lib/claude-agent.ts`, `src/lib/risk-manager.ts`, `src/lib/indicators.ts`, `src/lib/news-intelligence.ts`).
C-03: This feature must not modify `src/lib/types.ts` — `spx_*` fields remain untyped/dynamic JSONB keys on `indicators`, consistent with existing precedent (they are not part of the `TechnicalIndicators` interface today either).
C-04: The regime classification logic is frozen as specified: `BULL` / `CAUTION` / `BEAR` — no alternate label set.
C-05: No DB migration is required or permitted — `indicators` is an existing JSONB column.

## Out of Scope

- Wiring/fixing the live agent cycle's SPX snapshot computation — already fixed in `bbafb30`.
- Backfilling `trade_evaluations` — already covered by the existing `scripts/backfill-spx-regime.ts`.
- Consolidating/de-duplicating shared logic between the two backfill scripts into one canonical module imported by both — explicitly deferred (NFR-03); this spec only extracts a fresh copy for the new script.
- A dashboard column or UI surface for these fields on open positions.
- Handling rows that may appear in `open_position_contexts` in the future with a different schema — this spec targets the schema confirmed live today.
