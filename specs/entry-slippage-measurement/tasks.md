# Tasks — Measure real entry slippage vs recorded entry_price (STEP 0b, read-only)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (if applicable) — N/A, none touched
- [x] Database migrations drafted (if applicable) — N/A, none needed, read-only

## Implementation Checklist

### Phase 1 — Script scaffold (`.tmp/entry-slippage-check.ts`)
- [x] T-01: Create `.tmp/entry-slippage-check.ts`. Add a header comment stating it is throwaway,
  read-only, gitignored, and how to run it (`npx tsx --env-file=.env.local .tmp/entry-slippage-check.ts`).
- [x] T-02: Duplicate the minimal Alpaca header/base-URL construction (`APCA-API-KEY-ID`,
  `APCA-API-SECRET-KEY`, `ALPACA_BASE_URL ?? 'https://paper-api.alpaca.markets'`) and a
  `@supabase/supabase-js` client from `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` — no import from `src/lib`.
  Throw a clear error at startup if any required env var is missing (never print its value).

### Phase 2 — Data loading and join
- [x] T-03: `select` all `trade_evaluations` rows (`id, symbol, buy_timestamp, entry_price, exit_price,
  quantity, pnl_usd, pnl_pct, outcome, signal_type`).
- [x] T-04: `select` all `agent_log` rows where `action = 'BUY'` and `order_executed = true`
  (`symbol, timestamp, order_id`); build a `Map` keyed by `` `${symbol}|${timestamp}` ``.
- [x] T-05: For each trade, resolve its `order_id` via the map on `` `${symbol}|${buy_timestamp}` ``;
  tally and skip per FR-03 (no match) / FR-04 (`order_id` null).

### Phase 3 — Alpaca lookups
- [x] T-06: For each trade with a resolved `order_id`, call `GET {ALPACA_BASE_URL}/v2/orders/{order_id}`
  sequentially (small delay between calls); read `filled_qty` and `filled_avg_price`.
- [x] T-07: Tally and skip per FR-06 (partial fill, no `filled_avg_price`) / FR-07 (zero fill).
- [x] T-08: For every trade that clears both checks, record `{ trade, filledAvgPrice }`.

### Phase 4 — Metrics
- [x] T-09: Compute `slippageBps = ((filledAvgPrice - entry_price) / entry_price) * 10000` per trade.
- [x] T-10: Compute mean, median, and p90 of `slippageBps` overall and grouped by `signal_type`
  (`null`/missing → `'UNKNOWN'` group).
- [x] T-11: Compute the share (count + %) of measured trades where `filledAvgPrice > entry_price`.
- [x] T-12: Recompute `pnl_pct`/`pnl_usd` per trade using `filledAvgPrice` as cost basis (same formula
  `trade_evaluations` itself uses) with the existing `exit_price`/`quantity` unchanged.
- [x] T-13: Compute current vs. recomputed overall avg `pnl_pct`, win rate, and profit factor — win/loss
  classification for the recomputed side based on the sign of the recomputed `pnl_pct`, not the stored
  `outcome` column.

### Phase 5 — Report + safety
- [x] T-14: Print the full report to the console: n measured, exclusion counts by reason (FR-15), slippage
  stats (overall + per setup), % favorable-slippage share, and the current-vs-recomputed metrics table.
- [x] T-15: Confirm no credential value is ever interpolated into a `console.log`/`console.error` call.
- [x] T-16: Confirm the script contains zero Supabase write calls (`insert`/`update`/`upsert`/`delete`) and
  zero Alpaca order-mutation calls (no `POST`/`DELETE` to `/v2/orders`).

## Post-Implementation

- [x] Run the script: `npx tsx --env-file=.env.local .tmp/entry-slippage-check.ts` (from the repo root)
- [x] Report the full console output back as the deliverable
- [x] Confirm `.tmp/entry-slippage-check.ts` was never `git add`-ed or committed (`git status` shows it only
  as untracked-and-ignored, i.e. absent from `git status --porcelain` entirely)
- [ ] Leave the script in `.tmp/` (or delete it) — Amaury's call; either way it never enters history

## Estimated Complexity

**Low** — a single throwaway script, no new runtime dependency, read-only against two already-integrated
systems (Supabase, Alpaca), with roughly 110 rows to process sequentially. The only real care needed is in
getting the exclusion bookkeeping and the fill-based recomputation formulas exactly right, since the whole
point of this task is producing a trustworthy number.
