'use client'

import { useState } from 'react'
import type { TimelineEntry } from '@/lib/trade-views'
import { Badge, SignalBadge } from './ui'

const PAGE_SIZE = 30

const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ')

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    timeZone: 'America/New_York',
  })
}

function fmtSignedPct(n: number): string {
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'
}

interface Props {
  entries: TimelineEntry[]
}

export function LearningTimeline({ entries }: Props) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const visible = entries.slice(0, visibleCount)
  const hasMore = entries.length > visibleCount

  return (
    <div className="divide-y divide-border">
      {visible.map((entry) => {
        const isExpanded = expandedId === entry.id
        const isProfit = entry.outcome === 'profit'
        const isLoss = entry.outcome === 'loss'

        return (
          <div key={entry.id}>
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : entry.id)}
              aria-expanded={isExpanded}
              className="w-full flex items-center gap-4 py-3 text-left hover:bg-white/[0.015] transition"
            >
              <span className="num text-[11px] text-muted w-28 shrink-0">{fmtDate(entry.sellTimestamp)}</span>
              <span className="font-semibold w-16 shrink-0">{entry.symbol}</span>
              <span className="w-32 shrink-0">
                <SignalBadge signal={entry.setup} size="xs" />
              </span>
              <span
                className={cx(
                  'num text-sm font-semibold w-20 shrink-0 text-right',
                  isProfit ? 'text-green' : isLoss ? 'text-red' : 'text-muted',
                )}
              >
                {fmtSignedPct(entry.pnlPct)}
              </span>
              <span className="num text-[11px] text-mute2 flex-1 text-right">{entry.holdingDays}d held</span>
              <span className="text-[11px] text-muted ml-2 shrink-0">{isExpanded ? 'Hide' : 'Expand'}</span>
            </button>

            {isExpanded && (
              <div className="pb-4 pt-1 text-[12.5px] text-mute2 space-y-2">
                <div className="flex items-center gap-4 num">
                  <span>Buy ${entry.buyPrice.toFixed(2)}</span>
                  <span>Sell ${entry.sellPrice.toFixed(2)}</span>
                </div>
                {entry.fingerprintChips.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {entry.fingerprintChips.map((chip) => (
                      <Badge key={chip} tone="ghost" size="xs">{chip}</Badge>
                    ))}
                  </div>
                )}
                {entry.lessons.length > 0 && (
                  <ul className="list-disc list-inside space-y-1">
                    {entry.lessons.map((lesson, i) => (
                      <li key={i}>{lesson}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )
      })}

      {hasMore && (
        <div className="py-4 text-center">
          <button
            type="button"
            onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
            className="text-[11px] text-muted hover:text-text"
          >
            Show more
          </button>
        </div>
      )}
    </div>
  )
}
