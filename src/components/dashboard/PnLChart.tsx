'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { AgentLogEntry } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'

interface Props {
  entries: AgentLogEntry[]
}

export function PnLChart({ entries }: Props) {
  // Build one data point per unique timestamp (one per analysis cycle)
  const seen = new Set<string>()
  const data = entries
    .slice()
    .reverse() // oldest first for charting
    .filter((e) => {
      if (seen.has(e.timestamp)) return false
      seen.add(e.timestamp)
      return true
    })
    .map((e) => ({
      date: new Date(e.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      equity: parseFloat(e.portfolioSnapshot.equity),
    }))

  if (data.length === 0) {
    return (
      <div className="bg-[#13131a] border border-[#1e1e2e] rounded-xl p-4">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Portfolio Value Over Time</h2>
        <div className="flex items-center justify-center h-40 text-slate-600 text-sm">
          No data yet — run your first analysis to start tracking
        </div>
      </div>
    )
  }

  const minEquity = Math.min(...data.map((d) => d.equity))
  const maxEquity = Math.max(...data.map((d) => d.equity))
  const padding = (maxEquity - minEquity) * 0.1 || 500

  return (
    <div className="bg-[#13131a] border border-[#1e1e2e] rounded-xl p-4">
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Portfolio Value Over Time</h2>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
          <XAxis
            dataKey="date"
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
          <Line
            type="monotone"
            dataKey="equity"
            stroke="#6366f1"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#6366f1' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
