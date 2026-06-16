# Design — Backfill SPX Regime into trade_evaluations

## Architecture Decision

This is a one-off CLI script in `scripts/`, run via `npx tsx --env-file=.env.local`. It operates entirely outside the Next.js app: no route handlers, no middleware, no bundler. It reads from two external services (Alpaca data API, Supabase) and writes only to `trade_evaluations` rows that are still NULL. The script is idempotent — re-running it is safe because the Supabase UPDATE includes a `WHERE spx_price IS NULL` guard, and the query in STEP 1 only fetches NULL rows.

## Data Flow

```
.env.local (ALPACA_API_KEY, ALPACA_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        │
        ▼
STEP 1: Supabase SELECT
  trade_evaluations WHERE spx_price IS NULL AND buy_timestamp >= '2026-04-20'
        │ trades[] = [{ id, symbol, buy_timestamp }]
        ▼
STEP 2: Alpaca GET /v2/stocks/SPY/bars
  timeframe=1Day, start=(earliest-400d), end=(latest+5d), limit=1000, sort=asc, feed=iex
        │ bars[] = [{ date:'YYYY-MM-DD', close:number }], closes:number[]
        ▼
For each trade:
  STEP 3: toEtDate(buy_timestamp) → tradeDate
          findLastIndex(bars, bar => bar.date < tradeDate) → i, spyClose
          [no prior bar] → [BACKFILL_SKIP] reason=no_prior_bar
        │
  STEP 4: smaAtIndex(closes, i, 50) → sma50
          smaAtIndex(closes, i, 200) → sma200
          [insufficient bars] → [BACKFILL_SKIP] reason=insufficient_bars
        │
  STEP 5: regime = spyClose > sma200 ? 'BULL' : spyClose > sma50 ? 'CAUTION' : 'BEAR'
        │
  STEP 6 (dry):  console.log [BACKFILL_DRY] ...
  STEP 7 (live): Supabase UPDATE trade_evaluations SET spx_* WHERE id AND spx_price IS NULL
                 console.log [BACKFILL] ...
        │
STEP 6/7 summary: [BACKFILL_DRY_DONE] / [BACKFILL_DONE]
```

## Alpaca Auth Pattern

Copied exactly from `src/lib/alpaca.ts` — the backfill script uses the same two headers:

```ts
{
  'APCA-API-KEY-ID': process.env.ALPACA_API_KEY,
  'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY,
}
```

Data base URL: `process.env.ALPACA_DATA_URL ?? 'https://data.alpaca.markets'`

**Note:** Existing `getBars()` in `alpaca.ts` uses `feed=sip`. This script uses `feed=iex` (free-tier requirement for paper accounts, same as `getQuote()` and `getStockSnapshots()`).

## Supabase Client

`getClient()` in `src/lib/db.ts` is **not exported**. The script replicates its two-liner inline:

```ts
import { createClient } from '@supabase/supabase-js'
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
```

This avoids modifying `db.ts` and follows the same pattern `getClient()` uses internally.

## Env Loading

Same pattern as `scripts/run-cycle.ts`: no dotenv import. Run locally with:
```
npx tsx --env-file=.env.local scripts/backfill-spx-regime.ts
```

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Per-trade Alpaca requests | Simple loop | N HTTP calls; rate-limit risk; slow | Rejected |
| Single bulk SPY fetch | 1 HTTP call; fast; no rate-limit risk | Must pre-compute date range | **Chosen** |
| Export `getClient` from db.ts | Reuse existing function | Modifies `src/lib/db.ts` (forbidden by constraint) | Rejected |
| `feed=sip` (matches getBars) | Consistent | Fails on free paper-account tier without subscription | Rejected |
| `feed=iex` | Free-tier compatible | Slight data difference vs SIP | **Chosen** |

## Impact on Existing Files

| File | Change Type | Description |
|------|-------------|-------------|
| `scripts/backfill-spx-regime.ts` | CREATE | New one-off backfill script |

No file in `src/` is modified.

## Protected Zone Impact

None — this feature does not require Protected Zone changes. No file in `src/lib/` is touched.

## Database Changes

No schema changes — columns already exist from the `add-spx-regime-to-trade-evaluations` migration (Macro-A).

Only `trade_evaluations` rows where `spx_price IS NULL AND buy_timestamp >= '2026-04-20'` are written. Rows where `spx_price IS NOT NULL` are untouched by the `WHERE spx_price IS NULL` idempotency guard in the UPDATE.

## Open Questions

None — methodology, regime labels, skip conditions, and log format are all fully specified.
