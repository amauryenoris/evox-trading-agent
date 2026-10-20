# Design — STEP 0: BUY Sizing and Portfolio Limits Investigation (read-only)

## Architecture Decision

This is an investigation, not a feature. It runs as a handful of throwaway TypeScript scripts in `.tmp/` (gitignored, run with `tsx`, same style as the existing `.tmp/unified-stop-orders.ts`: read `.env.local` into `process.env`, never print it), reading the repository, Supabase (SELECT only) and Alpaca (GET only), and producing one written report. No source, migration, workflow or environment file changes. The later CHANGE (task 11) is drafted, not built.

## Pre-reading of the Code (to be confirmed or refuted by the investigation — not conclusions)

| Area | Where | What the code says |
|------|-------|--------------------|
| Base size | `claude-agent.ts:1057-1071` | `qty = floor(equity × RISK_PCT / (price × STOP_LOSS_PCT))`; with the defaults 1% / 5% that is **20% of equity** in notional before any multiplier |
| Regime multiplier | `claude-agent.ts:1039-1047, 1074-1075` | TRENDING 1.0, TRANSITION 0.75, RANGING 0.5, HIGH_VOLATILITY 0.25 (EWZ's "0.25x" comes from here) |
| Kalman halving | `claude-agent.ts:1078-1080` | halved when the Kalman signal is missing or NEUTRAL |
| Caps | `claude-agent.ts:1082-1086` | min(95% of buying power, **literal 10% of equity**); the env `MAX_POSITION_SIZE` is only printed in the prompt (`:875, :929`), not used here |
| Confidence | `claude-agent.ts:2462-2463` | `max(0.50, min(confidence, 1))` × base — so at confidence ≥ 0.5 a 20% base is already ≥ 10% and the cap binds |
| z override | `claude-agent.ts:2465-2467` | `if (zScore <= -2.0) adjustedShares = baseShares` — skips the confidence scaling, "applied last" |
| Setup logic | `claude-agent.ts:2468-2472` | only EMA_RECLAIM gets a multiplier (0.75); 3DAY and MR share the same path |
| Ranking mode | `claude-agent.ts:2479-2483, 2681` | when `slotsAvailable <= 1` the queued `qty` is executed later |
| Fills | `claude-agent.ts:1282-1332` | IOC at the ask plus a bounded remainder retry |
| ATR percentile | `indicators.ts:291-295, 319-327` | rolling ATR history for each prefix of the fetched daily bars (from 30 bars), `percentile = count(history ≤ current) / n` — the symbol's own history only |
| Percentile in sizing | `indicators.ts:301-309` | only through the regime: percentile > 0.80 → HIGH_VOLATILITY (0.25×); a low percentile never reduces size |
| Position limit | `risk-manager.ts:93-99` | `positions.length >= MAX_POSITIONS` (default 5) |
| Total risk gate | `risk-manager.ts:34-44, 110-117` | `Σ(buyPrice × qty × STOP_LOSS_PCT) / equity ≥ 10%`; with ≤ 5 positions of ≤ 10% notional the maximum is about 2.5%, so it looks unable to bind |
| Correlation gate | `risk-manager.ts:7-27, 119-127` | 15 symbols mapped (BIG_TECH, ENERGY, MINING); everything else is one `OTHER` bucket, limit 3 per bucket; MP, NEM, FCX, GOLD are MINING, UUUU is `OTHER` |
| Daily buys | `claude-agent.ts:1737, 2371, 2435` | `maxBuysPerDay = 5` |
| Initial stop | `claude-agent.ts:2509-2511`, `alpaca.ts` `submitStopOrder` | stop (market) GTC at `currentPrice × (1 − 5%)` |
| Capa B | `claude-agent.ts` `enforceStopLosses` (~:1093) | cycle check against `buyPrice × 0.95` |

Three things to settle early because the arithmetic depends on them: the **effective env values** (`.github/workflows/*.yml` and Vercel may override the defaults), whether `[BUY SIZING]` console lines are still retrievable from workflow logs (read-only), and the **equity** at each entry.

## Data Sources

| Need | Source (read-only) |
|------|--------------------|
| Closed trades | `trade_evaluations` (`buy_price`, `sell_price`, `quantity`, `pnl_*`, `signal_type`, `buy_indicators`, timestamps) |
| Entry inputs | `trade_evaluations.buy_indicators` (closed), `open_position_contexts.indicators` (open), `agent_log` BUY rows (reasoning, confidence, `portfolio_snapshot.equity`, `indicators.requestedQty`, `fillAttempts`) |
| Prices and gaps | `daily_bars` (open/high/low/close/volume per symbol and date) |
| Orders and stops | Alpaca `GET /v2/orders?status=all&symbols=…&after=…`, `GET /v2/positions` |
| 1-minute prices | Alpaca market data `GET /v2/stocks/{symbol}/bars?timeframe=1Min` (the same SIP feed the app uses) |
| Env values | repository workflow files and code defaults; Vercel values only if visible without changing anything, otherwise "not checked" |

## Data Flow

1. Extract closed trades + entry inputs into one in-memory table (script `.tmp/step0-trades.ts`), tagging the source of equity for each row.
2. Code trace (task 1–3) written from the file:line table above, verified against the stored `[BUY SIZING]`-equivalent data.
3. Reconstruct each listed entry: `base → regime → Kalman → confidence → z override → EMA_RECLAIM → caps → rounding`, compare with `requestedQty` and `fillAttempts` (task 4).
4. Pull Alpaca order history for INTC 2026-10-13 and UUUU 2026-10-15 and `daily_bars` for the gap (task 5).
5. Aggregate tables (tasks 6–8) and the simulation (task 9) from the same table.
6. Pull 1-minute bars for the opening-window losses (task 10).
7. Draft the CHANGE options (task 11) and assemble the report.

## Simulation Model (task 9) — assumptions to state in the report

- Each closed trade keeps its own pnl % (entry and exit prices unchanged); only the notional changes, so dollar pnl = new notional × pnl %.
- No path re-simulation, no slippage change, no capital or position-count limit, overlapping positions are independent.
- Equity for drawdown: starting from the equity of the first trade, updated trade by trade in sell-time order.
- (a) median position of the trade's own setup; (b) current notional capped at 5% of equity; (c) notional = 0.25% × equity / 5%; (d) notional ∝ 1 / ATR% with the cap 10% and floor 1% (scaled so the median notional is comparable); (e) like (c) with an 8% loss substituted for trades held overnight whose actual loss was smaller.
- With a few dozen trades per setup the results are indicative only.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Throwaway scripts in `.tmp/` reading Supabase and Alpaca | Matches existing practice, nothing tracked changes, re-runnable | Credentials read from `.env.local` (must never be printed) | **Chosen** |
| Supabase MCP `execute_sql` for the SELECTs | No credential handling in a script | Cannot join with Alpaca data or run simulations | Allowed for ad-hoc SELECTs only (see O-2) |
| Adding an analysis script under `scripts/` | Versioned | Modifies the repository, forbidden | Rejected |
| Recomputing percentile from `daily_bars` to explain CRWV | Verifiable | Window may differ from the app's fetch | **Chosen**, with the window stated |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| specs/step0-buy-sizing-investigation/ | CREATE | This spec; the report may be saved here (O-1) |
| .tmp/step0-*.ts | CREATE (untracked, gitignored) | Throwaway analysis scripts |
| Everything else | UNCHANGED | Read-only |

## Protected Zone Impact

None — this step reads `claude-agent.ts`, `risk-manager.ts`, `indicators.ts` and `config.ts` but modifies nothing. The CHANGE that follows will touch the Protected Zone (most likely `claude-agent.ts` for the sizing block, possibly `risk-manager.ts` for a gate, `config.ts` only for a named constant) and will need its own confirmation.

## Database Changes

None. SELECT only.

## Open Questions

- **O-1: where the report goes.** Chat only, `.tmp/step0-report.md` (gitignored), or `specs/step0-buy-sizing-investigation/report.md` (committed with the spec)? Default: chat plus `.tmp/step0-report.md`.
- **O-2: database access.** Read with a script using the service-role key from `.env.local` (SELECT only, never printed), or through the Supabase MCP `execute_sql` for SELECTs? Default: scripts for the bulk work, MCP SELECTs for quick checks.
- **O-3: workflow logs.** May the investigation read GitHub Actions run logs read-only (`gh run view --log`) to recover the `[BUY SIZING]` and `[BUY SIZING]`-adjacent lines? Default: yes, read-only; otherwise the reconstruction relies on stored data and says so.
- **O-4: simulation definitions.** Accept the model above (fixed pnl %, independent trades)? A path-dependent replay would need entries and exits re-simulated from bars, which is much larger.
- **O-5: closed-trade population.** All rows in `trade_evaluations` including legacy rows with a null setup, or only trades from a cut-off date (for example since 3DAY went live)? Default: all rows, with legacy shown as its own group.
