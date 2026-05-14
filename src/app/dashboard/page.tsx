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

const fmtUSD = (n: number, dp = 0) =>
  (n < 0 ? '-' : '') +
  '$' +
  Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  })

const fmtPct = (n: number, dp = 2) => (n >= 0 ? '+' : '') + (n * 100).toFixed(dp) + '%'

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

function ZoneTitle({
  kicker,
  title,
  subtitle,
}: {
  kicker: string
  title: string
  subtitle?: string
}) {
  return (
    <div className="mt-2 mb-1">
      <div className="flex items-center gap-3 mb-1">
        <span className="text-[10px] tracking-[0.22em] uppercase text-[#00B386] font-semibold">
          {kicker}
        </span>
        <span className="h-px w-10 bg-[#00B386]/40" />
      </div>
      <h2 className="text-[22px] font-semibold tracking-tight text-slate-100">{title}</h2>
      {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
    </div>
  )
}

export default async function DashboardPage() {
  const [portfolio, positions, agentLog, trades, patterns, reports, portfolioHistory] =
    await Promise.all([
      fetchJSON<PortfolioSummary | null>('/api/portfolio', null),
      fetchJSON<PositionDisplay[]>('/api/positions', []),
      fetchJSON<AgentLogEntry[]>('/api/agent-log', []),
      fetchJSON<AlpacaOrder[]>('/api/trades', []),
      fetchJSON<TradingPattern[]>('/api/patterns', []),
      fetchJSON<WeeklyReportRecord[]>('/api/reports', []),
      fetchJSON<PortfolioHistory | null>('/api/portfolio-history', null),
    ])

  const equity      = portfolio?.equity      ?? 0
  const todayPnL    = portfolio?.todayPnL    ?? 0
  const todayPnLPct = portfolio?.todayPnLPct ?? 0
  const totalPnL    = portfolio?.totalPnL    ?? 0
  const totalPnLPct = portfolio?.totalPnLPct ?? 0

  const tabs = {
    portfolio: (
      <div className="space-y-5">
        <ZoneTitle
          kicker="01 · Portfolio"
          title="Live capital & open exposure"
          subtitle="Everything currently allocated, profit-to-target progress, and how today is moving the book."
        />
        <PositionsTable positions={positions} />
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2">
            <PnLChart data={portfolioHistory} />
          </div>
          <div>
            <PortfolioOverviewCard data={portfolio} />
          </div>
        </div>
      </div>
    ),
    intelligence: (
      <div className="space-y-5">
        <ZoneTitle
          kicker="02 · Intelligence"
          title="What the agent is watching"
          subtitle="Near-miss entries, news-driven threshold adjustments, and setups evaluated but rejected today."
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <NearMissWatchlist />
          <NewsIntelligence />
        </div>
      </div>
    ),
    analytics: (
      <div className="space-y-5">
        <ZoneTitle
          kicker="03 · Analytics"
          title="How the system is performing"
          subtitle="Strategy-level breakdown, the agent's reasoning trail, and the patterns it has learned to exploit."
        />
        <PerformanceAnalytics />
        <AgentReasoningLog entries={agentLog} />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <PatternLibraryCard patterns={patterns} />
          <TradeHistoryTable orders={trades} />
        </div>
      </div>
    ),
    reports: (
      <div className="space-y-5">
        <ZoneTitle
          kicker="04 · Reports"
          title="Weekly archive"
          subtitle="Complete weekly report archive — expand any row for full breakdown and PDF export."
        />
        <WeeklyReportsCard reports={reports} />
      </div>
    ),
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-slate-200">
      {/* ─── Sticky header ─── */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#0A0A0F]/75 border-b border-[#1E1E2E]">
        <div className="max-w-[1480px] mx-auto px-6 lg:px-8">

          {/* Row 1: brand + centered equity metrics + actions */}
          <div className="flex items-center gap-6 h-[72px]">

            {/* Brand */}
            <div className="flex items-center gap-3 shrink-0 xl:min-w-[260px]">
              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-[#00B386]/12 border border-[#00B386]/25 flex items-center justify-center">
                  <span className="text-[#00B386] font-bold text-[10px] tracking-widest">PQ</span>
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#00B386] border-2 border-[#0A0A0F]" />
              </div>
              <div className="leading-tight">
                <div className="text-[#00B386] font-bold tracking-[0.18em] text-[15px]">PAQUITO</div>
                <div className="hidden sm:block text-[10.5px] text-slate-500 tracking-wide">
                  AI Trading Agent · Paper · LEARN
                </div>
              </div>
            </div>

            {/* Centered metrics — xl+ only */}
            <div className="hidden xl:flex flex-1 items-center justify-center gap-10 font-mono tabular-nums">
              <div className="text-center">
                <div className="text-[10px] text-slate-500 tracking-[0.16em] uppercase mb-0.5">Equity</div>
                <div className="text-[26px] font-semibold leading-none">{fmtUSD(equity)}</div>
              </div>
              <div className="h-9 w-px bg-[#1E1E2E]" />
              <div className="text-center">
                <div className="text-[10px] text-slate-500 tracking-[0.16em] uppercase mb-0.5">Today</div>
                <div className={`text-base font-semibold leading-none ${todayPnL >= 0 ? 'text-[#00B386]' : 'text-[#FF4444]'}`}>
                  {(todayPnL >= 0 ? '+' : '-') + fmtUSD(Math.abs(todayPnL))}{' '}
                  <span className="text-xs opacity-80">({fmtPct(todayPnLPct)})</span>
                </div>
              </div>
              <div className="h-9 w-px bg-[#1E1E2E]" />
              <div className="text-center">
                <div className="text-[10px] text-slate-500 tracking-[0.16em] uppercase mb-0.5">All Time</div>
                <div className={`text-base font-semibold leading-none ${totalPnL >= 0 ? 'text-[#00B386]' : 'text-[#FF4444]'}`}>
                  {(totalPnL >= 0 ? '+' : '-') + fmtUSD(Math.abs(totalPnL))}{' '}
                  <span className="text-xs opacity-80">({fmtPct(totalPnLPct)})</span>
                </div>
              </div>
            </div>

            {/* Right cluster */}
            <div className="flex items-center gap-2 lg:gap-3 min-w-0 justify-end ml-auto xl:min-w-[260px]">
              <Suspense fallback={<span className="text-xs text-slate-600">—</span>}>
                <MarketStatusBadge />
              </Suspense>
              <GenerateReportButton />
              <RunAgentButton />
              <LogoutButton />
            </div>
          </div>

          {/* Row 2: system status strip */}
          <div className="border-t border-[#1E1E2E]/60">
            <SystemStatusBar />
          </div>
        </div>
      </header>

      {/* Tabbed content */}
      <DashboardTabs tabs={tabs} defaultTab="portfolio" />

      <footer className="max-w-[1480px] mx-auto px-6 lg:px-8 pt-10 pb-8 text-center">
        <div className="inline-flex items-center gap-2 text-[10.5px] tracking-[0.16em] uppercase text-slate-500">
          <span className="h-px w-12 bg-[#1E1E2E]" />
          PAQUITO v2 · Paper Trading · LEARN Mode
          <span className="h-px w-12 bg-[#1E1E2E]" />
        </div>
      </footer>
    </div>
  )
}
