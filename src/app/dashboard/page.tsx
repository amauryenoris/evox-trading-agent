import { Suspense } from 'react'
import { PortfolioOverviewCard } from '@/components/dashboard/PortfolioOverviewCard'
import { PositionsTable } from '@/components/dashboard/PositionsTable'
import { PnLChart } from '@/components/dashboard/PnLChart'
import { TradeHistoryTable } from '@/components/dashboard/TradeHistoryTable'
import { AgentReasoningLog } from '@/components/dashboard/AgentReasoningLog'
import { PatternLibraryCard } from '@/components/dashboard/PatternLibraryCard'
import { RunAgentButton } from '@/components/dashboard/RunAgentButton'
import { MarketStatusBadge } from '@/components/dashboard/MarketStatusBadge'
import { WeeklyReportsCard } from '@/components/dashboard/WeeklyReportsCard'
import { GenerateReportButton } from '@/components/dashboard/GenerateReportButton'
import { SystemStatus } from '@/components/dashboard/SystemStatus'
import { NearMissWatchlist } from '@/components/dashboard/NearMissWatchlist'
import { NewsIntelligence } from '@/components/dashboard/NewsIntelligence'
import { PerformanceAnalytics } from '@/components/dashboard/PerformanceAnalytics'
import { LogoutButton } from '@/components/dashboard/LogoutButton'
import { cookies } from 'next/headers'
import type { PortfolioSummary, PositionDisplay, AgentLogEntry, AlpacaOrder, TradingPattern } from '@/lib/types'
import type { WeeklyReportRecord } from '@/lib/db'

export const dynamic = 'force-dynamic'

async function fetchJSON<T>(path: string, fallback: T): Promise<T> {
  try {
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
    const cookieStore = await cookies()
    const cookieHeader = cookieStore.getAll().map(c => `${c.name}=${c.value}`).join('; ')
    const res = await fetch(`${base}${path}`, {
      cache: 'no-store',
      headers: { Cookie: cookieHeader },
    })
    if (!res.ok) return fallback
    return res.json() as Promise<T>
  } catch {
    return fallback
  }
}

export default async function DashboardPage() {
  const [portfolio, positions, agentLog, trades, patterns, reports] = await Promise.all([
    fetchJSON<PortfolioSummary | null>('/api/portfolio', null),
    fetchJSON<PositionDisplay[]>('/api/positions', []),
    fetchJSON<AgentLogEntry[]>('/api/agent-log', []),
    fetchJSON<AlpacaOrder[]>('/api/trades', []),
    fetchJSON<TradingPattern[]>('/api/patterns', []),
    fetchJSON<WeeklyReportRecord[]>('/api/reports', []),
  ])

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Trading Dashboard</h1>
          <p className="text-sm text-slate-500">Autonomous AI agent · Paper Trading · LEARN Mode</p>
        </div>
        <div className="flex items-center gap-4">
          <Suspense fallback={<span className="text-xs text-slate-600">Loading market status...</span>}>
            <MarketStatusBadge />
          </Suspense>
          <GenerateReportButton />
          <RunAgentButton />
          <LogoutButton />
        </div>
      </div>

      {/* 1. System Status — top for immediate context */}
      <SystemStatus />

      {/* 2. Portfolio overview */}
      <section id="portfolio">
        <PortfolioOverviewCard data={portfolio} />
      </section>

      {/* 3. Open Positions */}
      <section id="positions">
        <PositionsTable positions={positions} />
      </section>

      {/* 4. Near-Miss Watchlist (only shown when there are active entries) */}
      <NearMissWatchlist />

      {/* 5. News Intelligence */}
      <NewsIntelligence />

      {/* 6. Agent Decisions */}
      <section id="agent">
        <AgentReasoningLog entries={agentLog} />
      </section>

      {/* 7. Performance Analytics */}
      <PerformanceAnalytics />

      {/* 8. Pattern Library + Trade History */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section id="patterns">
          <PatternLibraryCard patterns={patterns} />
        </section>
        <section id="trades">
          <TradeHistoryTable orders={trades} />
        </section>
      </div>

      {/* P&L chart (supplementary) */}
      <PnLChart entries={agentLog} />

      {/* 9. Weekly Reports */}
      <section id="reports">
        <WeeklyReportsCard reports={reports} />
      </section>
    </div>
  )
}
