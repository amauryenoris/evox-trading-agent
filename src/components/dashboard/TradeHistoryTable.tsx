import { formatCurrency, formatDate } from '@/lib/utils'
import type { AlpacaOrder } from '@/lib/types'

interface Props {
  orders: AlpacaOrder[]
}

export function TradeHistoryTable({ orders }: Props) {
  return (
    <div className="bg-[#13131a] border border-[#1e1e2e] rounded-xl p-4">
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Trade History</h2>
      {orders.length === 0 ? (
        <p className="text-slate-600 text-sm py-6 text-center">No executed trades yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 border-b border-[#1e1e2e]">
                <th className="text-left pb-2">Symbol</th>
                <th className="text-left pb-2">Side</th>
                <th className="text-right pb-2">Qty</th>
                <th className="text-right pb-2">Avg Price</th>
                <th className="text-right pb-2">Total</th>
                <th className="text-right pb-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {orders.slice(0, 20).map((o) => {
                const price = o.filled_avg_price ? parseFloat(o.filled_avg_price) : 0
                const qty = parseFloat(o.filled_qty)
                const total = price * qty
                return (
                  <tr key={o.id} className="border-b border-[#1e1e2e] last:border-0">
                    <td className="py-2.5 font-medium text-slate-100">{o.symbol}</td>
                    <td className="py-2.5">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          o.side === 'buy'
                            ? 'bg-green-400/10 text-green-400'
                            : 'bg-red-400/10 text-red-400'
                        }`}
                      >
                        {o.side.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2.5 text-right text-slate-300">{qty}</td>
                    <td className="py-2.5 text-right text-slate-300">{formatCurrency(price)}</td>
                    <td className="py-2.5 text-right text-slate-300">{formatCurrency(total)}</td>
                    <td className="py-2.5 text-right text-slate-500 text-xs">
                      {o.filled_at ? formatDate(o.filled_at) : '—'}
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
