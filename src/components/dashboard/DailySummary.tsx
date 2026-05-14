import { Card } from './ui'
import type { PortfolioSummary } from '@/lib/types'

const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ')

// ADAPTED: Components.jsx DailySummary uses tradesClosedToday/realizedToday/unrealizedToday
// which are absent from PortfolioSummary. Cells remapped to available fields.
const fmtUSD = (n: number, dp = 2) =>
  (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  })
const fmtSigned = (n: number, dp = 2) =>
  (n >= 0 ? '+' : '') + n.toLocaleString('en-US', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  })
const fmtPct = (n: number, dp = 2) => (n >= 0 ? '+' : '') + n.toFixed(dp) + '%'

interface Props {
  portfolio: PortfolioSummary | null
}

interface Cell {
  label: string
  value: string
  tone: 'green' | 'red' | 'neutral'
  strong?: boolean
}

export function DailySummary({ portfolio: p }: Props) {
  if (!p) return null

  const rows: Cell[] = [
    {
      label: 'Portfolio Equity',
      value: fmtUSD(p.equity, 0),
      tone: 'neutral',
    },
    {
      label: 'Today P&L',
      // ADAPTED: todayPnL is the correct field (was dayPnL in design mock)
      value: (p.todayPnL >= 0 ? '+' : '-') + '$' + Math.abs(p.todayPnL).toFixed(2),
      tone: p.todayPnL >= 0 ? 'green' : 'red',
    },
    {
      label: "Today's Return",
      // ADAPTED: todayPnLPct is a decimal fraction (0.02 = 2%) — multiplied by 100
      value: fmtPct(p.todayPnLPct * 100, 2),
      tone: p.todayPnLPct >= 0 ? 'green' : 'red',
    },
    {
      label: 'All-Time P&L',
      value: (p.totalPnL >= 0 ? '+' : '-') + '$' + Math.abs(p.totalPnL).toFixed(2)
        + ' (' + fmtPct(p.totalPnLPct * 100, 1) + ')',
      tone: p.totalPnL >= 0 ? 'green' : 'red',
      strong: true,
    },
    {
      label: 'Cash Available',
      value: fmtUSD(p.cash),
      tone: 'neutral',
    },
    {
      label: 'Buying Power',
      value: fmtUSD(p.buyingPower),
      tone: 'neutral',
    },
  ]

  const toneClass: Record<Cell['tone'], string> = {
    green:   'text-green',
    red:     'text-red',
    neutral: 'text-text',
  }

  return (
    <Card padded={false}>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-y md:divide-y-0 md:divide-x divide-border">
        {rows.map((r) => (
          <div key={r.label} className="px-5 py-4">
            <div className="text-[10px] tracking-[0.14em] uppercase text-muted">{r.label}</div>
            <div className={cx(
              'num mt-1.5',
              r.strong ? 'text-lg font-semibold' : 'text-base font-medium',
              toneClass[r.tone],
            )}>
              {r.value}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
