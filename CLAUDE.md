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
  "what_would_trigger": "what specific condition would strengthen the signal"
}
```

Claude must NOT: say BUY/SELL/HOLD, reject or approve trades, apply entry rules,
reference confidence thresholds by regime, use language like "prohibits" or "blocks".

---

## Stack

| Layer        | Technology                                 |
|--------------|--------------------------------------------|
| Framework    | Next.js 16.2.1 + React 19 + TypeScript 5  |
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
| `claude-agent.ts` | Main agent loop — `runAgentCycle()`, signal detection, exit rules, position sizing |
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
MAX_SPREAD_BPS = 50             // Max bid-ask spread allowed
MAX_QUOTE_AGE_SECONDS = 60      // Max quote staleness
INSTRUMENT_BLACKLIST            // Inverse + leveraged ETFs — never trade
```

---

## 4 Trading Signals

| Signal | Condition | Exit |
|--------|-----------|------|
| `MEAN_REVERSION` | Ranging market, z-score ≤ -1.3, RSI < 45, %B < 0.2 | z-score ≥ -0.8 (reverted to fair value) |
| `TREND_PULLBACK` | Uptrend (price > EMA50 > EMA200), z-score ≤ 0, momentum + ADX ≥ 20, EMA50 slope rising | Price falls below EMA50 |
| `TREND_ZLE05` | Same uptrend, z-score 0–1.25, positive MACD histogram, EMA50 slope rising | Price falls below EMA50 |
| `EMA_RECLAIM` | Price crossed above EMA50 from below (confirmed by prior day), z-score < 0, momentum confirmed | Price falls back below EMA50 |

Universal exits (all signal types):
- **+10% profit target** — close immediately
- **20 trading days** — time stop
- **-5% stop loss** — two layers: Alpaca GTC stop order (Capa A) + manual cycle check (Capa B)
- **Trailing stop** — activates at signal-specific profit threshold, floors at buy price

---

## Risk Parameters (env-driven)

| Variable | Default | Description |
|----------|---------|-------------|
| `RISK_PCT` | 0.01 | Capital at risk per trade (Kovner 1% rule) |
| `STOP_LOSS_PCT` | 0.05 | Stop loss below entry |
| `MAX_POSITION_SIZE` | 0.10 | Max position as % of equity |
| `MAX_POSITIONS` | 5 | Max simultaneous positions |
| `TRADING_WATCHLIST` | fallback list | Static symbols if screener fails |

Position sizing: `qty = (equity × RISK_PCT) / (price × STOP_LOSS_PCT)` × regime multiplier × confidence multiplier (floor 50%). Halved if no Kalman confirmation (Seykota undertrade mandate).

Execution gates (in order): liquidity (≥ 1M prev day volume) → spread (≤ 50bps) → trading hours (9:45am–3:30pm ET) → max 5 buys/day → portfolio risk check.

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
schedule: "0 14-20 * * 1-5"     # top of each hour, 10am–4pm ET (14–20 UTC)

# .github/workflows/agent-exits.yml
# Exit sweep — runs twice: market open and market close
schedule: "30 13 * * 1-5"       # 9:30am ET (13:30 UTC) — morning sweep
schedule: "55 19 * * 1-5"       # 3:55pm ET (19:55 UTC) — closing sweep

# .github/workflows/weekly-report.yml
# Weekly report generation
schedule: "0 21 * * 5"          # Friday 5pm ET (21:00 UTC)

# .github/workflows/keepalive.yml
# Prevents GitHub from disabling scheduled workflows after 60 days of inactivity
schedule: "0 12 * * 1"          # Every Monday noon UTC
```

All workflows run `npm ci` + `npm audit --audit-level=critical` before executing.
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
