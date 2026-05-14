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
import type { PortfolioSummary, PositionDisplay, AgentLogEntry, AlpacaOrder, TradingPattern } from '@/lib/types'
import type { WeeklyReportRecord } from '@/lib/db'

export const dynamic = 'force-dynamic'

function fmtUSD(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
}

function fmtPct(n: number) {
  const sign = n >= 0 ? '+' : ''
  return `${sign}${(n * 100).toFixed(2)}%`
}

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

function ZoneTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[10px] font-semibold tracking-[0.2em] uppercase text-slate-500 mb-4">
      {children}
    </h2>
  )
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

  const tabs = {
    portfolio: (
      <div className="space-y-6">
        <ZoneTitle>Positions &amp; Equity</ZoneTitle>
        <PortfolioOverviewCard data={portfolio} />
        <PositionsTable positions={positions} />
        <PnLChart data={portfolioHistory} />
      </div>
    ),
    intelligence: (
      <div className="space-y-6">
        <ZoneTitle>Market Intelligence</ZoneTitle>
        <NearMissWatchlist />
        <NewsIntelligence />
      </div>
    ),
    analytics: (
      <div className="space-y-6">
        <ZoneTitle>Performance &amp; Reasoning</ZoneTitle>
        <PerformanceAnalytics />
        <AgentReasoningLog entries={agentLog} />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <PatternLibraryCard patterns={patterns} />
          <TradeHistoryTable orders={trades} />
        </div>
      </div>
    ),
    reports: (
      <div className="space-y-6">
        <ZoneTitle>Weekly Reports</ZoneTitle>
        <WeeklyReportsCard reports={reports} />
      </div>
    ),
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      {/* Sticky header — Row 1 (72px) + Row 2 SystemStatusBar (~36px) = ~108px total */}
      <header className="sticky top-0 z-40 bg-[#0A0A0F]/90 backdrop-blur-xl border-b border-[#1E1E2E]">
        <div className="max-w-[1480px] mx-auto px-6 lg:px-8">

          {/* Row 1: brand + equity metrics + actions */}
          <div className="flex items-center justify-between gap-4 h-[72px]">
            <div className="flex items-center gap-10">
              {/* Brand */}
              <div>
                <p className="text-[13px] font-bold tracking-widest text-white uppercase leading-none">
                  PAQUITO
                </p>
                <p className="text-[10px] text-slate-600 tracking-wide mt-0.5">
                  Autonomous trading agent · Paper Trading · LEARN
                </p>
              </div>

              {/* Equity snapshot */}
              {portfolio && (
                <div className="hidden sm:flex items-center divide-x divide-[#1E1E2E]">
                  <div className="pr-7">
                    <p className="text-[9px] text-slate-500 uppercase tracking-widest">Equity</p>
                    <p className="text-[15px] font-semibold text-white tabular-nums mt-0.5">
                      {fmtUSD(portfolio.equity)}
                    </p>
                  </div>
                  <div className="px-7">
                    <p className="text-[9px] text-slate-500 uppercase tracking-widest">Today</p>
                    <p className={`text-[15px] font-semibold tabular-nums mt-0.5 ${todayPositive ? 'text-[#00B386]' : 'text-[#FF4444]'}`}>
                      {fmtPct(portfolio.todayPnLPct)}
                    </p>
                  </div>
                  <div className="pl-7">
                    <p className="text-[9px] text-slate-500 uppercase tracking-widest">All-time</p>
                    <p className={`text-[15px] font-semibold tabular-nums mt-0.5 ${totalPositive ? 'text-[#00B386]' : 'text-[#FF4444]'}`}>
                      {fmtPct(portfolio.totalPnLPct)}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
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
      </header>

      {/* Tabbed content — tab bar sticks at top-[108px] (set inside DashboardTabs) */}
      <DashboardTabs tabs={tabs} defaultTab="portfolio" />
    </div>
  )
}
