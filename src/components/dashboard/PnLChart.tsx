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
      <div className="bg-[#13131a] border border-[#1e1e2e] rounded-xl p-4">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
          Portfolio Value Over Time
        </h2>
        <div className="flex items-center justify-center h-40 text-slate-600 text-sm">
          No data yet — run your first analysis to start tracking
        </div>
      </div>
    )
  }

  const { history, startEquity, currentEquity, totalReturn } = data
  const lineColor = currentEquity >= startEquity ? '#00B386' : '#FF4444'
  const returnSign = totalReturn >= 0 ? '+' : ''

  // Format dates for X axis display
  const chartData = history.map((d) => ({
    ...d,
    label: new Date(d.date + 'T12:00:00Z').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }),
  }))

  const equities = history.map((d) => d.equity)
  const minEquity = Math.min(...equities, startEquity)
  const maxEquity = Math.max(...equities, startEquity)
  const padding = (maxEquity - minEquity) * 0.1 || 500

  return (
    <div className="bg-[#13131a] border border-[#1e1e2e] rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
          Portfolio Value Over Time
        </h2>
        <span className="text-sm font-medium" style={{ color: lineColor }}>
          {returnSign}{(totalReturn * 100).toFixed(2)}% total return
        </span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
          <XAxis
            dataKey="label"
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[minEquity - padding, maxEquity + padding]}
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
          />
          <Tooltip
            contentStyle={{ backgroundColor: '#13131a', border: '1px solid #1e1e2e', borderRadius: 8 }}
            labelStyle={{ color: '#94a3b8' }}
            formatter={(value) => [formatCurrency(Number(value)), 'Equity']}
          />
          <ReferenceLine
            y={startEquity}
            stroke="#475569"
            strokeDasharray="4 4"
            label={{ value: '$100k', fill: '#475569', fontSize: 10, position: 'insideTopRight' }}
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
  )
}
