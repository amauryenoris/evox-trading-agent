'use client'

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

export function PnLChart({ data }: Props) {
  if (!data || data.history.length === 0) {
    return (
      <Card padded={false}>
        <div className="flex items-baseline justify-between px-6 pt-5 pb-2">
          <h3 className="text-sm font-semibold tracking-[0.18em] uppercase">Portfolio Value</h3>
          <span className="text-[11px] text-muted">Last 30 trading days</span>
        </div>
        <div className="flex items-center justify-center h-40 text-muted text-sm px-6 pb-6">
          No data yet — run your first analysis to start tracking
        </div>
      </Card>
    )
  }

  const { history, startEquity, currentEquity, totalReturn } = data
  const lineColor  = currentEquity >= startEquity ? '#00B386' : '#FF4444'
  const totalUp    = totalReturn >= 0
  const returnSign = totalReturn >= 0 ? '+' : ''

  const chartData = history.map((d) => ({
    ...d,
    label: new Date(d.date + 'T12:00:00Z').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }),
  }))

  const equities  = history.map((d) => d.equity)
  const minEquity = Math.min(...equities, startEquity)
  const maxEquity = Math.max(...equities, startEquity)
  const padding   = (maxEquity - minEquity) * 0.1 || 500

  return (
    <Card padded={false}>
      <div className="flex items-baseline justify-between px-6 pt-5 pb-2">
        <div className="flex items-baseline gap-3">
          <h3 className="text-sm font-semibold tracking-[0.18em] uppercase">Portfolio Value</h3>
          <span className="text-[11px] text-muted">Last 30 trading days</span>
        </div>
        <div className="flex items-center gap-4">
          {/* ADAPTED: totalReturn from PortfolioHistory (0-1 decimal) — multiplied by 100 for display */}
          <div className={`num text-sm font-semibold ${totalUp ? 'text-green' : 'text-red'}`}>
            {returnSign}{(totalReturn * 100).toFixed(2)}%
            <span className="text-muted font-normal text-[11px] ml-1">total return</span>
          </div>
          {/* ADAPTED: time range selector is decorative — no filter implemented (recharts uses all history) */}
          <div className="flex items-center gap-1 text-[10px] tracking-wider uppercase text-muted">
            {['1W', '1M', '3M', 'YTD', 'ALL'].map((t, i) => (
              <button
                key={t}
                className={`px-2 py-1 rounded transition ${i === 1 ? 'bg-white/[0.06] text-text' : 'hover:text-text'}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="px-2 pb-3">
        {/* ADAPTED: recharts kept instead of pure SVG — was already adapted in previous session */}
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
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: lineColor }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
