import type { TradingPattern } from '@/lib/types'
import { MIN_PATTERN_SAMPLE_SIZE } from '@/lib/learning'
import { Card, Badge, SignalBadge, Progress } from './ui'

const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ')

interface Props {
  patterns: TradingPattern[]
}

export function PatternLibraryCard({ patterns }: Props) {
  // ADAPTED: filter sampleCount>=1 and slice 10 — same logic as before
  const ranked = patterns.filter((p) => p.sampleCount >= 1).slice(0, 10)

  return (
    <Card padded={false}>
      <div className="flex items-baseline justify-between px-6 pt-5 pb-3">
        <h3 className="text-sm font-semibold tracking-[0.18em] uppercase">Pattern Library</h3>
        <span className="text-[11px] text-muted">{patterns.length} discovered</span>
      </div>

      {ranked.length === 0 ? (
        <p className="px-6 pb-8 text-center text-sm text-muted">
          Patterns appear after 1+ completed trades
        </p>
      ) : (
        <div className="divide-y divide-border max-h-[640px] overflow-y-auto">
          {ranked.map((p) => {
            // ADAPTED: symbol extracted from id (no symbol field in TradingPattern)
            const symbol   = p.id.split('_').pop() ?? ''
            // ADAPTED: winRate is 0–1 decimal — multiplied by 100 for display
            const winPct   = p.winRate * 100
            const isGood   = winPct >= 50
            // ADAPTED: avgPnLPct is a percent value (e.g. 2.3 for 2.3%)
            const avgLabel = p.avgPnLPct >= 0 ? '+' + p.avgPnLPct.toFixed(1) + '%' : p.avgPnLPct.toFixed(1) + '%'
            const hasEnoughSamples = p.sampleCount >= MIN_PATTERN_SAMPLE_SIZE

            return (
              <div key={p.id} className="px-6 py-4 hover:bg-white/[0.015] transition">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2.5">
                    {symbol && (
                      <span className="font-semibold">{symbol}</span>
                    )}
                    {/* ADAPTED: signalType passed directly — MEAN_REVERSION shows as neutral fallback in SignalBadge; acceptable since ui.tsx cannot be modified */}
                    <SignalBadge signal={p.signalType} />
                    <Badge tone={p.action === 'BUY' ? 'green' : 'red'} size="xs">{p.action}</Badge>
                  </div>
                  <span className="text-[10.5px] text-muted num">{p.sampleCount} samples</span>
                </div>

                <div className="text-[12.5px] text-mute2 leading-relaxed line-clamp-3 mb-3">
                  {p.description}
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    {hasEnoughSamples ? (
                      <>
                        <div className="flex items-center justify-between text-[10px] tracking-wider uppercase text-muted mb-1">
                          <span>Win Rate</span>
                          <span className={cx('num', isGood ? 'text-green' : 'text-red')}>
                            {winPct.toFixed(0)}%
                          </span>
                        </div>
                        <Progress value={winPct / 100} tone={isGood ? 'green' : 'red'} />
                      </>
                    ) : (
                      <Badge tone="neutral" size="xs">Insufficient data (n={p.sampleCount})</Badge>
                    )}
                  </div>
                  <div className="w-20 text-right">
                    <div className="text-[10px] uppercase tracking-wider text-muted">Avg P&L</div>
                    <div className={cx('num text-sm font-semibold', p.avgPnLPct >= 0 ? 'text-green' : 'text-red')}>
                      {avgLabel}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
