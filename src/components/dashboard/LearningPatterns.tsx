'use client'

import { useMemo, useState } from 'react'
import type { TradeEvaluation } from '@/lib/types'
import { buildTimeline } from '@/lib/trade-views'
import type { PatternStats } from '@/lib/pattern-stats'
import { SignalBadge } from './ui'
import { LearningPatternSetupBlock } from './LearningPatternSetupBlock'

const LATEST_LESSONS_COUNT = 10

const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ')

type PatternsToggle = 'lessons' | 'setups'

const TOGGLES: { id: PatternsToggle; label: string }[] = [
  { id: 'lessons', label: 'Latest lessons' },
  { id: 'setups', label: 'Setup patterns' },
]

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
  patternStats: PatternStats
  allTrades: TradeEvaluation[]
}

function LatestLessons({ allTrades }: { allTrades: TradeEvaluation[] }) {
  const [expandedOverrides, setExpandedOverrides] = useState<Record<string, boolean>>({})
  const entries = useMemo(() => buildTimeline(allTrades).slice(0, LATEST_LESSONS_COUNT), [allTrades])

  if (entries.length === 0) {
    return <p className="py-6 text-center text-sm text-muted">No closed trades yet</p>
  }

  return (
    <div>
      <p className="pb-2 text-[11px] text-muted">
        Lessons are written by the model after each exit; treat them as hypotheses, not validated rules
      </p>
      <div className="divide-y divide-border">
        {entries.map((entry, index) => {
          const isExpanded = expandedOverrides[entry.id] ?? index === 0
          const isProfit = entry.outcome === 'profit'
          const isLoss = entry.outcome === 'loss'

          return (
            <div key={entry.id}>
              <button
                type="button"
                onClick={() => setExpandedOverrides((prev) => ({ ...prev, [entry.id]: !isExpanded }))}
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
                <div className="pb-4 pt-1 text-[12.5px] text-mute2">
                  {entry.lessons.length > 0 ? (
                    <ul className="list-disc list-inside space-y-1">
                      {entry.lessons.map((lesson, i) => (
                        <li key={i}>{lesson}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted">No lessons recorded</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SetupPatterns({ patternStats }: { patternStats: PatternStats }) {
  const blocks = patternStats.setups
    .flatMap((record) => {
      const setup = record.setup
      return setup === 'UNKNOWN' ? [] : [{ record, dimensions: patternStats.buckets[setup] }]
    })
    .sort((a, b) => b.record.baseline.n - a.record.baseline.n)

  return (
    <div className="space-y-4">
      {blocks.map(({ record, dimensions }) => (
        <LearningPatternSetupBlock key={record.setup} record={record} dimensions={dimensions} />
      ))}
    </div>
  )
}

export function LearningPatterns({ patternStats, allTrades }: Props) {
  const [activeToggle, setActiveToggle] = useState<PatternsToggle>('lessons')

  return (
    <div className="space-y-4">
      <p className="text-[11.5px] text-muted">
        {patternStats.multipleComparisonsNote} Patterns inform; they never gate entries
      </p>

      <div className="flex p-0.5 rounded-md bg-white/[0.04] border border-border text-[10.5px] w-fit">
        {TOGGLES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveToggle(t.id)}
            className={cx(
              'px-2.5 py-1 rounded transition tracking-wide',
              activeToggle === t.id ? 'bg-purple text-white' : 'text-muted hover:text-text',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeToggle === 'lessons' && <LatestLessons allTrades={allTrades} />}
      {activeToggle === 'setups' && <SetupPatterns patternStats={patternStats} />}
    </div>
  )
}
