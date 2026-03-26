import { formatCurrency, formatPct } from '@/lib/utils'
import type { PortfolioSummary } from '@/lib/types'

interface Props {
  data: PortfolioSummary | null
}

function Metric({ label, value, sub, positive }: { label: string; value: string; sub?: string; positive?: boolean }) {
  const color =
    positive === undefined
      ? 'text-slate-100'
      : positive
      ? 'text-green-400'
      : 'text-red-400'

  return (
    <div className="bg-[#13131a] border border-[#1e1e2e] rounded-xl p-4">
      <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-semibold ${color}`}>{value}</p>
      {sub && <p className={`text-sm mt-0.5 ${color}`}>{sub}</p>}
    </div>
  )
}

export function PortfolioOverviewCard({ data }: Props) {
  if (!data) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-[#13131a] border border-[#1e1e2e] rounded-xl p-4 animate-pulse h-24" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Metric label="Total Equity" value={formatCurrency(data.equity)} />
      <Metric label="Available Cash" value={formatCurrency(data.cash)} />
      <Metric
        label="Total P&L"
        value={formatCurrency(data.totalPnL)}
        sub={formatPct(data.totalPnLPct)}
        positive={data.totalPnL >= 0}
      />
      <Metric
        label="Today's P&L"
        value={formatCurrency(data.todayPnL)}
        sub={formatPct(data.todayPnLPct)}
        positive={data.todayPnL >= 0}
      />
    </div>
  )
}
