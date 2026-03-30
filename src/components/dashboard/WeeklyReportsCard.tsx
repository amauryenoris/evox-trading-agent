import type { WeeklyReportRecord } from '@/lib/db'

interface Props {
  reports: WeeklyReportRecord[]
}

export function WeeklyReportsCard({ reports }: Props) {
  return (
    <div className="bg-[#13131a] border border-[#1e1e2e] rounded-xl p-4">
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
        Weekly Reports ({reports.length})
      </h2>
      {reports.length === 0 ? (
        <p className="text-slate-600 text-sm py-6 text-center">
          No reports yet — generate your first weekly report
        </p>
      ) : (
        <div className="space-y-2">
          {reports.map((r) => {
            const pnl = r.summary?.pnlUSD ?? 0
            const pnlPct = r.summary?.pnlPct ?? 0
            const isPositive = pnl >= 0
            const tradesExecuted = r.summary?.tradesExecuted ?? 0
            const winRate = r.summary?.winRate ?? 0

            return (
              <div key={r.id} className="border border-[#1e1e2e] rounded-lg p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-300 font-medium">
                      {r.weekStart} → {r.weekEnd}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className={`text-xs font-medium ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                        {isPositive ? '+' : ''}${pnl.toFixed(2)} ({isPositive ? '+' : ''}{(pnlPct * 100).toFixed(1)}%)
                      </span>
                      <span className="text-xs text-slate-600">
                        {tradesExecuted} trades · {(winRate * 100).toFixed(0)}% win
                      </span>
                    </div>
                  </div>
                  <a
                    href={`/api/reports/${r.id}/download`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-xs px-3 py-1.5 bg-[#1daa6c]/10 hover:bg-[#1daa6c]/20 text-[#1daa6c] rounded-lg transition-colors"
                  >
                    PDF ↓
                  </a>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
