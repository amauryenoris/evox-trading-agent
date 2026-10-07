'use client'

import type { SetupGroup } from '@/lib/trade-views'
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

function toneFor(n: number | null): string {
  if (n == null) return 'text-muted'
  return n >= 0 ? 'text-green' : 'text-red'
}

interface Props {
  groups: SetupGroup[]
}

export function LearningBySetup({ groups }: Props) {
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.setup} className="space-y-2.5">
          <div className="flex items-center gap-4">
            <SignalBadge signal={group.setup} size="sm" />
            <span className="num text-[11px] text-mute2">n={group.summary.n}</span>
            <span className="num text-[11px] text-mute2">{fmtWinRate(group.summary.winRate)} win</span>
            <span className={cx('num text-sm font-semibold', toneFor(group.summary.avgPnlPct))}>
              {fmtPct(group.summary.avgPnlPct)}
            </span>
            <span className="num text-[11px] text-muted">median {fmtPct(group.summary.medianPnlPct)}</span>
            <span className="text-[11px] text-muted ml-auto">
              {group.tradesWithFingerprint} of {group.summary.n} trades have a state fingerprint
            </span>
          </div>

          {group.buckets.length === 0 ? (
            <p className="text-[11.5px] text-muted pl-1">{'Not enough trades per bucket'}</p>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
              {group.buckets.map((b) => (
                <div
                  key={`${b.dimension}-${b.bucket}`}
                  className="flex items-center gap-4 px-3 py-2 text-[11.5px]"
                >
                  <span className="text-muted w-28 shrink-0">{b.dimension}</span>
                  <span className="text-mute2 w-24 shrink-0">{b.bucket}</span>
                  <span className="num text-mute2 w-12 shrink-0">n={b.summary.n}</span>
                  <span className="num text-mute2 w-14 shrink-0">{fmtWinRate(b.summary.winRate)}</span>
                  <span className={cx('num flex-1', toneFor(b.summary.avgPnlPct))}>
                    {fmtPct(b.summary.avgPnlPct)}
                  </span>
                  {b.lowSample && <Badge tone="neutral" size="xs">{'hypothesis (n<20)'}</Badge>}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
