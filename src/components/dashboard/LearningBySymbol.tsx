'use client'

import { useState } from 'react'
import type { SymbolGroup } from '@/lib/trade-views'
import { Badge, SignalBadge } from './ui'

const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ')

function fmtPct(n: number | null): string {
  if (n == null) return '—'
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'
}

function fmtWinRate(n: number | null): string {
  if (n == null) return '—'
  return (n * 100).toFixed(0) + '%'
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    timeZone: 'America/New_York',
  })
}

function toneFor(n: number | null): string {
  if (n == null) return 'text-muted'
  return n >= 0 ? 'text-green' : 'text-red'
}

interface Props {
  groups: SymbolGroup[]
}

export function LearningBySymbol({ groups }: Props) {
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-muted">{'Small samples are context, not statistics'}</p>

      <div className="divide-y divide-border">
        {groups.map((group) => {
          const isExpanded = expandedSymbol === group.symbol

          return (
            <div key={group.symbol} className="py-4">
              <button
                type="button"
                onClick={() => setExpandedSymbol(isExpanded ? null : group.symbol)}
                aria-expanded={isExpanded}
                className="w-full flex items-center gap-4 text-left hover:bg-white/[0.015] transition"
              >
                <span className="font-semibold w-16 shrink-0">{group.symbol}</span>
                <span className="num text-[11px] text-mute2 w-14 shrink-0">n={group.summary.n}</span>
                <span className="num text-[11px] text-mute2 w-20 shrink-0">
                  {fmtWinRate(group.summary.winRate)} win
                </span>
                <span className={cx('num text-sm font-semibold w-20 shrink-0', toneFor(group.summary.avgPnlPct))}>
                  {fmtPct(group.summary.avgPnlPct)}
                </span>
                <span className="num text-[11px] text-muted flex-1 text-right">
                  median {fmtPct(group.summary.medianPnlPct)}
                </span>
                <span className="text-[11px] text-muted ml-2 shrink-0">{isExpanded ? 'Hide' : 'Expand'}</span>
              </button>

              <div className="mt-2 pl-1 space-y-1.5">
                {Object.entries(group.bySetup).map(([setup, s]) => (
                  <div key={setup} className="flex items-center gap-3 text-[11.5px]">
                    <SignalBadge signal={setup} size="xs" />
                    <span className="num text-mute2">n={s.n}</span>
                    <span className="num text-mute2">{fmtWinRate(s.winRate)} win</span>
                    <span className={cx('num', toneFor(s.avgPnlPct))}>{fmtPct(s.avgPnlPct)}</span>
                    {s.lowSample && <Badge tone="neutral" size="xs">{'small sample (n<5)'}</Badge>}
                  </div>
                ))}
              </div>

              {isExpanded && (
                <div className="mt-3 pl-3 space-y-1.5 border-l border-border2">
                  {group.trades.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 text-[11.5px] pl-3">
                      <span className="num text-muted w-24 shrink-0">{fmtDate(t.sellTimestamp)}</span>
                      <SignalBadge signal={t.signal_type ?? 'UNKNOWN'} size="xs" />
                      <span className={cx('num', toneFor(t.pnlPct))}>{fmtPct(t.pnlPct)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
