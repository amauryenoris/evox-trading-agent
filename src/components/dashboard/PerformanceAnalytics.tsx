'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, Cell, ResponsiveContainer, Tooltip } from 'recharts'

interface TradeSummary {
  index: number
  pnlUSD: number
  outcome: string
  symbol: string
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
  last10Trades: TradeSummary[]
  evoxYtdPct: number
  spyYtdPct: number | null
}

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

  useEffect(() => {
    fetch('/api/performance')
      .then((r) => r.json())
      .then((d: PerformanceData) => setData(d))
      .catch((e) => setError(String(e)))
  }, [])

  if (error) {
    return (
      <div className="bg-[#13131a] border border-[#1e1e2e] rounded-xl p-4">
        <p className="text-xs text-red-400">Performance data unavailable: {error}</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="bg-[#13131a] border border-[#1e1e2e] rounded-xl p-4">
        <div className="animate-pulse space-y-3">
          <div className="grid grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-slate-800 rounded-lg" />)}
          </div>
          <div className="h-24 bg-slate-800 rounded-lg" />
        </div>
      </div>
    )
  }

  const winRateColor = data.winRate >= 50 ? 'text-green-400' : 'text-red-400'
  const pfColor = data.profitFactor >= 1.5 ? 'text-green-400' : 'text-red-400'

  return (
    <div className="bg-[#13131a] border border-[#1e1e2e] rounded-xl p-4 space-y-4">
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
        Performance Analytics
      </h2>

      {/* Row 1 — 4 metric cards */}
      <div className="grid grid-cols-4 gap-3">
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
      </div>

      {/* Row 2 — Charts */}
      <div className="grid grid-cols-2 gap-3">
        {/* P&L per trade bar chart */}
        <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-lg p-3">
          <p className="text-xs text-slate-500 mb-2">P&L per Trade (last {data.last10Trades.length})</p>
          {data.last10Trades.length > 0 ? (
            <ResponsiveContainer width="100%" height={60}>
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

      {/* Footer */}
      <p className="text-xs text-slate-600">
        Based on {data.total} closed trade{data.total !== 1 ? 's' : ''} since Mar 26
      </p>
    </div>
  )
}
