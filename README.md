# EVOX Trading Agent

Autonomous algorithmic trading bot that runs on a schedule via GitHub Actions. Uses Claude AI as a pure analyst (no decision power), executes trades on Alpaca paper trading, and stores all data in Supabase. Includes a Next.js dashboard for live performance monitoring.

---

## How It Works

1. **GitHub Actions** triggers the bot on a schedule (market hours only)
2. **Claude AI** analyzes each stock and returns a confidence score + reasoning
3. **The system** (not Claude) decides whether to buy/hold/exit based on z-score, regime, and portfolio rules
4. **Alpaca** executes the paper trades
5. **Supabase** stores every decision, position, and evaluation
6. **Dashboard** (Vercel) shows live P&L, signal breakdown, and weekly reports

---

## Prerequisites

You will need accounts and API keys for the following services. All of them have free tiers that are sufficient to run the bot.

| Service | What it's used for | Free tier |
|---|---|---|
| [Alpaca](https://alpaca.markets) | Paper trading execution | Yes (paper trading is free) |
| [Anthropic](https://console.anthropic.com) | Claude AI stock analysis | Pay-per-use (very low cost) |
| [Supabase](https://supabase.com) | Database (positions, logs, reports) | Yes (free tier) |
| [Vercel](https://vercel.com) | Dashboard hosting | Yes |
| [GitHub](https://github.com) | Repo + cron automation (Actions) | Yes |

---

## Installation — Step by Step

### 1. Clone the repository

```bash
git clone https://github.com/amauryenoris/evox-trading-agent.git
cd evox-trading-agent
npm install
```

### 2. Create your `.env.local` file

Create a file named `.env.local` in the root of the project with the following content. Fill in each value — instructions for where to get each key are in the comments.

```env
# --- ALPACA ---
# Create a free account at https://alpaca.markets
# Go to Paper Trading > API Keys > Generate New Key
ALPACA_API_KEY=your_alpaca_api_key
ALPACA_SECRET_KEY=your_alpaca_secret_key
ALPACA_BASE_URL=https://paper-api.alpaca.markets
ALPACA_DATA_URL=https://data.alpaca.markets

# --- ANTHROPIC ---
# Get your key at https://console.anthropic.com > API Keys
ANTHROPIC_API_KEY=your_anthropic_api_key

# --- SUPABASE ---
# Get these from your Supabase project > Settings > API
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# --- TRADING CONFIG ---
# Comma-separated list of stock tickers to trade
TRADING_WATCHLIST=AAPL,MSFT,GOOGL,AMZN,NVDA,META,TSLA,JPM,V,UNH

# Comma-separated list of sector ETFs for regime detection
SECTOR_WATCHLIST=XLK,XLF,XLV,XLE,XLI,XLY,XLP,XLB,XLU,XLRE

# Maximum dollar amount per position (e.g. 1000 = $1,000 per trade)
MAX_POSITION_SIZE=1000

# Maximum number of open positions at the same time
MAX_POSITIONS=5

# Stop loss percentage (e.g. 0.05 = 5%)
STOP_LOSS_PCT=0.05

# Risk percentage of portfolio per trade (e.g. 0.02 = 2%)
RISK_PCT=0.02
```

### 3. Set up the Supabase database

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Open the **SQL Editor** in your project
3. Run the migration files in order — they are located in `supabase/migrations/` (or ask the project owner for the latest schema export)

The bot uses these tables:
- `agent_log` — every cycle decision logged here
- `open_position_contexts` — tracks open positions and their signal type
- `trade_evaluations` — post-mortem analysis of closed trades
- `pattern_library` — learned patterns from past trades
- `near_miss_watchlist` — stocks close to entry threshold
- `selection_history` / `selection_evaluations` — stock selector history
- `weekly_reports` — generated PDF reports

4. Enable **Row Level Security (RLS)** on all tables with an `authenticated_only` policy (only authenticated users can read data from the dashboard)

5. Go to **Authentication > Providers** and enable the Email provider

6. Go to **Authentication > Users** and create your account manually with your email and a password

7. Go to **Authentication > URL Configuration** and set the **Site URL** to your Vercel deployment URL (you'll get this after deploying — come back here)

### 4. Deploy the dashboard to Vercel

1. Push the repo to your GitHub account
2. Go to [vercel.com](https://vercel.com) and import the repository
3. Add all the environment variables from your `.env.local` to Vercel:
   - Go to your Vercel project > **Settings > Environment Variables**
   - Add every key from `.env.local` (same names, same values)
4. Deploy — Vercel will build and give you a URL like `https://your-project.vercel.app`
5. Go back to Supabase > Authentication > URL Configuration and set that URL as the Site URL

### 5. Add GitHub Secrets (for the cron automation)

The bot runs automatically via GitHub Actions. For this to work, you need to add the same environment variables as **GitHub Secrets**:

1. Go to your GitHub repository > **Settings > Secrets and variables > Actions**
2. Click **New repository secret** and add each of the following:

```
ALPACA_API_KEY
ALPACA_SECRET_KEY
ALPACA_BASE_URL
ALPACA_DATA_URL
ANTHROPIC_API_KEY
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
TRADING_WATCHLIST
SECTOR_WATCHLIST
MAX_POSITION_SIZE
MAX_POSITIONS
STOP_LOSS_PCT
RISK_PCT
```

Once these are set, the bot will run automatically on the schedule below.

---

## Automation Schedule

All times are Eastern Time (ET). The bot only runs on weekdays (Mon–Fri).

| Workflow | Schedule | What it does |
|---|---|---|
| **Exit Check** | 9:30 AM ET | Checks open positions for exit signals at market open |
| **Trading Cycle** | Every hour, 10 AM – 3 PM ET | Full cycle: analyze watchlist, enter/exit positions |
| **Exit Check** | 3:30 PM ET | Final exit check before market close |
| **Weekly Report** | Fridays 5 PM ET | Generates PDF performance report and saves to Supabase |

You can also trigger any workflow manually from the **Actions** tab in GitHub.

---

## Running Locally (development)

```bash
# Start the dashboard
npm run dev
# Open http://localhost:3000

# Run one full trading cycle manually
npm run cycle

# Run exit-only check (no new entries)
npm run exit-only

# Generate the weekly PDF report
npm run report
```

> **Note:** Local runs use the same Alpaca paper account and Supabase database as production. They will execute real paper trades.

---

## Project Structure

```
src/
├── app/                    # Next.js App Router (dashboard pages + API routes)
│   ├── dashboard/          # Main dashboard page
│   ├── login/              # Login page + server actions
│   └── api/                # Internal API routes (performance, positions, logs)
├── components/
│   └── dashboard/          # React components (charts, tables, cards)
├── lib/
│   ├── claude-agent.ts     # Main trading logic, setup detection, exit rules
│   ├── indicators.ts       # Technical indicators (RSI, MACD, Bollinger, EMA, Kalman)
│   ├── alpaca.ts           # Alpaca API client
│   ├── db.ts               # Supabase CRUD operations
│   ├── risk-manager.ts     # Position sizing, sector limits
│   ├── news-intelligence.ts# News classification and threshold adjustment
│   ├── watchlist-monitor.ts# Near-miss detection and auto-entry
│   ├── learning.ts         # Pattern library and post-mortem analysis
│   ├── report-generator.ts # Weekly PDF report generator
│   └── config.ts           # Single source of truth for trading parameters
└── scripts/
    └── exit-only.ts        # Entrypoint for exit-only workflow
scripts/
    ├── run-cycle.ts         # Entrypoint for full trading cycle
    └── generate-weekly-report.ts
.github/workflows/
    ├── agent-cron.yml       # Hourly trading cycle
    ├── agent-exits.yml      # Open/close exit checks
    └── weekly-report.yml    # Friday report generation
```

---

## Key Trading Parameters

These are set via environment variables and can be tuned without touching code:

| Parameter | Default | Description |
|---|---|---|
| `ZSCORE_ENTRY_THRESHOLD` | `-1.3` | Z-score level required to consider an entry (hardcoded in `src/lib/config.ts`) |
| `MAX_POSITIONS` | `5` | Max simultaneous open positions |
| `MAX_POSITION_SIZE` | `$1,000` | Max dollar size per position |
| `STOP_LOSS_PCT` | `5%` | Hard stop loss below entry price |
| `RISK_PCT` | `2%` | Portfolio risk per trade (used for sizing) |

---

## Signal Types

The bot uses four entry signals:

| Signal | Condition |
|---|---|
| `MEAN_REVERSION` | Z-score below `-1.3` in a ranging market |
| `TREND_PULLBACK` | Price in uptrend (above EMA50 > EMA200), z-score ≤ 0 |
| `TREND_ZLE05` | Same trend, z-score between 0 and 0.5 |
| `EMA_RECLAIM` | Price reclaims EMA50 from below (sized at 0.75x) |

---

## Tech Stack

- **Next.js 16** + React 19 + TypeScript + Tailwind CSS 4
- **Alpaca Markets** — paper trading API
- **Anthropic Claude Sonnet** — AI analyst
- **Supabase** (PostgreSQL) — database + auth
- **Recharts** — performance charts
- **PDFKit** — weekly report generation
- **GitHub Actions** — cron automation
- **Vercel** — dashboard hosting
