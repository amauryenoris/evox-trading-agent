'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, Cell, ResponsiveContainer, Tooltip } from 'recharts'

interface TradeSummary {
  index: number
  pnlUSD: number
  outcome: string
  symbol: string
}

interface SignalTypeStat {
  count: number
  winRate: number
  avgPnlPct: number
}

interface PerformanceData {
  total: number
  winCount: number
  lossCount: number
  winRate: number
  profitFactor: number
  avgWinUSD: number
  avgWinPct: number
  avgLossUSD: number
  avgLossPct: number
  expectancy: number
  last10Trades: TradeSummary[]
  evoxYtdPct: number
  spyYtdPct: number | null
  signalTypeBreakdown?: { meanReversion: SignalTypeStat; trend: SignalTypeStat; emaReclaim: SignalTypeStat }
  since: string | null
}

type ViewMode = 'new_system' | 'all_time'

const NEW_SYSTEM_DATE = '2026-04-20'

function formatPct(v: number): string {
  const sign = v >= 0 ? '+' : ''
  return `${sign}${v.toFixed(2)}%`
}

function formatUSD(v: number): string {
  const sign = v >= 0 ? '+' : ''
  return `${sign}$${Math.abs(v).toFixed(2)}`
}

export function PerformanceAnalytics() {
  const [data, setData] = useState<PerformanceData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>('new_system')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setData(null)
    const url = view === 'new_system'
      ? `/api/performance?since=${NEW_SYSTEM_DATE}`
      : '/api/performance'
    fetch(url)
      .then((r) => r.json())
      .then((d: PerformanceData) => { setData(d); setLoading(false) })
      .catch((e) => { setError(String(e)); setLoading(false) })
  }, [view])

  if (error) {
    return (
      <div className="bg-[#13131a] border border-[#1e1e2e] rounded-xl p-4">
        <p className="text-xs text-red-400">Performance data unavailable: {error}</p>
      </div>
    )
  }

  if (loading || !data) {
    return (
      <div className="bg-[#13131a] border border-[#1e1e2e] rounded-xl p-4">
        <div className="animate-pulse space-y-3">
          <div className="grid grid-cols-5 gap-3">
            {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-slate-800 rounded-lg" />)}
          </div>
          <div className="h-24 bg-slate-800 rounded-lg" />
        </div>
      </div>
    )
  }

  const winRateColor = data.winRate >= 50 ? 'text-green-400' : 'text-red-400'
  const pfColor = data.profitFactor >= 1.5 ? 'text-green-400' : 'text-red-400'
  const expectancyColor = data.expectancy >= 0 ? 'text-green-400' : 'text-red-400'

  return (
    <div className="bg-[#13131a] border border-[#1e1e2e] rounded-xl p-4 space-y-4">
      {/* Header + toggle */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
          Performance Analytics
        </h2>
        <div className="flex items-center bg-[#0d0d14] border border-[#1e1e2e] rounded-lg p-0.5 gap-0.5">
          <button
            onClick={() => setView('new_system')}
            className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
              view === 'new_system'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            New System (Apr 20+)
          </button>
          <button
            onClick={() => setView('all_time')}
            className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
              view === 'all_time'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            All Time
          </button>
        </div>
      </div>

      {/* Row 1 — 5 metric cards */}
      <div className="grid grid-cols-5 gap-3">
        {/* Win Rate */}
        <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-lg p-3">
          <p className="text-xs text-slate-500 mb-1">Win Rate</p>
          <p className={`text-lg font-bold ${winRateColor}`}>{data.winRate.toFixed(0)}%</p>
          <p className={`text-xs ${winRateColor}`}>
            {data.winRate >= 50 ? 'target met' : 'target 50%'}
          </p>
        </div>

        {/* Profit Factor */}
        <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-lg p-3">
          <p className="text-xs text-slate-500 mb-1">Profit Factor</p>
          <p className={`text-lg font-bold ${pfColor}`}>
            {data.profitFactor >= 999 ? '∞' : data.profitFactor.toFixed(2)}
          </p>
          <p className={`text-xs ${pfColor}`}>
            {data.profitFactor >= 1.5 ? 'target met' : 'target 1.5'}
          </p>
        </div>

        {/* Avg Win */}
        <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-lg p-3">
          <p className="text-xs text-slate-500 mb-1">Avg Win</p>
          <p className="text-lg font-bold text-green-400">{formatUSD(data.avgWinUSD)}</p>
          <p className="text-xs text-green-400">{formatPct(data.avgWinPct)}</p>
        </div>

        {/* Avg Loss */}
        <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-lg p-3">
          <p className="text-xs text-slate-500 mb-1">Avg Loss</p>
          <p className="text-lg font-bold text-red-400">{formatUSD(data.avgLossUSD)}</p>
          <p className="text-xs text-red-400">{formatPct(data.avgLossPct)}</p>
        </div>

        {/* Expectancy */}
        <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-lg p-3">
          <p className="text-xs text-slate-500 mb-1">Expectancy</p>
          <p className={`text-lg font-bold ${expectancyColor}`}>{formatPct(data.expectancy)}</p>
          <p className={`text-xs ${expectancyColor}`}>per trade</p>
        </div>
      </div>

      {/* Row 2 — Charts */}
      <div className="grid grid-cols-2 gap-3">
        {/* P&L per trade bar chart — last 10 */}
        <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-lg p-3">
          <p className="text-xs text-slate-500 mb-2">P&L per Trade (last {data.last10Trades.length})</p>
          {data.last10Trades.length > 0 ? (
            <ResponsiveContainer width="100%" height={80}>
              <BarChart data={data.last10Trades} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <Bar dataKey="pnlUSD" radius={[2, 2, 0, 0]}>
                  {data.last10Trades.map((entry, i) => (
                    <Cell key={i} fill={entry.pnlUSD >= 0 ? '#4ade80' : '#f87171'} />
                  ))}
                </Bar>
                <Tooltip
                  contentStyle={{ background: '#0d0d14', border: '1px solid #1e1e2e', borderRadius: 6, fontSize: 11 }}
                  formatter={(v) => [formatUSD(Number(v)), 'P&L']}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.symbol ?? ''}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-slate-600 text-center py-4">No closed trades yet</p>
          )}
        </div>

        {/* EVOX vs S&P 500 YTD */}
        <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-lg p-3">
          <p className="text-xs text-slate-500 mb-3">YTD Performance</p>
          <div className="flex items-center justify-around">
            <div className="text-center">
              <p className="text-xs text-slate-500 mb-1">EVOX</p>
              <p className={`text-xl font-bold ${data.evoxYtdPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatPct(data.evoxYtdPct)}
              </p>
            </div>
            <div className="w-px h-8 bg-slate-700" />
            <div className="text-center">
              <p className="text-xs text-slate-500 mb-1">S&P 500</p>
              {data.spyYtdPct !== null ? (
                <p className={`text-xl font-bold ${data.spyYtdPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatPct(data.spyYtdPct)}
                </p>
              ) : (
                <p className="text-xl font-bold text-slate-600">—</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Signal Type Breakdown */}
      {data.signalTypeBreakdown && (data.signalTypeBreakdown.meanReversion.count > 0 || data.signalTypeBreakdown.trend.count > 0 || data.signalTypeBreakdown.emaReclaim.count > 0) && (
        <div className={`grid gap-3 ${data.signalTypeBreakdown.emaReclaim.count > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          <div className="bg-[#0d0d14] border border-blue-500/10 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">Mean Reversion</span>
              <span className="text-xs text-slate-500">{data.signalTypeBreakdown.meanReversion.count} trades</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Win rate</span>
              <span className={data.signalTypeBreakdown.meanReversion.winRate >= 50 ? 'text-green-400' : 'text-red-400'}>
                {data.signalTypeBreakdown.meanReversion.winRate.toFixed(0)}%
              </span>
            </div>
            <div className="flex justify-between text-xs mt-1">
              <span className="text-slate-500">Avg P&L</span>
              <span className={data.signalTypeBreakdown.meanReversion.avgPnlPct >= 0 ? 'text-green-400' : 'text-red-400'}>
                {formatPct(data.signalTypeBreakdown.meanReversion.avgPnlPct)}
              </span>
            </div>
          </div>

          <div className="bg-[#0d0d14] border border-green-500/10 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 font-medium">Trend</span>
              <span className="text-xs text-slate-500">{data.signalTypeBreakdown.trend.count} trades</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Win rate</span>
              <span className={data.signalTypeBreakdown.trend.winRate >= 50 ? 'text-green-400' : 'text-red-400'}>
                {data.signalTypeBreakdown.trend.winRate.toFixed(0)}%
              </span>
            </div>
            <div className="flex justify-between text-xs mt-1">
              <span className="text-slate-500">Avg P&L</span>
              <span className={data.signalTypeBreakdown.trend.avgPnlPct >= 0 ? 'text-green-400' : 'text-red-400'}>
                {formatPct(data.signalTypeBreakdown.trend.avgPnlPct)}
              </span>
            </div>
          </div>

          {data.signalTypeBreakdown.emaReclaim.count > 0 && (
            <div className="bg-[#0d0d14] border border-violet-500/10 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20 font-medium">EMA Reclaim</span>
                <span className="text-xs text-slate-500">{data.signalTypeBreakdown.emaReclaim.count} trades</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Win rate</span>
                <span className={data.signalTypeBreakdown.emaReclaim.winRate >= 50 ? 'text-green-400' : 'text-red-400'}>
                  {data.signalTypeBreakdown.emaReclaim.winRate.toFixed(0)}%
                </span>
              </div>
              <div className="flex justify-between text-xs mt-1">
                <span className="text-slate-500">Avg P&L</span>
                <span className={data.signalTypeBreakdown.emaReclaim.avgPnlPct >= 0 ? 'text-green-400' : 'text-red-400'}>
                  {formatPct(data.signalTypeBreakdown.emaReclaim.avgPnlPct)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <p className="text-xs text-slate-600">
        {view === 'new_system'
          ? `New system (Apr 20+) — ${data.total} closed trade${data.total !== 1 ? 's' : ''}`
          : `All time — ${data.total} closed trade${data.total !== 1 ? 's' : ''}`
        }
      </p>
    </div>
  )
}
