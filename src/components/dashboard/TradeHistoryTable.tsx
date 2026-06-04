import type { AlpacaOrder } from '@/lib/types'
import { Card, Badge } from './ui'

const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ')

interface Props {
  orders: AlpacaOrder[]
}

export function TradeHistoryTable({ orders }: Props) {
  const items = orders.slice(0, 50)

  return (
    <Card padded={false}>
      <div className="flex items-baseline justify-between px-6 pt-5 pb-3">
        <h3 className="text-sm font-semibold tracking-[0.18em] uppercase">Trade History</h3>
        {/* ADAPTED: Export CSV is decorative — no handler implemented */}
        <button className="text-[11px] text-muted hover:text-text">Export CSV</button>
      </div>

      {items.length === 0 ? (
        <p className="px-6 pb-8 text-center text-sm text-muted">No executed trades yet</p>
      ) : (
        <div className="max-h-[640px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface z-10">
              <tr className="text-[10px] tracking-[0.14em] uppercase text-muted border-b border-border">
                <th className="text-left font-medium py-2.5 px-6">Time</th>
                <th className="text-left font-medium py-2.5 pr-4">Symbol</th>
                <th className="text-left font-medium py-2.5 pr-4">Side</th>
                <th className="text-right font-medium py-2.5 pr-4">Qty</th>
                <th className="text-right font-medium py-2.5 pr-4">Price</th>
                <th className="text-right font-medium py-2.5 pr-6">Total</th>
                {/* ADAPTED: P&L column absent — AlpacaOrder has no pnlUSD; omitted */}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((o) => {
                const price = o.filled_avg_price ? parseFloat(o.filled_avg_price) : 0
                const qty   = parseFloat(o.filled_qty)
                const total = price * qty
                const isBuy = o.side === 'buy'
                const date  = o.filled_at
                  ? new Date(o.filled_at).toLocaleString('en-US', {
                      month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                      timeZone: 'America/New_York',
                    })
                  : '—'

                return (
                  <tr key={o.id} className="hover:bg-white/[0.015] transition">
                    <td className="py-3 px-6 num text-[11px] text-muted whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <span className={cx(
                          'w-1 h-6 rounded-full opacity-80',
                          isBuy ? 'bg-green' : 'bg-red',
                        )} />
                        {date}
                      </div>
                    </td>
                    <td className="py-3 pr-4 font-semibold">{o.symbol}</td>
                    <td className="py-3 pr-4">
                      <Badge tone={isBuy ? 'green' : 'red'} size="xs">
                        {o.side.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4 text-right num text-mute2">{qty}</td>
                    <td className="py-3 pr-4 text-right num">${price.toFixed(2)}</td>
                    <td className="py-3 pr-6 text-right num text-mute2">
                      ${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
