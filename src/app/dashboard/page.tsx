import { Suspense } from 'react'
import { PortfolioOverviewCard } from '@/components/dashboard/PortfolioOverviewCard'
import { PositionsTable } from '@/components/dashboard/PositionsTable'
import { PnLChart, type PortfolioHistory } from '@/components/dashboard/PnLChart'
import { TradeHistoryTable } from '@/components/dashboard/TradeHistoryTable'
import { AgentReasoningLog } from '@/components/dashboard/AgentReasoningLog'
import { PatternLibraryCard } from '@/components/dashboard/PatternLibraryCard'
import { RunAgentButton } from '@/components/dashboard/RunAgentButton'
import { MarketStatusBadge } from '@/components/dashboard/MarketStatusBadge'
import { WeeklyReportsCard } from '@/components/dashboard/WeeklyReportsCard'
import { GenerateReportButton } from '@/components/dashboard/GenerateReportButton'
import { NearMissWatchlist } from '@/components/dashboard/NearMissWatchlist'
import { NewsIntelligence } from '@/components/dashboard/NewsIntelligence'
import { PerformanceAnalytics } from '@/components/dashboard/PerformanceAnalytics'
import { LogoutButton } from '@/components/dashboard/LogoutButton'
import { DashboardTabs } from '@/components/dashboard/DashboardTabs'
import { SystemStatusBar } from '@/components/dashboard/SystemStatusBar'
import { cookies } from 'next/headers'
import { formatCurrency, formatPct } from '@/lib/utils'
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
  const [portfolio, positions, agentLog, trades, patterns, reports, portfolioHistory] = await Promise.all([
    fetchJSON<PortfolioSummary | null>('/api/portfolio', null),
    fetchJSON<PositionDisplay[]>('/api/positions', []),
    fetchJSON<AgentLogEntry[]>('/api/agent-log', []),
    fetchJSON<AlpacaOrder[]>('/api/trades', []),
    fetchJSON<TradingPattern[]>('/api/patterns', []),
    fetchJSON<WeeklyReportRecord[]>('/api/reports', []),
    fetchJSON<PortfolioHistory | null>('/api/portfolio-history', null),
  ])

  const todayPositive = (portfolio?.todayPnL ?? 0) >= 0
  const totalPositive = (portfolio?.totalPnL ?? 0) >= 0

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* ── Header ── */}
      <div className="mb-6 space-y-3">
        {/* Row 1: title + equity snapshot + action buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-8">
            <div>
              <h1 className="text-xl font-bold text-slate-100 tracking-tight">PAQUITO</h1>
              <p className="text-xs text-slate-600">Autonomous trading agent · Paper Trading · LEARN</p>
            </div>

            {portfolio && (
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider">Equity</p>
                  <p className="text-base font-semibold text-slate-100">{formatCurrency(portfolio.equity)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider">Today</p>
                  <p className={`text-base font-semibold ${todayPositive ? 'text-green-400' : 'text-red-400'}`}>
                    {formatPct(portfolio.todayPnLPct)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider">All-time</p>
                  <p className={`text-base font-semibold ${totalPositive ? 'text-green-400' : 'text-red-400'}`}>
                    {formatPct(portfolio.totalPnLPct)}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Suspense fallback={<span className="text-xs text-slate-600">—</span>}>
              <MarketStatusBadge />
            </Suspense>
            <GenerateReportButton />
            <RunAgentButton />
            <LogoutButton />
          </div>
        </div>

        {/* Row 2: system status strip */}
        <SystemStatusBar />
      </div>

      {/* ── Tabbed content ── */}
      <DashboardTabs
        portfolio={
          <div className="space-y-6">
            <PortfolioOverviewCard data={portfolio} />
            <PositionsTable positions={positions} />
            <PnLChart data={portfolioHistory} />
          </div>
        }
        intelligence={
          <div className="space-y-6">
            <NearMissWatchlist />
            <NewsIntelligence />
          </div>
        }
        analytics={
          <div className="space-y-6">
            <PerformanceAnalytics />
            <AgentReasoningLog entries={agentLog} />
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <PatternLibraryCard patterns={patterns} />
              <TradeHistoryTable orders={trades} />
            </div>
          </div>
        }
        reports={
          <WeeklyReportsCard reports={reports} />
        }
      />
    </div>
  )
}
