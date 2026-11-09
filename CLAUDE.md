# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

# Paquito — EVOX Trading Agent

## Commands

```bash
npm run dev          # Start dev server (localhost:3000)
npm run build        # Production build + type-check
npm run lint         # ESLint (eslint-config-next)
npm test             # Run all Vitest tests (watch mode)
npm run test:coverage  # Coverage report (v8, targets src/lib/db.ts)

# Run a single test file
npx vitest run src/lib/__tests__/db.near-miss.test.ts

# CLI agent runners (tsx, require .env.local)
npm run cycle        # Full agent cycle (entry + exit analysis)
npm run exit-only    # Exit evaluation only (no new entries)
npm run report       # Generate weekly PDF report
```

---

## Decision Architecture

Claude is a **pure analyst**. It never decides whether to trade.

```
Market Data → Indicators → Setup Detection (hard gate)
                                     ↓ setup detected
                              Claude Analysis
                         (reasoning + confidence + learning notes)
                                     ↓
                         Execution Gates (liquidity, spread, hours, risk)
                                     ↓ all gates pass
                              System executes BUY
```

Claude's output schema (strict JSON — no markdown):
```json
{
  "reasoning": "2-4 sentences on what the indicators show",
  "confidence": 0.0,
  "learning_note": "what this case teaches about the setup",
  "near_miss_score": 0,
  "what_would_trigger": "what specific condition would strengthen the signal",
  "self_flagged_disqualifying_risk": false
}
```

Claude must NOT: say BUY/SELL/HOLD, reject or approve trades, apply entry rules,
reference confidence thresholds by regime, use language like "prohibits" or "blocks".

---

## Stack

| Layer        | Technology                                 |
|--------------|--------------------------------------------|
| Framework    | Next.js 16.4.4 + React 19 + TypeScript 5  |
| Broker       | Alpaca Markets API                         |
| Database     | Supabase (PostgreSQL + Auth)               |
| AI           | Claude API — `claude-sonnet-4-6`           |
| Deploy       | Vercel                                     |
| CI/CD        | GitHub Actions                             |
| PDF reports  | pdfkit                                     |
| Charts       | Recharts                                   |

---

## File Structure

### `src/lib/` — Core engine (most sensitive)

| File | Description |
|------|-------------|
| `config.ts` | **PROTECTED ZONE** — trading parameters (see below) |
| `claude-agent.ts` | Main agent loop — `runAgentCycle()`, signal detection, exit rules; calls `position-sizing.ts` for the BUY quantity and `prompt-builder.ts` for the prompt |
| `prompt-builder.ts` | Builds the exact system prompt and per-symbol user prompt sent to Claude (pure; env values passed as an argument) — changes alter analyst input |
| `position-sizing.ts` | BUY quantity: Kovner formula, regime multipliers, Kalman halving, buying-power and equity caps, confidence factor; `Z_SIZING_OVERRIDE_ENABLED` (false) |
| `protective-stop.ts` | Profit target, profit-floor and trailing-activation settings and protective-stop calculations (pure) |
| `exit-cooldown.ts` | Trading-day count, exit-reason mapping and cooldown date rules (pure helpers used by `claude-agent.ts`) |
| `run-cycle.ts` | Exit-only runner — calls `enforceExitRules()` without entry analysis |
| `indicators.ts` | Kalman filter, RSI, MACD, Bollinger Bands, ADX, ATR, EMA calculations |
| `alpaca.ts` | Alpaca API client — orders, positions, bars, quotes, news |
| `risk-manager.ts` | Portfolio risk checks — drawdown, correlation, concentration |
| `stock-selector.ts` | Dynamic watchlist selection from market movers |
| `news-intelligence.ts` | News-to-threshold adjustment layer |
| `watchlist-monitor.ts` | Near-miss watchlist — tracking, auto-entry, monitoring |
| `learning.ts` | Trade evaluation and pattern learning context |
| `agent-log.ts` | Log persistence helpers |
| `db.ts` | Supabase queries (agent_log, positions, trade_evaluations, near_miss) |
| `report-generator.ts` | PDF weekly report generator |
| `types.ts` | Shared TypeScript types |
| `utils.ts` | Shared utilities |
| `supabase/client.ts` | Supabase browser client |
| `supabase/server.ts` | Supabase server client (SSR) |

### `src/app/` — Next.js App Router

| Path | Description |
|------|-------------|
| `api/cron/run/` | Cron endpoint — triggers `runAgentCycle()` |
| `api/run-agent/` | Manual trigger from dashboard |
| `api/positions/` | Open positions |
| `api/trades/` | Trade history |
| `api/portfolio/` | Portfolio snapshot |
| `api/portfolio-history/` | Equity curve data |
| `api/performance/` | Performance metrics |
| `api/agent-log/` | Agent decisions log |
| `api/near-miss/` | Near-miss watchlist data |
| `api/news-events/` | News intelligence feed |
| `api/patterns/` | Pattern library |
| `api/rejected-today/` | Today's rejected setups |
| `api/reports/` | Report list + PDF download |
| `api/reports/generate/` | Report generation trigger |
| `api/system-status/` | System health |
| `dashboard/` | Main dashboard page |
| `login/` | Auth page |

### `src/components/dashboard/` — Dashboard UI

AgentReasoningLog, DailySummary, DashboardTabs, NearMissWatchlist, NewsIntelligence,
PatternLibraryCard, PerformanceAnalytics, PnLChart, PortfolioOverviewCard,
PositionsTable, RejectedSetups, RunAgentButton, SystemStatus, TradeHistoryTable,
WeeklyReportsCard, MarketStatusBadge, GenerateReportButton, LogoutButton

### `scripts/` — CLI runners (tsx)

| Script | Command | Description |
|--------|---------|-------------|
| `run-cycle.ts` | `npm run cycle` | Full agent cycle |
| `generate-weekly-report.ts` | `npm run report` | Generate weekly PDF |
| `src/scripts/exit-only.ts` | `npm run exit-only` | Exit evaluation only |

---

## Protected Zone — `src/lib/config.ts`

**Do NOT modify without explicit confirmation from Amaury.**

```ts
ZSCORE_ENTRY_THRESHOLD = -1.3   // Mean reversion entry threshold
MAX_SPREAD_BPS = 100            // Max bid-ask spread allowed
MAX_QUOTE_AGE_SECONDS = 60      // Max quote staleness
INSTRUMENT_BLACKLIST            // Inverse + leveraged ETFs — never trade
```

---

## Trading Signals

| Signal | Entry | Setup exit | Profit target |
|--------|-------|------------|---------------|
| `MEAN_REVERSION` | z-score ≤ effective threshold (base -1.3, news-adjusted); blocked when regime is RANGING and ADX < 18 | z-score ≥ -0.8 (Kalman `EXIT_LONG`) | 10% |
| `TREND_PULLBACK` | Uptrend (price > EMA50 > EMA200), z-score ≤ 0, EMA50 slope rising, ADX ≥ 20 (or ADX unavailable), MACD histogram > -2.0 | Price falls below EMA50 | 10% |
| `TREND_PULLBACK_3DAY` | Previous close > SMA200, three consecutive lower closes before it, price not above SMA5 (no z-score, ADX or MACD condition) | Price closes above SMA5 (`SMA5_RECLAIM`) | 10% |
| `TREND_ZLE05` | Same uptrend, 0 < z-score ≤ 1.25, EMA50 slope rising, ADX ≥ 18 (or ≥ 15 with MACD histogram > 0.25), MACD histogram > 0 | z-score ≥ 1.25 (EMA50 break is not an exit for this setup) | 5% |
| `EMA_RECLAIM` | Price above EMA50 by more than 0.2%, previous close ≤ previous EMA50, z-score < 0, momentum confirmed | Price falls back below EMA50 | 10% |

When several setups match, the classification priority is `TREND_PULLBACK_3DAY` > `MEAN_REVERSION` > `TREND_PULLBACK` > `TREND_ZLE05` > `EMA_RECLAIM`. Legacy rows with `signal_type = TREND` exit like `TREND_PULLBACK`; positions with no signal type get only the profit target and the time stop.

Exits that apply to every setup:
- **Profit target** — 5% for `TREND_ZLE05`, 10% for every other setup; close immediately
- **20 trading days** — time stop
- **-5% stop loss** — two layers: Alpaca GTC stop order (Capa A) + manual cycle check (Capa B)

Setup exit: the "Setup exit" column above (not applied to positions with no signal type).

Protective stop (one per setup, never both):
- **`MEAN_REVERSION` — profit floor**: activates once the high reaches +5% above entry; the stop is entry × (1 + max(3%, high% − 3 pp)), so it ratchets up 3 pp behind the high and never drops. It replaces the ATR trailing stop for this setup only.
- **All other setups — ATR trailing stop**: activates at +6% (`TREND_PULLBACK`, `TREND_PULLBACK_3DAY`), +3% (`TREND_ZLE05`), +4% (`EMA_RECLAIM`), +5% (no signal type); ATR multiplier 1.5 / 1.5 / 1.0 / 1.0 / 1.2 respectively; floored at the buy price.

---

## Risk Parameters (env-driven)

| Variable | Default | Description |
|----------|---------|-------------|
| `RISK_PCT` | 0.01 | Capital at risk per trade (Kovner 1% rule) |
| `STOP_LOSS_PCT` | 0.05 | Stop loss below entry |
| `MAX_POSITION_SIZE` | 0.10 | Prompt text only: feeds the `Max Position Size` and `Max Position Value Allowed` lines Claude sees (`prompt-builder.ts`); it does not limit the order quantity |
| `MAX_POSITIONS` | 5 | Max simultaneous positions |
| `TRADING_WATCHLIST` | fallback list | Static symbols if screener fails |

Real position caps (constants in `position-sizing.ts`, not env): `MAX_POSITION_EQUITY_FRACTION = 0.10` (10% of equity per position) and `BUYING_POWER_FRACTION = 0.95` (95% of buying power). The formula result is limited by both caps before the confidence factor is applied.

Position sizing: `qty = (equity × RISK_PCT) / (price × STOP_LOSS_PCT)` × regime multiplier × confidence multiplier (floor 50%). Halved if no Kalman confirmation (Seykota undertrade mandate). The z <= -2 sizing override is **disabled** (`Z_SIZING_OVERRIDE_ENABLED = false` in `position-sizing.ts`, code path kept dormant), so the confidence factor `max(0.5, confidence)` applies to every entry, including z <= -2.

Execution gates (in order): liquidity (≥ 1M prev day volume) → spread (≤ 100bps) → trading hours (9:45am–3:30pm ET) → max 5 buys/day → portfolio risk check.

---

## File Permission Matrix

### Touch freely
- `src/components/dashboard/**` — UI components
- `src/app/api/**` — API route handlers
- `src/app/dashboard/**` — Dashboard pages
- `src/app/login/**` — Auth pages
- `src/lib/types.ts` — Type definitions
- `src/lib/utils.ts` — Utilities
- `src/lib/supabase/**` — Supabase client wrappers
- `src/lib/agent-log.ts` — Log helpers
- `src/lib/report-generator.ts` — Report generation
- `scripts/**` — CLI scripts

### Confirm with Amaury before touching
| File | Reason |
|------|--------|
| `src/lib/config.ts` | Trading parameters — changes affect all live trades |
| `src/lib/claude-agent.ts` | Core decision engine and signal detection |
| `src/lib/risk-manager.ts` | Portfolio risk rules |
| `src/lib/indicators.ts` | Signal calculation — Kalman filter |
| `src/lib/news-intelligence.ts` | Threshold adjustment logic |
| `src/lib/watchlist-monitor.ts` | Auto-entry logic |
| `src/lib/learning.ts` | Trade evaluation and learning loop |
| `src/lib/prompt-builder.ts` | Builds the exact text Claude receives — changes alter analyst input |
| `src/lib/exit-cooldown.ts` | Exit reason mapping and cooldown rules — decides when a symbol can be re-entered |
| `.env` / `.env.local` | Secrets and broker config |
| `vercel.json` | Deployment config |
| Any DB migration | Supabase schema changes |

---

## Test Patterns

Tests live in `src/lib/__tests__/`. The Vitest environment is `node`; the test config (`vitest.config.ts`) pre-injects `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` so you don't need a real `.env` to run them.

**Supabase mock pattern** — always use `vi.hoisted` so mocks are hoisted before imports:

```ts
const { mockFrom, mockSelect } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockSelect: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom }),
}))
```

**Signal condition tests** (`trend-zle05-setup.test.ts`) replicate the detection logic inline rather than importing from `claude-agent.ts`. If you change a signal condition in `claude-agent.ts`, update the corresponding test helper to match — they are intentionally decoupled to avoid false-positive tests.

---

## GitHub Actions Schedule

```yaml
# .github/workflows/agent-cron.yml
# Full agent cycle — runs hourly during market hours Mon–Fri
schedule: "0 14-20 * * 1-5"     # top of each hour, 14–20 UTC = 10am–4pm EDT / 9am–3pm EST

# .github/workflows/agent-exits.yml
# Exit sweep — runs twice: market open and market close
schedule: "30 13 * * 1-5"       # 13:30 UTC = 9:30am EDT / 8:30am EST — morning sweep
schedule: "55 19 * * 1-5"       # 19:55 UTC = 3:55pm EDT / 2:55pm EST — closing sweep

# .github/workflows/weekly-report.yml
# Weekly report generation
schedule: "0 21 * * 5"          # Friday 21:00 UTC = 5pm EDT / 4pm EST
```

Every workflow installs dependencies with `npm ci` on Node 24. `npm audit` runs only in `security-audit.yml` (weekdays 12:00 UTC; level `critical` unless a manual run chooses another; it opens or closes a GitHub issue); no other workflow runs it.
Other workflows not listed above: `daily-bars-sync.yml`, `earnings-calendar-sync.yml`, `position-health.yml` and `pr-review.yml` — see `.github/workflows/` for their triggers.
Env vars injected per workflow — see each `.github/workflows/*.yml` for the full list.

---

## Env Variables Required

Server-side (`src/lib/db.ts`, `src/lib/supabase/server.ts`) and client-side use **different** variable names:

```
# Broker
ALPACA_API_KEY
ALPACA_SECRET_KEY
ALPACA_BASE_URL          # https://paper-api.alpaca.markets or live URL

# AI
ANTHROPIC_API_KEY

# Supabase — server side (service role, never sent to browser)
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY

# Supabase — client side (anon key, safe for browser)
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY

# App
NEXT_PUBLIC_BASE_URL
CRON_SECRET              # Protects /api/cron/run from unauthorized calls

# GitHub (used by dashboard "Run Agent" button)
GITHUB_TOKEN
GITHUB_OWNER
GITHUB_REPO

# Trading config
RISK_PCT
STOP_LOSS_PCT
MAX_POSITION_SIZE
MAX_POSITIONS
TRADING_WATCHLIST
```
