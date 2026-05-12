import type { TradingPattern } from '@/lib/types'

const SIGNAL_BADGE: Record<string, { label: string; className: string }> = {
  MEAN_REVERSION: { label: 'MR',    className: 'bg-blue-900/60 text-blue-300 border border-blue-700' },
  TREND_PULLBACK: { label: 'TP',    className: 'bg-green-900/60 text-green-300 border border-green-700' },
  TREND_ZLE05:    { label: 'ZLE',   className: 'bg-yellow-900/60 text-yellow-300 border border-yellow-700' },
  TREND:          { label: 'TREND', className: 'bg-green-900/60 text-green-300 border border-green-700' },
  EMA_RECLAIM:    { label: 'EMA',   className: 'bg-purple-900/60 text-purple-300 border border-purple-700' },
}

interface Props {
  patterns: TradingPattern[]
}

export function PatternLibraryCard({ patterns }: Props) {
  const ranked = patterns.filter((p) => p.sampleCount >= 1).slice(0, 10)

  return (
    <div className="bg-[#13131a] border border-[#1e1e2e] rounded-xl p-4">
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
        Pattern Library ({patterns.length} patterns)
      </h2>
      {ranked.length === 0 ? (
        <p className="text-slate-600 text-sm py-6 text-center">
          Patterns appear after 1+ completed trades
        </p>
      ) : (
        <div className="space-y-2">
          {ranked.map((p) => {
            const winPct = (p.winRate * 100).toFixed(0)
            const avgPnL = p.avgPnLPct >= 0 ? `+${p.avgPnLPct.toFixed(1)}%` : `${p.avgPnLPct.toFixed(1)}%`
            const isGood = p.winRate >= 0.6
            const symbol = p.id.split('_').pop() ?? ''
            const signalBadge = p.signalType ? SIGNAL_BADGE[p.signalType] : null
            return (
              <div key={p.id} className="border border-[#1e1e2e] rounded-lg p-3">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {symbol && (
                      <span className="text-xs font-bold text-slate-100 bg-[#1e1e2e] px-1.5 py-0.5 rounded shrink-0">
                        {symbol}
                      </span>
                    )}
                    <p className="text-xs text-slate-300 leading-relaxed">{p.description}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {signalBadge && (
                      <span className={`text-xs px-1.5 py-0.5 rounded font-mono font-medium ${signalBadge.className}`}>
                        {signalBadge.label}
                      </span>
                    )}
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        p.action === 'BUY'
                          ? 'bg-green-400/10 text-green-400'
                          : 'bg-red-400/10 text-red-400'
                      }`}
                    >
                      {p.action}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/* Win rate bar */}
                  <div className="flex-1 bg-[#0a0a0f] rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${isGood ? 'bg-green-500' : 'bg-amber-500'}`}
                      style={{ width: `${winPct}%` }}
                    />
                  </div>
                  <span className={`text-xs font-medium ${isGood ? 'text-green-400' : 'text-amber-400'}`}>
                    {winPct}% win
                  </span>
                  <span className={`text-xs ${p.avgPnLPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {avgPnL} avg
                  </span>
                  <span className="text-xs text-slate-600">{p.sampleCount} trades</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
