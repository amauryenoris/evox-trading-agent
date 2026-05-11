import { formatCurrency, formatPct } from '@/lib/utils'
import type { PositionDisplay } from '@/lib/types'

interface Props {
  positions: PositionDisplay[]
}

const SIGNAL_BADGE: Record<string, { label: string; className: string }> = {
  MEAN_REVERSION: { label: 'MR',    className: 'bg-blue-900/60 text-blue-300 border border-blue-700' },
  TREND_PULLBACK: { label: 'TP',    className: 'bg-green-900/60 text-green-300 border border-green-700' },
  TREND_ZLE05:    { label: 'ZLE',   className: 'bg-yellow-900/60 text-yellow-300 border border-yellow-700' },
  TREND:          { label: 'TREND', className: 'bg-green-900/60 text-green-300 border border-green-700' },
  EMA_RECLAIM:    { label: 'EMA',   className: 'bg-purple-900/60 text-purple-300 border border-purple-700' },
}

const ACTIVATION_PCT: Record<string, number> = {
  MEAN_REVERSION: 0.05,
  TREND:          0.06,
  TREND_PULLBACK: 0.06,
  TREND_ZLE05:    0.03,
  EMA_RECLAIM:    0.04,
  default:        0.05,
}

function TrailingStatus({ p }: { p: PositionDisplay }) {
  const trailingStop = p.trailingStop ?? null

  if (p.trailingActivated && trailingStop !== null) {
    const distPct = ((p.currentPrice - trailingStop) / p.currentPrice) * 100
    return (
      <span className="text-green-400">
        Trail: {formatCurrency(trailingStop)}{' '}
        <span className="text-green-600">(-{distPct.toFixed(2)}% to stop)</span>
      </span>
    )
  }

  if (p.trailingActivated && trailingStop === null) {
    return <span className="text-yellow-400">Trail: calculating...</span>
  }

  const signal = p.signalType ?? 'default'
  const activationPct = (ACTIVATION_PCT[signal] ?? ACTIVATION_PCT['default']) * 100
  return (
    <span className="text-slate-500">
      Trail: inactive{' '}
      <span className="text-slate-600">(activates at +{activationPct.toFixed(0)}%)</span>
    </span>
  )
}

export function PositionsTable({ positions }: Props) {
  return (
    <div className="bg-[#13131a] border border-[#1e1e2e] rounded-xl p-4">
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
        Open Positions ({positions.length})
      </h2>
      {positions.length === 0 ? (
        <p className="text-slate-600 text-sm py-6 text-center">No open positions</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 border-b border-[#1e1e2e]">
                <th className="text-left pb-2">Symbol</th>
                <th className="text-right pb-2">Shares</th>
                <th className="text-right pb-2">Avg Cost</th>
                <th className="text-right pb-2">Price</th>
                <th className="text-right pb-2">Value</th>
                <th className="text-right pb-2">P&L</th>
                <th className="text-right pb-2">Today</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => {
                const badge = p.signalType ? SIGNAL_BADGE[p.signalType] : null
                return (
                  <tr key={p.symbol} className="border-b border-[#1e1e2e] last:border-0">
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-100">{p.symbol}</span>
                        {badge && (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${badge.className}`}>
                            {badge.label}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] mt-0.5">
                        <TrailingStatus p={p} />
                      </div>
                    </td>
                    <td className="py-2.5 text-right text-slate-300">{p.qty}</td>
                    <td className="py-2.5 text-right text-slate-300">{formatCurrency(p.avgEntryPrice)}</td>
                    <td className="py-2.5 text-right text-slate-300">{formatCurrency(p.currentPrice)}</td>
                    <td className="py-2.5 text-right text-slate-300">{formatCurrency(p.marketValue)}</td>
                    <td className={`py-2.5 text-right font-medium ${p.unrealizedPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatCurrency(p.unrealizedPnL)}{' '}
                      <span className="text-xs">({formatPct(p.unrealizedPnLPct)})</span>
                    </td>
                    <td className={`py-2.5 text-right text-xs ${p.changeToday >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatPct(p.changeToday)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
