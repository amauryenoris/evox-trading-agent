# Design — Measure real entry slippage vs recorded entry_price (STEP 0b, read-only)

## Architecture Decision

This is a single, self-contained, throwaway TypeScript script — not a feature living in `src/`. It is
written to `.tmp/entry-slippage-check.ts` (already gitignored, confirmed in `.gitignore:37`) and run once
via `tsx`, the same way every script in `scripts/` is already run in this repo. It talks to exactly two
systems, both read-only: Supabase (via `@supabase/supabase-js`, an existing dependency — reading
`trade_evaluations` and `agent_log`) and Alpaca's REST API (via plain `fetch`, no SDK — `GET /v2/orders/{id}`
only). It duplicates the minimal client setup locally rather than importing `src/lib/db.ts` or
`src/lib/alpaca.ts`, matching the existing precedent in `scripts/backfill-spx-regime.ts`, because `tsx` run
against a file outside `src/` does not resolve this project's `@/` path alias.

The script has no CLI flags, no "live" vs "dry-run" mode (unlike `backfill-spx-regime.ts`, which supports
writing) — it only ever reads and prints. There is nothing to gate behind an env var, because there is
nothing destructive it could do.

## Data Flow

```
.tmp/entry-slippage-check.ts  (run: npx tsx --env-file=.env.local .tmp/entry-slippage-check.ts)
  │
  ├─ 1. Supabase SELECT trade_evaluations
  │     (id, symbol, buy_timestamp, entry_price, exit_price, quantity, pnl_usd, pnl_pct, outcome, signal_type)
  │
  ├─ 2. Supabase SELECT agent_log WHERE action = 'BUY' AND order_executed = true
  │     (symbol, timestamp, order_id)
  │     → build a Map<`${symbol}|${timestamp}`, order_id> for an O(1) join
  │
  ├─ 3. For each trade_evaluations row:
  │       look up order_id via the Map on `${symbol}|${buy_timestamp}`
  │       ├─ not found                      → tally "no matching agent_log row", skip
  │       ├─ found but order_id is null     → tally "no order_id recorded", skip
  │       └─ found with an order_id         → queue an Alpaca GET /v2/orders/{order_id}
  │
  ├─ 4. Alpaca GET /v2/orders/{order_id}  (sequential, small pause between calls — ~110 trades, no
  │       need for concurrency and no reason to risk Alpaca's rate limits)
  │       ├─ filled_qty == 0                        → tally "order shows zero fill", skip
  │       ├─ filled_qty > 0 && filled_avg_price null → tally "partial fill, no filled_avg_price", skip
  │       └─ filled_avg_price present                → record { trade, filledAvgPrice }
  │
  ├─ 5. For each recorded { trade, filledAvgPrice }:
  │       slippageBps = ((filledAvgPrice - entry_price) / entry_price) * 10000
  │       recomputedPnlPct = ((exit_price - filledAvgPrice) / filledAvgPrice) * 100
  │       recomputedPnlUSD = (exit_price - filledAvgPrice) * quantity
  │
  └─ 6. Print report to console:
          - n measured / n excluded (by reason)
          - slippage bps: mean / median / p90, overall and per signal_type
          - % of measured trades where filledAvgPrice > entry_price
          - current vs recomputed: avg pnl_pct, win rate, profit factor
```

Nothing is written back anywhere. The script exits after printing the report.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Live in the OS-level scratchpad directory (fully outside the repo) | Zero chance of ever being staged | Loses access to the repo's installed `node_modules` (`@supabase/supabase-js`) unless resolved via `cwd` tricks; less discoverable for Amaury during the session | Rejected |
| `.tmp/` inside the repo (already gitignored) | `node_modules` resolves naturally when run via `tsx` from the repo; already a sanctioned gitignored path per `.gitignore`; trivially deletable afterward | None meaningful | **Chosen** |
| Import `src/lib/db.ts` / `src/lib/alpaca.ts` directly | Less duplication | `tsx` does not resolve the `@/` alias for a file outside `src/`; breaks the existing `scripts/` convention of standalone scripts | Rejected |
| Use the Supabase REST (PostgREST) API via raw `fetch` instead of `@supabase/supabase-js` | Zero dependency on the installed package | `@supabase/supabase-js` is already installed and used by every other script in this repo; no reason to reinvent it | Rejected |
| Concurrent (`Promise.all`) Alpaca order lookups | Faster | ~110 trades is small; sequential avoids any risk of tripping Alpaca's rate limits for a one-off diagnostic; this is read-only research, not latency-sensitive | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `.tmp/entry-slippage-check.ts` | CREATE (gitignored, not part of the committed tree) | The throwaway measurement script described above |

No file inside `src/`, `scripts/`, or any other committed path is read for its *content* to be reused
verbatim (the script duplicates small, already-public patterns — header construction, base URL — rather
than importing), and nothing in the committed tree is modified.

## Protected Zone Impact

None — this task does not require Protected Zone changes. No Protected Zone file is referenced by the
script at all.

## Database Changes

None. Only `select` queries against `trade_evaluations` and `agent_log`.

## Pre-Implementation Verification (checked already)

- **Is the join key reliable?** Yes — `claude-agent.ts` sets both `saveOpenPositionContext({ buyTimestamp:
  timestamp, ... })` and `insertAgentLogEntry({ timestamp, ... })` from the same `timestamp` local variable
  within one `runAgentCycle()` call, so `agent_log.timestamp` and `trade_evaluations.buy_timestamp` are the
  identical ISO string for a given BUY — an exact string-equality join on `symbol` + that timestamp is
  correct, not an approximation.
- **Is `.tmp/` actually gitignored?** Yes — confirmed at `.gitignore:37` (`.tmp/`).
- **Does `@supabase/supabase-js` need a new install?** No — it is already a dependency, used by
  `src/lib/db.ts` and every existing `scripts/*.ts` file.
- **Does the historical `agent_log.order_id` cover every closed trade needed?** Not necessarily all 110 —
  some rows may predate consistent `order_id` logging or lack a matching `agent_log` row; this is exactly
  what FR-03/FR-04's distinct exclusion counters are for. No STOP condition — the spec requires reporting
  the gap, not guaranteeing 100% coverage.

## Open Questions

- None.
