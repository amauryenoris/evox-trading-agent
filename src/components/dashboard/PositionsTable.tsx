import { formatCurrency, formatPct } from '@/lib/utils'
import type { PositionDisplay } from '@/lib/types'

interface Props {
  positions: PositionDisplay[]
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
              {positions.map((p) => (
                <tr key={p.symbol} className="border-b border-[#1e1e2e] last:border-0">
                  <td className="py-2.5 font-medium text-slate-100">{p.symbol}</td>
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
