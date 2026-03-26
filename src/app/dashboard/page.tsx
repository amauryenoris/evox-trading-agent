import { Suspense } from 'react'
import { PortfolioOverviewCard } from '@/components/dashboard/PortfolioOverviewCard'
import { PositionsTable } from '@/components/dashboard/PositionsTable'
import { PnLChart } from '@/components/dashboard/PnLChart'
import { TradeHistoryTable } from '@/components/dashboard/TradeHistoryTable'
import { AgentReasoningLog } from '@/components/dashboard/AgentReasoningLog'
import { PatternLibraryCard } from '@/components/dashboard/PatternLibraryCard'
import { RunAgentButton } from '@/components/dashboard/RunAgentButton'
import { MarketStatusBadge } from '@/components/dashboard/MarketStatusBadge'
import type { PortfolioSummary, PositionDisplay, AgentLogEntry, AlpacaOrder, TradingPattern } from '@/lib/types'

export const dynamic = 'force-dynamic'

async function fetchJSON<T>(path: string, fallback: T): Promise<T> {
  try {
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
    const res = await fetch(`${base}${path}`, { cache: 'no-store' })
    if (!res.ok) return fallback
    return res.json() as Promise<T>
  } catch {
    return fallback
  }
}

export default async function DashboardPage() {
  const [portfolio, positions, agentLog, trades, patterns] = await Promise.all([
    fetchJSON<PortfolioSummary | null>('/api/portfolio', null),
    fetchJSON<PositionDisplay[]>('/api/positions', []),
    fetchJSON<AgentLogEntry[]>('/api/agent-log', []),
    fetchJSON<AlpacaOrder[]>('/api/trades', []),
    fetchJSON<TradingPattern[]>('/api/patterns', []),
  ])

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Trading Dashboard</h1>
          <p className="text-sm text-slate-500">Autonomous AI agent · Paper Trading</p>
        </div>
        <div className="flex items-center gap-4">
          <Suspense fallback={<span className="text-xs text-slate-600">Loading market status...</span>}>
            <MarketStatusBadge />
          </Suspense>
          <RunAgentButton />
        </div>
      </div>

      {/* Portfolio overview */}
      <section id="positions">
        <PortfolioOverviewCard data={portfolio} />
      </section>

      {/* P&L chart */}
      <PnLChart entries={agentLog} />

      {/* Positions + Agent log */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <PositionsTable positions={positions} />
        <section id="agent">
          <AgentReasoningLog entries={agentLog} />
        </section>
      </div>

      {/* Pattern library + Trade history */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section id="patterns">
          <PatternLibraryCard patterns={patterns} />
        </section>
        <section id="trades">
          <TradeHistoryTable orders={trades} />
        </section>
      </div>
    </div>
  )
}
