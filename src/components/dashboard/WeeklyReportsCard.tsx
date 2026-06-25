'use client'

import { useState } from 'react'
import type { ReportRecord } from '@/lib/db'
import { Card } from './ui'

const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ')

// ADAPTED: pnlPct from ReportSummary is a 0–1 decimal; multiplied by 100 for display
const fmtPct = (n: number, dp = 2) => (n >= 0 ? '+' : '') + n.toFixed(dp) + '%'

interface Props {
  reports: ReportRecord[]
}

export function WeeklyReportsCard({ reports }: Props) {
  const [open, setOpen] = useState<number | null>(0)

  if (reports.length === 0) {
    return (
      <Card>
        <p className="py-6 text-center text-sm text-muted">
          No reports yet — generate your first weekly report
        </p>
      </Card>
    )
  }

  return (
    <Card padded={false}>
      <div className="flex items-baseline justify-between px-6 pt-5 pb-3">
        <h3 className="text-sm font-semibold tracking-[0.18em] uppercase">Weekly Reports</h3>
        <span className="text-[11px] text-muted">{reports.length} archived</span>
      </div>

      <div className="divide-y divide-border">
        {reports.map((r, i) => {
          const isOpen      = open === i
          const pnl         = r.summary?.pnlUSD ?? 0
          // ADAPTED: pnlPct is 0–1 decimal → multiply by 100 for percentage display
          const pnlPct      = (r.summary?.pnlPct ?? 0) * 100
          const up          = pnl >= 0
          const trades      = r.summary?.tradesExecuted ?? 0
          // ADAPTED: winRate is 0–1 decimal → multiply by 100
          const winRate     = (r.summary?.winRate ?? 0) * 100
          const range       = `${r.weekStart} — ${r.weekEnd}`

          const summaryItems = [
            { l: 'Realized P&L', v: (up ? '+' : '-') + '$' + Math.abs(pnl).toFixed(2), t: up ? 'green' : 'red' },
            { l: 'Return %',     v: fmtPct(pnlPct, 2),                                  t: up ? 'green' : 'red' },
            { l: 'Trades',       v: String(trades),                                      t: 'neutral'            },
            { l: 'Win Rate',     v: winRate.toFixed(0) + '%',                            t: winRate >= 50 ? 'green' : 'amber' },
          ] as const

          return (
            <div key={r.id}>
              {/* Collapsed row — click to toggle */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => setOpen(isOpen ? null : i)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(isOpen ? null : i) } }}
                className="w-full px-6 py-3.5 flex items-center gap-4 hover:bg-white/[0.015] transition text-left cursor-pointer select-none"
              >
                <span className="num text-[11px] text-mute2 w-44 shrink-0">{range}</span>
                <span className={cx('num font-semibold text-sm w-32 shrink-0', up ? 'text-green' : 'text-red')}>
                  {(up ? '+' : '-') + '$' + Math.abs(pnl).toFixed(2)}
                  <span className="font-normal opacity-70 text-[10.5px] ml-1">({fmtPct(pnlPct, 2)})</span>
                </span>
                <span className="num text-[11px] text-muted flex-1">
                  {trades} trades · {winRate.toFixed(0)}% win
                </span>
                <span className="text-[11px] text-muted hidden sm:inline">
                  {isOpen ? 'Hide' : 'Open'}
                </span>
                <a
                  href={`/api/reports/${r.id}/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-[11px] px-2.5 py-1 rounded border border-border text-mute2 hover:text-text hover:border-border2 transition"
                >
                  PDF ↓
                </a>
                <svg
                  width="12" height="12" viewBox="0 0 12 12" fill="none"
                  style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}
                >
                  <path d="M3 5l3 3 3-3" stroke="#64748B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>

              {/* Expanded detail */}
              {isOpen && (
                <div className="px-6 pb-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-[12px]">
                  {summaryItems.map((k) => (
                    <div key={k.l} className="bg-surface2 border border-border rounded p-3">
                      <div className="text-[10px] uppercase tracking-wider text-muted">{k.l}</div>
                      <div className={cx(
                        'num font-semibold mt-1',
                        k.t === 'green' ? 'text-green' : k.t === 'red' ? 'text-red' : k.t === 'amber' ? 'text-amber' : 'text-text',
                      )}>
                        {k.v}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
