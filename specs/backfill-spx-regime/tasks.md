# Tasks — Backfill SPX Regime into trade_evaluations

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] Protected Zone changes confirmed (N/A — no file in src/ is touched)
- [X] Database migrations confirmed (N/A — columns already exist from Macro-A migration)

---

## STEP 0 — Read before touching anything (do NOT modify any file)

- [x] T-00a: Read `src/lib/alpaca.ts` lines 11–37 — confirm auth headers pattern:
  - `getHeaders()` → `APCA-API-KEY-ID` + `APCA-API-SECRET-KEY`
  - `dataUrl()` → `process.env.ALPACA_DATA_URL ?? 'https://data.alpaca.markets'`
  - `alpacaFetch<T>()` → wraps fetch with auth headers, throws on non-ok

- [x] T-00b: Read `src/lib/db.ts` lines 13–18 — confirm `getClient()` is NOT exported:
  ```ts
  function getClient(): SupabaseClient {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error(...)
    return createClient(url, key)
  }
  ```
  The script must replicate this inline — do NOT export it from db.ts.

- [x] T-00c: Run this Supabase query and show the result to Amaury:
  ```sql
  SELECT id, symbol, signal_type, buy_timestamp, spx_price
  FROM trade_evaluations
  WHERE buy_timestamp >= '2026-04-20'
  ORDER BY buy_timestamp ASC;
  ```
  Expected: `spx_price` is NULL for all rows.

---

## Implementation Checklist

### Phase 1 — Create scripts/backfill-spx-regime.ts

- [x] T-01: Create `scripts/backfill-spx-regime.ts` with header comment documenting methodology:
  - SPY snapshot = previous trading day's close relative to buy_timestamp
  - buy_timestamp converted to ET date to avoid UTC midnight edge cases
  - SMA50/SMA200 computed using only data available before entry date
  - No lookahead bias — at entry time only previous close was known
  - Regime: spyClose > sma200 → BULL | spyClose > sma50 → CAUTION | else → BEAR

- [x] T-02: Add imports:
  ```ts
  import { createClient } from '@supabase/supabase-js'
  ```
  No dotenv import needed — use `npx tsx --env-file=.env.local` at runtime.

- [x] T-03: Implement Supabase client inline (do NOT import from db.ts):
  ```ts
  const db = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  ```

- [x] T-04: Implement Alpaca auth headers inline matching alpaca.ts pattern:
  ```ts
  const ALPACA_HEADERS = {
    'APCA-API-KEY-ID': process.env.ALPACA_API_KEY!,
    'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY!,
  }
  const DATA_URL = process.env.ALPACA_DATA_URL ?? 'https://data.alpaca.markets'
  ```

- [x] T-05: Implement `toEtDate()` helper (exact body from spec):
  ```ts
  function toEtDate(isoTimestamp: string): string {
    return new Date(isoTimestamp).toLocaleDateString('en-CA', {
      timeZone: 'America/New_York',
    })
  }
  ```

- [x] T-06: Implement `smaAtIndex()` helper (exact body from spec):
  ```ts
  function smaAtIndex(closes: number[], index: number, period: number): number | null {
    if (index < period - 1) return null
    const slice = closes.slice(index - period + 1, index + 1)
    return slice.reduce((a, b) => a + b, 0) / period
  }
  ```

- [x] T-07: Implement STEP 1 — fetch trades from Supabase:
  ```ts
  const { data: trades, error } = await db
    .from('trade_evaluations')
    .select('id, symbol, buy_timestamp')
    .is('spx_price', null)
    .gte('buy_timestamp', '2026-04-20')
    .order('buy_timestamp', { ascending: true })
  ```

- [x] T-08: Implement STEP 2 — compute date range and bulk-fetch SPY bars:
  - `earliestDate` = earliest `buy_timestamp` minus 400 calendar days (ISO date string)
  - `latestDate` = latest `buy_timestamp` plus 5 calendar days (ISO date string)
  - URL: `${DATA_URL}/v2/stocks/SPY/bars`
  - Params: `timeframe=1Day`, `start=earliestDate`, `end=latestDate`, `limit=1000`, `sort=asc`, `feed=iex`
  - On fetch error: log `[BACKFILL_ERROR] <message>` and `process.exit(1)`
  - Parse: `bars = response.bars.map(b => ({ date: b.t.split('T')[0], close: b.c }))`
  - Extract: `closes = bars.map(b => b.close)`

- [x] T-09: Implement STEP 3 — per-trade prior bar lookup:
  - `const tradeDate = toEtDate(trade.buy_timestamp)`
  - `const i = findLastIndex(bars, b => b.date < tradeDate)` (implement `findLastIndex` inline — `Array.prototype.findLastIndex` exists in Node 18+)
  - If `i === -1`: log `[BACKFILL_SKIP] id=... reason=no_prior_bar`, increment `skipped`, continue

- [x] T-10: Implement STEP 4 — SMA computation and skip logic:
  - `const sma50 = smaAtIndex(closes, i, 50)`
  - `const sma200 = smaAtIndex(closes, i, 200)`
  - If `sma50 === null || sma200 === null`: log `[BACKFILL_SKIP] id=... reason=insufficient_bars`, increment `skipped`, continue

- [x] T-11: Implement STEP 5 — regime classification:
  ```ts
  const regime = spyClose > sma200 ? 'BULL' : spyClose > sma50 ? 'CAUTION' : 'BEAR'
  ```

- [x] T-12: Implement STEP 6 — dry-run branch (default when `RUN_BACKFILL` is not set):
  ```
  [BACKFILL_DRY] id=UUID symbol=NEM buy=2026-05-19 spy=584.22 sma50=571.83 sma200=548.19 regime=BULL
  ```
  After loop: `[BACKFILL_DRY_DONE] wouldUpdate=N wouldSkip=N`

- [x] T-13: Implement STEP 7 — live-run branch (`process.env.RUN_BACKFILL === 'true'`):
  - Supabase UPDATE:
    ```ts
    await db.from('trade_evaluations')
      .update({ spx_price: spyClose, spx_sma50: sma50, spx_sma200: sma200, spx_regime: regime })
      .eq('id', trade.id)
      .is('spx_price', null)
    ```
  - On success: log `[BACKFILL] id=UUID symbol=NEM buy=2026-05-19 spy=584.22 sma50=571.83 sma200=548.19 regime=BULL`, increment `updated`
  - On error: log `[BACKFILL_ROW_ERROR] id=UUID <message>`, increment `failed`, continue
  - After loop: `[BACKFILL_DONE] updated=N skipped=N failed=N`

---

## Phase 2 — Dry run verification (before live run)

- [x] T-14: Run dry run and paste output to Amaury:
  ```
  npx tsx --env-file=.env.local scripts/backfill-spx-regime.ts
  ```
  Must print `[BACKFILL_DRY_DONE] wouldUpdate=N wouldSkip=0`

- [X] T-15: Wait for Amaury's approval of the dry-run output before proceeding to Phase 3.

---

## Phase 3 — Live run (only after dry-run approval)

- [x] T-16: Run live backfill:
  ```
  RUN_BACKFILL=true npx tsx --env-file=.env.local scripts/backfill-spx-regime.ts
  ```

- [x] T-17: Verify completeness in Supabase:
  ```sql
  SELECT COUNT(*) FROM trade_evaluations
  WHERE buy_timestamp >= '2026-04-20' AND spx_price IS NULL;
  ```
  → Must return **0**

- [x] T-18: Verify sanity in Supabase:
  ```sql
  SELECT symbol, buy_timestamp, spx_price, spx_sma50, spx_sma200, spx_regime
  FROM trade_evaluations
  WHERE buy_timestamp >= '2026-04-20'
  ORDER BY buy_timestamp ASC
  LIMIT 10;
  ```
  → `spx_price` in range ~500–600 ✅
  → `spx_sma200 < spx_sma50` for Apr–May entries (BULL market condition) ✅
  → `spx_regime` mostly `'BULL'` for Apr–May trades ✅
  → No unexpected all-NULL or all-BEAR results ✅

---

## Post-Implementation

- [x] Run `/review backfill-spx-regime` to verify implementation matches spec
- [x] Confirm no file in `src/` was modified
- [x] Confirm only `trade_evaluations` rows with NULL `spx_price` were written

---

## Estimated Complexity

**Low** — single-file CLI script (~130 lines), no new dependencies, one HTTP request, straightforward index arithmetic. Main risk: insufficient SPY bar history for the earliest trades (skipped gracefully with `insufficient_bars`).
