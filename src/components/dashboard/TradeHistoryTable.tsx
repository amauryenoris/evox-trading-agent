import type { TradeEvaluation } from '@/lib/types'
import { Card, Badge, SignalBadge } from './ui'

const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ')

interface Props {
  trades: TradeEvaluation[]
}

export function TradeHistoryTable({ trades }: Props) {
  return (
    <Card padded={false}>
      <div className="flex items-baseline justify-between px-6 pt-5 pb-3">
        <h3 className="text-sm font-semibold tracking-[0.18em] uppercase">Trade History</h3>
        <button className="text-[11px] text-muted hover:text-text">Export CSV</button>
      </div>

      {trades.length === 0 ? (
        <p className="px-6 pb-8 text-center text-sm text-muted">No executed trades yet</p>
      ) : (
        <div className="max-h-[640px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface z-10">
              <tr className="text-[10px] tracking-[0.14em] uppercase text-muted border-b border-border">
                <th className="text-left font-medium py-2.5 px-6">Date</th>
                <th className="text-left font-medium py-2.5 pr-4">Symbol</th>
                <th className="text-left font-medium py-2.5 pr-4">Signal</th>
                <th className="text-right font-medium py-2.5 pr-4">Entry</th>
                <th className="text-right font-medium py-2.5 pr-4">Exit</th>
                <th className="text-right font-medium py-2.5 pr-4">Qty</th>
                <th className="text-right font-medium py-2.5 pr-4">P&L%</th>
                <th className="text-right font-medium py-2.5 pr-6">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {trades.map((t) => {
                const date = t.sellTimestamp
                  ? new Date(t.sellTimestamp).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                      timeZone: 'America/New_York',
                    })
                  : '—'
                const pnlPct = t.pnlPct
                const isProfit = pnlPct > 0
                const isLoss   = pnlPct < 0

                return (
                  <tr key={t.id} className="hover:bg-white/[0.015] transition">
                    <td className="py-3 px-6 num text-[11px] text-muted whitespace-nowrap">{date}</td>
                    <td className="py-3 pr-4 font-semibold">{t.symbol}</td>
                    <td className="py-3 pr-4">
                      <SignalBadge signal={t.signal_type ?? null} size="xs" />
                    </td>
                    <td className="py-3 pr-4 text-right num">${t.buyPrice.toFixed(2)}</td>
                    <td className="py-3 pr-4 text-right num">${t.sellPrice.toFixed(2)}</td>
                    <td className="py-3 pr-4 text-right num text-mute2">{t.quantity}</td>
                    <td className={cx(
                      'py-3 pr-4 text-right num',
                      isProfit ? 'text-green' : isLoss ? 'text-red' : 'text-muted',
                    )}>
                      {isProfit ? '+' : ''}{pnlPct.toFixed(2)}%
                    </td>
                    <td className="py-3 pr-6 text-right">
                      <Badge
                        tone={t.outcome === 'profit' ? 'green' : t.outcome === 'loss' ? 'red' : 'neutral'}
                        size="xs"
                      >
                        {t.outcome}
                      </Badge>
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
