'use client'

import { useState, useMemo, useEffect } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'
import { Card } from './ui'

interface EquityDataPoint {
  date: string
  equity: number
}

export interface PortfolioHistory {
  history: EquityDataPoint[]
  startEquity: number
  currentEquity: number
  totalReturn: number
}

interface Props {
  data: PortfolioHistory | null
}

const RANGES = ['Today', '1W', '1M', '3M', 'YTD', 'All'] as const
type Range = (typeof RANGES)[number]

function filterData(range: Range, pts: EquityDataPoint[]): EquityDataPoint[] {
  const now = new Date()
  const cutoffs: Record<Range, Date> = {
    Today: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    '1W':  new Date(Date.now() - 7  * 86400000),
    '1M':  new Date(Date.now() - 30 * 86400000),
    '3M':  new Date(Date.now() - 90 * 86400000),
    YTD:   new Date(now.getFullYear(), 0, 1),
    All:   new Date('2026-04-20'),
  }
  return pts.filter((d) => new Date(d.date) >= cutoffs[range])
}

export function PnLChart({ data }: Props) {
  const [liveData, setLiveData] = useState<PortfolioHistory | null>(data)
  const [activeRange, setActiveRange] = useState<Range>('All')

  useEffect(() => {
    fetch('/api/portfolio-history')
      .then((r) => r.json())
      .then((d: PortfolioHistory) => setLiveData(d))
      .catch(() => {}) // keep last known data on error
  }, [])

  const filtered = useMemo(
    () => (liveData ? filterData(activeRange, liveData.history ?? []) : []),
    [activeRange, liveData],
  )

  if (!liveData || !liveData.history?.length) {
    return (
      <Card padded={false}>
        <div className="flex items-baseline justify-between px-6 pt-5 pb-2">
          <h3 className="text-sm font-semibold tracking-[0.18em] uppercase">Portfolio Value</h3>
        </div>
        <div className="flex items-center justify-center h-40 text-muted text-sm px-6 pb-6">
          No data yet — run your first analysis to start tracking
        </div>
      </Card>
    )
  }

  const { startEquity, currentEquity, totalReturn } = liveData
  const lineColor  = currentEquity >= startEquity ? '#00B386' : '#FF4444'
  const totalUp    = totalReturn >= 0
  const returnSign = totalReturn >= 0 ? '+' : ''

  const chartData = filtered.map((d) => ({
    ...d,
    label: new Date(d.date + 'T12:00:00Z').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }),
  }))

  const equities  = filtered.length > 0 ? filtered.map((d) => d.equity) : [startEquity]
  const minEquity = Math.min(...equities, startEquity)
  const maxEquity = Math.max(...equities, startEquity)
  const padding   = (maxEquity - minEquity) * 0.1 || 500

  const singlePoint = chartData.length === 1

  return (
    <Card padded={false}>
      <div className="flex items-baseline justify-between px-6 pt-5 pb-2">
        <div className="flex items-baseline gap-3">
          <h3 className="text-sm font-semibold tracking-[0.18em] uppercase">Portfolio Value</h3>
        </div>
        <div className="flex items-center gap-4">
          <div className={`num text-sm font-semibold ${totalUp ? 'text-green' : 'text-red'}`}>
            {returnSign}{(totalReturn * 100).toFixed(2)}%
            <span className="text-muted font-normal text-[11px] ml-1">total return</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] tracking-wider uppercase text-muted">
            {RANGES.map((t) => (
              <button
                key={t}
                onClick={() => setActiveRange(t)}
                className={`px-2 py-1 rounded transition ${
                  activeRange === t ? 'bg-white/[0.06] text-text' : 'hover:text-text'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="px-2 pb-3">
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" />
            <XAxis
              dataKey="label"
              tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[minEquity - padding, maxEquity + padding]}
              tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#13131a', border: '1px solid #1E1E2E', borderRadius: 8 }}
              labelStyle={{ color: '#94a3b8' }}
              formatter={(value) => [formatCurrency(Number(value)), 'Equity']}
            />
            <ReferenceLine
              y={startEquity}
              stroke="#475569"
              strokeDasharray="4 4"
              label={{ value: '$100k baseline', fill: '#475569', fontSize: 10, position: 'insideTopRight' }}
            />
            <Line
              type="monotone"
              dataKey="equity"
              stroke={lineColor}
              strokeWidth={singlePoint ? 0 : 2}
              dot={singlePoint ? { r: 6, fill: lineColor, strokeWidth: 0 } : false}
              activeDot={{ r: 4, fill: lineColor }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
