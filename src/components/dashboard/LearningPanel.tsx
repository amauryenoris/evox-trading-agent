'use client'

import { useMemo, useState } from 'react'
import type { TradeEvaluation } from '@/lib/types'
import { buildTimeline, groupBySymbol, groupBySetup } from '@/lib/trade-views'
import { getPatternStats } from '@/lib/pattern-stats'
import { Card } from './ui'
import { LearningTimeline } from './LearningTimeline'
import { LearningBySymbol } from './LearningBySymbol'
import { LearningBySetup } from './LearningBySetup'
import { LearningPatterns } from './LearningPatterns'

const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ')

type SubView = 'timeline' | 'symbol' | 'setup' | 'patterns'

const SUB_VIEWS: { id: SubView; label: string }[] = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'symbol', label: 'By symbol' },
  { id: 'setup', label: 'By setup' },
  { id: 'patterns', label: 'Patterns' },
]

interface Props {
  allTrades: TradeEvaluation[]
}

export function LearningPanel({ allTrades }: Props) {
  const [activeView, setActiveView] = useState<SubView>('timeline')

  const timeline = useMemo(() => buildTimeline(allTrades), [allTrades])
  const bySymbol = useMemo(() => groupBySymbol(allTrades), [allTrades])
  const bySetup = useMemo(() => groupBySetup(allTrades), [allTrades])
  const patternStats = useMemo(() => getPatternStats(allTrades), [allTrades])

  if (allTrades.length === 0) {
    return (
      <Card>
        <p className="py-6 text-center text-sm text-muted">No closed trades yet</p>
      </Card>
    )
  }

  return (
    <Card padded={false}>
      <div className="flex items-center gap-2 px-6 pt-5 pb-3">
        {SUB_VIEWS.map((v) => {
          const isActive = activeView === v.id
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setActiveView(v.id)}
              className={cx(
                'px-3 py-1.5 rounded-md text-[11px] font-medium tracking-wide transition',
                isActive ? 'bg-white/[0.06] text-text' : 'text-muted hover:text-mute2',
              )}
            >
              {v.label}
            </button>
          )
        })}
      </div>

      <div className="px-6 pb-6">
        {activeView === 'timeline' && <LearningTimeline entries={timeline} />}
        {activeView === 'symbol' && <LearningBySymbol groups={bySymbol} />}
        {activeView === 'setup' && <LearningBySetup groups={bySetup} />}
        {activeView === 'patterns' && <LearningPatterns patternStats={patternStats} allTrades={allTrades} />}
      </div>
    </Card>
  )
}
