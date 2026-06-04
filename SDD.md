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
         │ setup detected (any of 4 signal types)
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
  4. Spread: spreadBps ≤ MAX_SPREAD_BPS (50)
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
      = baseShares if zScore ≤ -2.0 (extreme edge override)
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
| `MEAN_REVERSION` | `RANGING` regime, z-score ≤ effectiveThreshold (base: -1.3), RSI < 45, %B < 0.2 | z-score ≥ -0.8 |
| `TREND_PULLBACK` | price > EMA50 > EMA200, z-score ≤ 0, EMA50 slope rising, ADX ≥ 20, momentum ok | price < EMA50 |
| `TREND_ZLE05` | price > EMA50 > EMA200, 0 < z-score ≤ 1.25, EMA50 slope rising, ADX ≥ 18 (or ≥ 15 with MACD > 0.25), MACD histogram > 0 | price < EMA50 |
| `EMA_RECLAIM` | price crossed above EMA50 from below (prev day ≤ ema50Prev), z-score < 0, distance > 0.2%, momentum ok | price < EMA50 |

All signals share universal exits: +10% profit target, 20-day time stop, -5% stop loss (dual-layer), trailing stop.

---

## 5. Trailing Stop System

Activation thresholds (profit %, by signal):

| Signal | Activation | ATR Multiplier |
|--------|-----------|----------------|
| MEAN_REVERSION | 5% | 1.2× |
| TREND / TREND_PULLBACK | 6% | 1.5× |
| TREND_ZLE05 | 3% | 1.0× |
| EMA_RECLAIM | 4% | 1.0× |

Logic:
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

## 12. Database Schema (9 Tables)

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
| `weekly_reports` | `report-generator.ts` | Dashboard (PDF download) |

---

## 13. Supabase Client Architecture

| File | Key | Used in |
|------|-----|---------|
| `supabase/client.ts` | `SUPABASE_ANON_KEY` | Browser components (`'use client'`) |
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
| Full agent cycle | `agent-cron.yml` | Hourly, 14–20 UTC (10am–4pm ET), Mon–Fri | `npm run cycle` |
| Exit-only sweep | `agent-exits.yml` | 13:30 UTC (9:30am ET) + 19:55 UTC (3:55pm ET), Mon–Fri | `npm run exit-only` |
| Weekly report | `weekly-report.yml` | Friday 21:00 UTC (5pm ET) | `npm run report` |
| Keepalive | `keepalive.yml` | Monday noon UTC | GitHub Actions keepalive |

All workflows run with Node 24, `npm ci`, and `npm audit --audit-level=critical`.

---

## 16. Known Limitations & Risk Notes

### Persistence risk
Decisions are persisted to `agent_log` only **after the full symbol loop completes** (`appendAgentLogEntries` at the end of `runAgentCycle`). If the process crashes (OOM, Vercel timeout, unhandled rejection) mid-cycle, all decisions from that cycle are lost. Fix: persist per-symbol inside the loop.

### IOC fill uncertainty
Orders are submitted as IOC (Immediate-or-Cancel) at the ask price. A cancelled IOC (no liquidity at ask) is logged but `orderExecuted` may still be set to `true` before the status is checked. Dashboard shows the order as executed — misleading on cancelled IOC fills.

### Trailing stop context
`highSinceEntry`, `trailingStop`, and `trailingActivated` are stored in `open_position_contexts`. If a row is deleted mid-position (e.g., manual cleanup), the trailing stop resets to unactivated state.

### Position rotation mutation
In rotation mode, the local `positions` array is mutated (`positions.splice(...)`) to optimistically free a slot. If the close order fails but the splice already happened, `openPositionsCount` may undercount for that cycle.

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
