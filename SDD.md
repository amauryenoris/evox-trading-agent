# System Design Document — Paquito Trading Agent

## 1. Purpose

Paquito is an autonomous trading agent that identifies mean-reversion and trend setups in US equities, submits limit orders through Alpaca Markets, and manages exits deterministically. Claude (Anthropic API) serves as a **pure analyst** — it explains indicator readings and generates learning notes but never decides whether to trade.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        GitHub Actions                               │
│  trading-cycle.yml (hourly, 10am–4pm ET, Mon–Fri)                 │
│  exit-only.yml (9:30am + 3:55pm ET, Mon–Fri)                      │
│  weekly-report.yml (Friday 5pm ET)                                  │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ npm run cycle / exit-only / report
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   runAgentCycle() — claude-agent.ts                 │
│                                                                     │
│  1. Load portfolio state (Alpaca)                                   │
│  2. Dynamic stock selection (Alpaca screener → stock-selector.ts)  │
│  3. Compute indicators for all symbols (indicators.ts)             │
│  4. News Intelligence Layer (news-intelligence.ts → thresholdMap)  │
│  5. Watchlist Monitor (watchlist-monitor.ts → auto-entries)        │
│  6. Enforce exit rules (enforceExitRules → Alpaca closePosition)   │
│  7. Learning loop — detect closed positions (learning.ts)          │
│  8. Main analysis loop per symbol:                                  │
│     a. Setup detection (hard gate — no Claude if no setup)         │
│     b. Claude analysis (claude-sonnet-4-6, 1024 tokens)            │
│     c. Execution gates (liquidity → spread → hours → max → risk)  │
│     d. Position sizing (Kovner formula)                             │
│     e. Submit IOC limit order + GTC stop (Alpaca)                  │
│  9. Persist all decisions to Supabase (agent_log)                  │
└────────────────────┬────────────────────────┬───────────────────────┘
                     │                        │
              ┌──────▼──────┐         ┌───────▼──────┐
              │   Alpaca    │         │   Supabase   │
              │  Markets    │         │  PostgreSQL  │
              │  API        │         │  (9 tables)  │
              └─────────────┘         └──────────────┘
```

---

## 3. Decision Pipeline (Critical Path)

```
Market Data (Alpaca getBars, 300 days)
         │
         ▼
Kalman Filter + RSI + MACD + BB + ADX + ATR + EMA50/200
         │
         ▼
Setup Detection Gate ──── NO_SETUP ──→ log HOLD, skip
         │
         │ setup detected (any of 5 signal types)
         ▼
News Intelligence Layer (threshold adjustment per symbol)
         │
         ▼
Claude Analysis (pure analyst — no BUY/SELL decision)
  ├── reasoning (2–4 sentences on indicator state)
  ├── confidence (0.0–1.0, used for position sizing)
  ├── learning_note
  ├── near_miss_score
  └── what_would_trigger
         │
         ▼  [Claude's action field is forced to HOLD by the system]
Execution Gates (in order):
  1. Max positions < MAX_POSITIONS
  2. Buys today < 5
  3. Liquidity: prevDayVolume ≥ 1,000,000
  4. Spread: spreadBps ≤ MAX_SPREAD_BPS (100)
  5. Quote freshness: age ≤ MAX_QUOTE_AGE_SECONDS (60)
  6. Trading hours: 9:45am–3:30pm ET
  7. Portfolio risk: drawdown > -15%, total risk < 10%, correlated < 3
         │
         ▼ all gates pass
Position Sizing (Kovner formula):
  qty = floor((equity × RISK_PCT) / (price × STOP_LOSS_PCT))
      × regimeMultiplier   → TRENDING: 1.0, TRANSITION: 0.75, RANGING: 0.5, HIGH_VOL: 0.25
      × ½ if Kalman NEUTRAL (Seykota undertrade mandate)
      × confidenceMultiplier (floor 0.50, capped 1.0)
      × 0.75 if EMA_RECLAIM signal
      (z ≤ -2.0 override: disabled — Z_SIZING_OVERRIDE_ENABLED = false, code path kept dormant;
       the confidence multiplier above applies to every entry)
  capped by: min(95% of cash / price, 10% of equity / price)
         │
         ▼
Submit IOC limit order @ ask price (Alpaca)
Submit GTC stop order @ entry × (1 - STOP_LOSS_PCT) — Capa A
Save position context (open_position_contexts) — for exit tracking
         │
         ▼
Persist AgentLogEntry → agent_log (Supabase)
```

---

## 4. Signal Types

| Signal | Entry Conditions | Exit Condition |
|--------|-----------------|----------------|
| `MEAN_REVERSION` | z-score ≤ effectiveThreshold (base: -1.3); blocked when regime is `RANGING` and ADX < 18 | z-score ≥ -0.8 |
| `TREND_PULLBACK` | price > EMA50 > EMA200, z-score ≤ 0, EMA50 slope rising, ADX ≥ 20 (or ADX unavailable), MACD histogram > -2.0 | price < EMA50 |
| `TREND_PULLBACK_3DAY` | previous close > SMA200, three consecutive lower closes before it, price not above SMA5 (no z-score, ADX or MACD condition) | price > SMA5 (`SMA5_RECLAIM`) |
| `TREND_ZLE05` | price > EMA50 > EMA200, 0 < z-score ≤ 1.25, EMA50 slope rising, ADX ≥ 18 (or ≥ 15 with MACD > 0.25), MACD histogram > 0 | z-score ≥ 1.25 (EMA50 break is not an exit) |
| `EMA_RECLAIM` | price crossed above EMA50 from below (prev day ≤ ema50Prev), z-score < 0, distance > 0.2%, momentum ok | price < EMA50 |

Classification priority when several match: `TREND_PULLBACK_3DAY` > `MEAN_REVERSION` > `TREND_PULLBACK` > `TREND_ZLE05` > `EMA_RECLAIM`.

All signals share these exits: profit target (5% for `TREND_ZLE05`, 10% for the others), 20-trading-day time stop, -5% stop loss (dual-layer). Each also has one protective stop: a profit floor for `MEAN_REVERSION` only, the ATR trailing stop for every other setup (section 5).

---

## 5. Trailing Stop System

Activation thresholds (profit %, by signal). `MEAN_REVERSION` uses the profit floor below instead of the ATR trailing stop:

| Signal | Activation | ATR Multiplier |
|--------|-----------|----------------|
| MEAN_REVERSION | 5% (profit floor, no ATR) | — |
| TREND / TREND_PULLBACK / TREND_PULLBACK_3DAY | 6% | 1.5× |
| TREND_ZLE05 | 3% | 1.0× |
| EMA_RECLAIM | 4% | 1.0× |

Profit floor (`MEAN_REVERSION` only): active once `highSinceEntry` ≥ entry × 1.05; stop = entry × (1 + max(3%, high% − 3 pp)), never lowered.

ATR trailing logic (all other setups):
1. Track `highSinceEntry` — updated each cycle if new high is made
2. Activate once (one-way flag) when P&L ≥ activation threshold
3. `trailingStop = max(highSinceEntry - ATR_MULT × ATR, highSinceEntry × 0.985)`
4. Floor at `buyPrice` — never give back guaranteed profit
5. Only fires when: activated, NOT the activation cycle (`!justActivated`), no new high made, price ≤ stop

---

## 6. Exit Enforcement (Two Layers)

**Capa A — Alpaca GTC Stop Order**: Submitted immediately after BUY. Alpaca monitors price continuously and fills the stop automatically.

**Capa B — Cycle Stop Check**: `enforceStopLosses()` runs at the start of every cycle. Cross-checks all `open_position_contexts` against current Alpaca price. Closes any position below stop price that Alpaca may have missed (e.g., gap down, overnight halt).

---

## 7. Near-Miss Watchlist System

Purpose: Track setups that almost triggered (z-score in range [-1.0, threshold]). If the setup strengthens, auto-entry occurs without waiting for the next watchlist selection.

Flow:
1. `detectNearMisses()` — called for symbols in the near-miss zone; inserts or updates `near_miss_watchlist`
2. `updateWatchlist()` — re-evaluates all active near-misses each cycle
3. `checkAutoEntry()` — returns symbols whose z-score has crossed the threshold; injects them into the watchlist for this cycle
4. `markWatchlistTriggered()` — marks the near-miss entry as triggered after the BUY logs

Near-miss symbols bypass the setup detection gate (`isAutoEntry = true`) — their z-score already qualified.

News boosts can relax the effective threshold for a symbol, accelerating auto-entry.

---

## 8. Position Rotation

When portfolio is full (≥ 5 positions) and a new signal fires with confidence ≥ 0.70:

1. Scan open positions for rotation candidates:
   - **Priority 1** (highest): position with z-score ≥ -0.8 (mean reversion complete)
   - **Priority 2**: profitable position (P&L > 5%) AND new signal confidence > 0.80

2. If candidate found: close the weakest, free the slot, proceed with BUY in the same cycle.

3. If no candidate: log `"no rotation candidates"`, skip symbol.

---

## 9. Ranking System

When only 1 slot remains (`slotsAvailable ≤ 1`), multiple setups may compete. All valid candidates are queued after Claude analysis + gate checks. After the loop, the best candidate is selected:

Ranking priority:
1. z-score ≤ -2.0 (extreme edge) — wins over all
2. Lowest z-score (strongest mean reversion)
3. Highest confidence (Claude's score)

Losing candidates are logged as `"Outranked by [winner]"` and tracked as near-misses.

---

## 10. Learning Loop

After each position closes (detected via `detectClosedPositions`):
1. `evaluateClosedTrade()` — compares expected exit (entry signal conditions) vs actual exit, writes to `trade_evaluations`
2. `recordSelectionOutcome()` — updates `selection_evaluations` for stock screener learning
3. `buildLearningContext()` — aggregates past evaluations into the Claude prompt for this cycle

If a trade was already evaluated by `enforceExitRules()` in the same cycle, `tradeEvaluationExists()` prevents double-evaluation.

---

## 11. News Intelligence Layer

`newsIntelligenceLayer()` runs once per cycle before the main loop:

1. Fetches recent headlines for all watchlist symbols
2. Classifies news sentiment per symbol
3. Returns a `ThresholdMap`: symbol → adjusted z-score threshold
4. Negative news → threshold more negative (harder to enter)
5. Positive news → threshold relaxed (easier to enter)

The effective threshold for each symbol is: `thresholdMap[symbol] ?? ZSCORE_ENTRY_THRESHOLD`

---

## 12. Database Schema (Core Tables)

| Table | Written by | Read by |
|-------|-----------|---------|
| `agent_log` | `appendAgentLogEntries` | Dashboard (decisions, reasoning) |
| `open_position_contexts` | `saveOpenPositionContext` | Exit rules, stop loss check, learning |
| `trade_evaluations` | `evaluateClosedTrade` | Learning context, performance metrics |
| `near_miss_watchlist` | `detectNearMisses` | `checkAutoEntry`, dashboard |
| `news_events` | `newsIntelligenceLayer` | Dashboard, threshold map |
| `pattern_library` | `evaluateClosedTrade` | `buildLearningContext`, dashboard |
| `selection_history` | `selectStocksForAnalysis` | Screener learning |
| `selection_evaluations` | `recordSelectionOutcome` | Screener learning |
| `reports` | `report-generator.ts` | Dashboard (PDF download) |

Other tables the code reads or writes (`.from(...)` calls in `src/`): `market_daily_briefings`, `symbol_cooldowns`, `position_health_snapshots`, `daily_bars`, `selection_failures`.

---

## 13. Supabase Client Architecture

| File | Key | Used in |
|------|-----|---------|
| `supabase/client.ts` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser components (`'use client'`) |
| `supabase/server.ts` | Reads cookies | Server components (SSR) |
| `db.ts` | `SUPABASE_SERVICE_ROLE_KEY` | Server-only — bypasses RLS |

**Rule**: `db.ts` must never be imported from browser-side code. Service role key never reaches the client.

---

## 14. Claude API Usage

- **Model**: `claude-sonnet-4-6`
- **Max tokens**: 1024
- **Retry logic**: exponential backoff on HTTP 429/529 (4 retries, max 30s delay + jitter)
- **System prompt**: static — defines analyst role and strict JSON schema
- **User prompt**: built per symbol — includes Kalman state, all indicators, portfolio state, learning history, macro news, symbol news, signal type context, and news-adjusted threshold

Claude's `action` field in the response is **always overwritten to `'HOLD'`** by the system after parsing. Only the execution gate logic sets `action = 'BUY'`.

---

## 15. GitHub Actions Workflows

| Workflow | File | Schedule | Command |
|----------|------|----------|---------|
| Trading Agent Cycle | `agent-cron.yml` | `0 14-20 * * 1-5` — hourly 14–20 UTC (10am–4pm EDT / 9am–3pm EST) | `npm run cycle` |
| Exit Check — Open and Close | `agent-exits.yml` | `30 13 * * 1-5` (9:30am EDT / 8:30am EST) and `55 19 * * 1-5` (3:55pm EDT / 2:55pm EST) | `npm run exit-only` |
| Position Health Check | `position-health.yml` | `45 13 * * 1-5` (9:45am EDT / 8:45am EST) and `10 20 * * 1-5` (4:10pm EDT / 3:10pm EST) | `npm run health-check` |
| Daily Bars Sync | `daily-bars-sync.yml` | `0 21 * * 1-5` (5:00pm EDT / 4:00pm EST) | `npm run daily-bars-sync` |
| Earnings Calendar Sync | `earnings-calendar-sync.yml` | `17 11 * * 1-5` (7:17am EDT / 6:17am EST) | `npm run earnings-calendar-sync` |
| Security Audit | `security-audit.yml` | `0 12 * * 1-5` (8:00am EDT / 7:00am EST) | `npm audit` (level `critical` by default) |
| Weekly Trading Report | `weekly-report.yml` | `0 21 * * 5` — Fridays (5pm EDT / 4pm EST) | `npm run report` |
| PR Review | `pr-review.yml` | No cron; pull request opened, synchronize or reopened on `main` | `tsc --noEmit`, `vitest run`, Protected Zone audit, Claude review, PR comment and label |

Scheduled workflows can be disabled by GitHub after 60 days without repo activity; check Actions if the repo goes quiet.

All workflows run with Node 24 and `npm ci`. `npm audit` runs only in `security-audit.yml` (weekdays 12:00 UTC; level `critical` unless a manual run chooses another); no other workflow runs it.

---

## 16. Known Limitations & Risk Notes

### Persistence risk
Decisions are persisted to `agent_log` only **after the full symbol loop completes** (`appendAgentLogEntries` at the end of `runAgentCycle`). If the process crashes (OOM, Vercel timeout, unhandled rejection) mid-cycle, all decisions from that cycle are lost. Fix: persist per-symbol inside the loop.

### IOC fill uncertainty
Orders are submitted as IOC (Immediate-or-Cancel) at the ask price. The synchronous Alpaca response is not trusted: `resolveIocFinalState` re-fetches the order up to 4 times (1500 ms apart) and forces a cancel if it is still unresolved (`claude-agent.ts:945-982`). `orderExecuted` is set to `true` only when at least one share filled; a 0-fill IOC is logged as `IOC_NOT_FILLED` and the action stays `HOLD` (`claude-agent.ts:2227-2243`).

### Trailing stop context
`highSinceEntry`, `trailingStop`, and `trailingActivated` are stored in `open_position_contexts`. If a row is deleted mid-position (e.g., manual cleanup), the trailing stop resets to unactivated state.

### Position rotation mutation
In rotation mode, the local `positions` array is mutated (`positions.splice(...)`) after `closePosition` returns; a thrown close error skips it (`claude-agent.ts:1612-1624`). `openPositionsCount` is set once from `positions.length` (`:1468`) and the rotation splice does not decrement it, so the max-positions gate (`:2100`) and the ranking slot count (`:1483`) still count the rotated-out position for the rest of the cycle.

### Legacy positions
Positions entered before `signalType` was recorded have `signal_type = null`. The exit engine applies only profit target and time stop to these — no z-score or EMA exit is applied (intentional).

---

## 17. Protected Zone

**Do not modify without explicit approval from Amaury:**

| File | What's protected |
|------|-----------------|
| `src/lib/config.ts` | `ZSCORE_ENTRY_THRESHOLD`, `MAX_SPREAD_BPS`, `MAX_QUOTE_AGE_SECONDS`, `INSTRUMENT_BLACKLIST` |
| `src/lib/claude-agent.ts` | Decision pipeline, signal detection, exit rules, position sizing formula |
| `src/lib/risk-manager.ts` | Drawdown gate (-15%), total risk gate (10%), correlation gate (3 per sector) |
| `src/lib/indicators.ts` | Kalman filter implementation |
| `src/lib/news-intelligence.ts` | Threshold adjustment logic |
| Any DB migration | Supabase schema changes |
