# Design — Always sync sector-proxy ETFs into daily_bars

## Architecture Decision

The change stays inside `scripts/daily-bars-sync.ts`, the standalone CLI run by `.github/workflows/daily-bars-sync.yml`
(`npm run daily-bars-sync`). It adds a constant, extends the universe, and adds a history path for sector-proxy ETFs
that have fewer than 400 stored rows. No app code, Protected Zone file, table or workflow is involved. The script
already has the dedup mechanism (`upsert(..., { onConflict: 'symbol,bar_date' })`) and the table has
`UNIQUE (symbol, bar_date)`, so duplicates across runs are impossible.

## Pre-Implementation Verification (FAIL FAST checks, against current code)

| Fail-fast condition | Result | Evidence |
|---|---|---|
| `daily_bars` has no unique constraint or the script has no dedup path | **Passes** | Migration `20260904192938_create_daily_bars.sql` declares `UNIQUE (symbol, bar_date)`; script upserts with `onConflict: 'symbol,bar_date'` (line 95) |
| Universe built outside `scripts/daily-bars-sync.ts` | **Passes** | `getSymbolUniverse()` (lines 27-48) is in the script; `SECTOR_WATCHLIST` is only used by `stock-selector.ts` and is not part of this universe |

## Findings That Shape the Design (not in the request text)

1. **The current fetch is 400 *calendar* days, not 400 trading days.** `getBars(symbol, '1Day', 400, 400)` means
   `daysBack=400` calendar days (about 275 trading days) with `limit=400`. The incremental path alone therefore never
   reaches 400 stored rows; the new history path is what first gets an ETF to 400 rows. After that, the existing path
   keeps it current.
2. **`getBars` cannot do what the request asks.** It has no `adjustment` parameter (Alpaca then returns raw bars),
   ignores `next_page_token`, and cannot request a start date. Split adjustment and paging need a request the helper
   does not offer. `alpaca.ts` is outside the allowed scope, so the script needs its own small fetcher (Open Question 2).
3. **The existing script uses no adjustment.** Per the request, this is reported here and the backfill uses `'split'`.
   Consequence: stored history for these ETFs becomes a mix. The incremental path (still raw) rewrites the most recent
   ~400 calendar days on every run, while backfilled rows older than that stay split-adjusted. This only matters if one
   of the 11 ETFs split inside the window. The dry-run therefore also compares raw against split closes (Open Question 1).
4. **"Split/dividend-adjusted" and `'split'` disagree.** Alpaca's `split` value adjusts for splits only; dividend
   adjustment is a different value (`dividend` or `all`). The request's explicit instruction is `'split'`, which this
   design follows.
5. **Duplicate-in-batch hazard.** The script collects all rows and upserts once. If a sector-proxy symbol were fetched by
   both the normal path and the backfill, the batch would contain two rows with the same `(symbol, bar_date)` and
   Postgres rejects the whole statement ("ON CONFLICT DO UPDATE command cannot affect row a second time"). The existing
   code logs the error and still exits 0, so the day's entire sync would be lost silently. The backfill therefore
   *replaces* the normal fetch for that symbol, never adds to it (FR-22, FR-24).
6. **The script has no test file and runs `main()` on import** (line 105). Tests need the module to be importable
   without side effects (FR-34), so a small entrypoint guard and a few exports are part of this change.
7. **Batch size grows.** Up to 11 ETFs x 400 rows are added to a single upsert on the first run. The existing code already
   upserts thousands of rows in one request; this stays within the same order of magnitude but is the first thing to
   check if the first scheduled run fails.

## Data Flow

1. `getSymbolUniverse()` returns open positions + 7-day candidates; on a `selection_history` error it still returns
   open positions (existing behavior).
2. `buildUniverse(base)` returns the deduplicated union of `base` and `SECTOR_PROXY_ETFS` (a `Set`), so each ETF appears
   once whether or not it was already present (FR-02, FR-03, FR-05).
3. For each symbol, `fetchSymbolBars(symbol)` decides the path:
   - not in `SECTOR_PROXY_ETFS`: existing `getBars(symbol, '1Day', 400, 400)`;
   - in `SECTOR_PROXY_ETFS`: `countStoredRows(symbol)`; if `< BACKFILL_MIN_ROWS (400)`, `fetchHistoryBars(symbol)`;
     otherwise (or if the count read failed, logged) the existing `getBars` path.
4. `fetchHistoryBars`: GET `/v2/stocks/{symbol}/bars` with `timeframe=1Day`, `start = today - BACKFILL_CALENDAR_DAYS`,
   `limit = BACKFILL_PAGE_LIMIT`, `adjustment=split`, `feed` as in `getBars`, `sort=asc`; follow `next_page_token` until
   null; keep the last `BACKFILL_TARGET_BARS (400)` bars.
5. Each symbol's bars go through the same row mapping as today. A failure in step 3 is caught per symbol: one
   `[DAILY_BARS_ERROR]` line, `failed++`, continue (FR-28 to FR-30).
6. Single upsert, dry-run gate and summary line unchanged.

## Constants

| Name | Value | Purpose |
|------|-------|---------|
| `SECTOR_PROXY_ETFS` | 11 symbols (exported) | Always-synced universe |
| `BACKFILL_MIN_ROWS` | 400 | Stored-row threshold |
| `BACKFILL_TARGET_BARS` | 400 | Trading days to keep |
| `BACKFILL_CALENDAR_DAYS` | 620 | Window with margin: 620 calendar days is about 427 trading days |
| `BACKFILL_PAGE_LIMIT` | 1000 | Explicit page size (Alpaca's maximum is 10000) |

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Own fetcher inside the script | Respects "nothing else" scope; supports adjustment, paging and start date | Repeats the auth header and data-URL logic of `alpaca.ts` (about 15 lines) | Chosen |
| Add optional params to `getBars` in `alpaca.ts` | No duplication; fixes the helper for everyone | Outside the allowed scope; touches a shared module used by the agent cycle | Rejected (Open Question 2) |
| Backfill replaces the normal fetch for that symbol | No in-batch duplicates; one request per symbol | Backfilled symbols skip the normal call that run | Chosen |
| Backfill in addition to the normal fetch, dedupe rows in code | Keeps both calls | Two sources for the same dates, mixed adjustment inside one run | Rejected |
| Count rows with a head/count query per ETF | Cheap, bounded, no rows transferred | 11 small reads | Chosen |
| Select all ETF rows and count in code | One query | Transfers up to several thousand rows | Rejected |
| Fetch from a calendar window and keep the last 400 bars | Independent of holiday math | May fetch about 27 extra bars | Chosen |
| Fetch with `limit=400` and a computed start | Exact count | The macro-bar truncation bug: if the window holds more than the limit, ascending order drops the newest bars | Rejected |
| Entrypoint guard + exports to make the script testable | Smallest change that allows tests | Alters how the script starts | Chosen |
| Extract logic to `scripts/lib/` | Cleaner | A new file outside the allowed scope | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| scripts/daily-bars-sync.ts | MODIFY | Add exported `SECTOR_PROXY_ETFS` and constants, `buildUniverse`, `countStoredRows`, `fetchHistoryBars`, per-symbol path selection; entrypoint guard so import does not run `main()`. Stays under 800 lines |
| scripts/daily-bars-sync.test.ts | CREATE | Vitest file next to the script (no scripts test file exists today; vitest's default include picks it up and `tsc` includes `**/*.ts`) |
| .tmp/sector-proxy-dryrun.ts | CREATE (gitignored) | Throwaway read-only dry-run for VERIFY |

## Protected Zone Impact

None — this feature does not require Protected Zone changes. `package.json`, `db.ts`, `types.ts`, `alpaca.ts`, migrations
and workflows are untouched.

## Database Changes

None. Reads `daily_bars` (row counts) and writes `daily_bars` through the existing upsert. No migration, column, index or
RLS change.

## Test Plan (house style: Vitest, AAA, `vi.hoisted` mocks)

- Universe contains all 11 ETFs, each once, with and without overlap with open positions and candidates.
- Universe still contains the ETFs when `selection_history` errors.
- Backfill used at 399 rows, not at 400 or 401 stored rows; never used for a non-ETF symbol.
- Backfill request carries `adjustment=split`, `sort=asc`, an explicit `limit`, and follows `next_page_token` across two pages.
- Keeps only the latest 400 bars when the window returns more.
- A backfilled symbol contributes rows from one path only (no duplicate `(symbol, bar_date)` in the batch).
- One failing symbol logs one line, increments `failed`, and the others still produce rows.
- A count-read error falls back to the normal path and logs one line.
- Importing the module does not run `main()`.

## Risks

- First scheduled run writes about 4,400 extra rows in one request; if it fails, the existing code logs the error and
  exits 0, so check the `[DAILY_BARS_DONE]` line of the first run.
- A symbol whose total history is shorter than 400 trading days would trigger the history path on every run. None of
  the 11 listed ETFs is that new, and the path is idempotent.
- Mixed adjustment (finding 3) if any ETF split within the window.

## Open Questions

1. **Adjustment — DECIDED 2026-10-13: raw.** (Dry-run: 186 differing bars each for XLE, XLK, XLY; `split` would have changed 89 stored XLE rows and mixed conventions.) Original text: The request says to use `'split'` when the script uses none, and the script uses none (raw), as does
   the rest of the system (`getBars`, macro bars). Proceed with `'split'` as instructed, or use raw so every stored row
   shares one convention? Recommendation: keep `'split'` only if the dry-run shows no raw-vs-split difference in the
   window for all 11 ETFs (then it is moot); otherwise use raw. The dry-run will print that count.
2. **Where the fetcher lives.** Own fetcher in the script (default in this spec), or an additive optional-parameter
   change to `getBars` in `alpaca.ts` (needs your authorization because it is outside the allowed scope)?
3. **Test file location.** `scripts/daily-bars-sync.test.ts` next to the script (default), or elsewhere?
4. **Entrypoint guard.** Is a small guard plus exports inside the script acceptable? It is the only way to test the
   script without a new file.
5. **Count-read failure.** Keep the symbol on the normal path and log (default), or count it as a failed symbol?
